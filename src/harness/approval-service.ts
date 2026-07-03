import type { CorvusDatabase } from "../db/connection.js";
import {
  decidePermission,
  setPermissionRule,
  type PermissionDecision,
  type PermissionPolicy,
} from "../permissions.js";
import type { EventLog } from "./event-log.js";
import type { EvidenceStore } from "./evidence-store.js";
import { newId, nowIso, type ApprovalRow, type ApprovalStatus, type DecisionScope } from "./types.js";

export interface CreateApprovalInput {
  runId: string;
  toolCallId: string;
  toolName?: string;
}

interface ApprovalDbRow {
  id: string;
  run_id: string;
  tool_call_id: string;
  tool_name: string | null;
  status: ApprovalStatus;
  decision_scope: DecisionScope;
  created_at: string;
  decided_at: string | null;
}

interface ApprovalToolCallDbRow {
  id: string;
  run_id: string;
  tool_name: string;
  status: string;
}

const approvalStatuses = new Set<ApprovalStatus>(["pending", "approved", "denied", "expired"]);
const decisionScopes = new Set<DecisionScope>(["once", "always", "never"]);

export class ApprovalService {
  constructor(
    private readonly db: CorvusDatabase,
    private readonly events: EventLog,
    private readonly policy: PermissionPolicy,
    private readonly evidence: EvidenceStore,
  ) {}

  decideToolPermission(toolName: string, capability: string): PermissionDecision {
    return decidePermission(this.policy, { toolName, capability });
  }

  createApproval(input: CreateApprovalInput): ApprovalRow {
    return this.db.transaction(() => {
      const approval: ApprovalRow = {
        id: newId("appr"),
        runId: input.runId,
        toolCallId: input.toolCallId,
        toolName: input.toolName ?? this.findToolName(input.toolCallId),
        status: "pending",
        decisionScope: "once",
        createdAt: nowIso(),
        decidedAt: null,
      };

      this.db
        .prepare(
          `insert into approvals (id, run_id, tool_call_id, status, decision_scope, created_at, decided_at)
           values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          approval.id,
          approval.runId,
          approval.toolCallId,
          approval.status,
          approval.decisionScope,
          approval.createdAt,
          approval.decidedAt,
        );
      this.events.append("approval.created", approvalEventPayload(approval), approval.runId);
      return approval;
    })();
  }

  listPending(runId?: string): ApprovalRow[] {
    const sql = approvalSelectSql(
      runId
        ? "where approvals.status = 'pending' and approvals.run_id = ?"
        : "where approvals.status = 'pending'",
    );
    const rows = runId ? this.db.prepare(sql).all(runId) : this.db.prepare(sql).all();
    return rows.map((row) => mapApprovalRow(row as ApprovalDbRow));
  }

  resolveApproval(id: string, status: ApprovalStatus, decisionScope: DecisionScope): ApprovalRow {
    if (!approvalStatuses.has(status)) {
      throw new Error(`Invalid approval status: ${status}`);
    }
    if (!decisionScopes.has(decisionScope)) {
      throw new Error(`Invalid decision scope: ${decisionScope}`);
    }
    if (decisionScope === "always" && status !== "approved") {
      throw new Error("Decision scope always requires an approved approval");
    }
    if (decisionScope === "never" && status !== "denied") {
      throw new Error("Decision scope never requires a denied approval");
    }

    return this.db.transaction(() => {
      const existing = this.getApproval(id);
      if (!existing) {
        throw new Error(`Approval not found: ${id}`);
      }
      if (existing.status !== "pending") {
        if (existing.status === status && existing.decisionScope === decisionScope) {
          return existing;
        }
        throw new Error(
          `Approval ${id} is already resolved as ${existing.status} with scope ${existing.decisionScope}`,
        );
      }
      if (status === "pending") {
        throw new Error("Approval resolution must be terminal");
      }

      const decidedAt = nowIso();
      this.db
        .prepare("update approvals set status = ?, decision_scope = ?, decided_at = ? where id = ?")
        .run(status, decisionScope, decidedAt, id);

      const updated = this.getApproval(id);
      if (!updated) {
        throw new Error(`Approval not found after update: ${id}`);
      }

      if (status === "approved") {
        this.events.append("approval.approved", approvalEventPayload(updated), updated.runId);
      } else if (status === "denied") {
        this.events.append("approval.denied", approvalEventPayload(updated), updated.runId);
      } else if (status === "expired") {
        this.events.append("approval.expired", approvalEventPayload(updated), updated.runId);
      }
      if (status === "denied" || status === "expired") {
        this.denyToolCallForApproval(updated, status);
      }
      if (decisionScope === "always" && updated.toolName) {
        setPermissionRule(this.policy, `tool:${updated.toolName}`, "allow");
      } else if (decisionScope === "never" && updated.toolName) {
        setPermissionRule(this.policy, `tool:${updated.toolName}`, "deny");
      }

      return updated;
    })();
  }

  private getApproval(id: string): ApprovalRow | undefined {
    const row = this.db.prepare(approvalSelectSql("where approvals.id = ?")).get(id);
    return row ? mapApprovalRow(row as ApprovalDbRow) : undefined;
  }

  private findToolName(toolCallId: string): string | null {
    const row = this.db.prepare("select tool_name from tool_calls where id = ?").get(toolCallId) as
      | { tool_name: string }
      | undefined;
    return row?.tool_name ?? null;
  }

  private denyToolCallForApproval(approval: ApprovalRow, status: "denied" | "expired"): void {
    const toolCall = this.db
      .prepare("select id, run_id, tool_name, status from tool_calls where id = ?")
      .get(approval.toolCallId) as ApprovalToolCallDbRow | undefined;
    if (!toolCall) {
      throw new Error(`Tool call not found for approval ${approval.id}: ${approval.toolCallId}`);
    }
    if (toolCall.status === "denied") {
      return;
    }
    if (toolCall.status !== "approval_required") {
      throw new Error(`Tool call ${toolCall.id} is not waiting for approval; current status is ${toolCall.status}`);
    }

    const message =
      status === "expired"
        ? `Tool ${toolCall.tool_name} approval expired`
        : `Tool ${toolCall.tool_name} denied by approval decision`;
    const completedAt = nowIso();
    const update = this.db
      .prepare(
        "update tool_calls set status = ?, error = ?, completed_at = ? where id = ? and status = 'approval_required'",
      )
      .run("denied", message, completedAt, toolCall.id);
    if (update.changes === 0) {
      const current = this.db.prepare("select status from tool_calls where id = ?").get(toolCall.id) as
        | { status: string }
        | undefined;
      throw new Error(`Tool call ${toolCall.id} was not denied; current status is ${current?.status ?? "missing"}`);
    }

    this.events.append(
      "tool_call.denied",
      {
        runId: toolCall.run_id,
        toolCallId: toolCall.id,
        toolName: toolCall.tool_name,
        error: message,
      },
      toolCall.run_id,
    );
    this.evidence.createEvidence({
      runId: toolCall.run_id,
      sourceType: "permission_denial",
      sourceId: toolCall.id,
      title: `Tool ${toolCall.tool_name} denied`,
      summary: message,
      content: message,
    });
  }
}

function approvalSelectSql(whereClause: string): string {
  return `
    select approvals.id,
           approvals.run_id,
           approvals.tool_call_id,
           tool_calls.tool_name,
           approvals.status,
           approvals.decision_scope,
           approvals.created_at,
           approvals.decided_at
    from approvals
    left join tool_calls on tool_calls.id = approvals.tool_call_id
    ${whereClause}
    order by approvals.created_at, approvals.id`;
}

function mapApprovalRow(row: ApprovalDbRow): ApprovalRow {
  return {
    id: row.id,
    runId: row.run_id,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    status: row.status,
    decisionScope: row.decision_scope,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function approvalEventPayload(approval: ApprovalRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    runId: approval.runId,
    approvalId: approval.id,
    toolCallId: approval.toolCallId,
    status: approval.status,
    decisionScope: approval.decisionScope,
  };
  if (approval.toolName) {
    payload.toolName = approval.toolName;
  }
  return payload;
}

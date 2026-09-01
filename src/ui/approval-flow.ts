import type { PendingApprovalInfo } from "../agent.js";
import type { CorvusConfig } from "../config.js";
import type { DurableHarnessAdapter } from "../commands.js";
import { setPermissionRule } from "../permissions.js";
import type { ToolRegistry } from "../tools/index.js";

export const APPROVAL_CHOICES = [
  { label: "Allow once", value: "allow once" },
  { label: "Workspace", value: "workspace" },
  { label: "Always", value: "always" },
  { label: "Deny", value: "deny" },
  { label: "Never", value: "never" },
] as const;

export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number]["value"];

export interface ApprovalFlowDeps {
  harness: DurableHarnessAdapter;
  tools?: ToolRegistry;
  config: CorvusConfig;
  saveConfig?: () => Promise<void>;
  cwd?: string;
}

export interface ApprovalChoiceResult {
  approved: boolean;
  executed: boolean;
}

/**
 * Apply one approval decision (shared by line mode and the workbench).
 *
 * - allow once: approve for this call only, then execute the tool.
 * - workspace / always: approve and persist a permission rule, then execute.
 * - deny / never: reject the call; never also persists a deny rule.
 */
export async function handleApprovalChoice(
  choice: ApprovalChoice,
  approval: PendingApprovalInfo,
  deps: ApprovalFlowDeps,
): Promise<ApprovalChoiceResult> {
  const { harness, tools, config, saveConfig, cwd } = deps;
  const toolName = approval.toolName;
  let approved = false;

  if (choice === "always") {
    harness.resolveApproval(approval.approvalId, "approved", "always");
    if (toolName) setPermissionRule(config.permissions, `tool:${toolName}`, "allow");
    await saveConfig?.();
    approved = true;
  } else if (choice === "workspace") {
    harness.resolveApproval(approval.approvalId, "approved", "always");
    if (toolName) setPermissionRule(config.permissions, `tool:${toolName}`, "allow", cwd ?? process.cwd());
    await saveConfig?.();
    approved = true;
  } else if (choice === "never") {
    harness.resolveApproval(approval.approvalId, "denied", "never");
    if (toolName) setPermissionRule(config.permissions, `tool:${toolName}`, "deny");
    await saveConfig?.();
  } else if (choice === "deny") {
    harness.resolveApproval(approval.approvalId, "denied", "once");
  } else {
    // Default: allow once
    harness.resolveApproval(approval.approvalId, "approved", "once");
    approved = true;
  }

  let executed = false;
  if (approved) {
    const tool = tools?.list().find((candidate) => candidate.name === toolName);
    if (tool) {
      await harness.runApproved(approval.toolCallId, tool);
      executed = true;
    }
  }
  return { approved, executed };
}
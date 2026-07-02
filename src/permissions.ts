export type PermissionDecision = "allow" | "ask" | "deny";

export interface PermissionPolicy {
  rules: Record<string, PermissionDecision>;
}

export interface PermissionRequest {
  toolName: string;
  capability: string;
}

const validDecisions = new Set<PermissionDecision>(["allow", "ask", "deny"]);

export function createDefaultPolicy(): PermissionPolicy {
  return {
    rules: {
      "capability:filesystem.read": "allow",
      "capability:filesystem.write": "ask",
      "capability:local": "allow",
      "capability:memory.read": "allow",
      "capability:memory.write": "ask",
      "capability:network": "ask",
      "capability:process": "ask",
      "capability:plugin": "ask",
    },
  };
}

export function decidePermission(policy: PermissionPolicy, request: PermissionRequest): PermissionDecision {
  const toolRule = policy.rules[`tool:${request.toolName}`];
  if (toolRule) {
    return toolRule;
  }

  const capabilityRule = policy.rules[`capability:${request.capability}`];
  if (capabilityRule) {
    return capabilityRule;
  }

  return "ask";
}

export function setPermissionRule(policy: PermissionPolicy, target: string, decision: PermissionDecision): void {
  if (!validDecisions.has(decision)) {
    throw new Error(`Invalid permission decision: ${decision}`);
  }

  if (!target.includes(":")) {
    throw new Error("Permission target must look like tool:shell or capability:network");
  }

  policy.rules[target] = decision;
}

export function formatPermissionRules(policy: PermissionPolicy): string[] {
  return Object.entries(policy.rules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([target, decision]) => `${target}=${decision}`);
}


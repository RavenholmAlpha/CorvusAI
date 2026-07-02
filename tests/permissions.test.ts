import { describe, expect, it } from "vitest";
import { createDefaultPolicy, decidePermission, setPermissionRule } from "../src/permissions.js";

describe("permission policy", () => {
  it("defaults mutating and network tools to ask while allowing safe reads", () => {
    const policy = createDefaultPolicy();

    expect(decidePermission(policy, { toolName: "read_file", capability: "filesystem.read" })).toBe("allow");
    expect(decidePermission(policy, { toolName: "write_file", capability: "filesystem.write" })).toBe("ask");
    expect(decidePermission(policy, { toolName: "web_fetch", capability: "network" })).toBe("ask");
  });

  it("lets explicit tool rules override capability defaults", () => {
    const policy = createDefaultPolicy();

    setPermissionRule(policy, "tool:shell", "deny");

    expect(decidePermission(policy, { toolName: "shell", capability: "process" })).toBe("deny");
  });
});

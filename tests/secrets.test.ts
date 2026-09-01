import { describe, expect, it } from "vitest";
import { redactSecrets, resolveSecret } from "../src/secrets.js";

describe("secret references", () => {
  it("resolves env references and redacts serialized configuration", () => {
    process.env.CORVUS_TEST_SECRET = "secret-value";
    expect(resolveSecret("env:CORVUS_TEST_SECRET", "fallback")).toBe("secret-value");
    expect(redactSecrets({ providers: { p: { apiKey: "secret-value", apiKeyRef: "env:CORVUS_TEST_SECRET" } } })).toEqual({ providers: { p: { apiKey: "***configured***", apiKeyRef: "***configured***" } } });
    delete process.env.CORVUS_TEST_SECRET;
  });
});

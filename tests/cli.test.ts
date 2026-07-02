import { describe, expect, it } from "vitest";
import { isCliEntryPoint } from "../src/cli.js";

describe("cli entrypoint", () => {
  it("recognizes Windows file URLs as the invoked script", () => {
    expect(isCliEntryPoint("file:///D:/codexproject/CorvusAI/src/cli.ts", "D:\\codexproject\\CorvusAI\\src\\cli.ts")).toBe(
      true,
    );
  });
});

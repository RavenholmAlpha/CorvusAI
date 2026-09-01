import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent";

describe("MessageContent", () => {
  it("renders structured markdown content", () => {
    const markdown = ["# Plan", "- item", "Use `tool`", "```ts", "const x = 1", "```"].join("\n");
    render(<MessageContent text={markdown} />);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(screen.getByText(/•/)).toBeTruthy();
    expect(screen.getByText("tool").tagName).toBe("CODE");
    expect(screen.getByText("const x = 1").tagName).toBe("CODE");
  });

  it("renders long unbroken content for safe CSS wrapping", () => {
    const text = "x".repeat(500);
    render(<MessageContent text={text} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("renders markdown tables and blockquotes", () => {
    const markdown = [
      "> Cassette Futurism Rule",
      "| Col A | Col B |",
      "|---|---|",
      "| Val 1 | Val 2 |",
    ].join("\n");
    render(<MessageContent text={markdown} />);
    expect(screen.getByText("Cassette Futurism Rule")).toBeTruthy();
    expect(screen.getByText("Col A")).toBeTruthy();
    expect(screen.getByText("Val 1")).toBeTruthy();
  });

  it("renders links correctly", () => {
    const markdown = "Check out [Corvus Docs](https://corvus.ai/docs)";
    render(<MessageContent text={markdown} />);
    const link = screen.getByRole("link", { name: "Corvus Docs" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://corvus.ai/docs");
  });
});
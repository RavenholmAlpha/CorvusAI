import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/e2e.test.ts",
      "tests/web-dev.test.ts",
      "tests/web-dev-complex.test.ts",
      "openclaw/**",
      "hermes-agent/**",
      "vault/**",
      ".worktrees/**",
      "node_modules/**",
      "dist/**"
    ]
  }
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
export default defineConfig({ root: dirname(fileURLToPath(import.meta.url)), plugins: [react()], test: { environment: "jsdom", include: ["src/**/*.test.tsx"] } });

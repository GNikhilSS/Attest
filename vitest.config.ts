import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["UI/**", "node_modules/**", "dist/**"],
  },
});


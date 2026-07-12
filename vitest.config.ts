import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@blackwater/game-core": new URL(
        "./packages/game-core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@blackwater/protocol": new URL(
        "./packages/protocol/src/index.ts",
        import.meta.url,
      ).pathname,
      "@blackwater/test-fixtures": new URL(
        "./packages/test-fixtures/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/game-core/src/**/*.ts", "apps/server/src/**/*.ts"],
    },
  },
});

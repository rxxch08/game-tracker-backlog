import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://backlog:backlog@localhost:5433/backlog_clear",
      JWT_ACCESS_SECRET: "test-access-secret-test-access-secret-1234",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret-123",
    },
  },
});
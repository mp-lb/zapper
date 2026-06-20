export default {
  test: {
    globals: true,
    environment: "node",
    testTimeout: 60000, // 60 second timeout for e2e tests
    hookTimeout: 60000,
    fileParallelism: false, // E2E tests share supervisor state and must run serially
    include: ["tests/e2e/**/*.test.ts"],
    setupFiles: [],
  },
};

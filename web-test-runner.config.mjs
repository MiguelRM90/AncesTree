export default {
  nodeResolve: true,
  files: ['test/**/*.test.js'],
  // The project only supports desktop Chromium (see storage.md), so there is no
  // point running the suite against other engines.
  concurrency: 4,
  coverageConfig: {
    include: ['src/domain/**/*.js'],
    threshold: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};

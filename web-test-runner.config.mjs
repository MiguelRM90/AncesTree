export default {
  nodeResolve: true,
  files: ['test/**/*.test.js'],
  // The project only supports desktop Chromium (see storage.md), so there is no
  // point running the suite against other engines.
  concurrency: 4,
  plugins: [
    {
      name: 'vite-inline-css',
      transform(context) {
        if (context.url.includes('.css?inline')) {
          return {
            body: `export default ${JSON.stringify(context.body)};`,
            headers: { 'content-type': 'application/javascript; charset=utf-8' },
          };
        }
      },
    },
  ],
  coverageConfig: {
    include: ['src/domain/**/*.js'],
    threshold: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};

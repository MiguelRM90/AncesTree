import wc from 'eslint-plugin-wc';

/**
 * The dependency rule from architecture.md is enforced here:
 *
 *     UI  ->  STORE  ->  DOMAIN  ->  STORAGE
 *
 * Dependencies only ever point downwards. An import that breaks this is an
 * architecture error, not a convenience.
 */
const layerViolation = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        indexedDB: 'readonly',
        console: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        EventTarget: 'readonly',
        CSSStyleSheet: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        Response: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        TransformStream: 'readonly',
        WritableStream: 'readonly',
      },
    },
    plugins: { wc },
    rules: {
      ...wc.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // domain/ is the pure layer: no DOM, no storage, no store. That is what
  // lets it be tested without a browser and run inside a Worker.
  {
    files: ['src/domain/**/*.js'],
    rules: layerViolation([
      { group: ['**/storage/**'], message: 'domain/ must not depend on storage/' },
      { group: ['**/store/**'], message: 'domain/ must not depend on store/' },
      { group: ['**/ui/**'], message: 'domain/ must not depend on ui/' },
    ]),
  },

  // storage/ knows nothing about the store or the UI: it takes and returns
  // plain objects.
  {
    files: ['src/storage/**/*.js'],
    rules: layerViolation([
      { group: ['**/store/**'], message: 'storage/ must not depend on store/' },
      { group: ['**/ui/**'], message: 'storage/ must not depend on ui/' },
    ]),
  },

  // The UI never talks to storage/ directly. Always through the store.
  {
    files: ['src/ui/**/*.js'],
    rules: layerViolation([
      { group: ['**/storage/**'], message: 'ui/ must go through the store, not storage/' },
    ]),
  },
];

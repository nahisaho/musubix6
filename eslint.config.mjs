export default [
  { ignores: ['.git/**', '.sdd/**', 'node_modules/**', '.venv/**'] },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest' },
    rules: {
      'constructor-super': 'error',
      'no-const-assign': 'error',
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];

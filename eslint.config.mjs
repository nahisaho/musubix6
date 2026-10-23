import js from '@eslint/js';
import globals from 'globals';

/** @id CODE-DIAGJS-002 @implements REQ-DIAGJS-004 */
export default [{
  ...js.configs.recommended,
  files: ['**/*.{[jJ][sS],[jJ][sS][xX],[mMcC][jJ][sS]}'],
  languageOptions: {
    globals: globals.node,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  linterOptions: { noInlineConfig: true },
}];

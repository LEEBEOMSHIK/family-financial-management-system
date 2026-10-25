import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules },
  globalIgnores(['.next/**', 'src/generated/**', 'public/theme.js', 'playwright-report/**', 'test-results/**']),
]);

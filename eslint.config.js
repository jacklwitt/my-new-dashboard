import nextjs from '@next/eslint-plugin-next';
import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': nextjs
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      'prefer-const': 'warn'
    }
  }
]; 
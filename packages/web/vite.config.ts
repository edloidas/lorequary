import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {defineConfig, lazyPlugins} from 'vite-plus';

import {baseFmt, baseSortImportGroups} from '../../tooling/fmt';
import {baseLint, basePlugins, baseRules, testOverrideRules} from '../../tooling/lint';
import {baseTest} from '../../tooling/test';

// Node emits a warning when the jsdom environment passes --localstorage-file
// without a valid path. Suppress it by propagating --no-warnings to workers.
if (process.env.VITEST) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --no-warnings`.trim();
}

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    ...baseLint,
    plugins: [...basePlugins, 'react', 'jsx-a11y'],
    ignorePatterns: ['node_modules/', 'build/', 'public/', 'dist/', 'coverage/', '**/*.d.ts'],
    rules: {
      ...baseRules,

      // Correctness
      'react/exhaustive-deps': 'error',
      'jsx-a11y/prefer-tag-over-role': 'warn',

      // Restriction
      'react/no-unknown-property': 'error',

      // Suspicious
      'react/jsx-no-comment-textnodes': 'error',

      // Pedantic
      'react/display-name': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-unescaped-entities': 'error',
      'react/rules-of-hooks': 'error',
    },
    overrides: [
      {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: testOverrideRules,
      },
    ],
  },
  fmt: {
    ...baseFmt,
    jsxSingleQuote: true,
    sortImports: {
      newlinesBetween: true,
      customGroups: [{groupName: 'css', elementNamePattern: ['*.css', '*.scss', '*.sass']}],
      groups: [...baseSortImportGroups.slice(0, -1), 'css', 'unknown'],
    },
  },
  test: {
    ...baseTest,
    environment: 'jsdom',
    setupFiles: ['./config/vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/?(*.)+(story|stories).[tj]sx?', 'src/**/index.ts'],
      thresholds: {
        statements: 15,
        branches: 15,
        lines: 15,
        functions: 20,
      },
    },
  },
  plugins: lazyPlugins(() => [tailwindcss(), react()]),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    open: true,
  },
});

import type {UserConfig} from 'vite-plus';

type TestConfig = NonNullable<UserConfig['test']>;

export const baseCoverageThresholds = {
  statements: 15,
  branches: 15,
  lines: 15,
  functions: 50,
};

export const baseReporters = process.env.CI ? ['default', 'junit'] : ['default'];

export const baseOutputFile = {
  junit: 'reports/junit/results.xml',
};

/**
 * Vitest config for the runtime-neutral packages. `packages/web` spreads this
 * and swaps in the jsdom environment plus the tsx-aware globs.
 */
export const baseTest = {
  globals: true,
  include: ['src/**/*.test.ts'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  passWithNoTests: true,
  coverage: {
    include: ['src/**/*.ts'],
    exclude: ['src/**/index.ts'],
    thresholds: baseCoverageThresholds,
  },
  reporters: baseReporters,
  outputFile: baseOutputFile,
} satisfies TestConfig;

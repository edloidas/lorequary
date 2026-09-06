import type {UserConfig} from 'vite-plus';

type FmtConfig = NonNullable<UserConfig['fmt']>;
type SortImports = Extract<NonNullable<FmtConfig['sortImports']>, object>;

export const baseSortImportGroups: NonNullable<SortImports['groups']> = [
  ['value-builtin', 'value-external'],
  'value-internal',
  'type-import',
  ['value-parent', 'value-sibling', 'value-index'],
  'unknown',
];

/**
 * Format config shared by every package. `packages/web` spreads this and adds
 * the JSX and stylesheet-ordering options.
 */
export const baseFmt = {
  printWidth: 120,
  semi: true,
  trailingComma: 'all',
  singleQuote: true,
  arrowParens: 'avoid',
  bracketSpacing: false,
  sortImports: {
    newlinesBetween: true,
    groups: baseSortImportGroups,
  },
  sortPackageJson: false,
  ignorePatterns: ['dist/', 'coverage/'],
} satisfies FmtConfig;

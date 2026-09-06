import {defineConfig} from 'vite-plus';

import {baseFmt} from '../../tooling/fmt';
import {baseLint} from '../../tooling/lint';
import {baseTest} from '../../tooling/test';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: baseLint,
  fmt: baseFmt,
  test: baseTest,
});

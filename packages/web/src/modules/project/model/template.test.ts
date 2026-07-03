import {validateProject} from '@lorequary/core';
import {expect, it} from 'vite-plus/test';

import {createDemoProject} from './template';

it('demo template validates cleanly', () => {
  expect(validateProject(createDemoProject())).toStrictEqual([]);
});

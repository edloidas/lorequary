import {describe, expect, it} from 'vite-plus/test';

import {lockReasonKey, modifierKey, nodeTextKey, optionKey, variantKey} from './keys';

describe('localization keys', () => {
  it('builds a node text key', () => {
    expect(nodeTextKey('dlg', 'n1')).toBe('dlg.n1.text');
  });

  it('builds a text variant key', () => {
    expect(variantKey('dlg', 'n1', 'v1')).toBe('dlg.n1.variant.v1');
  });

  it('builds a choice option key', () => {
    expect(optionKey('dlg', 'n1', 'o1')).toBe('dlg.n1.option.o1');
  });

  it('builds a lock reason key', () => {
    expect(lockReasonKey('dlg', 'n1', 'o1')).toBe('dlg.n1.option.o1.lock');
  });

  it('builds a check modifier key', () => {
    expect(modifierKey('dlg', 'n1', 'o1', 'm1')).toBe('dlg.n1.option.o1.mod.m1');
  });
});

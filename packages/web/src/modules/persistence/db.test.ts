import {SCHEMA_VERSION} from '@lorequary/core';
import {describe, expect, it} from 'vite-plus/test';

import {createDefaultProject} from '@/modules/project/model/store';

import {parseStored} from './db';

describe('parseStored', () => {
  it('parses a valid current-version document', () => {
    const doc = createDefaultProject('Load');

    expect(parseStored(doc)).toStrictEqual(doc);
  });

  it('rejects a document written by a newer build instead of loading it lossily', () => {
    const doc = {...createDefaultProject('Future'), schemaVersion: SCHEMA_VERSION + 1};

    expect(parseStored(doc)).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored('nope')).toBeNull();
  });
});

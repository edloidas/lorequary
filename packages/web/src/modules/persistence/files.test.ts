import {serializeProject} from '@lorequary/core';
import {describe, expect, it} from 'vite-plus/test';

import {$project, createDefaultProject} from '@/modules/project/model/store';
import {$currentDialogueId} from '@/modules/workspace/model/store';

import {applyImportedProject, importProjectText, sanitizeFileName} from './files';

describe('sanitizeFileName', () => {
  it('keeps word characters and dashes, replaces the rest', () => {
    expect(sanitizeFileName('My Project: The "Sequel"!')).toBe('my-project-the-sequel');
  });

  it('falls back for empty names', () => {
    expect(sanitizeFileName('***')).toBe('project');
  });
});

describe('importProjectText', () => {
  it('parses a valid .lorequary payload', () => {
    const doc = createDefaultProject('Imported');
    const result = importProjectText(serializeProject(doc));

    if (!result.ok) {
      expect.unreachable(`expected ok, got ${result.error.message}`);
    }

    expect(result.value.meta.name).toBe('Imported');
  });

  it('fails with issues on an invalid payload', () => {
    const result = importProjectText('{"schemaVersion": 1}');

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.message).toMatch(/invalid/i);
  });
});

describe('applyImportedProject', () => {
  it('replaces the current project and selects its first dialogue', () => {
    const doc = createDefaultProject('Fresh');

    applyImportedProject(doc);

    expect($project.get()).toStrictEqual(doc);
    expect($currentDialogueId.get()).toBe(doc.dialogues[0]?.id);
  });
});

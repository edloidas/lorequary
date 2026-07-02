import {describe, expect, it} from 'vite-plus/test';

import {buildDialogue, buildProject} from '../fixtures';
import {exportRuntimeJson, toRuntimeDocument} from './ir';

describe('toRuntimeDocument', () => {
  it('strips editor state from every dialogue', () => {
    const runtime = toRuntimeDocument(buildProject());

    for (const dialogue of runtime.dialogues) {
      expect(dialogue).not.toHaveProperty('editor');
    }
  });

  it('keeps logic fields intact', () => {
    const project = buildProject();
    const runtime = toRuntimeDocument(project);

    expect(runtime.dialogues[0]?.nodes).toStrictEqual(project.dialogues[0]?.nodes);
    expect(runtime.dialogues[0]?.edges).toStrictEqual(project.dialogues[0]?.edges);
    expect(runtime.meta).toStrictEqual(project.meta);
    expect(runtime.variables).toStrictEqual(project.variables);
  });

  it('does not mutate the source document', () => {
    const project = buildProject();

    toRuntimeDocument(project);

    expect(project.dialogues[0]).toHaveProperty('editor');
  });
});

describe('exportRuntimeJson', () => {
  it('produces JSON without editor state', () => {
    const json = exportRuntimeJson(buildProject({dialogues: [buildDialogue()]}));

    expect(json).not.toContain('nodePositions');
    expect(JSON.parse(json)).toMatchObject({schemaVersion: 1});
  });
});

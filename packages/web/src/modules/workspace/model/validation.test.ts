import {describe, expect, it} from 'vite-plus/test';

import {$project, createDefaultProject} from '@/modules/project/model/store';

import type {GraphIssue, ProjectDocument} from '@lorequary/core';

import {$validationIssues, formatIssueLocation} from './validation';

const issue = (overrides: Partial<GraphIssue>): GraphIssue => ({
  severity: 'error',
  code: 'broken-edge',
  message: 'Edge `e1` references a missing node',
  ...overrides,
});

describe('formatIssueLocation', () => {
  const project = createDefaultProject('Loc');
  const dialogue = project.dialogues[0];

  it('names the dialogue and node', () => {
    expect(formatIssueLocation(issue({dialogueId: dialogue?.id, nodeId: 'n42'}), project)).toBe(
      `${dialogue?.name ?? ''} · node n42`,
    );
  });

  it('includes option and edge locations', () => {
    expect(formatIssueLocation(issue({dialogueId: dialogue?.id, nodeId: 'n1', optionId: 'o1'}), project)).toBe(
      `${dialogue?.name ?? ''} · node n1 · option o1`,
    );
    expect(formatIssueLocation(issue({dialogueId: dialogue?.id, edgeId: 'e9'}), project)).toBe(
      `${dialogue?.name ?? ''} · edge e9`,
    );
  });

  it('labels project-level issues', () => {
    expect(formatIssueLocation(issue({variableId: 'v1'}), project)).toBe('variable v1');
    expect(formatIssueLocation(issue({}), project)).toBe('project');
  });
});

describe('$validationIssues', () => {
  it('reflects the current project document live', () => {
    const valid = createDefaultProject('Valid');

    $project.set(valid);

    // The starter node has empty text — a warning, but no errors.
    expect($validationIssues.get().filter(i => i.severity === 'error')).toStrictEqual([]);

    const dialogue = valid.dialogues[0];

    if (dialogue === undefined) throw new Error('no dialogue');

    const broken: ProjectDocument = {
      ...valid,
      dialogues: [{...dialogue, entryNodeId: 'ghost'}],
    };

    $project.set(broken);

    expect($validationIssues.get().some(i => i.code === 'missing-entry')).toBe(true);
  });
});

import {describe, expect, it} from 'vite-plus/test';

import type {Dialogue, ProjectDocument} from '../schema';

import {zProjectDocument} from '../validate/schemas';
import {migrateProjectData} from './migrate';
import {deserializeProject, serializeProject} from './serial';

// A representative v1 document: dual-stored option targets, embedded check
// targets, option edges via sourceHandle, and a single expressionId.
const v1Project = (): Record<string, unknown> => ({
  schemaVersion: 1,
  meta: {id: 'p1', name: 'Old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'},
  settings: {},
  characters: [],
  variables: [{id: 'var_wit', name: 'Wit', key: 'skills.wit', type: 'number', defaultValue: 5}],
  dialogues: [
    {
      id: 'dlg',
      name: 'Old dialogue',
      entryNodeId: 'n1',
      nodes: [
        {id: 'n1', kind: 'line', text: 'Start.', expressionId: 'exp_smile'},
        {
          id: 'n2',
          kind: 'choice',
          text: 'Decide.',
          options: [
            // Target stored twice: targetNodeId + a real edge with sourceHandle.
            {id: 'o_dup', text: 'Dup', targetNodeId: 'n3', visibility: 'available'},
            // Target stored only on the option — the migrator must create the edge.
            {id: 'o_solo', text: 'Solo', targetNodeId: 'n4', visibility: 'available'},
            // Conflict: option says n4, edge says n3 — the edge must win.
            {id: 'o_conflict', text: 'Conflict', targetNodeId: 'n4', visibility: 'available'},
            {
              id: 'o_check',
              text: 'Try',
              targetNodeId: '',
              visibility: 'available',
              skillCheck: {
                skillId: 'var_wit',
                baseDifficulty: 10,
                checkType: 'red',
                successTargetId: 'n3',
                failureTargetId: 'n4',
              },
            },
          ],
        },
        {id: 'n3', kind: 'line', text: 'Won.'},
        {id: 'n4', kind: 'line', text: 'Lost.'},
      ],
      edges: [
        {id: 'e_flow', source: 'n1', target: 'n2', targetHandle: 'in'},
        {id: 'e_dup', source: 'n2', target: 'n3', sourceHandle: 'o_dup'},
        {id: 'e_conflict', source: 'n2', target: 'n3', sourceHandle: 'o_conflict'},
        {id: 'e_back', source: 'n3', target: 'n2'},
        {id: 'e_back2', source: 'n4', target: 'n2'},
      ],
      editor: {nodePositions: {}},
    },
  ],
});

const migrate = (data: unknown): {project: ProjectDocument; notes: string[]} => {
  const result = migrateProjectData(data);
  const parsed = zProjectDocument.safeParse(result.data);

  if (!parsed.success) {
    throw new Error(`migrated document is invalid: ${parsed.error.issues[0]?.message ?? '?'}`);
  }

  return {project: parsed.data, notes: result.notes};
};

const dialogueOf = (project: ProjectDocument): Dialogue => {
  const dialogue = project.dialogues[0];

  if (dialogue === undefined) throw new Error('no dialogue');

  return dialogue;
};

describe('migrateProjectData', () => {
  it('leaves current-version documents untouched', () => {
    const doc = {schemaVersion: 2, anything: true};
    const result = migrateProjectData(doc);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(doc);
    expect(result.notes).toStrictEqual([]);
  });

  it('produces a valid v2 document from v1 data', () => {
    const {project} = migrate(v1Project());

    expect(project.schemaVersion).toBe(2);
  });

  it('gives existing edges role flow and maps sourceHandle to sourceOption', () => {
    const {project} = migrate(v1Project());
    const dialogue = dialogueOf(project);
    const flow = dialogue.edges.find(edge => edge.id === 'e_flow');
    const dup = dialogue.edges.find(edge => edge.id === 'e_dup');

    expect(flow).toStrictEqual({id: 'e_flow', source: 'n1', role: 'flow', target: 'n2'});
    expect(dup).toStrictEqual({id: 'e_dup', source: 'n2', sourceOption: 'o_dup', role: 'flow', target: 'n3'});
  });

  it('prefers the existing edge over a duplicated option target', () => {
    const {project, notes} = migrate(v1Project());
    const dialogue = dialogueOf(project);
    const dupEdges = dialogue.edges.filter(edge => edge.sourceOption === 'o_dup');

    expect(dupEdges).toHaveLength(1);
    expect(notes.filter(note => note.includes('o_dup'))).toStrictEqual([]);
  });

  it('creates a flow edge for an option target with no edge', () => {
    const {project} = migrate(v1Project());
    const dialogue = dialogueOf(project);
    const soloEdges = dialogue.edges.filter(edge => edge.sourceOption === 'o_solo');

    expect(soloEdges).toHaveLength(1);
    expect(soloEdges[0]).toMatchObject({source: 'n2', role: 'flow', target: 'n4'});
  });

  it('resolves target conflicts in favor of the edge and reports the repair', () => {
    const {project, notes} = migrate(v1Project());
    const dialogue = dialogueOf(project);
    const conflictEdges = dialogue.edges.filter(edge => edge.sourceOption === 'o_conflict');

    expect(conflictEdges).toHaveLength(1);
    expect(conflictEdges[0]).toMatchObject({target: 'n3'});
    expect(notes.some(note => note.includes('o_conflict') && note.includes('e_conflict'))).toBe(true);
  });

  it('turns check targets into success and failure edges and drops the fields', () => {
    const {project} = migrate(v1Project());
    const dialogue = dialogueOf(project);
    const outcomes = dialogue.edges.filter(edge => edge.sourceOption === 'o_check');
    const choice = dialogue.nodes.find(node => node.id === 'n2');

    expect(outcomes.map(edge => ({role: edge.role, target: edge.target}))).toStrictEqual([
      {role: 'success', target: 'n3'},
      {role: 'failure', target: 'n4'},
    ]);

    if (choice?.kind !== 'choice') {
      expect.unreachable('expected a choice node');
    }

    expect(choice.options.find(option => option.id === 'o_check')?.skillCheck).toStrictEqual({
      skillId: 'var_wit',
      baseDifficulty: 10,
      checkType: 'red',
    });
  });

  it('drops expressionId with a note when no expression slots exist', () => {
    const {project, notes} = migrate(v1Project());
    const line = dialogueOf(project).nodes.find(node => node.id === 'n1');

    if (line?.kind !== 'line') {
      expect.unreachable('expected a line node');
    }

    expect(line.expression).toBeUndefined();
    expect(notes.some(note => note.includes('exp_smile'))).toBe(true);
  });

  it('maps expressionId onto the first expression slot when slots exist', () => {
    const data = v1Project();

    data.settings = {expressionSlots: [{id: 'slot_emotion', name: 'emotion', options: ['exp_smile']}]};

    const {project, notes} = migrate(data);
    const line = dialogueOf(project).nodes.find(node => node.id === 'n1');

    if (line?.kind !== 'line') {
      expect.unreachable('expected a line node');
    }

    expect(line.expression).toStrictEqual({slot_emotion: 'exp_smile'});
    expect(notes.some(note => note.includes('exp_smile'))).toBe(false);
  });

  it('drops stale source handles that match no option', () => {
    const data = v1Project();
    const dialogue = (data.dialogues as Record<string, unknown>[])[0] as Record<string, unknown>;

    (dialogue.edges as Record<string, unknown>[]).push({
      id: 'e_stale',
      source: 'n1',
      target: 'n2',
      sourceHandle: 'ghost_option',
    });

    const {project, notes} = migrate(data);
    const stale = dialogueOf(project).edges.find(edge => edge.id === 'e_stale');

    expect(stale?.sourceOption).toBeUndefined();
    expect(notes.some(note => note.includes('ghost_option'))).toBe(true);
  });
});

describe('deserializeProject migration', () => {
  it('loads a v1 document transparently', () => {
    const result = deserializeProject(JSON.stringify(v1Project()));

    if (!result.ok) {
      expect.unreachable(`expected ok, got: ${result.error.message}`);
    }

    expect(result.value.project.schemaVersion).toBe(2);
    expect(result.value.notes.length).toBeGreaterThan(0);
  });

  it('round-trips a migrated document without further changes', () => {
    const first = deserializeProject(JSON.stringify(v1Project()));

    if (!first.ok) {
      expect.unreachable('expected ok');
    }

    const second = deserializeProject(serializeProject(first.value.project));

    if (!second.ok) {
      expect.unreachable('expected ok');
    }

    expect(second.value.project).toStrictEqual(first.value.project);
    expect(second.value.notes).toStrictEqual([]);
  });
});

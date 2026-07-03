import {describe, expect, it} from 'vite-plus/test';

import {buildProject} from '../fixtures';
import {SCHEMA_VERSION} from '../schema';
import {deserializeProject, serializeProject} from './serial';

describe('serializeProject', () => {
  it('produces pretty-printed JSON', () => {
    const json = serializeProject(buildProject());

    expect(json).toContain('"schemaVersion": 2');
    expect(json.split('\n').length).toBeGreaterThan(1);
  });
});

describe('deserializeProject', () => {
  it('round-trips a valid project', () => {
    const project = buildProject();
    const result = deserializeProject(serializeProject(project));

    if (!result.ok) {
      expect.unreachable(`expected ok, got: ${result.error.message}`);
    }

    expect(result.value.project).toStrictEqual(project);
    expect(result.value.notes).toStrictEqual([]);
  });

  it('accepts a full-featured document', () => {
    const project = buildProject({
      settings: {
        stageSlots: [{id: 'slot_place', name: 'place', options: ['harbor', 'tavern']}],
        expressionSlots: [{id: 'slot_emotion', name: 'emotion', options: ['calm', 'angry']}],
        checkRoll: {formula: '1d20', critFail: true, critSuccess: false},
      },
      dialogues: [
        {
          id: 'dlg',
          name: 'Checks',
          entryNodeId: 'n0',
          stageDefaults: {slot_place: 'harbor'},
          nodes: [
            {
              id: 'n0',
              kind: 'line',
              text: 'You made it past the gate.',
              failureText: 'The gate stays shut.',
              check: {skillId: 'var_perception', baseDifficulty: 10, checkType: 'red'},
              passiveCheck: {skillId: 'var_empathy', threshold: 8, mode: 'below'},
              stage: {slot_place: 'tavern'},
              expression: {slot_emotion: 'calm'},
            },
            {
              id: 'n1',
              kind: 'choice',
              text: 'What do you do?',
              conditions: ['hero.money > 0'],
              effects: ['hero.money -= 1'],
              textVariants: [{id: 'v1', conditions: ['hero.origin == "noble"'], text: 'M’lady?'}],
              options: [
                {
                  id: 'o1',
                  text: '[Rhetoric] Convince her',
                  spokenText: 'Listen — you want to let me through.',
                  visibility: 'available',
                  lockReason: 'Rhetoric too low',
                  skillCheck: {
                    skillId: 'var_rhetoric',
                    baseDifficulty: 12,
                    checkType: 'white',
                    modifiers: [
                      {id: 'm1', condition: 'quest.found_diary', bonus: 1, description: 'Found the diary (+1)'},
                    ],
                  },
                },
              ],
            },
            {id: 'n2', kind: 'hub', conditions: ['hero.money > 0'], effects: ['hero.money -= 1']},
            {id: 'n3', kind: 'jump', jumpTarget: {dialogueId: 'dlg_other'}},
          ],
          edges: [
            {
              id: 'e1',
              source: 'n1',
              sourceOption: 'o1',
              role: 'success',
              target: 'n1',
              priority: 1,
              conditions: ['true'],
              effects: ['hero.money += 5'],
            },
          ],
          editor: {
            nodePositions: {n1: {x: 10, y: 20}},
            nodeSizes: {n1: {width: 200, height: 80}},
            viewport: {x: 0, y: 0, zoom: 1.5},
            groups: [{id: 'g1', name: 'Act 1', nodeIds: ['n1'], collapsed: false}],
          },
        },
      ],
    });

    const result = deserializeProject(serializeProject(project));

    expect(result.ok).toBe(true);
  });

  it('rejects an empty jump target', () => {
    const project = buildProject();
    const dialogue = project.dialogues[0];

    if (dialogue === undefined) {
      expect.unreachable('fixture has a dialogue');
    }

    dialogue.nodes.push({id: 'n_jump', kind: 'jump', jumpTarget: {}});

    const result = deserializeProject(serializeProject(project));

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.issues?.join('\n')).toMatch(/jump target/i);
  });

  it('rejects an option id that collides with the handle encoding', () => {
    const project = buildProject();
    const dialogue = project.dialogues[0];

    if (dialogue === undefined) {
      expect.unreachable('fixture has a dialogue');
    }

    dialogue.nodes.push({
      id: 'n_choice',
      kind: 'choice',
      text: 'Pick.',
      options: [{id: 'a:b', text: 'Colon', visibility: 'available'}],
    });

    const result = deserializeProject(serializeProject(project));

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.issues?.join('\n')).toMatch(/option id/i);
  });

  it('rejects malformed JSON', () => {
    const result = deserializeProject('{not json');

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.message).toMatch(/json/i);
  });

  it('rejects a document that fails schema validation', () => {
    const result = deserializeProject('{"schemaVersion": 1, "meta": {}}');

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.message).toMatch(/invalid/i);
    expect(result.error.issues?.length).toBeGreaterThan(0);
  });

  it('rejects a newer schema version', () => {
    const project = buildProject({schemaVersion: SCHEMA_VERSION + 1});
    const result = deserializeProject(serializeProject(project));

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.message).toMatch(/schema version/i);
  });

  it('rejects invalid nested structures with a pointed issue path', () => {
    const project = buildProject();
    const json = serializeProject(project).replace('"kind": "line"', '"kind": "npc"');
    const result = deserializeProject(json);

    if (result.ok) {
      expect.unreachable('expected an error');
    }

    expect(result.error.issues?.join('\n')).toMatch(/kind/);
  });
});

import {describe, expect, it} from 'vite-plus/test';

import {buildProject} from '../fixtures';
import {SCHEMA_VERSION} from '../schema';
import {deserializeProject, serializeProject} from './serial';

describe('serializeProject', () => {
  it('produces pretty-printed JSON', () => {
    const json = serializeProject(buildProject());

    expect(json).toContain('"schemaVersion": 1');
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

    expect(result.value).toStrictEqual(project);
  });

  it('accepts a full-featured document', () => {
    const project = buildProject({
      dialogues: [
        {
          id: 'dlg',
          name: 'Checks',
          entryNodeId: 'n1',
          nodes: [
            {
              id: 'n1',
              kind: 'choice',
              text: 'What do you do?',
              conditions: ['hero.money > 0'],
              effects: ['hero.money -= 1'],
              passiveCheck: {skillId: 'var_empathy', threshold: 8},
              textVariants: [{id: 'v1', conditions: ['hero.origin == "noble"'], text: 'M’lady?'}],
              options: [
                {
                  id: 'o1',
                  text: '[Rhetoric] Convince her',
                  targetNodeId: 'n1',
                  visibility: 'available',
                  lockReason: 'Rhetoric too low',
                  skillCheck: {
                    skillId: 'var_rhetoric',
                    baseDifficulty: 12,
                    checkType: 'white',
                    modifiers: [
                      {id: 'm1', condition: 'quest.found_diary', bonus: 1, description: 'Found the diary (+1)'},
                    ],
                    successTargetId: 'n1',
                    failureTargetId: 'n1',
                  },
                },
              ],
            },
          ],
          edges: [{id: 'e1', source: 'n1', target: 'n1', sourceHandle: 'o1', priority: 1, conditions: ['true']}],
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

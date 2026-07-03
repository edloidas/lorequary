import {describe, expect, it} from 'vite-plus/test';

import type {GraphIssue} from './graph';

import {
  buildChoiceNode,
  buildDialogue,
  buildEdge,
  buildJumpNode,
  buildNode,
  buildProject,
  buildVariable,
} from '../fixtures';
import {validateProject} from './graph';

const codes = (issues: GraphIssue[]): string[] => issues.map(issue => issue.code);

describe('validateProject', () => {
  it('returns no issues for a valid project', () => {
    expect(validateProject(buildProject())).toStrictEqual([]);
  });

  it('reports a missing entry node', () => {
    const project = buildProject({dialogues: [buildDialogue({entryNodeId: 'ghost'})]});
    const issues = validateProject(project);

    expect(codes(issues)).toContain('missing-entry');
  });

  it('reports broken edges', () => {
    const project = buildProject({
      dialogues: [buildDialogue({edges: [buildEdge({id: 'e_bad', source: 'node_1', target: 'ghost'})]})],
    });
    const issues = validateProject(project);
    const issue = issues.find(i => i.code === 'broken-edge');

    expect(issue).toMatchObject({severity: 'error', dialogueId: 'dlg_intro', edgeId: 'e_bad'});
  });

  it('reports duplicate node ids', () => {
    const project = buildProject({
      dialogues: [buildDialogue({nodes: [buildNode(), buildNode(), buildNode({id: 'node_2'})]})],
    });

    expect(codes(validateProject(project))).toContain('duplicate-node-id');
  });

  it('reports option edges pointing at a missing node', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildChoiceNode({
              id: 'node_1',
              options: [{id: 'o1', text: 'Go', visibility: 'available'}],
            }),
            buildNode({id: 'node_2'}),
          ],
          edges: [
            buildEdge({id: 'e_opt', sourceOption: 'o1', target: 'ghost'}),
            buildEdge({id: 'e_flow', source: 'node_2', target: 'node_1'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'broken-edge');

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({dialogueId: 'dlg_intro', edgeId: 'e_opt'});
  });

  it('accepts a checked option wired through success and failure edges', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'node_1'}),
            buildChoiceNode({
              id: 'node_2',
              options: [
                {
                  id: 'o1',
                  text: 'Try',
                  visibility: 'available',
                  skillCheck: {skillId: 'var_money', baseDifficulty: 10, checkType: 'white'},
                },
              ],
            }),
            buildNode({id: 'node_3'}),
          ],
          edges: [
            buildEdge(),
            buildEdge({id: 'e_ok', source: 'node_2', sourceOption: 'o1', role: 'success', target: 'node_3'}),
            buildEdge({id: 'e_fail', source: 'node_2', sourceOption: 'o1', role: 'failure', target: 'node_3'}),
          ],
        }),
      ],
    });

    expect(validateProject(project)).toStrictEqual([]);
  });

  it('reports a choice node with no options', () => {
    const project = buildProject({
      dialogues: [buildDialogue({nodes: [buildChoiceNode({id: 'node_1'}), buildNode({id: 'node_2'})]})],
    });

    expect(codes(validateProject(project))).toContain('empty-choice');
  });

  it('reports a missing character reference', () => {
    const project = buildProject({
      dialogues: [buildDialogue({nodes: [buildNode({characterId: 'char_ghost'}), buildNode({id: 'node_2'})]})],
    });
    const issue = validateProject(project).find(i => i.code === 'missing-character');

    expect(issue).toMatchObject({severity: 'error', nodeId: 'node_1'});
  });

  it('reports an unknown skill variable in passive and skill checks', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'node_1', passiveCheck: {skillId: 'var_ghost', threshold: 5}}),
            buildNode({id: 'node_2'}),
          ],
        }),
      ],
    });

    expect(codes(validateProject(project))).toContain('unknown-skill');
  });

  it('reports invalid condition and effect expressions with locations', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'node_1', conditions: ['hero.money >>> 5'], effects: ['hero.ghost += 1']}),
            buildNode({id: 'node_2'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'invalid-expression');

    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({severity: 'error', nodeId: 'node_1'});
    expect(issues.map(i => i.message).join('\n')).toMatch(/hero\.ghost/);
  });

  it('validates expressions in variants, options, modifiers, and edges', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildChoiceNode({
              id: 'node_1',
              textVariants: [{id: 'v1', conditions: ['bad.var'], text: 'Variant'}],
              options: [
                {
                  id: 'o1',
                  text: 'Go',
                  visibility: 'available',
                  conditions: ['also.bad'],
                  effects: ['ghost.var += 1'],
                  skillCheck: {
                    skillId: 'var_money',
                    baseDifficulty: 10,
                    checkType: 'white',
                    modifiers: [{id: 'm1', condition: 'nope.nope', bonus: 1, description: 'Nope'}],
                  },
                },
              ],
            }),
            buildNode({id: 'node_2'}),
          ],
          edges: [buildEdge({conditions: ['edge.bad'], effects: ['edge.ghost += 1']})],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'invalid-expression');

    expect(issues.length).toBe(6);
  });

  it('validates computed variable expressions without a boolean requirement', () => {
    const valid = buildProject({
      variables: [
        buildVariable(),
        buildVariable({id: 'var_c', key: 'hero.double', computed: {expression: 'hero.money * 2', dependencies: []}}),
      ],
    });

    expect(validateProject(valid)).toStrictEqual([]);

    const invalid = buildProject({
      variables: [
        buildVariable(),
        buildVariable({id: 'var_c', key: 'hero.double', computed: {expression: 'ghost.var * 2', dependencies: []}}),
      ],
    });

    expect(codes(validateProject(invalid))).toContain('invalid-expression');
  });

  it('reports unreachable nodes as warnings', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [buildNode(), buildNode({id: 'node_2'}), buildNode({id: 'island'})],
        }),
      ],
    });
    const issue = validateProject(project).find(i => i.code === 'unreachable-node');

    expect(issue).toMatchObject({severity: 'warning', nodeId: 'island'});
  });

  it('treats check outcome edges as reachability paths', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'node_1'}),
            buildChoiceNode({
              id: 'choice',
              options: [
                {
                  id: 'o1',
                  text: 'Try',
                  visibility: 'available',
                  skillCheck: {skillId: 'var_money', baseDifficulty: 10, checkType: 'white'},
                },
              ],
            }),
            buildNode({id: 'win'}),
            buildNode({id: 'lose'}),
          ],
          edges: [
            buildEdge({target: 'choice'}),
            buildEdge({id: 'e_ok', source: 'choice', sourceOption: 'o1', role: 'success', target: 'win'}),
            buildEdge({id: 'e_fail', source: 'choice', sourceOption: 'o1', role: 'failure', target: 'lose'}),
          ],
        }),
      ],
    });

    expect(validateProject(project)).toStrictEqual([]);
  });

  it('treats same-dialogue jump targets as reachability paths', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode(),
            buildJumpNode({id: 'node_2', jumpTarget: {nodeId: 'island'}}),
            buildNode({id: 'island'}),
          ],
        }),
      ],
    });

    expect(validateProject(project)).toStrictEqual([]);
  });

  it('reports empty node text as a warning', () => {
    const project = buildProject({
      dialogues: [buildDialogue({nodes: [buildNode({text: '  '}), buildNode({id: 'node_2'})]})],
    });
    const issue = validateProject(project).find(i => i.code === 'empty-text');

    expect(issue).toMatchObject({severity: 'warning', nodeId: 'node_1'});
  });
});

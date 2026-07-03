import {describe, expect, it} from 'vite-plus/test';

import type {GraphIssue} from './graph';

import {
  buildChoiceNode,
  buildDialogue,
  buildEdge,
  buildHubNode,
  buildJumpNode,
  buildNode,
  buildProject,
  buildVariable,
} from '../fixtures';
import {validateProject} from './graph';

const CHECK = {skillId: 'var_money', baseDifficulty: 10, checkType: 'white'} as const;

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

  it('does not report empty text for hub and jump nodes', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode(),
            buildHubNode({id: 'node_2'}),
            buildJumpNode({id: 'node_3', jumpTarget: {nodeId: 'node_1'}}),
          ],
          edges: [buildEdge(), buildEdge({id: 'edge_2', source: 'node_2', target: 'node_3'})],
        }),
      ],
    });

    expect(validateProject(project).filter(i => i.code === 'empty-text')).toStrictEqual([]);
  });
});

describe('edge-port rules', () => {
  it('reports choice-entry when the entry node is a choice', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildChoiceNode({options: [{id: 'o1', text: 'Go', visibility: 'available'}]}),
            buildNode({id: 'node_2'}),
          ],
          edges: [buildEdge({sourceOption: 'o1'})],
        }),
      ],
    });
    const issue = validateProject(project).find(i => i.code === 'choice-entry');

    expect(issue).toMatchObject({severity: 'error', nodeId: 'node_1'});
  });

  it('reports broken-option-ref when an edge references a missing option', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          entryNodeId: 'node_2',
          nodes: [
            buildChoiceNode({options: [{id: 'o1', text: 'Go', visibility: 'available'}]}),
            buildNode({id: 'node_2'}),
          ],
          edges: [
            buildEdge({id: 'e_in', source: 'node_2', target: 'node_1'}),
            buildEdge({id: 'e_ghost', sourceOption: 'ghost', target: 'node_2'}),
            buildEdge({id: 'e_o1', sourceOption: 'o1', target: 'node_2'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'broken-option-ref');

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({severity: 'error', edgeId: 'e_ghost'});
  });

  it('reports role-mismatch for outcome edges without a check and flow edges from checked ports', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          entryNodeId: 'node_2',
          nodes: [
            buildChoiceNode({
              options: [
                {id: 'o_plain', text: 'Go', visibility: 'available'},
                {id: 'o_check', text: 'Try', visibility: 'available', skillCheck: CHECK},
              ],
            }),
            buildNode({id: 'node_2'}),
          ],
          edges: [
            buildEdge({id: 'e_in', source: 'node_2', target: 'node_1'}),
            buildEdge({id: 'e_bad_outcome', sourceOption: 'o_plain', role: 'success', target: 'node_2'}),
            buildEdge({id: 'e_bad_flow', sourceOption: 'o_check', role: 'flow', target: 'node_2'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'role-mismatch');

    expect(issues.map(i => i.edgeId).sort((a, b) => (a ?? '').localeCompare(b ?? ''))).toStrictEqual([
      'e_bad_flow',
      'e_bad_outcome',
    ]);
  });

  it('reports role-mismatch for a flow edge from a line with an entry check', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [buildNode({check: CHECK, failureText: 'No.'}), buildNode({id: 'node_2'})],
          edges: [buildEdge({id: 'e_flow', role: 'flow'})],
        }),
      ],
    });

    expect(validateProject(project).filter(i => i.code === 'role-mismatch')).toHaveLength(1);
  });

  it('reports broken-jump for unresolvable jump targets', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode(),
            buildJumpNode({id: 'node_2'}),
            buildJumpNode({id: 'node_3', jumpTarget: {nodeId: 'ghost'}}),
            buildJumpNode({id: 'node_4', jumpTarget: {dialogueId: 'dlg_ghost'}}),
            buildJumpNode({id: 'node_5', jumpTarget: {dialogueId: 'dlg_intro'}}),
          ],
          edges: [
            buildEdge(),
            buildEdge({id: 'e2', target: 'node_3'}),
            buildEdge({id: 'e3', target: 'node_4'}),
            buildEdge({id: 'e4', target: 'node_5'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'broken-jump');

    // No target, missing node, unknown dialogue, and same-dialogue without a node.
    expect(issues.map(i => i.nodeId).sort((a, b) => (a ?? '').localeCompare(b ?? ''))).toStrictEqual([
      'node_2',
      'node_3',
      'node_4',
      'node_5',
    ]);
  });

  it('accepts a cross-dialogue jump to another dialogue entry', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [buildNode(), buildJumpNode({id: 'node_2', jumpTarget: {dialogueId: 'dlg_other'}})],
        }),
        buildDialogue({id: 'dlg_other', name: 'Other'}),
      ],
    });

    expect(validateProject(project).filter(i => i.code === 'broken-jump')).toStrictEqual([]);
  });

  it('reports jump-has-edges once per jump node with outgoing edges', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [buildNode(), buildJumpNode({id: 'node_2', jumpTarget: {nodeId: 'node_1'}})],
          edges: [
            buildEdge(),
            buildEdge({id: 'e_out1', source: 'node_2', target: 'node_1'}),
            buildEdge({id: 'e_out2', source: 'node_2', target: 'node_1'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'jump-has-edges');

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({severity: 'error', nodeId: 'node_2'});
  });

  it('reports unknown-stage-slot for unknown slots and unknown options', () => {
    const project = buildProject({
      settings: {stageSlots: [{id: 'slot_place', name: 'place', options: ['harbor']}]},
      dialogues: [
        buildDialogue({
          stageDefaults: {slot_ghost: 'x'},
          nodes: [buildNode({stage: {slot_place: 'moon'}}), buildNode({id: 'node_2', stage: {slot_place: 'harbor'}})],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'unknown-stage-slot');

    expect(issues).toHaveLength(2);
  });

  it('reports missing-outcome for partially wired checks', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({check: CHECK, failureText: 'No.'}),
            buildChoiceNode({
              id: 'node_2',
              options: [{id: 'o1', text: 'Try', visibility: 'available', skillCheck: CHECK}],
            }),
            buildNode({id: 'node_3'}),
          ],
          edges: [
            buildEdge({role: 'success'}),
            buildEdge({id: 'e2', source: 'node_1', role: 'failure', target: 'node_2'}),
            buildEdge({id: 'e3', source: 'node_2', sourceOption: 'o1', role: 'success', target: 'node_3'}),
          ],
        }),
      ],
    });
    const issues = validateProject(project).filter(i => i.code === 'missing-outcome');

    // The checked line is fully wired; the option lacks its failure edge.
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({severity: 'warning', nodeId: 'node_2', optionId: 'o1'});
  });

  it('reports dangling-option for option ports with zero edges', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          entryNodeId: 'node_2',
          nodes: [
            buildChoiceNode({options: [{id: 'o1', text: 'Go', visibility: 'available'}]}),
            buildNode({id: 'node_2'}),
          ],
          edges: [buildEdge({id: 'e_in', source: 'node_2', target: 'node_1'})],
        }),
      ],
    });
    const issue = validateProject(project).find(i => i.code === 'dangling-option');

    expect(issue).toMatchObject({severity: 'warning', nodeId: 'node_1', optionId: 'o1'});
  });

  it('reports dead-hub for hubs with no outgoing edges', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [buildNode(), buildHubNode({id: 'node_2'})],
        }),
      ],
    });
    const issue = validateProject(project).find(i => i.code === 'dead-hub');

    expect(issue).toMatchObject({severity: 'warning', nodeId: 'node_2'});
  });

  it('accepts a hub with conditions, effects, and outgoing flow', () => {
    const project = buildProject({
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode(),
            buildHubNode({id: 'node_2', conditions: ['hero.money > 0'], effects: ['hero.money -= 1']}),
            buildNode({id: 'node_3'}),
          ],
          edges: [buildEdge(), buildEdge({id: 'e2', source: 'node_2', target: 'node_3'})],
        }),
      ],
    });

    expect(validateProject(project)).toStrictEqual([]);
  });
});

import {describe, expect, it} from 'vite-plus/test';

import type {ChoiceOption, ProjectDocument} from '../schema';

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
import {startPlaythrough} from './engine';

// rng stub: cycles through the given [0,1) values.
const seq = (...values: number[]): (() => number) => {
  let index = 0;

  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
};

const VARIABLES = [
  buildVariable(),
  buildVariable({id: 'var_rhetoric', name: 'Rhetoric', key: 'skills.rhetoric', defaultValue: 4}),
  buildVariable({id: 'var_empathy', name: 'Empathy', key: 'skills.empathy', defaultValue: 10}),
  buildVariable({id: 'var_diary', name: 'Found Diary', key: 'quest.found_diary', type: 'boolean', defaultValue: true}),
];

const buildOption = (overrides?: Partial<ChoiceOption>): ChoiceOption => ({
  id: 'o1',
  text: 'Continue',
  visibility: 'available',
  ...overrides,
});

const linearProject = (): ProjectDocument =>
  buildProject({
    variables: VARIABLES,
    dialogues: [
      buildDialogue({
        entryNodeId: 'n1',
        nodes: [
          buildNode({id: 'n1', text: 'First.', characterId: 'char_aurelia', effects: ['hero.money += 10']}),
          buildNode({id: 'n2', text: 'Second.', conditions: ['hero.money > 1000']}),
          buildNode({id: 'n3', text: 'Third.'}),
        ],
        edges: [buildEdge({id: 'e1', source: 'n1', target: 'n2'}), buildEdge({id: 'e2', source: 'n2', target: 'n3'})],
      }),
    ],
  });

describe('startPlaythrough', () => {
  it('starts at the entry node with a resolved line view', () => {
    const run = startPlaythrough(linearProject(), 'dlg_intro');
    const view = run.current();

    expect(view).toMatchObject({kind: 'line', nodeId: 'n1', text: 'First.', characterId: 'char_aurelia'});
  });

  it('initializes variables from defaults and applies entry node effects', () => {
    const run = startPlaythrough(linearProject(), 'dlg_intro');

    expect(run.variables['hero.money']).toBe(110);
    expect(run.variables['skills.rhetoric']).toBe(4);
  });

  it('throws on an unknown dialogue id', () => {
    expect(() => startPlaythrough(linearProject(), 'nope')).toThrow(/dialogue/i);
  });
});

describe('advance', () => {
  it('skips line nodes whose conditions fail', () => {
    const run = startPlaythrough(linearProject(), 'dlg_intro');

    run.advance();

    // n2 requires money > 1000 — skipped straight to n3.
    expect(run.current()).toMatchObject({nodeId: 'n3'});
  });

  it('ends when there are no outgoing edges', () => {
    const run = startPlaythrough(linearProject(), 'dlg_intro');

    run.advance();
    run.advance();

    expect(run.current()).toBeNull();
    expect(run.ended).toBe(true);
  });

  it('respects edge conditions and priority order', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({id: 'rich', text: 'Rich path.'}),
            buildNode({id: 'poor', text: 'Poor path.'}),
          ],
          edges: [
            buildEdge({id: 'e_poor', source: 'n1', target: 'poor', priority: 2}),
            buildEdge({id: 'e_rich', source: 'n1', target: 'rich', priority: 1, conditions: ['hero.money >= 100']}),
          ],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'rich'});
  });

  it('hides passive-check lines below the skill threshold', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({id: 'voice', text: 'Empathy whispers…', passiveCheck: {skillId: 'var_empathy', threshold: 12}}),
            buildNode({id: 'n3', text: 'After.'}),
          ],
          edges: [
            buildEdge({id: 'e1', source: 'n1', target: 'voice'}),
            buildEdge({id: 'e2', source: 'voice', target: 'n3'}),
          ],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    // Empathy is 10 < 12 — the interjection is skipped.
    expect(run.current()).toMatchObject({nodeId: 'n3'});
  });

  it('resolves text variants by condition', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({
              id: 'n1',
              text: 'Default greeting.',
              textVariants: [
                {id: 'v1', conditions: ['hero.money > 1000'], text: 'Greetings, moneybags.'},
                {id: 'v2', conditions: ['hero.money >= 100'], text: 'Greetings, solvent one.'},
              ],
            }),
          ],
          edges: [],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    expect(run.current()).toMatchObject({text: 'Greetings, solvent one.'});
  });

  it('records errors for unparseable conditions and treats them as false', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({id: 'n2', text: 'Gated.', conditions: ['hero.money >>> 5']}),
            buildNode({id: 'n3', text: 'Fallback.'}),
          ],
          edges: [buildEdge({id: 'e1', source: 'n1', target: 'n2'}), buildEdge({id: 'e2', source: 'n2', target: 'n3'})],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n3'});
    expect(run.errors.length).toBeGreaterThan(0);
  });
});

// Options without a check flow to 'end'; checked options route success → 'win', failure → 'lose'.
const checkProject = (options: ChoiceOption[], entryEffects?: string[]): ProjectDocument =>
  buildProject({
    variables: VARIABLES,
    dialogues: [
      buildDialogue({
        entryNodeId: 'choice',
        nodes: [
          buildChoiceNode({id: 'choice', text: 'Decide.', options, effects: entryEffects}),
          buildNode({id: 'end', text: 'Done.'}),
          buildNode({id: 'win', text: 'Won.'}),
          buildNode({id: 'lose', text: 'Lost.'}),
        ],
        edges: [
          buildEdge({id: 'back_win', source: 'win', target: 'choice'}),
          buildEdge({id: 'back_lose', source: 'lose', target: 'choice'}),
          ...options.flatMap(option =>
            option.skillCheck === undefined
              ? [buildEdge({id: `e_${option.id}`, source: 'choice', sourceOption: option.id, target: 'end'})]
              : [
                  buildEdge({
                    id: `e_${option.id}_ok`,
                    source: 'choice',
                    sourceOption: option.id,
                    role: 'success',
                    target: 'win',
                  }),
                  buildEdge({
                    id: `e_${option.id}_fail`,
                    source: 'choice',
                    sourceOption: option.id,
                    role: 'failure',
                    target: 'lose',
                  }),
                ],
          ),
        ],
      }),
    ],
  });

const RHETORIC_CHECK = {
  skillId: 'var_rhetoric',
  baseDifficulty: 12,
  checkType: 'white',
} as const;

describe('choice options', () => {
  it('exposes option states in the choice view', () => {
    const project = checkProject([
      buildOption({id: 'open', text: 'Leave'}),
      buildOption({
        id: 'gated',
        text: 'Bribe',
        conditions: ['hero.money >= 1000'],
        visibility: 'locked_visible',
        lockReason: 'Not enough money',
      }),
      buildOption({
        id: 'secret',
        text: 'Blackmail',
        conditions: ['quest.found_diary == false'],
        visibility: 'invisible',
      }),
    ]);
    const run = startPlaythrough(project, 'dlg_intro');
    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected a choice view');
    }

    expect(view.options).toStrictEqual([
      expect.objectContaining({optionId: 'open', state: 'available'}),
      expect.objectContaining({optionId: 'gated', state: 'locked_visible', lockReason: 'Not enough money'}),
      expect.objectContaining({optionId: 'secret', state: 'invisible'}),
    ]);
  });

  it('hides an available-visibility option when its conditions fail', () => {
    const project = checkProject([buildOption({id: 'o1', conditions: ['hero.money > 1000']})]);
    const run = startPlaythrough(project, 'dlg_intro');
    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected a choice view');
    }

    expect(view.options[0]).toMatchObject({state: 'invisible'});
  });

  it('moves to the target and applies effects on choose', () => {
    const project = checkProject([buildOption({id: 'o1', effects: ['hero.money -= 25']})]);
    const run = startPlaythrough(project, 'dlg_intro');

    run.choose('o1');

    expect(run.current()).toMatchObject({nodeId: 'end'});
    expect(run.variables['hero.money']).toBe(75);
  });

  it('rejects choosing a locked option', () => {
    const project = checkProject([
      buildOption({id: 'o1', conditions: ['hero.money > 1000'], visibility: 'locked_visible'}),
    ]);
    const run = startPlaythrough(project, 'dlg_intro');

    expect(() => run.choose('o1')).toThrow(/not selectable/i);
  });
});

describe('skill checks', () => {
  it('computes the roll: 2d6 + skill + modifiers vs difficulty', () => {
    const project = checkProject([
      buildOption({
        id: 'o1',
        skillCheck: {
          ...RHETORIC_CHECK,
          modifiers: [
            {id: 'm1', condition: 'quest.found_diary', bonus: 1, description: 'Found the diary (+1)'},
            {id: 'm2', condition: 'hero.money > 1000', bonus: 2, description: 'Rich (+2)'},
          ],
        },
      }),
    ]);
    // Two d6 rolls of (0.5 → 4): rolled 8, +4 rhetoric, +1 diary = 13 >= 12 → success.
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0.5, 0.5)});
    const outcome = run.choose('o1');

    expect(outcome.check).toStrictEqual({
      rolled: 8,
      total: 13,
      dc: 12,
      passed: true,
      appliedModifiers: [expect.objectContaining({id: 'm1'})],
    });
    expect(run.current()).toMatchObject({nodeId: 'win'});
  });

  it('routes to the failure target on a failed roll', () => {
    const project = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK}})]);
    // Two rolls of 1: rolled 2 → critical failure regardless of totals.
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});
    const outcome = run.choose('o1');

    expect(outcome.check?.passed).toBe(false);
    expect(run.current()).toMatchObject({nodeId: 'lose'});
  });

  it('treats a natural 12 as success and a natural 2 as failure', () => {
    const highDc = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK, baseDifficulty: 100}})]);
    const boxcars = startPlaythrough(highDc, 'dlg_intro', {rng: seq(0.99, 0.99)});

    expect(boxcars.choose('o1').check).toMatchObject({rolled: 12, passed: true});

    const lowDc = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK, baseDifficulty: 1}})]);
    const snakeEyes = startPlaythrough(lowDc, 'dlg_intro', {rng: seq(0, 0)});

    expect(snakeEyes.choose('o1').check).toMatchObject({rolled: 2, passed: false});
  });

  it('locks a red check after failure but keeps white checks retryable', () => {
    const project = checkProject([
      buildOption({id: 'red', skillCheck: {...RHETORIC_CHECK, checkType: 'red'}}),
      buildOption({id: 'white', skillCheck: {...RHETORIC_CHECK}}),
    ]);
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});

    run.choose('red');
    run.advance(); // lose → back to choice

    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected a choice view');
    }

    expect(view.options).toStrictEqual([
      expect.objectContaining({optionId: 'red', state: 'locked_used'}),
      expect.objectContaining({optionId: 'white', state: 'available'}),
    ]);
    expect(() => run.choose('red')).toThrow(/not selectable/i);
    expect(run.choose('white').check?.passed).toBe(false);
  });

  it('supports forced outcomes and check modes', () => {
    const project = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK}})]);

    const forced = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});
    expect(forced.choose('o1', {outcome: 'success'}).check?.passed).toBe(true);

    const alwaysPass = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0), checkMode: 'always_pass'});
    expect(alwaysPass.choose('o1').check?.passed).toBe(true);

    const alwaysFail = startPlaythrough(project, 'dlg_intro', {rng: seq(0.99, 0.99), checkMode: 'always_fail'});
    expect(alwaysFail.choose('o1').check?.passed).toBe(false);
  });
});

describe('seenCount, back, and reset', () => {
  it('exposes seenCount() to conditions', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'choice',
          nodes: [
            buildChoiceNode({
              id: 'choice',
              text: 'Around we go.',
              options: [buildOption({id: 'loop', text: 'Again'})],
            }),
            buildNode({id: 'mid', text: 'Passing through.'}),
            buildNode({id: 'twice', text: 'Seen it before.', conditions: ['seenCount() >= 1']}),
            buildNode({id: 'fresh', text: 'First time here.'}),
          ],
          edges: [
            buildEdge({id: 'e_loop', source: 'choice', sourceOption: 'loop', target: 'mid'}),
            buildEdge({id: 'e1', source: 'mid', target: 'twice'}),
            buildEdge({id: 'e2', source: 'twice', target: 'fresh'}),
            buildEdge({id: 'e3', source: 'fresh', target: 'choice'}),
          ],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.choose('loop');
    run.advance();

    // First pass: 'twice' has seenCount 0 — its own condition fails, lands on 'fresh'.
    expect(run.current()).toMatchObject({nodeId: 'fresh'});

    run.advance(); // back to choice
    run.choose('loop');
    run.advance();

    // 'twice' was never entered — still 0. But 'fresh' was: this loop asserts gating is per-node.
    expect(run.current()).toMatchObject({nodeId: 'fresh'});
    expect(run.seenCount('fresh')).toBe(2);
    expect(run.seenCount('choice')).toBe(2);
  });

  it('back() restores position and variables', () => {
    const project = checkProject([buildOption({id: 'o1', effects: ['hero.money -= 25']})]);
    const run = startPlaythrough(project, 'dlg_intro');

    run.choose('o1');
    expect(run.variables['hero.money']).toBe(75);

    run.back();

    expect(run.current()).toMatchObject({nodeId: 'choice'});
    expect(run.variables['hero.money']).toBe(100);
  });

  it('reset() restores the initial state including red check locks', () => {
    const project = checkProject([buildOption({id: 'red', skillCheck: {...RHETORIC_CHECK, checkType: 'red'}})]);
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});

    run.choose('red');
    run.reset();

    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected a choice view');
    }

    expect(view.options[0]).toMatchObject({state: 'available'});
    expect(run.variables['hero.money']).toBe(100);
  });
});

describe('computed variables', () => {
  it('evaluates computed variables on read', () => {
    const project = buildProject({
      variables: [
        ...VARIABLES,
        buildVariable({
          id: 'var_status',
          name: 'Wealth Status',
          key: 'hero.wealth_score',
          defaultValue: 0,
          computed: {expression: 'hero.money * 2', dependencies: ['hero.money']},
        }),
      ],
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({id: 'n2', text: 'Wealthy.', conditions: ['hero.wealth_score >= 200']}),
            buildNode({id: 'n3', text: 'Modest.'}),
          ],
          edges: [buildEdge({id: 'e1', source: 'n1', target: 'n2'}), buildEdge({id: 'e2', source: 'n2', target: 'n3'})],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    // money 100 → wealth_score 200 → n2 visible.
    expect(run.current()).toMatchObject({nodeId: 'n2'});
  });
});

describe('hubs', () => {
  it('passes through eligible hubs applying effects', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildHubNode({id: 'hub', effects: ['hero.money += 5']}),
            buildNode({id: 'n3', text: 'After.'}),
          ],
          edges: [
            buildEdge({id: 'e1', source: 'n1', target: 'hub'}),
            buildEdge({id: 'e2', source: 'hub', target: 'n3'}),
          ],
          entryNodeId: 'n1',
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n3'});
    expect(run.variables['hero.money']).toBe(105);
    expect(run.seenCount('hub')).toBe(1);
  });

  it('skips ineligible hubs without applying effects', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildHubNode({id: 'hub', conditions: ['hero.money > 1000'], effects: ['hero.money += 5']}),
            buildNode({id: 'n3', text: 'After.'}),
          ],
          edges: [
            buildEdge({id: 'e1', source: 'n1', target: 'hub'}),
            buildEdge({id: 'e2', source: 'hub', target: 'n3'}),
          ],
          entryNodeId: 'n1',
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n3'});
    expect(run.variables['hero.money']).toBe(100);
    expect(run.seenCount('hub')).toBe(0);
  });
});

describe('jumps', () => {
  it('follows same-dialogue jumps to their target node', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildJumpNode({id: 'j1', jumpTarget: {nodeId: 'n3'}}),
            buildNode({id: 'n3', text: 'Landed.'}),
          ],
          edges: [buildEdge({id: 'e1', source: 'n1', target: 'j1'})],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n3', text: 'Landed.'});
  });

  it('switches dialogues on cross-dialogue jumps, preserving state', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.', effects: ['hero.money += 10']}),
            buildJumpNode({id: 'j1', jumpTarget: {dialogueId: 'dlg_two'}}),
          ],
          edges: [buildEdge({id: 'e1', source: 'n1', target: 'j1'})],
        }),
        buildDialogue({
          id: 'dlg_two',
          name: 'Two',
          entryNodeId: 'm1',
          nodes: [buildNode({id: 'm1', text: 'Elsewhere.'})],
          edges: [],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    run.advance();

    expect(run.activeDialogueId).toBe('dlg_two');
    expect(run.current()).toMatchObject({nodeId: 'm1', text: 'Elsewhere.'});
    expect(run.variables['hero.money']).toBe(110);
    expect(run.seenCount('n1')).toBe(1);
  });

  it('keeps red-check locks across a cross-dialogue round trip', () => {
    const project = buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildChoiceNode({
              id: 'choice',
              text: 'Decide.',
              options: [
                buildOption({id: 'o_red', text: 'Force it', skillCheck: {...RHETORIC_CHECK, checkType: 'red'}}),
              ],
            }),
            buildNode({id: 'win', text: 'Won.'}),
            buildNode({id: 'lose', text: 'Lost.'}),
            buildJumpNode({id: 'j_away', jumpTarget: {dialogueId: 'dlg_two'}}),
          ],
          edges: [
            buildEdge({id: 'e1', source: 'n1', target: 'choice'}),
            buildEdge({id: 'e_ok', source: 'choice', sourceOption: 'o_red', role: 'success', target: 'win'}),
            buildEdge({id: 'e_fail', source: 'choice', sourceOption: 'o_red', role: 'failure', target: 'lose'}),
            buildEdge({id: 'e_away', source: 'lose', target: 'j_away'}),
          ],
        }),
        buildDialogue({
          id: 'dlg_two',
          name: 'Two',
          entryNodeId: 'm1',
          nodes: [
            buildNode({id: 'm1', text: 'Elsewhere.'}),
            buildJumpNode({id: 'j_back', jumpTarget: {dialogueId: 'dlg_intro', nodeId: 'choice'}}),
          ],
          edges: [buildEdge({id: 'em1', source: 'm1', target: 'j_back'})],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});

    run.advance(); // n1 → choice
    run.choose('o_red'); // snake eyes → failure → lose
    run.advance(); // lose → jump away → dlg_two m1

    expect(run.activeDialogueId).toBe('dlg_two');

    run.advance(); // m1 → jump back → choice

    expect(run.activeDialogueId).toBe('dlg_intro');

    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected a choice view');
    }

    expect(view.options[0]).toMatchObject({optionId: 'o_red', state: 'locked_used'});
  });
});

describe('entry checks', () => {
  const gateProject = (checkType: 'white' | 'red'): ProjectDocument =>
    buildProject({
      variables: VARIABLES,
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({
              id: 'gate',
              text: 'You slip past.',
              failureText: 'You are stopped.',
              check: {skillId: 'var_rhetoric', baseDifficulty: 12, checkType},
            }),
            buildNode({id: 'win', text: 'Won.'}),
            buildNode({id: 'lose', text: 'Lost.'}),
          ],
          edges: [
            buildEdge({id: 'e1', source: 'n1', target: 'gate'}),
            buildEdge({id: 'e_ok', source: 'gate', role: 'success', target: 'win'}),
            buildEdge({id: 'e_fail', source: 'gate', role: 'failure', target: 'lose'}),
            buildEdge({id: 'e_loop', source: 'lose', target: 'gate'}),
          ],
        }),
      ],
    });

  it('rolls on show, picks failureText, and routes from the outcome port', () => {
    const run = startPlaythrough(gateProject('white'), 'dlg_intro', {rng: seq(0, 0)});

    run.advance();

    const view = run.current();

    expect(view).toMatchObject({nodeId: 'gate', text: 'You are stopped.'});

    if (view?.kind !== 'line') {
      expect.unreachable('expected a line view');
    }

    expect(view.check).toMatchObject({rolled: 2, passed: false});

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'lose'});
  });

  it('shows the success text and routes to the success target on a pass', () => {
    const run = startPlaythrough(gateProject('white'), 'dlg_intro', {rng: seq(0.99, 0.99)});

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'gate', text: 'You slip past.'});

    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'win'});
  });

  it('re-rolls white entry checks on each visit', () => {
    const run = startPlaythrough(gateProject('white'), 'dlg_intro', {rng: seq(0, 0, 0.99, 0.99)});

    run.advance(); // gate: rolled 2 → failure
    run.advance(); // lose
    run.advance(); // gate again: rolled 12 → success

    expect(run.current()).toMatchObject({nodeId: 'gate', text: 'You slip past.'});
  });

  it('rolls red entry checks once and keeps the result on revisit', () => {
    const run = startPlaythrough(gateProject('red'), 'dlg_intro', {rng: seq(0, 0, 0.99, 0.99)});

    run.advance(); // gate: rolled 2 → failure, sticky
    run.advance(); // lose
    run.advance(); // gate again: no re-roll

    const view = run.current();

    expect(view).toMatchObject({nodeId: 'gate', text: 'You are stopped.'});

    if (view?.kind !== 'line') {
      expect.unreachable('expected a line view');
    }

    expect(view.check).toMatchObject({rolled: 2, passed: false});
  });
});

describe('edge effects and conditional outcome routing', () => {
  it('applies the winning edge effects on traversal', () => {
    const project = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK}})]);
    const dialogue = project.dialogues[0];
    const success = dialogue?.edges.find(e => e.id === 'e_o1_ok');

    if (success === undefined) throw new Error('missing edge');

    success.effects = ['hero.money += 5'];

    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0.99, 0.99)});

    run.choose('o1');

    expect(run.current()).toMatchObject({nodeId: 'win'});
    expect(run.variables['hero.money']).toBe(105);
  });

  it('routes outcome ports through priorities and conditions', () => {
    const project = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK}})]);
    const dialogue = project.dialogues[0];

    if (dialogue === undefined) throw new Error('missing dialogue');

    dialogue.nodes.push(buildNode({id: 'rich_win', text: 'Rich win.'}));
    dialogue.edges.push(
      buildEdge({
        id: 'e_rich',
        source: 'choice',
        sourceOption: 'o1',
        role: 'success',
        target: 'rich_win',
        priority: -1,
        conditions: ['hero.money >= 1000'],
      }),
    );

    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0.99, 0.99)});

    run.choose('o1');

    // The rich branch is gated off — the default success edge wins.
    expect(run.current()).toMatchObject({nodeId: 'win'});
  });
});

describe('spoken text and stage', () => {
  it('emits spokenText when choosing an option that carries it', () => {
    const project = checkProject([buildOption({id: 'o1', spokenText: 'I said it out loud.'})]);
    const run = startPlaythrough(project, 'dlg_intro');

    expect(run.choose('o1')).toStrictEqual({spoken: 'I said it out loud.'});
  });

  it('resolves stage state from dialogue defaults and node overrides', () => {
    const project = buildProject({
      variables: VARIABLES,
      settings: {stageSlots: [{id: 'slot_place', name: 'place', options: ['harbor', 'tavern']}]},
      dialogues: [
        buildDialogue({
          entryNodeId: 'n1',
          stageDefaults: {slot_place: 'harbor'},
          nodes: [
            buildNode({id: 'n1', text: 'Start.'}),
            buildNode({id: 'n2', text: 'Inside.', stage: {slot_place: 'tavern'}}),
          ],
          edges: [buildEdge({id: 'e1', source: 'n1', target: 'n2'})],
        }),
      ],
    });
    const run = startPlaythrough(project, 'dlg_intro');

    expect(run.currentStage()).toStrictEqual({slot_place: 'harbor'});

    run.advance();

    expect(run.currentStage()).toStrictEqual({slot_place: 'tavern'});
  });
});

describe('anti-passive checks', () => {
  it('shows below-mode lines only when the skill is under the threshold', () => {
    const antiPassive = (threshold: number): ProjectDocument =>
      buildProject({
        variables: VARIABLES,
        dialogues: [
          buildDialogue({
            entryNodeId: 'n1',
            nodes: [
              buildNode({id: 'n1', text: 'Start.'}),
              buildNode({
                id: 'voice',
                text: 'A dim thought surfaces…',
                passiveCheck: {skillId: 'var_empathy', threshold, mode: 'below'},
              }),
              buildNode({id: 'n3', text: 'After.'}),
            ],
            edges: [
              buildEdge({id: 'e1', source: 'n1', target: 'voice'}),
              buildEdge({id: 'e2', source: 'voice', target: 'n3'}),
            ],
          }),
        ],
      });

    // Empathy is 10: below 12 → shown; not below 8 → skipped.
    const shown = startPlaythrough(antiPassive(12), 'dlg_intro');

    shown.advance();
    expect(shown.current()).toMatchObject({nodeId: 'voice'});

    const skipped = startPlaythrough(antiPassive(8), 'dlg_intro');

    skipped.advance();
    expect(skipped.current()).toMatchObject({nodeId: 'n3'});
  });
});

describe('roll settings', () => {
  const d20Project = (checkRoll: NonNullable<ProjectDocument['settings']['checkRoll']>): ProjectDocument => {
    const project = checkProject([buildOption({id: 'o1', skillCheck: {...RHETORIC_CHECK}})]);

    project.settings = {...project.settings, checkRoll};

    return project;
  };

  it('rolls 1d20 when configured', () => {
    // floor(0.5 * 20) + 1 = 11; total 11 + 4 rhetoric = 15 >= 12 → success.
    const run = startPlaythrough(d20Project({formula: '1d20'}), 'dlg_intro', {rng: seq(0.5)});
    const outcome = run.choose('o1');

    expect(outcome.check).toMatchObject({rolled: 11, total: 15, passed: true});
  });

  it('applies d20 crit bounds', () => {
    const high = startPlaythrough(d20Project({formula: '1d20'}), 'dlg_intro', {rng: seq(0.99)});

    expect(high.choose('o1').check).toMatchObject({rolled: 20, passed: true});

    const low = startPlaythrough(d20Project({formula: '1d20'}), 'dlg_intro', {rng: seq(0)});

    expect(low.choose('o1').check).toMatchObject({rolled: 1, passed: false});
  });

  it('honours disabled crit rules', () => {
    // Rolled 2 would crit-fail by default; with critFail off, 2 + 4 + 10 bonus-free total loses to dc 12,
    // so pick a dc the raw total beats.
    const project = d20Project({formula: '2d6', critFail: false, critSuccess: false});
    const option = project.dialogues[0]?.nodes.find(n => n.id === 'choice');

    if (option?.kind !== 'choice') throw new Error('missing choice');

    const check = option.options[0]?.skillCheck;

    if (check === undefined) throw new Error('missing check');

    check.baseDifficulty = 5;

    // Rolled 2 + rhetoric 4 = 6 >= 5 → passes because crit failure is disabled.
    const run = startPlaythrough(project, 'dlg_intro', {rng: seq(0, 0)});

    expect(run.choose('o1').check).toMatchObject({rolled: 2, passed: true});
  });
});

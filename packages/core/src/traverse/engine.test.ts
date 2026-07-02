import {describe, expect, it} from 'vite-plus/test';

import type {ChoiceOption, ProjectDocument} from '../schema';

import {buildDialogue, buildEdge, buildNode, buildProject, buildVariable} from '../fixtures';
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
  targetNodeId: 'end',
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

const checkProject = (options: ChoiceOption[], entryEffects?: string[]): ProjectDocument =>
  buildProject({
    variables: VARIABLES,
    dialogues: [
      buildDialogue({
        entryNodeId: 'choice',
        nodes: [
          buildNode({id: 'choice', kind: 'choice', text: 'Decide.', options, effects: entryEffects}),
          buildNode({id: 'end', text: 'Done.'}),
          buildNode({id: 'win', text: 'Won.'}),
          buildNode({id: 'lose', text: 'Lost.'}),
        ],
        edges: [
          buildEdge({id: 'back_win', source: 'win', target: 'choice'}),
          buildEdge({id: 'back_lose', source: 'lose', target: 'choice'}),
        ],
      }),
    ],
  });

const RHETORIC_CHECK = {
  skillId: 'var_rhetoric',
  baseDifficulty: 12,
  checkType: 'white',
  successTargetId: 'win',
  failureTargetId: 'lose',
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
            buildNode({
              id: 'choice',
              kind: 'choice',
              text: 'Around we go.',
              options: [buildOption({id: 'loop', text: 'Again', targetNodeId: 'mid'})],
            }),
            buildNode({id: 'mid', text: 'Passing through.'}),
            buildNode({id: 'twice', text: 'Seen it before.', conditions: ['seenCount() >= 1']}),
            buildNode({id: 'fresh', text: 'First time here.'}),
          ],
          edges: [
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

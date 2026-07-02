import {beforeEach, describe, expect, it} from 'vite-plus/test';

import {$project, createDefaultProject} from '@/modules/project/model/store';
import {$currentDialogueId} from '@/modules/workspace/model/store';

import type {ProjectDocument} from '@lorequary/core';

import {
  $playtest,
  playtestAdvance,
  playtestBack,
  playtestChoose,
  playtestReset,
  setPlaytestMode,
  startPlaytest,
  stopPlaytest,
} from './store';

const buildPlaytestProject = (): ProjectDocument => {
  const base = createDefaultProject('PT');
  const dialogue = base.dialogues[0];

  if (dialogue === undefined) throw new Error('no dialogue');

  return {
    ...base,
    variables: [
      {id: 'v_money', name: 'Money', key: 'hero.money', type: 'number', defaultValue: 100},
      {id: 'v_rhetoric', name: 'Rhetoric', key: 'skills.rhetoric', type: 'number', defaultValue: 4},
    ],
    dialogues: [
      {
        ...dialogue,
        entryNodeId: 'start',
        nodes: [
          {id: 'start', kind: 'line', text: 'Hello.', effects: ['hero.money += 5']},
          {
            id: 'choice',
            kind: 'choice',
            text: 'Decide.',
            options: [
              {id: 'go', text: 'Go', targetNodeId: 'end', visibility: 'available'},
              {
                id: 'try',
                text: 'Try',
                targetNodeId: 'end',
                visibility: 'available',
                skillCheck: {
                  skillId: 'v_rhetoric',
                  baseDifficulty: 30,
                  checkType: 'white',
                  successTargetId: 'end',
                  failureTargetId: 'end',
                },
              },
            ],
          },
          {id: 'end', kind: 'line', text: 'Bye.'},
        ],
        edges: [{id: 'e1', source: 'start', target: 'choice'}],
        editor: {nodePositions: {}},
      },
    ],
  };
};

describe('playtest store', () => {
  beforeEach(() => {
    const project = buildPlaytestProject();

    $project.set(project);
    $currentDialogueId.set(project.dialogues[0]?.id ?? null);
    stopPlaytest();
  });

  it('starts at the entry node with initialized variables', () => {
    startPlaytest({rng: () => 0});

    const state = $playtest.get();

    expect(state.active).toBe(true);
    expect(state.view).toMatchObject({kind: 'line', nodeId: 'start', text: 'Hello.'});
    expect(state.variables['hero.money']).toBe(105);
    expect(state.canBack).toBe(false);
  });

  it('advances lines and presents choices', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance();

    const state = $playtest.get();

    expect(state.view).toMatchObject({kind: 'choice', nodeId: 'choice'});
    expect(state.canBack).toBe(true);
  });

  it('chooses an option and reaches the end', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance();
    playtestChoose('go');

    expect($playtest.get().view).toMatchObject({nodeId: 'end'});

    playtestAdvance();

    expect($playtest.get().ended).toBe(true);
    expect($playtest.get().view).toBeNull();
  });

  it('records the check result and honors mode overrides', () => {
    startPlaytest({rng: () => 0.5});
    playtestAdvance();
    setPlaytestMode('always_pass');
    playtestChoose('try');

    // DC 30 is unreachable by rolling — always_pass forces success.
    expect($playtest.get().lastCheck).toMatchObject({passed: true, dc: 30});
  });

  it('supports manual outcomes per choice', () => {
    startPlaytest({rng: () => 0.99});
    playtestAdvance();
    setPlaytestMode('manual');
    playtestChoose('try', 'failure');

    expect($playtest.get().lastCheck).toMatchObject({passed: false});
  });

  it('back() returns to the previous step and reset() restarts', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance();
    playtestBack();

    expect($playtest.get().view).toMatchObject({nodeId: 'start'});

    playtestAdvance();
    playtestReset();

    const state = $playtest.get();

    expect(state.view).toMatchObject({nodeId: 'start'});
    expect(state.canBack).toBe(false);
    expect(state.lastCheck).toBeNull();
  });

  it('stopPlaytest deactivates and clears the view', () => {
    startPlaytest({rng: () => 0});
    stopPlaytest();

    const state = $playtest.get();

    expect(state.active).toBe(false);
    expect(state.view).toBeNull();
  });
});

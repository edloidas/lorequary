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
              {id: 'go', text: 'Go', visibility: 'available'},
              {
                id: 'try',
                text: 'Try',
                visibility: 'available',
                skillCheck: {skillId: 'v_rhetoric', baseDifficulty: 30, checkType: 'white'},
              },
            ],
          },
          {id: 'end', kind: 'line', text: 'Bye.'},
        ],
        edges: [
          {id: 'e1', source: 'start', role: 'flow', target: 'choice'},
          {id: 'e_go', source: 'choice', sourceOption: 'go', role: 'flow', target: 'end'},
          {id: 'e_try_ok', source: 'choice', sourceOption: 'try', role: 'success', target: 'end'},
          {id: 'e_try_fail', source: 'choice', sourceOption: 'try', role: 'failure', target: 'end'},
        ],
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

describe('entry checks, spoken text, stage, and jumps', () => {
  const buildRichProject = (): ProjectDocument => {
    const base = buildPlaytestProject();
    const dialogue = base.dialogues[0];

    if (dialogue === undefined) throw new Error('no dialogue');

    return {
      ...base,
      settings: {
        ...base.settings,
        stageSlots: [{id: 'slot_place', name: 'place', options: ['harbor', 'tavern']}],
      },
      dialogues: [
        {
          ...dialogue,
          stageDefaults: {slot_place: 'harbor'},
          nodes: [
            {id: 'start', kind: 'line', text: 'Hello.'},
            {
              id: 'gate',
              kind: 'line',
              text: 'You slip past.',
              failureText: 'You are stopped.',
              stage: {slot_place: 'tavern'},
              check: {skillId: 'v_rhetoric', baseDifficulty: 30, checkType: 'white'},
            },
            {
              id: 'choice',
              kind: 'choice',
              text: 'Decide.',
              options: [{id: 'go', text: 'Go', spokenText: 'I choose to go.', visibility: 'available'}],
            },
            {id: 'jump_out', kind: 'jump', jumpTarget: {dialogueId: 'dlg_two'}},
          ],
          edges: [
            {id: 'e1', source: 'start', role: 'flow', target: 'gate'},
            {id: 'e_ok', source: 'gate', role: 'success', target: 'choice'},
            {id: 'e_fail', source: 'gate', role: 'failure', target: 'choice'},
            {id: 'e_go', source: 'choice', sourceOption: 'go', role: 'flow', target: 'jump_out'},
          ],
          editor: {nodePositions: {}},
        },
        {
          id: 'dlg_two',
          name: 'Elsewhere',
          entryNodeId: 'm1',
          nodes: [{id: 'm1', kind: 'line', text: 'You arrive elsewhere.'}],
          edges: [],
          editor: {nodePositions: {}},
        },
      ],
    };
  };

  beforeEach(() => {
    const project = buildRichProject();

    $project.set(project);
    $currentDialogueId.set(project.dialogues[0]?.id ?? null);
    stopPlaytest();
  });

  it('exposes the entry-check result and failure text on the view', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance();

    const state = $playtest.get();

    expect(state.view).toMatchObject({kind: 'line', nodeId: 'gate', text: 'You are stopped.'});

    if (state.view?.kind !== 'line') throw new Error('expected line view');

    expect(state.view.check).toMatchObject({passed: false, dc: 30});
  });

  it('resolves stage state with node overrides and keeps the check in the transcript', () => {
    startPlaytest({rng: () => 0});

    expect($playtest.get().stage).toStrictEqual({slot_place: 'harbor'});

    playtestAdvance();

    expect($playtest.get().stage).toStrictEqual({slot_place: 'tavern'});

    playtestAdvance();

    const logged = $playtest.get().log.find(entry => entry.kind === 'line' && entry.nodeId === 'gate');

    if (logged?.kind !== 'line') throw new Error('expected the gate line in the log');

    expect(logged.check).toMatchObject({passed: false});
  });

  it('records spokenText on picks and follows cross-dialogue jumps', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance(); // start → gate
    playtestAdvance(); // gate → choice
    playtestChoose('go'); // → jump_out → dlg_two

    const state = $playtest.get();
    const pick = state.log.find(entry => entry.kind === 'pick');
    const jump = state.log.find(entry => entry.kind === 'jump');

    if (pick?.kind !== 'pick') throw new Error('expected a pick entry');

    expect(pick.spoken).toBe('I choose to go.');
    expect(jump).toMatchObject({kind: 'jump', text: 'Elsewhere'});
    expect(state.view).toMatchObject({nodeId: 'm1'});
    expect($currentDialogueId.get()).toBe('dlg_two');
  });

  it('back() returns across a dialogue transition', () => {
    const homeId = $currentDialogueId.get();

    startPlaytest({rng: () => 0});
    playtestAdvance();
    playtestAdvance();
    playtestChoose('go');

    expect($currentDialogueId.get()).toBe('dlg_two');

    playtestBack();

    const state = $playtest.get();

    expect(state.view).toMatchObject({nodeId: 'choice'});
    expect($currentDialogueId.get()).toBe(homeId);
    expect(state.log.some(entry => entry.kind === 'jump')).toBe(false);
  });

  it('does not fake a jump when the sidebar switches dialogues mid-run', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance(); // start → gate

    // Simulate a sidebar dialogue switch during an active playtest.
    $currentDialogueId.set('dlg_two');

    playtestAdvance(); // gate → choice, still in the home dialogue

    const state = $playtest.get();

    expect(state.view).toMatchObject({nodeId: 'choice'});
    expect(state.log.some(entry => entry.kind === 'jump')).toBe(false);
  });

  it('still records a real jump even when the sidebar pre-selected the destination', () => {
    startPlaytest({rng: () => 0});
    playtestAdvance(); // start → gate
    playtestAdvance(); // gate → choice

    // Sidebar jumps ahead to the destination dialogue before the real jump fires.
    $currentDialogueId.set('dlg_two');

    playtestChoose('go'); // → jump_out → dlg_two

    const state = $playtest.get();
    const jump = state.log.find(entry => entry.kind === 'jump');

    expect(jump).toMatchObject({kind: 'jump', text: 'Elsewhere'});
    expect(state.view).toMatchObject({nodeId: 'm1'});
    expect($currentDialogueId.get()).toBe('dlg_two');
  });
});

import {startPlaythrough} from '@lorequary/core';
import {atom} from 'nanostores';

import {$project} from '@/modules/project/model/store';
import {$currentDialogue} from '@/modules/workspace/model/store';

import type {CheckResult, NodeView, Playthrough, RuntimeIssue, VariableState} from '@lorequary/core';

export type PlaytestMode = 'roll' | 'always_pass' | 'always_fail' | 'manual';

export type PlaytestUiState = {
  active: boolean;
  view: NodeView | null;
  variables: Readonly<VariableState>;
  ended: boolean;
  lastCheck: CheckResult | null;
  errors: RuntimeIssue[];
  canBack: boolean;
  mode: PlaytestMode;
};

const IDLE: PlaytestUiState = {
  active: false,
  view: null,
  variables: {},
  ended: false,
  lastCheck: null,
  errors: [],
  canBack: false,
  mode: 'roll',
};

export const $playtest = atom<PlaytestUiState>(IDLE);

let run: Playthrough | null = null;
let steps = 0;

const sync = (patch?: Partial<PlaytestUiState>): void => {
  if (run === null) return;

  $playtest.set({
    ...$playtest.get(),
    view: run.current(),
    variables: run.variables,
    ended: run.ended,
    errors: [...run.errors],
    canBack: steps > 0,
    ...patch,
  });
};

export const startPlaytest = (options: {rng?: () => number} = {}): void => {
  const project = $project.get();
  const dialogue = $currentDialogue.get();

  if (project === null || dialogue === null) return;

  run = startPlaythrough(project, dialogue.id, options.rng === undefined ? {} : {rng: options.rng});
  steps = 0;
  $playtest.set({...IDLE, active: true, mode: $playtest.get().mode});
  sync();
};

export const stopPlaytest = (): void => {
  run = null;
  steps = 0;
  $playtest.set({...IDLE, mode: $playtest.get().mode});
};

export const setPlaytestMode = (mode: PlaytestMode): void => {
  $playtest.set({...$playtest.get(), mode});
};

export const playtestAdvance = (): void => {
  if (run === null) return;

  run.advance();
  steps += 1;
  sync();
};

// Debug modes are applied as forced outcomes so switching modes mid-run needs no restart.
export const playtestChoose = (optionId: string, manualOutcome?: 'success' | 'failure'): void => {
  if (run === null) return;

  const {mode} = $playtest.get();
  let outcome: 'success' | 'failure' | undefined;

  if (mode === 'always_pass') outcome = 'success';
  if (mode === 'always_fail') outcome = 'failure';
  if (mode === 'manual') outcome = manualOutcome;

  const result = run.choose(optionId, outcome === undefined ? {} : {outcome});

  steps += 1;
  sync({lastCheck: result.check ?? null});
};

export const playtestBack = (): void => {
  if (run === null || steps === 0) return;

  run.back();
  steps -= 1;
  sync({lastCheck: null});
};

export const playtestReset = (): void => {
  if (run === null) return;

  run.reset();
  steps = 0;
  sync({lastCheck: null});
};

import {startPlaythrough} from '@lorequary/core';
import {atom} from 'nanostores';

import {$project} from '@/modules/project/model/store';
import {$currentDialogue} from '@/modules/workspace/model/store';

import type {CheckResult, NodeView, Playthrough, RuntimeIssue, VariableState} from '@lorequary/core';

export type PlaytestMode = 'roll' | 'always_pass' | 'always_fail' | 'manual';

export type PlaytestLogEntry =
  | {kind: 'line'; nodeId: string; characterId?: string; text: string}
  | {kind: 'pick'; text: string; check: CheckResult | null};

export type PlaytestUiState = {
  active: boolean;
  view: NodeView | null;
  variables: Readonly<VariableState>;
  ended: boolean;
  lastCheck: CheckResult | null;
  errors: RuntimeIssue[];
  canBack: boolean;
  mode: PlaytestMode;
  log: PlaytestLogEntry[];
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
  log: [],
};

export const $playtest = atom<PlaytestUiState>(IDLE);

let run: Playthrough | null = null;
let steps = 0;

// Transcript of everything already played, Disco Elysium roll style. Each step
// records how many entries it appended so `back` can trim precisely.
let log: PlaytestLogEntry[] = [];
let stepSizes: number[] = [];

const sync = (patch?: Partial<PlaytestUiState>): void => {
  if (run === null) return;

  $playtest.set({
    ...$playtest.get(),
    view: run.current(),
    variables: run.variables,
    ended: run.ended,
    errors: [...run.errors],
    canBack: steps > 0,
    log: [...log],
    ...patch,
  });
};

export const startPlaytest = (options: {rng?: () => number} = {}): void => {
  const project = $project.get();
  const dialogue = $currentDialogue.get();

  if (project === null || dialogue === null) return;

  run = startPlaythrough(project, dialogue.id, options.rng === undefined ? {} : {rng: options.rng});
  steps = 0;
  log = [];
  stepSizes = [];
  $playtest.set({...IDLE, active: true, mode: $playtest.get().mode});
  sync();
};

export const stopPlaytest = (): void => {
  run = null;
  steps = 0;
  log = [];
  stepSizes = [];
  $playtest.set({...IDLE, mode: $playtest.get().mode});
};

export const setPlaytestMode = (mode: PlaytestMode): void => {
  $playtest.set({...$playtest.get(), mode});
};

export const playtestAdvance = (): void => {
  if (run === null) return;

  const current = run.current();

  if (current !== null) {
    log.push({
      kind: 'line',
      nodeId: current.nodeId,
      text: current.text,
      ...(current.characterId === undefined ? {} : {characterId: current.characterId}),
    });
    stepSizes.push(1);
  } else {
    stepSizes.push(0);
  }

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

  const current = run.current();
  const optionText =
    current?.kind === 'choice' ? (current.options.find(option => option.optionId === optionId)?.text ?? '') : '';

  const result = run.choose(optionId, outcome === undefined ? {} : {outcome});
  let pushed = 0;

  if (current !== null && current.text !== '') {
    log.push({
      kind: 'line',
      nodeId: current.nodeId,
      text: current.text,
      ...(current.characterId === undefined ? {} : {characterId: current.characterId}),
    });
    pushed += 1;
  }

  log.push({kind: 'pick', text: optionText, check: result.check ?? null});
  pushed += 1;

  stepSizes.push(pushed);
  steps += 1;
  sync({lastCheck: result.check ?? null});
};

export const playtestBack = (): void => {
  if (run === null || steps === 0) return;

  const trimmed = stepSizes.pop() ?? 0;

  if (trimmed > 0) log = log.slice(0, log.length - trimmed);

  run.back();
  steps -= 1;
  sync({lastCheck: null});
};

export const playtestReset = (): void => {
  if (run === null) return;

  run.reset();
  steps = 0;
  log = [];
  stepSizes = [];
  sync({lastCheck: null});
};

import {startPlaythrough} from '@lorequary/core';
import {atom} from 'nanostores';

import {$project} from '@/modules/project/model/store';
import {$currentDialogue, $currentDialogueId} from '@/modules/workspace/model/store';

import type {CheckResult, NodeView, Playthrough, RuntimeIssue, VariableState} from '@lorequary/core';

export type PlaytestMode = 'roll' | 'always_pass' | 'always_fail' | 'manual';

export type PlaytestLogEntry =
  | {kind: 'line'; nodeId: string; characterId?: string; text: string; check?: CheckResult}
  | {kind: 'pick'; text: string; check: CheckResult | null; spoken?: string}
  | {kind: 'jump'; text: string};

export type PlaytestUiState = {
  active: boolean;
  view: NodeView | null;
  variables: Readonly<VariableState>;
  stage: Record<string, string>;
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
  stage: {},
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

// The workbench follows the playthrough across cross-dialogue jumps.
const reconcileDialogue = (): void => {
  if (run !== null && $currentDialogueId.get() !== run.activeDialogueId) {
    $currentDialogueId.set(run.activeDialogueId);
  }
};

// Returns the number of transcript entries pushed for a dialogue transition.
const followDialogue = (): number => {
  if (run === null || $currentDialogueId.get() === run.activeDialogueId) return 0;

  const activeId = run.activeDialogueId;
  const name = $project.get()?.dialogues.find(d => d.id === activeId)?.name ?? activeId;

  log.push({kind: 'jump', text: name});
  reconcileDialogue();

  return 1;
};

const sync = (patch?: Partial<PlaytestUiState>): void => {
  if (run === null) return;

  $playtest.set({
    ...$playtest.get(),
    view: run.current(),
    variables: run.variables,
    stage: run.currentStage(),
    ended: run.ended,
    errors: [...run.errors],
    canBack: steps > 0,
    log: [...log],
    ...patch,
  });
};

// A shown line enters the transcript with its entry-check result, if it rolled one.
const pushCurrentLine = (view: NodeView): void => {
  log.push({
    kind: 'line',
    nodeId: view.nodeId,
    text: view.text,
    ...(view.characterId === undefined ? {} : {characterId: view.characterId}),
    ...(view.kind === 'line' && view.check !== undefined ? {check: view.check} : {}),
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
  reconcileDialogue();
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
  let pushed = 0;

  if (current !== null) {
    pushCurrentLine(current);
    pushed += 1;
  }

  run.advance();
  pushed += followDialogue();
  stepSizes.push(pushed);
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
    pushCurrentLine(current);
    pushed += 1;
  }

  log.push({
    kind: 'pick',
    text: optionText,
    check: result.check ?? null,
    ...(result.spoken === undefined ? {} : {spoken: result.spoken}),
  });
  pushed += 1;

  pushed += followDialogue();
  stepSizes.push(pushed);
  steps += 1;
  sync({lastCheck: result.check ?? null});
};

export const playtestBack = (): void => {
  if (run === null || steps === 0) return;

  const trimmed = stepSizes.pop() ?? 0;

  if (trimmed > 0) log = log.slice(0, log.length - trimmed);

  run.back();
  reconcileDialogue();
  steps -= 1;
  sync({lastCheck: null});
};

export const playtestReset = (): void => {
  if (run === null) return;

  run.reset();
  reconcileDialogue();
  steps = 0;
  log = [];
  stepSizes = [];
  sync({lastCheck: null});
};

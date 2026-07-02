import {useStore} from '@nanostores/react';

import {$project} from '@/modules/project/model/store';
import {$currentDialogue} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';
import {Select, SmallButton} from '@/shared/ui/fields';

import type {PlaytestMode} from '../model/store';
import type {CheckResult, ChoiceOption, ChoiceView, OptionView} from '@lorequary/core';
import type {ReactElement} from 'react';

import {
  $playtest,
  playtestAdvance,
  playtestBack,
  playtestChoose,
  playtestReset,
  setPlaytestMode,
  startPlaytest,
  stopPlaytest,
} from '../model/store';

const MODE_OPTIONS: {value: PlaytestMode; label: string}[] = [
  {value: 'roll', label: 'Random rolls'},
  {value: 'always_pass', label: 'Always pass'},
  {value: 'always_fail', label: 'Always fail'},
  {value: 'manual', label: 'Manual'},
];

const CheckBanner = ({check}: {check: CheckResult}): ReactElement => (
  <div
    className={cn(
      'rounded border px-2 py-1 text-[11px]',
      check.passed
        ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
        : 'border-red-800 bg-red-950/40 text-red-300',
    )}
  >
    2d6 → {check.rolled} · total {check.total} vs DC {check.dc} — {check.passed ? 'Success' : 'Failure'}
    {check.appliedModifiers.length > 0 && (
      <span className='text-neutral-400'> · {check.appliedModifiers.map(m => m.description).join(', ')}</span>
    )}
  </div>
);

CheckBanner.displayName = 'CheckBanner';

const OptionRow = ({
  view,
  option,
  manual,
}: {
  view: OptionView;
  option: ChoiceOption | undefined;
  manual: boolean;
}): ReactElement | null => {
  if (view.state === 'invisible') return null;

  const hasCheck = option?.skillCheck !== undefined;
  const checkTag = hasCheck
    ? `[${option.skillCheck?.checkType === 'red' ? 'RED' : 'WHITE'} DC ${option.skillCheck?.baseDifficulty}] `
    : '';

  if (view.state === 'locked_hidden') {
    return <div className='rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-600'>▪▪▪ locked</div>;
  }

  if (view.state === 'locked_visible') {
    return (
      <div className='rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-500'>
        {checkTag}
        {view.text}
        {view.lockReason !== undefined && <span className='ml-1 text-neutral-600'>({view.lockReason})</span>}
      </div>
    );
  }

  if (view.state === 'locked_used') {
    return (
      <div className='rounded border border-red-950 px-2 py-1 text-xs text-red-900 line-through'>
        {checkTag}
        {view.text}
      </div>
    );
  }

  if (manual && hasCheck) {
    return (
      <div className='flex items-center gap-1'>
        <span className='flex-1 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200'>
          {checkTag}
          {view.text}
        </span>
        <SmallButton onClick={() => playtestChoose(view.optionId, 'success')}>✓ pass</SmallButton>
        <SmallButton danger onClick={() => playtestChoose(view.optionId, 'failure')}>
          ✗ fail
        </SmallButton>
      </div>
    );
  }

  return (
    <button
      type='button'
      className='rounded border border-neutral-700 px-2 py-1 text-left text-xs text-neutral-200 hover:border-sky-600 hover:bg-neutral-800'
      onClick={() => playtestChoose(view.optionId)}
    >
      {checkTag}
      {view.text}
    </button>
  );
};

OptionRow.displayName = 'OptionRow';

const ChoiceStage = ({view}: {view: ChoiceView}): ReactElement => {
  const dialogue = useStore($currentDialogue);
  const playtest = useStore($playtest);
  const node = dialogue?.nodes.find(n => n.id === view.nodeId);

  return (
    <div className='flex flex-col gap-1'>
      {view.options.map(optionView => (
        <OptionRow
          key={optionView.optionId}
          view={optionView}
          option={node?.options?.find(o => o.id === optionView.optionId)}
          manual={playtest.mode === 'manual'}
        />
      ))}
    </div>
  );
};

ChoiceStage.displayName = 'ChoiceStage';

const Stage = (): ReactElement => {
  const playtest = useStore($playtest);
  const project = useStore($project);

  if (playtest.view === null) {
    return (
      <div className='flex items-center gap-3'>
        <span className='text-sm text-neutral-500'>— Dialogue ended —</span>
        <SmallButton onClick={playtestReset}>↺ Restart</SmallButton>
      </div>
    );
  }

  const speaker = project?.characters.find(character => character.id === playtest.view?.characterId);

  return (
    <div className='flex flex-col gap-2'>
      {playtest.lastCheck !== null && <CheckBanner check={playtest.lastCheck} />}
      <div className='flex items-start gap-2'>
        {speaker !== undefined && (
          <span
            className='mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold'
            style={{backgroundColor: `${speaker.color}33`, color: speaker.color}}
          >
            {speaker.displayName}
          </span>
        )}
        <p className={cn('text-sm', playtest.view.text === '' ? 'italic text-neutral-600' : 'text-neutral-100')}>
          {playtest.view.text === '' ? '(empty line)' : playtest.view.text}
        </p>
      </div>
      {playtest.view.kind === 'line' ? (
        <div>
          <SmallButton onClick={playtestAdvance}>Continue ▸</SmallButton>
        </div>
      ) : (
        <ChoiceStage view={playtest.view} />
      )}
    </div>
  );
};

Stage.displayName = 'Stage';

const VariableWatch = (): ReactElement => {
  const playtest = useStore($playtest);
  const entries = Object.entries(playtest.variables);

  return (
    <div className='flex max-h-40 w-56 shrink-0 flex-col gap-0.5 overflow-y-auto rounded border border-neutral-800 p-2'>
      <span className='text-[10px] font-semibold uppercase tracking-wide text-neutral-500'>Variables</span>
      {entries.length === 0 && <span className='text-[11px] text-neutral-600'>No variables</span>}
      {entries.map(([key, value]) => (
        <div key={key} className='flex items-center justify-between gap-2 text-[11px]'>
          <span className='truncate font-mono text-neutral-400'>{key}</span>
          <span className='font-mono text-neutral-200'>{String(value)}</span>
        </div>
      ))}
      {playtest.errors.length > 0 && (
        <span className='mt-1 text-[10px] text-red-400' title={playtest.errors.map(e => e.message).join('\n')}>
          ⚠ {playtest.errors.length} expression error(s)
        </span>
      )}
    </div>
  );
};

VariableWatch.displayName = 'VariableWatch';

export const PlaytestBar = (): ReactElement => {
  const playtest = useStore($playtest);
  const dialogue = useStore($currentDialogue);

  if (!playtest.active) {
    return (
      <div className='flex items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-3 py-1.5'>
        <button
          type='button'
          className={cn(
            'rounded border border-emerald-800 px-2.5 py-1 text-xs',
            dialogue === null ? 'cursor-default text-neutral-600' : 'text-emerald-300 hover:bg-emerald-950/40',
          )}
          disabled={dialogue === null}
          onClick={() => startPlaytest()}
        >
          ▶ Playtest
        </button>
        <span className='text-[11px] text-neutral-600'>Step through the current dialogue with debug controls</span>
      </div>
    );
  }

  return (
    <div className='flex items-start gap-3 border-t border-neutral-800 bg-neutral-900 px-3 py-2'>
      <div className='flex w-36 shrink-0 flex-col gap-1'>
        <SmallButton danger onClick={stopPlaytest}>
          ■ Stop
        </SmallButton>
        <div className='flex gap-1'>
          <SmallButton onClick={playtestBack}>{playtest.canBack ? '◀ Back' : '◁'}</SmallButton>
          <SmallButton onClick={playtestReset}>↺ Reset</SmallButton>
        </div>
        <Select value={playtest.mode} options={MODE_OPTIONS} onChange={next => setPlaytestMode(next as PlaytestMode)} />
      </div>
      <div className='min-w-0 flex-1'>
        <Stage />
      </div>
      <VariableWatch />
    </div>
  );
};

PlaytestBar.displayName = 'PlaytestBar';

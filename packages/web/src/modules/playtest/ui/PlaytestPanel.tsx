import {useStore} from '@nanostores/react';
import {useEffect, useRef} from 'react';

import {$project} from '@/modules/project/model/store';
import {$currentDialogue} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';
import {Select, SmallButton} from '@/shared/ui/fields';

import type {PlaytestLogEntry, PlaytestMode} from '../model/store';
import type {Character, CheckResult, ChoiceOption, ChoiceView, OptionView} from '@lorequary/core';
import type {ReactElement} from 'react';

import {
  $playtest,
  playtestAdvance,
  playtestBack,
  playtestChoose,
  playtestReset,
  setPlaytestMode,
  stopPlaytest,
} from '../model/store';

const MODE_OPTIONS: {value: PlaytestMode; label: string}[] = [
  {value: 'roll', label: 'Random rolls'},
  {value: 'always_pass', label: 'Always pass'},
  {value: 'always_fail', label: 'Always fail'},
  {value: 'manual', label: 'Manual'},
];

const speakerOf = (characterId: string | undefined): Character | undefined => {
  if (characterId === undefined) return undefined;

  return $project.get()?.characters.find(character => character.id === characterId);
};

//
// * Transcript pieces
//

const CheckBanner = ({check, entry}: {check: CheckResult; entry?: boolean}): ReactElement => (
  <div
    className={cn(
      'rounded-md border px-2.5 py-1.5 text-[11px]',
      check.passed
        ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300'
        : 'border-red-800/70 bg-red-950/40 text-red-300',
    )}
  >
    <span className='font-semibold uppercase tracking-wide'>
      {entry === true && '⚅ '}
      {check.passed ? 'Success' : 'Failure'}
    </span>
    <span className='text-zinc-400'>
      {' '}
      — rolled {check.rolled}, total {check.total} vs DC {check.dc}
    </span>
    {check.appliedModifiers.length > 0 && (
      <div className='mt-0.5 text-[10px] text-zinc-500'>
        {check.appliedModifiers.map(modifier => modifier.description).join(' · ')}
      </div>
    )}
  </div>
);

CheckBanner.displayName = 'CheckBanner';

// Full spoken player line emitted after picking an option.
const SpokenLine = ({text}: {text: string}): ReactElement => (
  <p className='text-[13px] italic leading-relaxed text-sky-100/90'>“{text}”</p>
);

SpokenLine.displayName = 'SpokenLine';

const JumpDivider = ({text}: {text: string}): ReactElement => (
  <div className='flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-300/80'>
    <span className='h-px flex-1 bg-ink-700' />
    <span>↪ {text}</span>
    <span className='h-px flex-1 bg-ink-700' />
  </div>
);

JumpDivider.displayName = 'JumpDivider';

const SpeakerLine = ({
  characterId,
  text,
  current,
}: {
  characterId: string | undefined;
  text: string;
  current?: boolean;
}): ReactElement => {
  const speaker = speakerOf(characterId);
  const color = speaker?.color ?? '#8a8f9d';

  return (
    <div className={cn('flex flex-col gap-0.5', current === true && 'rounded-md bg-ink-800/60 p-2 -m-2 mt-0')}>
      <span className='text-[10px] font-bold uppercase tracking-widest' style={{color}}>
        {speaker?.displayName ?? '—'}
      </span>
      <p className={cn('text-[13px] leading-relaxed', text === '' ? 'italic text-zinc-600' : 'text-zinc-200')}>
        {text === '' ? '(empty line)' : text}
      </p>
    </div>
  );
};

SpeakerLine.displayName = 'SpeakerLine';

const LogEntryView = ({entry}: {entry: PlaytestLogEntry}): ReactElement => {
  if (entry.kind === 'jump') {
    return <JumpDivider text={entry.text} />;
  }

  if (entry.kind === 'line') {
    return (
      <div className='flex flex-col gap-1'>
        {entry.check !== undefined && <CheckBanner entry check={entry.check} />}
        <SpeakerLine characterId={entry.characterId} text={entry.text} />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <p className='text-[12px] italic leading-relaxed text-sky-200/80'>▸ {entry.text === '' ? '…' : entry.text}</p>
      {entry.check !== null && <CheckBanner check={entry.check} />}
      {entry.spoken !== undefined && <SpokenLine text={entry.spoken} />}
    </div>
  );
};

LogEntryView.displayName = 'LogEntryView';

//
// * Choices
//

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
    return <div className='rounded-md border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-600'>▪▪▪ locked</div>;
  }

  if (view.state === 'locked_visible') {
    return (
      <div className='rounded-md border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-500'>
        {checkTag}
        {view.text}
        {view.lockReason !== undefined && <span className='ml-1 text-zinc-600'>({view.lockReason})</span>}
      </div>
    );
  }

  if (view.state === 'locked_used') {
    return (
      <div className='rounded-md border border-red-950 px-2.5 py-1.5 text-xs text-red-900 line-through'>
        {checkTag}
        {view.text}
      </div>
    );
  }

  if (manual && hasCheck) {
    return (
      <div className='flex items-center gap-1'>
        <span className='flex-1 rounded-md border border-ink-600 px-2.5 py-1.5 text-xs text-zinc-200'>
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
      className='cursor-pointer rounded-md border border-ink-600 px-2.5 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:border-sky-600 hover:bg-ink-800'
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
  const options = node?.kind === 'choice' ? node.options : [];

  return (
    <div className='flex flex-col gap-1.5'>
      {view.options.map(optionView => (
        <OptionRow
          key={optionView.optionId}
          view={optionView}
          option={options.find(o => o.id === optionView.optionId)}
          manual={playtest.mode === 'manual'}
        />
      ))}
    </div>
  );
};

ChoiceStage.displayName = 'ChoiceStage';

//
// * Variables
//

// Resolved stage state — dialogue defaults with the current line's overrides.
const StageStrip = (): ReactElement | null => {
  const playtest = useStore($playtest);
  const project = useStore($project);
  const entries = Object.entries(playtest.stage);

  if (entries.length === 0) return null;

  const slotName = (slotId: string): string =>
    project?.settings.stageSlots?.find(slot => slot.id === slotId)?.name ?? slotId;

  return (
    <div className='flex flex-wrap gap-1 border-b border-ink-800 px-3 py-1.5'>
      {entries.map(([slotId, value]) => (
        <span key={slotId} className='rounded-sm bg-ink-800 px-1.5 py-0.5 text-[10px] text-zinc-400'>
          {slotName(slotId)}: <span className='text-zinc-200'>{value}</span>
        </span>
      ))}
    </div>
  );
};

StageStrip.displayName = 'StageStrip';

const VariableWatch = (): ReactElement => {
  const playtest = useStore($playtest);
  const entries = Object.entries(playtest.variables);

  return (
    <details className='border-t border-ink-800 px-3 py-2'>
      <summary className='cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300'>
        Variables ({entries.length})
        {playtest.errors.length > 0 && <span className='ml-2 text-red-400'>⚠ {playtest.errors.length} error(s)</span>}
      </summary>
      <div className='mt-1.5 flex max-h-44 flex-col gap-0.5 overflow-y-auto'>
        {entries.map(([key, value]) => (
          <div key={key} className='flex items-center justify-between gap-2 text-[11px]'>
            <span className='truncate font-mono text-zinc-400'>{key}</span>
            <span className='font-mono text-zinc-200'>{String(value)}</span>
          </div>
        ))}
        {playtest.errors.map((error, index) => (
          // Errors accumulate append-only during a run; index identity is stable enough.
          // eslint-disable-next-line react/no-array-index-key
          <p key={index} className='text-[10px] leading-snug text-red-400'>
            {error.expression}: {error.message}
          </p>
        ))}
      </div>
    </details>
  );
};

VariableWatch.displayName = 'VariableWatch';

//
// * Panel
//

export const PlaytestPanel = (): ReactElement => {
  const playtest = useStore($playtest);
  const endRef = useRef<HTMLDivElement | null>(null);

  const logLength = playtest.log.length;
  const viewNodeId = playtest.view?.nodeId;

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, [logLength, viewNodeId]);

  return (
    <div className='flex h-full flex-col bg-ink-900'>
      <div className='flex items-center gap-2 border-b border-ink-800 px-3 py-2'>
        <span className='text-xs font-semibold uppercase tracking-wider text-emerald-300'>▶ Playtest</span>
        <div className='flex-1' />
        <SmallButton onClick={playtestBack}>{playtest.canBack ? '◀ Back' : '◁'}</SmallButton>
        <SmallButton onClick={playtestReset}>↺ Reset</SmallButton>
        <SmallButton danger onClick={stopPlaytest}>
          ■
        </SmallButton>
      </div>
      <div className='border-b border-ink-800 px-3 py-1.5'>
        <Select value={playtest.mode} options={MODE_OPTIONS} onChange={next => setPlaytestMode(next as PlaytestMode)} />
      </div>
      <StageStrip />

      <div className='flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3'>
        {playtest.log.map((entry, index) => (
          // The log is append-only within a run; back() trims from the end.
          // eslint-disable-next-line react/no-array-index-key
          <LogEntryView key={index} entry={entry} />
        ))}

        {playtest.view !== null && (
          <div className='flex flex-col gap-2'>
            {playtest.view.kind === 'line' && playtest.view.check !== undefined && (
              <CheckBanner entry check={playtest.view.check} />
            )}
            <SpeakerLine characterId={playtest.view.characterId} text={playtest.view.text} current />
            {playtest.view.kind === 'line' ? (
              <div>
                <button
                  type='button'
                  className='cursor-pointer rounded-md border border-ink-600 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-sky-600 hover:bg-ink-800'
                  onClick={playtestAdvance}
                >
                  Continue ▸
                </button>
              </div>
            ) : (
              <ChoiceStage view={playtest.view} />
            )}
          </div>
        )}

        {playtest.view === null && (
          <div className='flex flex-col items-start gap-2 pt-2'>
            <span className='text-sm italic text-zinc-500'>— Dialogue ended —</span>
            <SmallButton onClick={playtestReset}>↺ Restart</SmallButton>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <VariableWatch />
    </div>
  );
};

PlaytestPanel.displayName = 'PlaytestPanel';

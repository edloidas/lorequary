import {Handle, Position} from '@xyflow/react';
import {useState} from 'react';

import {runCommand, updateNode} from '@/modules/workspace/model/commands';
import {$contextMenu, $currentDialogue, $quickAdd} from '@/modules/workspace/model/store';
import {useLiveDraft} from '@/shared/hooks/useLiveDraft';
import {cn} from '@/shared/lib/cn';

import type {DialogFlowNode, GroupFlowNode} from '../flow/adapter';
import type {CharacterType, ChoiceOption} from '@lorequary/core';
import type {NodeProps} from '@xyflow/react';
import type {MouseEvent as ReactMouseEvent, ReactElement} from 'react';

const commitText = (nodeId: string, text: string): void => {
  const dialogue = $currentDialogue.get();

  if (dialogue === null) return;

  runCommand(doc => updateNode(doc, dialogue.id, nodeId, {text}));
};

const SPEAKER_GLYPHS: Record<CharacterType, string> = {
  character: '◉',
  player: '➤',
  skill_voice: '✦',
  narrator: '◈',
};

const FALLBACK_COLOR = '#64748b';
const CHOICE_COLOR = '#8b5cf6';

// Opens the quick-add menu anchored at the clicked pin, so a plain click on an
// open pin offers "add connected node" without dragging.
const openQuickAdd = (event: ReactMouseEvent, nodeId: string, handleId?: string): void => {
  const flow = (event.target as HTMLElement).closest('.react-flow');

  if (flow === null) return;

  const bounds = flow.getBoundingClientRect();

  $contextMenu.set(null);
  $quickAdd.set({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    source: {nodeId, ...(handleId === undefined ? {} : {handleId})},
  });
};

//
// * Inline text
//

const InlineText = ({nodeId, text, placeholder}: {nodeId: string; text: string; placeholder: string}): ReactElement => {
  const [editing, setEditing] = useState(false);
  const {draft, handleChange, handleBlur} = useLiveDraft(text, next => commitText(nodeId, next));

  if (!editing) {
    return (
      <p
        className={cn(
          'line-clamp-3 min-h-4 cursor-text text-xs leading-relaxed',
          text === '' ? 'italic text-zinc-500' : 'text-zinc-200',
        )}
        title='Double-click to edit'
        onDoubleClick={event => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        {text === '' ? placeholder : text}
      </p>
    );
  }

  return (
    <textarea
      ref={element => element?.focus()}
      className='nodrag w-full resize-none rounded border border-sky-700/60 bg-ink-950 p-1.5 text-xs leading-relaxed text-zinc-200 outline-none'
      rows={3}
      value={draft}
      onChange={event => handleChange(event.target.value)}
      onBlur={() => {
        handleBlur();
        setEditing(false);
      }}
      onKeyDown={event => {
        event.stopPropagation();

        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
          event.preventDefault();
          handleBlur();
          setEditing(false);
        }
      }}
    />
  );
};

InlineText.displayName = 'InlineText';

//
// * Badges
//

const NodeBadges = ({data}: {data: DialogFlowNode['data']}): ReactElement => {
  const {node} = data;
  const conditionCount = node.conditions?.length ?? 0;
  const effectCount = node.effects?.length ?? 0;
  const variantCount = node.textVariants?.length ?? 0;

  return (
    <div className='flex shrink-0 gap-1 text-[9px]'>
      {data.entry && (
        <span className='rounded-sm bg-emerald-500/15 px-1 font-bold uppercase text-emerald-300' title='Entry node'>
          ▶
        </span>
      )}
      {node.passiveCheck !== undefined && (
        <span
          className='rounded-sm bg-indigo-500/15 px-1 text-indigo-300'
          title={`Passive check — shown when skill ≥ ${node.passiveCheck.threshold}`}
        >
          psv ≥{node.passiveCheck.threshold}
        </span>
      )}
      {variantCount > 0 && (
        <span className='rounded-sm bg-sky-500/10 px-1 text-sky-300' title={`${variantCount} text variant(s)`}>
          ≋{variantCount}
        </span>
      )}
      {conditionCount > 0 && (
        <span className='rounded-sm bg-ink-700/80 px-1 text-zinc-300' title={`${conditionCount} condition(s)`}>
          ?{conditionCount}
        </span>
      )}
      {effectCount > 0 && (
        <span className='rounded-sm bg-ink-700/80 px-1 text-zinc-300' title={`${effectCount} effect(s)`}>
          !{effectCount}
        </span>
      )}
    </div>
  );
};

NodeBadges.displayName = 'NodeBadges';

//
// * Shared pieces
//

const nodeShell = (selected: boolean | undefined): string =>
  cn(
    'w-64 rounded-lg border bg-ink-850 shadow-[0_6px_20px_rgb(0_0_0/0.45)]',
    selected === true
      ? 'border-sky-400 shadow-[0_0_0_1px_rgb(56_189_248/0.35),0_6px_24px_rgb(0_0_0/0.5)]'
      : 'border-ink-700',
  );

const headerClass = 'node-drag-header flex items-center gap-1.5 rounded-t-[7px] border-b border-white/5 px-2.5 py-1.5';

const PlusGlyph = (): ReactElement => (
  <span className='pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none text-sky-300'>
    +
  </span>
);

PlusGlyph.displayName = 'PlusGlyph';

//
// * LineNode
//

export const LineNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement => {
  const color = data.speakerColor ?? FALLBACK_COLOR;
  const glyph = data.speakerType === undefined ? '◌' : SPEAKER_GLYPHS[data.speakerType];

  return (
    <div className={nodeShell(selected)}>
      <Handle type='target' position={Position.Left} />
      <div
        className={headerClass}
        style={{background: `linear-gradient(90deg, ${color}42, ${color}14 60%, transparent)`}}
      >
        <span className='text-[10px]' style={{color}}>
          {glyph}
        </span>
        <span className='truncate text-[10px] font-semibold tracking-wide' style={{color}}>
          {data.speakerName ?? 'No speaker'}
        </span>
        <div className='flex-1' />
        <NodeBadges data={data} />
      </div>
      <div className='px-2.5 py-2'>
        <InlineText nodeId={id} text={data.node.text} placeholder='Double-click to write…' />
      </div>
      <Handle
        type='source'
        position={Position.Right}
        className={cn(!data.outgoingConnected && 'handle-open')}
        onClick={event => {
          if (!data.outgoingConnected) openQuickAdd(event, id);
        }}
      >
        {!data.outgoingConnected && <PlusGlyph />}
      </Handle>
    </div>
  );
};

LineNode.displayName = 'LineNode';

//
// * ChoiceNode
//

const checkTag = (option: ChoiceOption): ReactElement | null => {
  if (option.skillCheck === undefined) return null;

  const red = option.skillCheck.checkType === 'red';

  return (
    <span
      className={cn('mr-1 font-semibold', red ? 'text-red-400' : 'text-zinc-100')}
      title={red ? 'Red check — one attempt' : 'White check — retryable'}
    >
      [{red ? 'RED' : 'WHITE'} {option.skillCheck.baseDifficulty}]
    </span>
  );
};

const optionConnected = (option: ChoiceOption, connectedOptionIds: string[]): boolean => {
  if (option.skillCheck !== undefined) {
    return option.skillCheck.successTargetId !== '' && option.skillCheck.failureTargetId !== '';
  }

  return connectedOptionIds.includes(option.id);
};

export const ChoiceNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement => (
  <div className={nodeShell(selected)}>
    <Handle type='target' position={Position.Left} />
    <div
      className={headerClass}
      style={{background: `linear-gradient(90deg, ${CHOICE_COLOR}38, ${CHOICE_COLOR}10 60%, transparent)`}}
    >
      <span className='text-[10px] text-violet-300'>⑂</span>
      <span className='text-[10px] font-semibold uppercase tracking-wider text-violet-300'>Choice</span>
      <div className='flex-1' />
      <NodeBadges data={data} />
    </div>
    <div className='flex flex-col gap-1 px-2.5 py-2'>
      <InlineText nodeId={id} text={data.node.text} placeholder='Double-click to describe…' />
      <div className='flex flex-col gap-1'>
        {(data.node.options ?? []).map(option => {
          const connected = optionConnected(option, data.connectedOptionIds);

          return (
            <div
              key={option.id}
              className='relative rounded border border-ink-700/70 bg-ink-900/80 px-2 py-1 pr-3 text-[10px] text-zinc-300'
            >
              <span className='line-clamp-1'>
                {checkTag(option)}
                {option.visibility !== 'available' && (
                  <span className='mr-1 text-zinc-500' title={`Gated: ${option.visibility}`}>
                    🔒
                  </span>
                )}
                {option.text === '' ? <span className='italic text-zinc-500'>empty option</span> : option.text}
              </span>
              <Handle
                id={option.id}
                type='source'
                position={Position.Right}
                className={cn('handle-option !absolute !-right-[17px] !top-1/2', !connected && 'handle-open')}
                onClick={event => {
                  if (!connected) openQuickAdd(event, id, option.id);
                }}
              >
                {!connected && <PlusGlyph />}
              </Handle>
            </div>
          );
        })}
        {(data.node.options ?? []).length === 0 && (
          <span className='text-[10px] italic text-zinc-500'>No options — add them in the inspector</span>
        )}
      </div>
    </div>
  </div>
);

ChoiceNode.displayName = 'ChoiceNode';

//
// * GroupNode
//

export const GroupNode = ({data, selected}: NodeProps<GroupFlowNode>): ReactElement => (
  <div
    className={cn(
      'w-64 rounded-lg border-2 border-dashed bg-ink-850/80 p-3 shadow-[0_6px_20px_rgb(0_0_0/0.45)]',
      selected ? 'border-sky-400' : 'border-ink-600',
    )}
    style={data.group.color === undefined ? {} : {borderColor: data.group.color}}
  >
    <Handle type='target' position={Position.Left} />
    <div className='node-drag-header flex items-center justify-between gap-2'>
      <span className='truncate text-xs font-semibold text-zinc-100'>▣ {data.group.name}</span>
      <span className='shrink-0 rounded bg-ink-700 px-1.5 text-[10px] text-zinc-300'>{data.memberCount}</span>
    </div>
    <p className='mt-1 text-[10px] italic text-zinc-500'>Double-click to open</p>
    <Handle type='source' position={Position.Right} />
  </div>
);

GroupNode.displayName = 'GroupNode';

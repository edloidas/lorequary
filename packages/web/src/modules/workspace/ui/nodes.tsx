import {useStore} from '@nanostores/react';
import {Handle, Position} from '@xyflow/react';
import {useState} from 'react';

import {$project} from '@/modules/project/model/store';
import {runCommand, updateNode} from '@/modules/workspace/model/commands';
import {$contextMenu, $currentDialogue, $currentDialogueId, $quickAdd} from '@/modules/workspace/model/store';
import {$focusNodeId} from '@/modules/workspace/model/validation';
import {useLiveDraft} from '@/shared/hooks/useLiveDraft';
import {cn} from '@/shared/lib/cn';

import type {DialogFlowNode, GroupFlowNode} from '../flow/adapter';
import type {
  CharacterType,
  ChoiceNode as CoreChoiceNode,
  ChoiceOption,
  JumpTarget,
  LineNode as CoreLineNode,
} from '@lorequary/core';
import type {NodeProps} from '@xyflow/react';
import type {MouseEvent as ReactMouseEvent, ReactElement} from 'react';

import {IN_HANDLE, OUT_HANDLE} from '../flow/adapter';

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
const HUB_COLOR = '#38bdf8';
const JUMP_COLOR = '#f59e0b';

// Opens the quick-add menu anchored at the clicked pin, so a plain click on an
// open pin offers "add connected node" without dragging.
const openQuickAdd = (event: ReactMouseEvent, nodeId: string, handleId: string): void => {
  const flow = (event.target as HTMLElement).closest('.react-flow');

  if (flow === null) return;

  const bounds = flow.getBoundingClientRect();

  $contextMenu.set(null);
  $quickAdd.set({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    source: {nodeId, handleId},
  });
};

//
// * Pins
//

type SourcePinProps = {
  nodeId: string;
  handleId: string;
  connected: boolean;
  className?: string;
};

const SourcePin = ({nodeId, handleId, connected, className}: SourcePinProps): ReactElement => (
  <Handle
    id={handleId}
    type='source'
    position={Position.Right}
    className={cn(className, !connected && 'handle-open')}
    onClick={event => {
      if (!connected) openQuickAdd(event, nodeId, handleId);
    }}
  >
    {!connected && (
      <span className='pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none text-sky-300'>
        +
      </span>
    )}
  </Handle>
);

SourcePin.displayName = 'SourcePin';

// Dedicated pass/fail pins for check-bearing ports.
const OutcomePins = ({
  nodeId,
  base,
  connectedHandles,
  offsets,
}: {
  nodeId: string;
  base: string;
  connectedHandles: string[];
  offsets: [string, string];
}): ReactElement => (
  <>
    <Handle
      id={`${base}:success`}
      type='source'
      position={Position.Right}
      className='handle-success'
      style={{top: offsets[0]}}
      title='On success'
      onClick={event => {
        if (!connectedHandles.includes(`${base}:success`)) openQuickAdd(event, nodeId, `${base}:success`);
      }}
    />
    <Handle
      id={`${base}:failure`}
      type='source'
      position={Position.Right}
      className='handle-failure'
      style={{top: offsets[1]}}
      title='On failure'
      onClick={event => {
        if (!connectedHandles.includes(`${base}:failure`)) openQuickAdd(event, nodeId, `${base}:failure`);
      }}
    />
  </>
);

OutcomePins.displayName = 'OutcomePins';

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

const NodeBadges = ({node, entry}: {node: CoreLineNode | CoreChoiceNode; entry: boolean}): ReactElement => {
  const conditionCount = node.conditions?.length ?? 0;
  const effectCount = node.effects?.length ?? 0;
  const variantCount = node.textVariants?.length ?? 0;

  return (
    <div className='flex shrink-0 gap-1 text-[9px]'>
      {entry && (
        <span className='rounded-sm bg-emerald-500/15 px-1 font-bold uppercase text-emerald-300' title='Entry node'>
          ▶
        </span>
      )}
      {node.kind === 'line' && node.check !== undefined && (
        <span
          className={cn(
            'rounded-sm px-1 font-semibold',
            node.check.checkType === 'red' ? 'bg-red-500/15 text-red-300' : 'bg-zinc-500/15 text-zinc-200',
          )}
          title={`Entry check — rolls when shown (DC ${node.check.baseDifficulty})`}
        >
          ⚅{node.check.baseDifficulty}
        </span>
      )}
      {node.passiveCheck !== undefined && (
        <span
          className='rounded-sm bg-indigo-500/15 px-1 text-indigo-300'
          title={
            node.passiveCheck.mode === 'below'
              ? `Anti-passive check — shown when skill < ${node.passiveCheck.threshold}`
              : `Passive check — shown when skill ≥ ${node.passiveCheck.threshold}`
          }
        >
          psv {node.passiveCheck.mode === 'below' ? '<' : '≥'}
          {node.passiveCheck.threshold}
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

//
// * LineNode
//

export const LineNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement | null => {
  const {node} = data;

  if (node.kind !== 'line') return null;

  const color = data.speakerColor ?? FALLBACK_COLOR;
  const glyph = data.speakerType === undefined ? '◌' : SPEAKER_GLYPHS[data.speakerType];

  return (
    <div className={nodeShell(selected)}>
      <Handle id={IN_HANDLE} type='target' position={Position.Left} />
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
        <NodeBadges node={node} entry={data.entry} />
      </div>
      <div className='px-2.5 py-2'>
        <InlineText nodeId={id} text={node.text} placeholder='Double-click to write…' />
      </div>
      {node.check === undefined ? (
        <SourcePin nodeId={id} handleId={OUT_HANDLE} connected={data.connectedHandles.includes(OUT_HANDLE)} />
      ) : (
        <OutcomePins nodeId={id} base={OUT_HANDLE} connectedHandles={data.connectedHandles} offsets={['38%', '68%']} />
      )}
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

export const ChoiceNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement | null => {
  const {node} = data;

  if (node.kind !== 'choice') return null;

  return (
    <div className={nodeShell(selected)}>
      <Handle id={IN_HANDLE} type='target' position={Position.Left} />
      <div
        className={headerClass}
        style={{background: `linear-gradient(90deg, ${CHOICE_COLOR}38, ${CHOICE_COLOR}10 60%, transparent)`}}
      >
        <span className='text-[10px] text-violet-300'>⑂</span>
        <span className='text-[10px] font-semibold uppercase tracking-wider text-violet-300'>Choice</span>
        <div className='flex-1' />
        <NodeBadges node={node} entry={data.entry} />
      </div>
      <div className='flex flex-col gap-1 px-2.5 py-2'>
        <InlineText nodeId={id} text={node.text} placeholder='Double-click to describe…' />
        <div className='flex flex-col gap-1'>
          {node.options.map(option => (
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
              {option.skillCheck === undefined ? (
                <Handle
                  id={option.id}
                  type='source'
                  position={Position.Right}
                  className={cn(
                    'handle-option !absolute !-right-[17px] !top-1/2',
                    !data.connectedHandles.includes(option.id) && 'handle-open',
                  )}
                  onClick={event => {
                    if (!data.connectedHandles.includes(option.id)) openQuickAdd(event, id, option.id);
                  }}
                >
                  {!data.connectedHandles.includes(option.id) && (
                    <span className='pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none text-sky-300'>
                      +
                    </span>
                  )}
                </Handle>
              ) : (
                <>
                  <Handle
                    id={`${option.id}:success`}
                    type='source'
                    position={Position.Right}
                    className='handle-success !absolute !-right-[17px] !top-[30%]'
                    title='On success'
                    onClick={event => {
                      if (!data.connectedHandles.includes(`${option.id}:success`)) {
                        openQuickAdd(event, id, `${option.id}:success`);
                      }
                    }}
                  />
                  <Handle
                    id={`${option.id}:failure`}
                    type='source'
                    position={Position.Right}
                    className='handle-failure !absolute !-right-[17px] !top-[70%]'
                    title='On failure'
                    onClick={event => {
                      if (!data.connectedHandles.includes(`${option.id}:failure`)) {
                        openQuickAdd(event, id, `${option.id}:failure`);
                      }
                    }}
                  />
                </>
              )}
            </div>
          ))}
          {node.options.length === 0 && (
            <span className='text-[10px] italic text-zinc-500'>No options — add them in the inspector</span>
          )}
        </div>
      </div>
    </div>
  );
};

ChoiceNode.displayName = 'ChoiceNode';

//
// * HubNode
//

export const HubNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement | null => {
  const {node} = data;

  if (node.kind !== 'hub') return null;

  const conditionCount = node.conditions?.length ?? 0;
  const effectCount = node.effects?.length ?? 0;

  return (
    <div
      className={cn(
        'node-drag-header flex w-28 items-center gap-1.5 rounded-full border bg-ink-850 px-3 py-1.5 shadow-[0_6px_20px_rgb(0_0_0/0.45)]',

        selected ? 'border-sky-400' : 'border-ink-700',
      )}
    >
      <Handle id={IN_HANDLE} type='target' position={Position.Left} />
      <span className='text-[11px]' style={{color: HUB_COLOR}}>
        ◇
      </span>
      <span className='text-[10px] font-semibold uppercase tracking-wider' style={{color: HUB_COLOR}}>
        Hub
      </span>
      <div className='flex-1' />
      <div className='flex gap-1 text-[9px]'>
        {conditionCount > 0 && <span className='rounded-sm bg-ink-700/80 px-1 text-zinc-300'>?{conditionCount}</span>}
        {effectCount > 0 && <span className='rounded-sm bg-ink-700/80 px-1 text-zinc-300'>!{effectCount}</span>}
      </div>
      <SourcePin nodeId={id} handleId={OUT_HANDLE} connected={data.connectedHandles.includes(OUT_HANDLE)} />
    </div>
  );
};

HubNode.displayName = 'HubNode';

//
// * JumpNode
//

const NONE = '__none__';

const patchJumpTarget = (nodeId: string, target: JumpTarget | undefined): void => {
  const dialogue = $currentDialogue.get();

  if (dialogue === null) return;

  runCommand(doc => updateNode(doc, dialogue.id, nodeId, {jumpTarget: target}));
};

export const JumpNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement | null => {
  const project = useStore($project);
  const dialogue = useStore($currentDialogue);
  const {node} = data;

  if (node.kind !== 'jump' || project === null || dialogue === null) return null;

  const target = node.jumpTarget;
  const targetDialogueId = target?.dialogueId ?? dialogue.id;
  const targetDialogue = project.dialogues.find(d => d.id === targetDialogueId);

  const handleNavigate = (): void => {
    if (target === undefined || targetDialogue === undefined) return;

    if (targetDialogue.id !== dialogue.id) {
      $currentDialogueId.set(targetDialogue.id);
    }

    $focusNodeId.set(target.nodeId ?? targetDialogue.entryNodeId);
  };

  const handleDialogueChange = (next: string): void => {
    if (next === dialogue.id) {
      // Same-dialogue jumps need an explicit node — cleared until picked.
      patchJumpTarget(id, undefined);
      return;
    }

    patchJumpTarget(id, {dialogueId: next});
  };

  const handleNodeChange = (next: string): void => {
    const sameDialogue = targetDialogueId === dialogue.id;

    if (next === NONE) {
      patchJumpTarget(id, sameDialogue ? undefined : {dialogueId: targetDialogueId});
      return;
    }

    patchJumpTarget(id, sameDialogue ? {nodeId: next} : {dialogueId: targetDialogueId, nodeId: next});
  };

  const nodeOptions = (targetDialogue?.nodes ?? []).filter(n => n.kind !== 'jump');

  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-ink-850 shadow-[0_6px_20px_rgb(0_0_0/0.45)]',

        selected ? 'border-sky-400' : 'border-ink-700',
      )}
      onDoubleClick={handleNavigate}
      title='Double-click to go to the target'
    >
      <Handle id={IN_HANDLE} type='target' position={Position.Left} />
      <div
        className={headerClass}
        style={{background: `linear-gradient(90deg, ${JUMP_COLOR}30, ${JUMP_COLOR}0c 60%, transparent)`}}
      >
        <span className='text-[11px]' style={{color: JUMP_COLOR}}>
          ↪
        </span>
        <span className='text-[10px] font-semibold uppercase tracking-wider' style={{color: JUMP_COLOR}}>
          Jump
        </span>
      </div>
      <div className='nodrag flex flex-col gap-1 px-2.5 py-2'>
        <select
          className='w-full rounded border border-ink-700 bg-ink-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-sky-600'
          value={targetDialogueId}
          onChange={event => handleDialogueChange(event.target.value)}
        >
          {project.dialogues.map(d => (
            <option key={d.id} value={d.id}>
              {d.id === dialogue.id ? `${d.name} (this dialogue)` : d.name}
            </option>
          ))}
        </select>
        <select
          className='w-full rounded border border-ink-700 bg-ink-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-sky-600'
          value={target?.nodeId ?? NONE}
          onChange={event => handleNodeChange(event.target.value)}
        >
          <option value={NONE}>{targetDialogueId === dialogue.id ? '— pick a node —' : '— dialogue entry —'}</option>
          {nodeOptions.map(n => (
            <option key={n.id} value={n.id}>
              {'text' in n && n.text.trim() !== '' ? n.text.slice(0, 32) : n.id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

JumpNode.displayName = 'JumpNode';

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

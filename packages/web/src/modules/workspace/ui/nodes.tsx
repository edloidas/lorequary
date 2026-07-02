import {Handle, Position} from '@xyflow/react';
import {useState} from 'react';

import {runCommand, updateNode} from '@/modules/workspace/model/commands';
import {$currentDialogue} from '@/modules/workspace/model/store';
import {useLiveDraft} from '@/shared/hooks/useLiveDraft';
import {cn} from '@/shared/lib/cn';

import type {DialogFlowNode, GroupFlowNode} from '../flow/adapter';
import type {NodeProps} from '@xyflow/react';
import type {ReactElement} from 'react';

const commitText = (nodeId: string, text: string): void => {
  const dialogue = $currentDialogue.get();

  if (dialogue === null) return;

  runCommand(doc => updateNode(doc, dialogue.id, nodeId, {text}));
};

const InlineText = ({nodeId, text, placeholder}: {nodeId: string; text: string; placeholder: string}): ReactElement => {
  const [editing, setEditing] = useState(false);
  const {draft, handleChange, handleBlur} = useLiveDraft(text, next => commitText(nodeId, next));

  if (!editing) {
    return (
      <p
        className={cn('line-clamp-2 min-h-4 text-xs', text === '' ? 'italic text-neutral-500' : 'text-neutral-200')}
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
      className='nodrag w-full resize-none rounded border border-neutral-600 bg-neutral-900 p-1 text-xs text-neutral-200 outline-none'
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

const NodeBadges = ({data}: {data: DialogFlowNode['data']}): ReactElement => {
  const {node} = data;
  const conditionCount = node.conditions?.length ?? 0;
  const effectCount = node.effects?.length ?? 0;

  return (
    <div className='flex gap-1 text-[9px] text-neutral-400'>
      {data.entry && <span className='rounded bg-emerald-900/60 px-1 text-emerald-300'>entry</span>}
      {node.passiveCheck !== undefined && (
        <span className='rounded bg-indigo-900/60 px-1 text-indigo-300'>passive ≥{node.passiveCheck.threshold}</span>
      )}
      {conditionCount > 0 && <span className='rounded bg-neutral-700/70 px-1'>?{conditionCount}</span>}
      {effectCount > 0 && <span className='rounded bg-neutral-700/70 px-1'>!{effectCount}</span>}
    </div>
  );
};

NodeBadges.displayName = 'NodeBadges';

const nodeShell = (selected: boolean | undefined): string =>
  cn('w-56 rounded-md border bg-neutral-800 shadow-md', selected ? 'border-sky-500' : 'border-neutral-700');

export const LineNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement => (
  <div className={nodeShell(selected)}>
    <Handle type='target' position={Position.Top} />
    <div className='flex items-stretch'>
      <div className='w-1 shrink-0 rounded-l-md' style={{backgroundColor: data.speakerColor ?? '#525252'}} />
      <div className='flex min-w-0 flex-1 flex-col gap-1 p-2'>
        <div className='flex items-center justify-between gap-1'>
          <span className='truncate text-[10px] font-semibold' style={{color: data.speakerColor ?? '#a3a3a3'}}>
            {data.speakerName ?? 'No speaker'}
          </span>
          <NodeBadges data={data} />
        </div>
        <InlineText nodeId={id} text={data.node.text} placeholder='Double-click to write…' />
      </div>
    </div>
    <Handle type='source' position={Position.Bottom} />
  </div>
);

LineNode.displayName = 'LineNode';

export const ChoiceNode = ({id, data, selected}: NodeProps<DialogFlowNode>): ReactElement => (
  <div className={nodeShell(selected)}>
    <Handle type='target' position={Position.Top} />
    <div className='flex flex-col gap-1 p-2'>
      <div className='flex items-center justify-between gap-1'>
        <span className='text-[10px] font-semibold uppercase tracking-wide text-amber-400'>Choice</span>
        <NodeBadges data={data} />
      </div>
      <InlineText nodeId={id} text={data.node.text} placeholder='Double-click to describe…' />
      <div className='flex flex-col gap-0.5'>
        {(data.node.options ?? []).map(option => (
          <div
            key={option.id}
            className='relative rounded bg-neutral-900/70 px-1.5 py-0.5 pr-3 text-[10px] text-neutral-300'
          >
            <span className='line-clamp-1'>
              {option.skillCheck !== undefined && (
                <span className='text-amber-300'>[{option.skillCheck.checkType === 'red' ? 'RED' : 'WHITE'}] </span>
              )}
              {option.text === '' ? '…' : option.text}
            </span>
            <Handle id={option.id} type='source' position={Position.Right} className='!absolute !-right-2.5 !top-1/2' />
          </div>
        ))}
        {(data.node.options ?? []).length === 0 && (
          <span className='text-[10px] italic text-neutral-500'>No options — add them in the inspector</span>
        )}
      </div>
    </div>
  </div>
);

ChoiceNode.displayName = 'ChoiceNode';

export const GroupNode = ({data, selected}: NodeProps<GroupFlowNode>): ReactElement => (
  <div
    className={cn(
      'w-56 rounded-md border-2 border-dashed bg-neutral-800/70 p-3 shadow-md',
      selected ? 'border-sky-500' : 'border-neutral-600',
    )}
    style={data.group.color === undefined ? {} : {borderColor: data.group.color}}
  >
    <Handle type='target' position={Position.Top} />
    <div className='flex items-center justify-between gap-2'>
      <span className='truncate text-xs font-semibold text-neutral-100'>▣ {data.group.name}</span>
      <span className='shrink-0 rounded bg-neutral-700 px-1.5 text-[10px] text-neutral-300'>{data.memberCount}</span>
    </div>
    <p className='mt-1 text-[10px] italic text-neutral-500'>Double-click to open</p>
    <Handle type='source' position={Position.Bottom} />
  </div>
);

GroupNode.displayName = 'GroupNode';

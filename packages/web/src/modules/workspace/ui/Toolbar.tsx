import {useStore} from '@nanostores/react';

import {$playtest, startPlaytest, stopPlaytest} from '@/modules/playtest/model/store';
import {$appView} from '@/modules/project/model/navigation';
import {$canRedo, $canUndo, addNode, groupNodes, redo, runCommand, undo} from '@/modules/workspace/model/commands';
import {$activeGroupId, $currentDialogue, $selection, clearSelection} from '@/modules/workspace/model/store';
import {$validationIssues, $validationOpen} from '@/modules/workspace/model/validation';
import {cn} from '@/shared/lib/cn';

import type {NodeKind} from '@lorequary/core';
import type {ReactElement} from 'react';

const buttonClass = (enabled: boolean): string =>
  cn(
    'rounded-md border border-ink-600 px-2.5 py-1 text-xs transition-colors',
    enabled ? 'cursor-pointer text-zinc-200 hover:border-ink-600 hover:bg-ink-800' : 'cursor-default text-zinc-600',
  );

// New nodes land below the current lowest node so they never stack.
const nextFreePosition = (): {x: number; y: number} => {
  const dialogue = $currentDialogue.get();
  const positions = Object.values(dialogue?.editor.nodePositions ?? {});
  const lowest = positions.reduce((max, position) => Math.max(max, position.y), 0);

  return {x: 100, y: positions.length === 0 ? 100 : lowest + 140};
};

export const Toolbar = (): ReactElement => {
  const dialogue = useStore($currentDialogue);
  const canUndo = useStore($canUndo);
  const canRedo = useStore($canRedo);
  const selection = useStore($selection);
  const playtest = useStore($playtest);
  const issues = useStore($validationIssues);

  // Group ids can land in the node selection — only real nodes are groupable.
  const groupableIds = selection.nodeIds.filter(id => dialogue?.nodes.some(node => node.id === id));

  const handleAdd = (kind: NodeKind): void => {
    if (dialogue === null) return;

    runCommand(doc => addNode(doc, dialogue.id, kind, nextFreePosition(), $activeGroupId.get() ?? undefined));
  };

  const handleGroup = (): void => {
    if (dialogue === null || groupableIds.length < 2) return;

    const name = window.prompt('Group name', 'Group');

    if (name === null || name.trim() === '') return;

    runCommand(doc => groupNodes(doc, dialogue.id, groupableIds, name.trim()));
    clearSelection();
  };

  const playtestButtonClass = cn(
    'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
    playtest.active
      ? 'border-red-900 bg-red-950/40 text-red-300 hover:bg-red-950/70'
      : 'border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40',
  );

  return (
    <div className='flex items-center gap-2 border-b border-ink-800 bg-ink-900 px-3 py-2'>
      <button
        type='button'
        className='cursor-pointer rounded-md px-1.5 py-1 text-xs text-zinc-500 hover:bg-ink-800 hover:text-zinc-200'
        title='Back to project'
        onClick={() => $appView.set('project')}
      >
        ←
      </button>
      <span className='max-w-48 truncate text-xs font-semibold text-zinc-300'>{dialogue?.name ?? ''}</span>
      <div className='mx-1 h-4 w-px bg-ink-700' />
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('line')}>
        ＋ Line
      </button>
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('choice')}>
        ＋ Choice
      </button>
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('hub')}>
        ＋ Hub
      </button>
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('jump')}>
        ＋ Jump
      </button>
      <div className='mx-1 h-4 w-px bg-ink-700' />
      <button type='button' className={buttonClass(canUndo)} disabled={!canUndo} onClick={undo}>
        ↩ Undo
      </button>
      <button type='button' className={buttonClass(canRedo)} disabled={!canRedo} onClick={redo}>
        ↪ Redo
      </button>
      <div className='mx-1 h-4 w-px bg-ink-700' />
      <button type='button' className={buttonClass(groupableIds.length >= 2)} onClick={handleGroup}>
        ▣ Group
      </button>
      <button
        type='button'
        className={buttonClass(dialogue !== null)}
        onClick={() => $validationOpen.set(!$validationOpen.get())}
      >
        ✓ Validate
        {issues.length > 0 && (
          <span className='ml-1 rounded-sm bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-300'>
            {issues.length}
          </span>
        )}
      </button>
      <div className='flex-1' />
      <button
        type='button'
        className={playtestButtonClass}
        disabled={dialogue === null}
        onClick={() => {
          if (playtest.active) {
            stopPlaytest();
          } else {
            startPlaytest();
          }
        }}
      >
        {playtest.active ? '■ Stop' : '▶ Play'}
      </button>
    </div>
  );
};

Toolbar.displayName = 'Toolbar';

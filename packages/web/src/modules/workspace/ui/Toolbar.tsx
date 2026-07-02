import {useStore} from '@nanostores/react';

import {$canRedo, $canUndo, addNode, redo, runCommand, undo} from '@/modules/workspace/model/commands';
import {$currentDialogue} from '@/modules/workspace/model/store';
import {cn} from '@/shared/lib/cn';

import type {NodeKind} from '@lorequary/core';
import type {ReactElement} from 'react';

const buttonClass = (enabled: boolean): string =>
  cn(
    'rounded border border-neutral-700 px-2.5 py-1 text-xs',
    enabled ? 'text-neutral-200 hover:bg-neutral-800' : 'cursor-default text-neutral-600',
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

  const handleAdd = (kind: NodeKind): void => {
    if (dialogue === null) return;

    runCommand(doc => addNode(doc, dialogue.id, kind, nextFreePosition()));
  };

  return (
    <div className='flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2'>
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('line')}>
        + Line
      </button>
      <button type='button' className={buttonClass(dialogue !== null)} onClick={() => handleAdd('choice')}>
        + Choice
      </button>
      <div className='mx-1 h-4 w-px bg-neutral-800' />
      <button type='button' className={buttonClass(canUndo)} disabled={!canUndo} onClick={undo}>
        ↩ Undo
      </button>
      <button type='button' className={buttonClass(canRedo)} disabled={!canRedo} onClick={redo}>
        ↪ Redo
      </button>
      <div className='flex-1' />
      <span className='text-xs text-neutral-500'>{dialogue?.name ?? ''}</span>
    </div>
  );
};

Toolbar.displayName = 'Toolbar';

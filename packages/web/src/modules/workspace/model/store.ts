import {atom, computed} from 'nanostores';

import {$project} from '@/modules/project/model/store';

import type {Dialogue} from '@lorequary/core';

export const $currentDialogueId = atom<string | null>(null);

export const $currentDialogue = computed([$project, $currentDialogueId], (project, dialogueId): Dialogue | null => {
  if (project === null) return null;

  return project.dialogues.find(dialogue => dialogue.id === dialogueId) ?? project.dialogues[0] ?? null;
});

export type Selection = {
  nodeIds: string[];
  edgeIds: string[];
};

export const $selection = atom<Selection>({nodeIds: [], edgeIds: []});

export const clearSelection = (): void => {
  $selection.set({nodeIds: [], edgeIds: []});
};

// Live positions while dragging — not undoable; committed via moveNodes on drag stop.
export const $dragPositions = atom<Record<string, {x: number; y: number}>>({});

export type ContextMenuState =
  | {type: 'pane'; x: number; y: number; canvasX: number; canvasY: number}
  | {type: 'node'; x: number; y: number; nodeId: string};

export const $contextMenu = atom<ContextMenuState | null>(null);

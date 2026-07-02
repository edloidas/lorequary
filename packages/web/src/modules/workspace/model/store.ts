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

// Rendered node sizes reported by ReactFlow — transient view state consumed by the minimap.
export const $nodeDimensions = atom<Record<string, {width: number; height: number}>>({});

// Currently submerged group (null = root level). Purely a view concern.
export const $activeGroupId = atom<string | null>(null);

export type ContextMenuState =
  | {type: 'pane'; x: number; y: number; canvasX: number; canvasY: number}
  | {type: 'node'; x: number; y: number; nodeId: string}
  | {type: 'edge'; x: number; y: number; edgeId: string};

export const $contextMenu = atom<ContextMenuState | null>(null);

// Pending "add a connected node" menu — opened by dropping a connection on the
// pane or by clicking an unconnected source pin.
export type QuickAddState = {
  x: number;
  y: number;
  // Flow coordinates for the new node; omitted for pin clicks, where the
  // command derives a position from the source node instead.
  canvasX?: number;
  canvasY?: number;
  source: {nodeId: string; handleId?: string};
};

export const $quickAdd = atom<QuickAddState | null>(null);

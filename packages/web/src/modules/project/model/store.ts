import {SCHEMA_VERSION, nodeTextKey} from '@lorequary/core';
import {nanoid} from 'nanoid';
import {atom} from 'nanostores';

import type {Dialogue, ProjectDocument} from '@lorequary/core';

export const $project = atom<ProjectDocument | null>(null);

export const createStarterDialogue = (name: string): Dialogue => {
  const dialogueId = nanoid(8);
  const nodeId = nanoid(8);

  return {
    id: dialogueId,
    name,
    entryNodeId: nodeId,
    nodes: [{id: nodeId, kind: 'line', text: '', lineKey: nodeTextKey(dialogueId, nodeId)}],
    edges: [],
    editor: {nodePositions: {[nodeId]: {x: 100, y: 100}}},
  };
};

export const createDefaultProject = (name: string): ProjectDocument => {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {id: nanoid(8), name, createdAt: now, updatedAt: now},
    settings: {},
    characters: [
      {id: nanoid(8), name: 'narrator', displayName: 'Narrator', type: 'narrator', color: '#8a8a9a'},
      {id: nanoid(8), name: 'player', displayName: 'You', type: 'player', color: '#4a9a6a'},
    ],
    variables: [],
    dialogues: [createStarterDialogue('Main')],
  };
};

import type {Character, DialogEdge, DialogNode, Dialogue, ProjectDocument, Variable} from './schema';

import {SCHEMA_VERSION} from './schema';

// Test-data builders. Not exported from the package index.

export const buildVariable = (overrides?: Partial<Variable>): Variable => ({
  id: 'var_money',
  name: 'Money',
  key: 'hero.money',
  type: 'number',
  defaultValue: 100,
  ...overrides,
});

export const buildCharacter = (overrides?: Partial<Character>): Character => ({
  id: 'char_aurelia',
  name: 'aurelia',
  displayName: 'Aurelia',
  type: 'character',
  color: '#c04040',
  ...overrides,
});

export const buildNode = (overrides?: Partial<DialogNode>): DialogNode => ({
  id: 'node_1',
  kind: 'line',
  text: 'Hello, traveler.',
  ...overrides,
});

export const buildEdge = (overrides?: Partial<DialogEdge>): DialogEdge => ({
  id: 'edge_1',
  source: 'node_1',
  target: 'node_2',
  ...overrides,
});

export const buildDialogue = (overrides?: Partial<Dialogue>): Dialogue => ({
  id: 'dlg_intro',
  name: 'Intro',
  entryNodeId: 'node_1',
  nodes: [buildNode(), buildNode({id: 'node_2', text: 'Farewell.'})],
  edges: [buildEdge()],
  editor: {
    nodePositions: {node_1: {x: 0, y: 0}, node_2: {x: 0, y: 150}},
  },
  ...overrides,
});

export const buildProject = (overrides?: Partial<ProjectDocument>): ProjectDocument => ({
  schemaVersion: SCHEMA_VERSION,
  meta: {
    id: 'proj_1',
    name: 'Test Project',
    createdAt: '2026-07-02T12:00:00.000Z',
    updatedAt: '2026-07-02T12:00:00.000Z',
  },
  settings: {},
  characters: [buildCharacter()],
  variables: [buildVariable()],
  dialogues: [buildDialogue()],
  ...overrides,
});

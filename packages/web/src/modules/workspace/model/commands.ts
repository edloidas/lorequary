import {nodeTextKey} from '@lorequary/core';
import {nanoid} from 'nanoid';
import {atom, computed} from 'nanostores';

import {$project, createStarterDialogue} from '@/modules/project/model/store';

import type {
  Character,
  ChoiceNode,
  ChoiceOption,
  DialogNode,
  Dialogue,
  EdgeRole,
  JumpNode,
  LineNode,
  NodeKind,
  ProjectDocument,
  Variable,
} from '@lorequary/core';

type Position = {x: number; y: number};

const DUPLICATE_OFFSET = 40;
const HISTORY_LIMIT = 100;

//
// * History
//

const $history = atom<{past: ProjectDocument[]; future: ProjectDocument[]}>({past: [], future: []});

export const $canUndo = computed($history, history => history.past.length > 0);
export const $canRedo = computed($history, history => history.future.length > 0);

// Live editing coalescing: consecutive commands sharing a key (e.g. keystrokes in one
// input) merge into a single undo entry — only the first keystroke snapshots history.
let ambientCoalesceKey: string | null = null;
let activeCoalesceKey: string | null = null;

export const coalesced = (key: string, fn: () => void): void => {
  ambientCoalesceKey = key;

  try {
    fn();
  } finally {
    ambientCoalesceKey = null;
  }
};

export const endCoalescing = (): void => {
  activeCoalesceKey = null;
};

export const resetHistory = (): void => {
  activeCoalesceKey = null;
  $history.set({past: [], future: []});
};

export const runCommand = (mutate: (doc: ProjectDocument) => ProjectDocument): void => {
  const doc = $project.get();

  if (doc === null) return;

  const next = mutate(doc);

  if (next === doc) return;

  const {past} = $history.get();
  const merge = ambientCoalesceKey !== null && ambientCoalesceKey === activeCoalesceKey && past.length > 0;

  if (!merge) {
    $history.set({past: [...past.slice(-(HISTORY_LIMIT - 1)), doc], future: []});
  }

  activeCoalesceKey = ambientCoalesceKey;
  $project.set({...next, meta: {...next.meta, updatedAt: new Date().toISOString()}});
};

export const undo = (): void => {
  const doc = $project.get();
  const {past, future} = $history.get();
  const previous = past[past.length - 1];

  if (doc === null || previous === undefined) return;

  activeCoalesceKey = null;
  $history.set({past: past.slice(0, -1), future: [doc, ...future]});
  $project.set(previous);
};

export const redo = (): void => {
  const doc = $project.get();
  const {past, future} = $history.get();
  const [next, ...rest] = future;

  if (doc === null || next === undefined) return;

  activeCoalesceKey = null;
  $history.set({past: [...past, doc], future: rest});
  $project.set(next);
};

//
// * Helpers
//

const mapDialogue = (
  doc: ProjectDocument,
  dialogueId: string,
  fn: (dialogue: Dialogue) => Dialogue,
): ProjectDocument => ({
  ...doc,
  dialogues: doc.dialogues.map(dialogue => (dialogue.id === dialogueId ? fn(dialogue) : dialogue)),
});

const omitKeys = <T>(record: Record<string, T>, keys: string[]): Record<string, T> => {
  const next = {...record};

  for (const key of keys) delete next[key];

  return next;
};

//
// * Node commands
//

const insertNode = (
  doc: ProjectDocument,
  dialogueId: string,
  node: DialogNode,
  position: Position,
  groupId?: string,
): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    nodes: [...dialogue.nodes, node],
    editor: {
      ...dialogue.editor,
      nodePositions: {...dialogue.editor.nodePositions, [node.id]: position},
      ...(groupId === undefined || dialogue.editor.groups === undefined
        ? {}
        : {
            groups: dialogue.editor.groups.map(group =>
              group.id === groupId ? {...group, nodeIds: [...group.nodeIds, node.id]} : group,
            ),
          }),
    },
  }));

const buildNode = (dialogueId: string, kind: NodeKind): DialogNode => {
  const nodeId = nanoid(8);

  if (kind === 'hub' || kind === 'jump') {
    return {id: nodeId, kind};
  }

  const content = {id: nodeId, text: '', lineKey: nodeTextKey(dialogueId, nodeId)};

  return kind === 'choice' ? {...content, kind, options: []} : {...content, kind};
};

export const addNode = (
  doc: ProjectDocument,
  dialogueId: string,
  kind: NodeKind,
  position: Position,
  groupId?: string,
): ProjectDocument => insertNode(doc, dialogueId, buildNode(dialogueId, kind), position, groupId);

// Flat cross-kind patch; `kind` is fixed at creation and never patched.
export type DialogNodePatch = Partial<Omit<LineNode, 'kind'>> &
  Partial<Omit<ChoiceNode, 'kind'>> &
  Partial<Omit<JumpNode, 'kind'>>;

export const updateNode = (
  doc: ProjectDocument,
  dialogueId: string,
  nodeId: string,
  patch: DialogNodePatch,
): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    nodes: dialogue.nodes.map(node => (node.id === nodeId ? ({...node, ...patch} as DialogNode) : node)),
  }));

export const deleteNodes = (doc: ProjectDocument, dialogueId: string, nodeIds: string[]): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => {
    const removed = new Set(nodeIds);

    return {
      ...dialogue,
      nodes: dialogue.nodes.filter(node => !removed.has(node.id)),
      edges: dialogue.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)),
      editor: {
        ...dialogue.editor,
        nodePositions: omitKeys(dialogue.editor.nodePositions, nodeIds),
        ...(dialogue.editor.nodeSizes === undefined ? {} : {nodeSizes: omitKeys(dialogue.editor.nodeSizes, nodeIds)}),
        ...(dialogue.editor.groups === undefined
          ? {}
          : {
              groups: dialogue.editor.groups.map(group => ({
                ...group,
                nodeIds: group.nodeIds.filter(id => !removed.has(id)),
              })),
            }),
      },
    };
  });

export const moveNodes = (
  doc: ProjectDocument,
  dialogueId: string,
  positions: Record<string, Position>,
): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    editor: {
      ...dialogue.editor,
      nodePositions: {...dialogue.editor.nodePositions, ...positions},
    },
  }));

export const duplicateNodes = (doc: ProjectDocument, dialogueId: string, nodeIds: string[]): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => {
    const copies: DialogNode[] = [];
    const positions: Record<string, Position> = {};

    for (const nodeId of nodeIds) {
      const source = dialogue.nodes.find(node => node.id === nodeId);

      if (source === undefined) continue;

      const copyId = nanoid(8);
      const origin = dialogue.editor.nodePositions[nodeId] ?? {x: 0, y: 0};
      const copy = structuredClone(source);

      copy.id = copyId;

      if (copy.kind === 'line' || copy.kind === 'choice') copy.lineKey = nodeTextKey(dialogueId, copyId);
      if (copy.kind === 'choice') copy.options = copy.options.map(option => ({...option, id: nanoid(8)}));

      copies.push(copy);
      positions[copyId] = {x: origin.x + DUPLICATE_OFFSET, y: origin.y + DUPLICATE_OFFSET};
    }

    return {
      ...dialogue,
      nodes: [...dialogue.nodes, ...copies],
      editor: {
        ...dialogue.editor,
        nodePositions: {...dialogue.editor.nodePositions, ...positions},
      },
    };
  });

//
// * Edge commands
//

const findOption = (dialogue: Dialogue, nodeId: string, optionId: string | undefined): ChoiceOption | undefined => {
  if (optionId === undefined) return undefined;

  const node = dialogue.nodes.find(n => n.id === nodeId);

  return node?.kind === 'choice' ? node.options.find(option => option.id === optionId) : undefined;
};

// Adds an edge from a port, replacing the port's previous edge when it leaves an
// option — the canvas edits one target per port until multi-edge routing UX lands.
const addPortEdge = (
  doc: ProjectDocument,
  dialogueId: string,
  connection: {source: string; target: string; sourceOption?: string; role: EdgeRole},
): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => {
    const {source, target, sourceOption, role} = connection;
    const edges =
      sourceOption === undefined
        ? dialogue.edges
        : dialogue.edges.filter(
            edge => !(edge.source === source && edge.sourceOption === sourceOption && edge.role === role),
          );

    return {
      ...dialogue,
      edges: [...edges, {id: nanoid(8), source, ...(sourceOption === undefined ? {} : {sourceOption}), role, target}],
    };
  });

export const addEdge = (
  doc: ProjectDocument,
  dialogueId: string,
  connection: {source: string; target: string; sourceHandle?: string},
): ProjectDocument => {
  const dialogue = doc.dialogues.find(d => d.id === dialogueId);

  if (dialogue === undefined) return doc;

  const option = findOption(dialogue, connection.source, connection.sourceHandle);

  return addPortEdge(doc, dialogueId, {
    source: connection.source,
    target: connection.target,
    ...(option === undefined ? {} : {sourceOption: option.id}),
    role: 'flow',
  });
};

export const deleteEdges = (doc: ProjectDocument, dialogueId: string, edgeIds: string[]): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    edges: dialogue.edges.filter(edge => !edgeIds.includes(edge.id)),
  }));

// Routes a canvas connection: a check-bearing option wires its success port first,
// then failure; further drags replace the success edge. Plain ports add flow edges.
export const connectHandles = (
  doc: ProjectDocument,
  dialogueId: string,
  connection: {source: string; target: string; sourceHandle?: string},
): ProjectDocument => {
  const dialogue = doc.dialogues.find(d => d.id === dialogueId);

  if (dialogue === undefined) return doc;

  const option = findOption(dialogue, connection.source, connection.sourceHandle);

  if (option?.skillCheck !== undefined) {
    const outcomes = dialogue.edges.filter(
      edge => edge.source === connection.source && edge.sourceOption === option.id,
    );
    const hasSuccess = outcomes.some(edge => edge.role === 'success');
    const hasFailure = outcomes.some(edge => edge.role === 'failure');
    const role = !hasSuccess || hasFailure ? 'success' : 'failure';

    return addPortEdge(doc, dialogueId, {
      source: connection.source,
      target: connection.target,
      sourceOption: option.id,
      role,
    });
  }

  return addEdge(doc, dialogueId, connection);
};

// Horizontal gap between a source node and a quick-added follower.
const QUICK_ADD_OFFSET_X = 340;
const QUICK_ADD_OFFSET_Y = 56;

export const addConnectedNode = (
  doc: ProjectDocument,
  dialogueId: string,
  kind: NodeKind,
  source: {nodeId: string; handleId?: string},
  position?: Position,
  groupId?: string,
): ProjectDocument => {
  const dialogue = doc.dialogues.find(d => d.id === dialogueId);
  const sourceNode = dialogue?.nodes.find(n => n.id === source.nodeId);

  if (dialogue === undefined || sourceNode === undefined) return doc;

  const origin = dialogue.editor.nodePositions[source.nodeId] ?? {x: 0, y: 0};
  const sourceOptions = sourceNode.kind === 'choice' ? sourceNode.options : [];
  const optionIndex =
    source.handleId === undefined ? -1 : sourceOptions.findIndex(option => option.id === source.handleId);
  const target = position ?? {
    x: origin.x + QUICK_ADD_OFFSET_X,
    y: origin.y + (optionIndex > 0 ? optionIndex * QUICK_ADD_OFFSET_Y : 0),
  };

  const node = buildNode(dialogueId, kind);
  const withNode = insertNode(doc, dialogueId, node, target, groupId);

  return connectHandles(withNode, dialogueId, {
    source: source.nodeId,
    target: node.id,
    ...(source.handleId === undefined ? {} : {sourceHandle: source.handleId}),
  });
};

//
// * Dialogue commands
//

export const addDialogue = (doc: ProjectDocument, name: string): ProjectDocument => ({
  ...doc,
  dialogues: [...doc.dialogues, createStarterDialogue(name)],
});

export const renameDialogue = (doc: ProjectDocument, dialogueId: string, name: string): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({...dialogue, name}));

export const deleteDialogue = (doc: ProjectDocument, dialogueId: string): ProjectDocument => ({
  ...doc,
  dialogues: doc.dialogues.filter(dialogue => dialogue.id !== dialogueId),
});

//
// * Group commands
//

export const groupNodes = (
  doc: ProjectDocument,
  dialogueId: string,
  nodeIds: string[],
  name: string,
): ProjectDocument => {
  const dialogue = doc.dialogues.find(d => d.id === dialogueId);
  const members = nodeIds.filter(id => dialogue?.nodes.some(node => node.id === id));

  if (dialogue === undefined || members.length < 2) return doc;

  const groupId = nanoid(8);
  const positions = members.map(id => dialogue.editor.nodePositions[id] ?? {x: 0, y: 0});
  const centroid = {
    x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
    y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
  };

  return mapDialogue(doc, dialogueId, current => ({
    ...current,
    editor: {
      ...current.editor,
      nodePositions: {...current.editor.nodePositions, [groupId]: centroid},
      groups: [...(current.editor.groups ?? []), {id: groupId, name, nodeIds: members, collapsed: true}],
    },
  }));
};

export const ungroupNodes = (doc: ProjectDocument, dialogueId: string, groupId: string): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    editor: {
      ...dialogue.editor,
      nodePositions: omitKeys(dialogue.editor.nodePositions, [groupId]),
      groups: (dialogue.editor.groups ?? []).filter(group => group.id !== groupId),
    },
  }));

export const renameGroup = (doc: ProjectDocument, dialogueId: string, groupId: string, name: string): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({
    ...dialogue,
    editor: {
      ...dialogue.editor,
      groups: (dialogue.editor.groups ?? []).map(group => (group.id === groupId ? {...group, name} : group)),
    },
  }));

export const setEntryNode = (doc: ProjectDocument, dialogueId: string, nodeId: string): ProjectDocument =>
  mapDialogue(doc, dialogueId, dialogue => ({...dialogue, entryNodeId: nodeId}));

export const renameProject = (doc: ProjectDocument, name: string): ProjectDocument => ({
  ...doc,
  meta: {...doc.meta, name},
});

//
// * Character and variable commands
//

export const upsertCharacter = (doc: ProjectDocument, character: Character): ProjectDocument => ({
  ...doc,
  characters: doc.characters.some(existing => existing.id === character.id)
    ? doc.characters.map(existing => (existing.id === character.id ? character : existing))
    : [...doc.characters, character],
});

export const deleteCharacter = (doc: ProjectDocument, characterId: string): ProjectDocument => ({
  ...doc,
  characters: doc.characters.filter(character => character.id !== characterId),
});

export const upsertVariable = (doc: ProjectDocument, variable: Variable): ProjectDocument => ({
  ...doc,
  variables: doc.variables.some(existing => existing.id === variable.id)
    ? doc.variables.map(existing => (existing.id === variable.id ? variable : existing))
    : [...doc.variables, variable],
});

export const deleteVariable = (doc: ProjectDocument, variableId: string): ProjectDocument => ({
  ...doc,
  variables: doc.variables.filter(variable => variable.id !== variableId),
});

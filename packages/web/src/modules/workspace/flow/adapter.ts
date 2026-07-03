import type {Character, CharacterType, DialogEdge, DialogNode, Dialogue, NodeGroup} from '@lorequary/core';
import type {Edge, Node} from '@xyflow/react';

export type DialogNodeData = {
  node: DialogNode;
  speakerName: string | undefined;
  speakerColor: string | undefined;
  speakerType: CharacterType | undefined;
  entry: boolean;
  // Source-handle connectivity, used for quick-add affordances.
  outgoingConnected: boolean;
  connectedOptionIds: string[];
  [key: string]: unknown;
};

export type DialogFlowNode = Node<DialogNodeData>;

export type GroupNodeData = {
  group: NodeGroup;
  memberCount: number;
  [key: string]: unknown;
};

export type GroupFlowNode = Node<GroupNodeData>;

export type FlowNode = DialogFlowNode | GroupFlowNode;

// Maps member node id → owning collapsed group id.
const collapsedMembership = (dialogue: Dialogue): Map<string, string> => {
  const membership = new Map<string, string>();

  for (const group of dialogue.editor.groups ?? []) {
    if (!group.collapsed) continue;

    for (const nodeId of group.nodeIds) membership.set(nodeId, group.id);
  }

  return membership;
};

// An option counts as connected when its ports are fully wired: a flow edge for
// plain options, both outcome edges for check-bearing ones.
const connectedOptionIds = (node: DialogNode, outgoing: DialogEdge[]): string[] => {
  if (node.kind !== 'choice') return [];

  return node.options
    .filter(option => {
      const edges = outgoing.filter(edge => edge.sourceOption === option.id);

      if (option.skillCheck === undefined) return edges.some(edge => edge.role === 'flow');

      return edges.some(edge => edge.role === 'success') && edges.some(edge => edge.role === 'failure');
    })
    .map(option => option.id);
};

const toDialogNode = (
  dialogue: Dialogue,
  node: DialogNode,
  charactersById: Map<string, Character>,
  selectedIds: Set<string>,
): DialogFlowNode => {
  const characterId = node.kind === 'line' || node.kind === 'choice' ? node.characterId : undefined;
  const speaker = characterId === undefined ? undefined : charactersById.get(characterId);
  const outgoing = dialogue.edges.filter(edge => edge.source === node.id);

  return {
    id: node.id,
    type: node.kind,
    position: dialogue.editor.nodePositions[node.id] ?? {x: 0, y: 0},
    selected: selectedIds.has(node.id),
    data: {
      node,
      speakerName: speaker?.displayName,
      speakerColor: speaker?.color,
      speakerType: speaker?.type,
      entry: dialogue.entryNodeId === node.id,
      outgoingConnected: outgoing.some(edge => edge.sourceOption === undefined),
      connectedOptionIds: connectedOptionIds(node, outgoing),
    },
  };
};

export const toFlowNodes = (
  dialogue: Dialogue,
  characters: Character[],
  selectedIds: Set<string>,
  activeGroupId: string | null = null,
): FlowNode[] => {
  const charactersById = new Map(characters.map(character => [character.id, character]));

  if (activeGroupId !== null) {
    const group = dialogue.editor.groups?.find(g => g.id === activeGroupId);
    const members = new Set(group?.nodeIds ?? []);

    return dialogue.nodes
      .filter(node => members.has(node.id))
      .map(node => toDialogNode(dialogue, node, charactersById, selectedIds));
  }

  const membership = collapsedMembership(dialogue);
  const visible: FlowNode[] = dialogue.nodes
    .filter(node => !membership.has(node.id))
    .map(node => toDialogNode(dialogue, node, charactersById, selectedIds));

  for (const group of dialogue.editor.groups ?? []) {
    if (!group.collapsed) continue;

    visible.push({
      id: group.id,
      type: 'group',
      position: dialogue.editor.nodePositions[group.id] ?? {x: 0, y: 0},
      selected: selectedIds.has(group.id),
      data: {group, memberCount: group.nodeIds.length},
    });
  }

  return visible;
};

// Role-driven presentation: flow edges from options reuse the option styling,
// outcome edges keep the check success/failure styles and pass/fail labels.
const edgePresentation = (edge: DialogEdge): {className?: string; label?: string} => {
  if (edge.role === 'success') return {className: 'edge-check-success', label: edge.label ?? 'pass'};
  if (edge.role === 'failure') return {className: 'edge-check-failure', label: edge.label ?? 'fail'};

  return {
    ...(edge.sourceOption === undefined ? {} : {className: 'edge-option'}),
    ...(edge.label === undefined ? {} : {label: edge.label}),
  };
};

type EdgeRoute = {
  source: string;
  target: string;
  keepHandle: boolean;
};

const toFlowEdge = (edge: DialogEdge, selectedIds: Set<string>, route?: EdgeRoute): Edge => {
  const {className, label} = edgePresentation(edge);
  const keepHandle = route?.keepHandle ?? true;

  return {
    id: edge.id,
    source: route?.source ?? edge.source,
    target: route?.target ?? edge.target,
    ...(keepHandle && edge.sourceOption !== undefined ? {sourceHandle: edge.sourceOption} : {}),
    ...(label === undefined ? {} : {label}),
    ...(className === undefined ? {} : {className}),
    selected: selectedIds.has(edge.id),
  };
};

export const toFlowEdges = (
  dialogue: Dialogue,
  selectedIds: Set<string>,
  activeGroupId: string | null = null,
): Edge[] => {
  if (activeGroupId !== null) {
    const group = dialogue.editor.groups?.find(g => g.id === activeGroupId);
    const members = new Set(group?.nodeIds ?? []);

    return dialogue.edges
      .filter(edge => members.has(edge.source) && members.has(edge.target))
      .map(edge => toFlowEdge(edge, selectedIds));
  }

  const membership = collapsedMembership(dialogue);
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const edge of dialogue.edges) {
    const source = membership.get(edge.source) ?? edge.source;
    const target = membership.get(edge.target) ?? edge.target;
    const remapped = source !== edge.source || target !== edge.target;

    if (source === target && membership.has(edge.source)) continue;
    if (source === target) continue;

    // Boundary edges of a collapsed group dedupe into one; regular parallel
    // edges (e.g. success/failure to the same node) all render.
    if (remapped) {
      const key = `${source}|${target}`;

      if (seen.has(key)) continue;

      seen.add(key);
    }

    // A handle only exists while its owning choice node is visible.
    edges.push(toFlowEdge(edge, selectedIds, {source, target, keepHandle: source === edge.source}));
  }

  return edges;
};

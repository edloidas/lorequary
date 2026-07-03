import type {Character, CharacterType, DialogEdge, DialogNode, Dialogue, EdgeRole, NodeGroup} from '@lorequary/core';
import type {Edge, Node} from '@xyflow/react';

export type DialogNodeData = {
  node: DialogNode;
  speakerName: string | undefined;
  speakerColor: string | undefined;
  speakerType: CharacterType | undefined;
  entry: boolean;
  // Source handle ids with at least one edge, used for quick-add affordances.
  connectedHandles: string[];
  [key: string]: unknown;
};

//
// * Handle mapping
//

// Deterministic ReactFlow handle ids per port: lines and hubs use `out`,
// options use their id; check outcomes append `:success` / `:failure`.
// All inputs share the single `in` handle.
export const IN_HANDLE = 'in';
export const OUT_HANDLE = 'out';

export type PortRef = {
  sourceOption?: string;
  role: EdgeRole;
};

export const portToHandle = (port: PortRef): string => {
  const base = port.sourceOption ?? OUT_HANDLE;

  return port.role === 'flow' ? base : `${base}:${port.role}`;
};

export const handleToPort = (handleId: string | undefined): PortRef => {
  if (handleId === undefined) return {role: 'flow'};

  const separator = handleId.lastIndexOf(':');
  const base = separator === -1 ? handleId : handleId.slice(0, separator);
  const suffix = separator === -1 ? '' : handleId.slice(separator + 1);
  const role: EdgeRole = suffix === 'success' || suffix === 'failure' ? suffix : 'flow';

  return {role, ...(base === OUT_HANDLE ? {} : {sourceOption: base})};
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
      connectedHandles: [...new Set(outgoing.map(edge => portToHandle(edge)))],
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
};

// Handle ids only apply while the owning node is visible — endpoints remapped
// to a collapsed group fall back to the group's default handles.
const toFlowEdge = (edge: DialogEdge, selectedIds: Set<string>, route?: EdgeRoute): Edge => {
  const {className, label} = edgePresentation(edge);
  const sourceKept = route === undefined || route.source === edge.source;
  const targetKept = route === undefined || route.target === edge.target;

  return {
    id: edge.id,
    source: route?.source ?? edge.source,
    target: route?.target ?? edge.target,
    ...(sourceKept ? {sourceHandle: portToHandle(edge)} : {}),
    ...(targetKept ? {targetHandle: IN_HANDLE} : {}),
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

    edges.push(toFlowEdge(edge, selectedIds, {source, target}));
  }

  return edges;
};

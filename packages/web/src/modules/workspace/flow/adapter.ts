import type {Character, DialogNode, Dialogue, NodeGroup} from '@lorequary/core';
import type {Edge, Node} from '@xyflow/react';

export type DialogNodeData = {
  node: DialogNode;
  speakerName: string | undefined;
  speakerColor: string | undefined;
  entry: boolean;
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

const toDialogNode = (
  dialogue: Dialogue,
  node: DialogNode,
  charactersById: Map<string, Character>,
  selectedIds: Set<string>,
): DialogFlowNode => {
  const speaker = node.characterId === undefined ? undefined : charactersById.get(node.characterId);

  return {
    id: node.id,
    type: node.kind,
    position: dialogue.editor.nodePositions[node.id] ?? {x: 0, y: 0},
    selected: selectedIds.has(node.id),
    data: {
      node,
      speakerName: speaker?.displayName,
      speakerColor: speaker?.color,
      entry: dialogue.entryNodeId === node.id,
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
      .map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.sourceHandle === undefined ? {} : {sourceHandle: edge.sourceHandle}),
        ...(edge.label === undefined ? {} : {label: edge.label}),
        selected: selectedIds.has(edge.id),
      }));
  }

  const membership = collapsedMembership(dialogue);
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const edge of dialogue.edges) {
    const source = membership.get(edge.source) ?? edge.source;
    const target = membership.get(edge.target) ?? edge.target;

    if (source === target && membership.has(edge.source)) continue;
    if (source === target) continue;

    const key = `${source}|${target}`;

    if (seen.has(key)) continue;

    seen.add(key);

    // A handle only exists while its owning choice node is visible.
    const keepHandle = edge.sourceHandle !== undefined && source === edge.source;

    edges.push({
      id: edge.id,
      source,
      target,
      ...(keepHandle && edge.sourceHandle !== undefined ? {sourceHandle: edge.sourceHandle} : {}),
      ...(edge.label === undefined ? {} : {label: edge.label}),
      selected: selectedIds.has(edge.id),
    });
  }

  return edges;
};

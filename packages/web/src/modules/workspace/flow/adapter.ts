import type {Character, CharacterType, DialogNode, Dialogue, NodeGroup} from '@lorequary/core';
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

// Derived skill-check outcome edges are display-only; their ids encode the owning option.
export const CHECK_EDGE_PREFIX = 'check:';

export type CheckEdgeRef = {
  nodeId: string;
  optionId: string;
  outcome: 'success' | 'failure';
};

export const parseCheckEdgeId = (edgeId: string): CheckEdgeRef | null => {
  if (!edgeId.startsWith(CHECK_EDGE_PREFIX)) return null;

  const [nodeId, optionId, outcome] = edgeId.slice(CHECK_EDGE_PREFIX.length).split('|');

  if (nodeId === undefined || optionId === undefined || (outcome !== 'success' && outcome !== 'failure')) return null;

  return {nodeId, optionId, outcome};
};

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
      outgoingConnected: outgoing.some(edge => edge.sourceHandle === undefined),
      connectedOptionIds: outgoing.map(edge => edge.sourceHandle).filter(handle => handle !== undefined),
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

const edgeClassName = (dialogue: Dialogue, sourceId: string, sourceHandle: string | undefined): string | undefined => {
  if (sourceHandle === undefined) return undefined;

  const source = dialogue.nodes.find(node => node.id === sourceId);

  return source?.options?.some(option => option.id === sourceHandle) === true ? 'edge-option' : undefined;
};

// Skill-check outcome links live on options, not in dialogue.edges — surface them
// as display-only edges so branching is visible on the canvas.
const toCheckEdges = (dialogue: Dialogue, visibleIds: (id: string) => boolean): Edge[] => {
  const nodeIds = new Set(dialogue.nodes.map(node => node.id));
  const edges: Edge[] = [];

  for (const node of dialogue.nodes) {
    if (!visibleIds(node.id)) continue;

    for (const option of node.options ?? []) {
      const check = option.skillCheck;

      if (check === undefined) continue;

      const outcomes = [
        {outcome: 'success' as const, target: check.successTargetId, className: 'edge-check-success', label: 'pass'},
        {outcome: 'failure' as const, target: check.failureTargetId, className: 'edge-check-failure', label: 'fail'},
      ];

      for (const {outcome, target, className, label} of outcomes) {
        if (target === '' || !nodeIds.has(target) || !visibleIds(target)) continue;

        edges.push({
          id: `${CHECK_EDGE_PREFIX}${node.id}|${option.id}|${outcome}`,
          source: node.id,
          target,
          sourceHandle: option.id,
          label,
          className,
          selectable: false,
          reconnectable: false,
        });
      }
    }
  }

  return edges;
};

export const toFlowEdges = (
  dialogue: Dialogue,
  selectedIds: Set<string>,
  activeGroupId: string | null = null,
): Edge[] => {
  if (activeGroupId !== null) {
    const group = dialogue.editor.groups?.find(g => g.id === activeGroupId);
    const members = new Set(group?.nodeIds ?? []);

    return [
      ...dialogue.edges
        .filter(edge => members.has(edge.source) && members.has(edge.target))
        .map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          ...(edge.sourceHandle === undefined ? {} : {sourceHandle: edge.sourceHandle}),
          ...(edge.label === undefined ? {} : {label: edge.label}),
          ...(edgeClassName(dialogue, edge.source, edge.sourceHandle) === undefined
            ? {}
            : {className: edgeClassName(dialogue, edge.source, edge.sourceHandle)}),
          selected: selectedIds.has(edge.id),
        })),
      ...toCheckEdges(dialogue, id => members.has(id)),
    ];
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
    const className = keepHandle ? edgeClassName(dialogue, edge.source, edge.sourceHandle) : undefined;

    edges.push({
      id: edge.id,
      source,
      target,
      ...(keepHandle && edge.sourceHandle !== undefined ? {sourceHandle: edge.sourceHandle} : {}),
      ...(edge.label === undefined ? {} : {label: edge.label}),
      ...(className === undefined ? {} : {className}),
      selected: selectedIds.has(edge.id),
    });
  }

  return [...edges, ...toCheckEdges(dialogue, id => !membership.has(id))];
};

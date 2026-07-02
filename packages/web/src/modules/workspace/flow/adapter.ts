import type {Character, DialogNode, Dialogue} from '@lorequary/core';
import type {Edge, Node} from '@xyflow/react';

export type DialogNodeData = {
  node: DialogNode;
  speakerName: string | undefined;
  speakerColor: string | undefined;
  entry: boolean;
  [key: string]: unknown;
};

export type DialogFlowNode = Node<DialogNodeData>;

export const toFlowNodes = (
  dialogue: Dialogue,
  characters: Character[],
  selectedIds: Set<string>,
): DialogFlowNode[] => {
  const charactersById = new Map(characters.map(character => [character.id, character]));

  return dialogue.nodes.map(node => {
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
  });
};

export const toFlowEdges = (dialogue: Dialogue, selectedIds: Set<string>): Edge[] =>
  dialogue.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle === undefined ? {} : {sourceHandle: edge.sourceHandle}),
    ...(edge.label === undefined ? {} : {label: edge.label}),
    selected: selectedIds.has(edge.id),
  }));

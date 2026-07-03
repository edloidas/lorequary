import {describe, expect, it} from 'vite-plus/test';

import {toFlowEdges, toFlowNodes} from '@/modules/workspace/flow/adapter';

import type {Dialogue, ProjectDocument} from '@lorequary/core';

import {addNode, groupNodes, renameGroup, ungroupNodes} from './commands';

const baseDialogue = (): Dialogue => ({
  id: 'dlg',
  name: 'Test',
  entryNodeId: 'a',
  nodes: [
    {id: 'a', kind: 'line', text: 'A'},
    {id: 'b', kind: 'line', text: 'B'},
    {id: 'c', kind: 'line', text: 'C'},
  ],
  edges: [
    {id: 'e_ab', source: 'a', role: 'flow', target: 'b'},
    {id: 'e_bc', source: 'b', role: 'flow', target: 'c'},
  ],
  editor: {nodePositions: {a: {x: 0, y: 0}, b: {x: 100, y: 100}, c: {x: 200, y: 300}}},
});

const baseDoc = (): ProjectDocument => ({
  schemaVersion: 1,
  meta: {id: 'p', name: 'P', createdAt: '', updatedAt: ''},
  settings: {},
  characters: [],
  variables: [],
  dialogues: [baseDialogue()],
});

describe('group commands', () => {
  it('groupNodes creates a collapsed group with a centroid position', () => {
    const doc = groupNodes(baseDoc(), 'dlg', ['b', 'c'], 'Act 1');
    const dialogue = doc.dialogues[0];
    const group = dialogue?.editor.groups?.[0];

    expect(group).toMatchObject({name: 'Act 1', nodeIds: ['b', 'c'], collapsed: true});
    expect(dialogue?.editor.nodePositions[group?.id ?? '']).toStrictEqual({x: 150, y: 200});
  });

  it('groupNodes ignores selections of fewer than two nodes', () => {
    const doc = groupNodes(baseDoc(), 'dlg', ['b'], 'Solo');

    expect(doc.dialogues[0]?.editor.groups).toBeUndefined();
  });

  it('ungroupNodes dissolves the group and cleans up its position and edges', () => {
    let doc = groupNodes(baseDoc(), 'dlg', ['b', 'c'], 'Act 1');
    const groupId = doc.dialogues[0]?.editor.groups?.[0]?.id ?? '';

    doc = ungroupNodes(doc, 'dlg', groupId);

    const dialogue = doc.dialogues[0];

    expect(dialogue?.editor.groups).toStrictEqual([]);
    expect(dialogue?.editor.nodePositions[groupId]).toBeUndefined();
    expect(dialogue?.nodes).toHaveLength(3);
  });

  it('renameGroup renames in place', () => {
    let doc = groupNodes(baseDoc(), 'dlg', ['b', 'c'], 'Act 1');
    const groupId = doc.dialogues[0]?.editor.groups?.[0]?.id ?? '';

    doc = renameGroup(doc, 'dlg', groupId, 'Act One');

    expect(doc.dialogues[0]?.editor.groups?.[0]?.name).toBe('Act One');
  });

  it('addNode with a groupId adds the new node to that group', () => {
    let doc = groupNodes(baseDoc(), 'dlg', ['b', 'c'], 'Act 1');
    const groupId = doc.dialogues[0]?.editor.groups?.[0]?.id ?? '';

    doc = addNode(doc, 'dlg', 'line', {x: 0, y: 0}, groupId);

    const dialogue = doc.dialogues[0];
    const newNode = dialogue?.nodes[dialogue.nodes.length - 1];

    expect(dialogue?.editor.groups?.[0]?.nodeIds).toContain(newNode?.id);
  });
});

describe('adapter with groups', () => {
  const groupedDialogue = (): {dialogue: Dialogue; groupId: string} => {
    const doc = groupNodes(baseDoc(), 'dlg', ['b', 'c'], 'Act 1');
    const dialogue = doc.dialogues[0];

    if (dialogue === undefined) throw new Error('no dialogue');

    return {dialogue, groupId: dialogue.editor.groups?.[0]?.id ?? ''};
  };

  it('replaces collapsed group members with a single group stub at root', () => {
    const {dialogue, groupId} = groupedDialogue();
    const nodes = toFlowNodes(dialogue, [], new Set(), null);

    expect(nodes.map(n => n.id)).toStrictEqual(['a', groupId]);
    expect(nodes[1]).toMatchObject({type: 'group', position: {x: 150, y: 200}});
    expect(nodes[1]?.data).toMatchObject({memberCount: 2});
  });

  it('retargets boundary edges to the group stub and drops internal ones at root', () => {
    const {dialogue, groupId} = groupedDialogue();
    const edges = toFlowEdges(dialogue, new Set(), null);

    // a→b becomes a→group; b→c is internal and disappears.
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({source: 'a', target: groupId});
  });

  it('dedupes multiple boundary edges into one', () => {
    const {dialogue, groupId} = groupedDialogue();
    const withExtra: Dialogue = {
      ...dialogue,
      edges: [...dialogue.edges, {id: 'e_ac', source: 'a', role: 'flow', target: 'c'}],
    };
    const edges = toFlowEdges(withExtra, new Set(), null);

    expect(edges.filter(e => e.source === 'a' && e.target === groupId)).toHaveLength(1);
  });

  it('shows only members and internal edges when submerged', () => {
    const {dialogue, groupId} = groupedDialogue();
    const nodes = toFlowNodes(dialogue, [], new Set(), groupId);
    const edges = toFlowEdges(dialogue, new Set(), groupId);

    expect(nodes.map(n => n.id)).toStrictEqual(['b', 'c']);
    expect(edges.map(e => e.id)).toStrictEqual(['e_bc']);
  });

  it('renders everything normally when the group is expanded', () => {
    const {dialogue, groupId} = groupedDialogue();
    const expanded: Dialogue = {
      ...dialogue,
      editor: {
        ...dialogue.editor,
        groups: dialogue.editor.groups?.map(g => (g.id === groupId ? {...g, collapsed: false} : g)),
      },
    };
    const nodes = toFlowNodes(expanded, [], new Set(), null);

    expect(nodes.map(n => n.id)).toStrictEqual(['a', 'b', 'c']);
  });
});

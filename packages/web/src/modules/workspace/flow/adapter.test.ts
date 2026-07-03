import {describe, expect, it} from 'vite-plus/test';

import type {Character, Dialogue} from '@lorequary/core';

import {toFlowEdges, toFlowNodes} from './adapter';

const CHARACTERS: Character[] = [
  {id: 'c1', name: 'aurelia', displayName: 'Aurelia', type: 'character', color: '#c04040'},
];

const DIALOGUE: Dialogue = {
  id: 'dlg',
  name: 'Test',
  entryNodeId: 'n1',
  nodes: [
    {id: 'n1', kind: 'line', text: 'Hello there, wanderer.', characterId: 'c1'},
    {
      id: 'n2',
      kind: 'choice',
      text: 'Decide.',
      options: [{id: 'o1', text: 'Leave', visibility: 'available'}],
    },
  ],
  edges: [{id: 'e1', source: 'n1', role: 'flow', target: 'n2'}],
  editor: {nodePositions: {n1: {x: 10, y: 20}}},
};

describe('toFlowNodes', () => {
  it('maps nodes with positions, kind types, and character data', () => {
    const nodes = toFlowNodes(DIALOGUE, CHARACTERS, new Set(['n1']));

    expect(nodes[0]).toMatchObject({
      id: 'n1',
      type: 'line',
      position: {x: 10, y: 20},
      selected: true,
      data: {
        node: DIALOGUE.nodes[0],
        speakerName: 'Aurelia',
        speakerColor: '#c04040',
        entry: true,
      },
    });
  });

  it('falls back to origin position and marks unselected nodes', () => {
    const nodes = toFlowNodes(DIALOGUE, CHARACTERS, new Set());

    expect(nodes[1]).toMatchObject({id: 'n2', type: 'choice', position: {x: 0, y: 0}, selected: false});
    expect(nodes[1]?.data).toMatchObject({speakerName: undefined, entry: false});
  });
});

describe('toFlowEdges', () => {
  it('maps edges with selection state', () => {
    const edges = toFlowEdges(DIALOGUE, new Set(['e1']));

    expect(edges[0]).toMatchObject({id: 'e1', source: 'n1', target: 'n2', selected: true});
  });

  it('styles outcome edges by role with pass/fail labels', () => {
    const dialogue: Dialogue = {
      ...DIALOGUE,
      edges: [
        {id: 'e_ok', source: 'n2', sourceOption: 'o1', role: 'success', target: 'n1'},
        {id: 'e_fail', source: 'n2', sourceOption: 'o1', role: 'failure', target: 'n1', label: 'busted'},
        {id: 'e_opt', source: 'n2', sourceOption: 'o1', role: 'flow', target: 'n1'},
      ],
    };

    const edges = toFlowEdges(dialogue, new Set());

    expect(edges.find(edge => edge.id === 'e_ok')).toMatchObject({
      sourceHandle: 'o1',
      className: 'edge-check-success',
      label: 'pass',
    });
    expect(edges.find(edge => edge.id === 'e_fail')).toMatchObject({
      className: 'edge-check-failure',
      label: 'busted',
    });
    expect(edges.find(edge => edge.id === 'e_opt')).toMatchObject({className: 'edge-option'});
  });
});

describe('source connectivity', () => {
  it('should expose source connectivity for quick-add affordances', () => {
    const nodes = toFlowNodes(DIALOGUE, CHARACTERS, new Set());

    expect(nodes[0]?.data).toMatchObject({outgoingConnected: true});
    expect(nodes[1]?.data).toMatchObject({outgoingConnected: false, connectedOptionIds: []});
  });

  it('marks a checked option connected only when both outcome edges exist', () => {
    const dialogue: Dialogue = {
      ...DIALOGUE,
      nodes: [
        DIALOGUE.nodes[0] as Dialogue['nodes'][number],
        {
          id: 'n2',
          kind: 'choice',
          text: 'Decide.',
          options: [
            {
              id: 'o1',
              text: 'Try',
              visibility: 'available',
              skillCheck: {skillId: 'v1', baseDifficulty: 10, checkType: 'white'},
            },
          ],
        },
      ],
      edges: [{id: 'e_ok', source: 'n2', sourceOption: 'o1', role: 'success', target: 'n1'}],
    };

    expect(toFlowNodes(dialogue, CHARACTERS, new Set())[1]?.data).toMatchObject({connectedOptionIds: []});

    const wired: Dialogue = {
      ...dialogue,
      edges: [...dialogue.edges, {id: 'e_fail', source: 'n2', sourceOption: 'o1', role: 'failure', target: 'n1'}],
    };

    expect(toFlowNodes(wired, CHARACTERS, new Set())[1]?.data).toMatchObject({connectedOptionIds: ['o1']});
  });
});

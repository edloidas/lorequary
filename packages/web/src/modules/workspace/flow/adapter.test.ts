import {describe, expect, it} from 'vite-plus/test';

import type {Character, Dialogue} from '@lorequary/core';

import {handleToPort, portToHandle, toFlowEdges, toFlowNodes} from './adapter';

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

describe('handle mapping', () => {
  it('maps ports to deterministic handle ids and back', () => {
    expect(portToHandle({role: 'flow'})).toBe('out');
    expect(portToHandle({role: 'success'})).toBe('out:success');
    expect(portToHandle({sourceOption: 'o1', role: 'flow'})).toBe('o1');
    expect(portToHandle({sourceOption: 'o1', role: 'failure'})).toBe('o1:failure');

    expect(handleToPort('out')).toStrictEqual({role: 'flow'});
    expect(handleToPort('out:failure')).toStrictEqual({role: 'failure'});
    expect(handleToPort('o1')).toStrictEqual({role: 'flow', sourceOption: 'o1'});
    expect(handleToPort('o1:success')).toStrictEqual({role: 'success', sourceOption: 'o1'});
    expect(handleToPort(undefined)).toStrictEqual({role: 'flow'});
  });
});

describe('toFlowEdges', () => {
  it('maps edges with handle ids and selection state', () => {
    const edges = toFlowEdges(DIALOGUE, new Set(['e1']));

    expect(edges[0]).toMatchObject({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      sourceHandle: 'out',
      targetHandle: 'in',
      selected: true,
    });
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
      sourceHandle: 'o1:success',
      className: 'edge-check-success',
      label: 'pass',
    });
    expect(edges.find(edge => edge.id === 'e_fail')).toMatchObject({
      sourceHandle: 'o1:failure',
      className: 'edge-check-failure',
      label: 'busted',
    });
    expect(edges.find(edge => edge.id === 'e_opt')).toMatchObject({sourceHandle: 'o1', className: 'edge-option'});
  });
});

describe('source connectivity', () => {
  it('should expose connected source handles for quick-add affordances', () => {
    const nodes = toFlowNodes(DIALOGUE, CHARACTERS, new Set());

    expect(nodes[0]?.data).toMatchObject({connectedHandles: ['out']});
    expect(nodes[1]?.data).toMatchObject({connectedHandles: []});
  });

  it('lists outcome handles independently for checked options', () => {
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

    expect(toFlowNodes(dialogue, CHARACTERS, new Set())[1]?.data).toMatchObject({connectedHandles: ['o1:success']});
  });
});

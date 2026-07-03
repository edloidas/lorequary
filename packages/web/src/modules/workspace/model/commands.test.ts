import {describe, expect, it, beforeEach} from 'vite-plus/test';

import {$project, createDefaultProject} from '@/modules/project/model/store';

import type {DialogNode, ProjectDocument} from '@lorequary/core';

import {
  $canRedo,
  $canUndo,
  addConnectedNode,
  addDialogue,
  addNode,
  coalesced,
  connectHandles,
  deleteDialogue,
  deleteEdges,
  deleteNodes,
  deleteVariable,
  duplicateNodes,
  endCoalescing,
  moveNodes,
  reconnectEdge,
  redo,
  renameDialogue,
  resetHistory,
  runCommand,
  updateEdge,
  undo,
  updateNode,
  upsertCharacter,
  upsertVariable,
} from './commands';

const dialogueId = (doc: ProjectDocument): string => {
  const dialogue = doc.dialogues[0];

  if (dialogue === undefined) throw new Error('fixture has no dialogue');

  return dialogue.id;
};

const contentText = (node: DialogNode | undefined): string | undefined =>
  node?.kind === 'line' || node?.kind === 'choice' ? node.text : undefined;

const setup = (): {doc: ProjectDocument; dlg: string} => {
  const doc = createDefaultProject('Test');

  $project.set(doc);
  resetHistory();

  return {doc, dlg: dialogueId(doc)};
};

describe('node commands', () => {
  beforeEach(() => {
    setup();
  });

  it('addNode creates a node with a line key and a canvas position', () => {
    const {doc, dlg} = {doc: $project.get() as ProjectDocument, dlg: dialogueId($project.get() as ProjectDocument)};
    const before = doc.dialogues[0]?.nodes.length ?? 0;

    runCommand(d => addNode(d, dlg, 'line', {x: 40, y: 80}));

    const next = $project.get() as ProjectDocument;
    const nodes = next.dialogues[0]?.nodes ?? [];
    const added = nodes[nodes.length - 1];

    expect(nodes).toHaveLength(before + 1);
    expect(added).toMatchObject({kind: 'line', text: '', lineKey: `${dlg}.${added?.id ?? ''}.text`});
    expect(next.dialogues[0]?.editor.nodePositions[added?.id ?? '']).toStrictEqual({x: 40, y: 80});
  });

  it('addNode creates choice nodes with an empty options list', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    const nodes = ($project.get() as ProjectDocument).dialogues[0]?.nodes ?? [];

    expect(nodes[nodes.length - 1]).toMatchObject({kind: 'choice', options: []});
  });

  it('updateNode patches node fields', () => {
    const {doc, dlg} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => updateNode(d, dlg, nodeId, {text: 'Changed', conditions: ['hero.money > 0']}));

    const node = ($project.get() as ProjectDocument).dialogues[0]?.nodes[0];

    expect(node).toMatchObject({text: 'Changed', conditions: ['hero.money > 0']});
  });

  it('deleteNodes removes nodes, touching edges, positions, and group refs', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const nodes = doc.dialogues[0]?.nodes ?? [];
    const first = nodes[0]?.id ?? '';
    const second = nodes[1]?.id ?? '';

    runCommand(d => connectHandles(d, dlg, {source: first, target: second}));
    runCommand(d => {
      const dialogue = d.dialogues[0];

      if (dialogue === undefined) return d;

      return {
        ...d,
        dialogues: [
          {
            ...dialogue,
            editor: {...dialogue.editor, groups: [{id: 'g1', name: 'G', nodeIds: [first, second], collapsed: false}]},
          },
        ],
      };
    });

    runCommand(d => deleteNodes(d, dlg, [second]));

    doc = $project.get() as ProjectDocument;
    const dialogue = doc.dialogues[0];

    expect(dialogue?.nodes.map(n => n.id)).toStrictEqual([first]);
    expect(dialogue?.edges).toStrictEqual([]);
    expect(dialogue?.editor.nodePositions[second]).toBeUndefined();
    expect(dialogue?.editor.groups?.[0]?.nodeIds).toStrictEqual([first]);
  });

  it('moveNodes updates editor positions only', () => {
    const {doc, dlg} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => moveNodes(d, dlg, {[nodeId]: {x: 500, y: 600}}));

    const next = $project.get() as ProjectDocument;

    expect(next.dialogues[0]?.editor.nodePositions[nodeId]).toStrictEqual({x: 500, y: 600});
    expect(next.dialogues[0]?.nodes).toStrictEqual(doc.dialogues[0]?.nodes);
  });

  it('duplicateNodes clones nodes with fresh ids and offset positions', () => {
    const {doc, dlg} = setup();
    const sourceId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => duplicateNodes(d, dlg, [sourceId]));

    const next = $project.get() as ProjectDocument;
    const nodes = next.dialogues[0]?.nodes ?? [];
    const copy = nodes[nodes.length - 1];

    expect(nodes).toHaveLength(2);
    expect(copy?.id).not.toBe(sourceId);
    expect(contentText(copy)).toBe(contentText(nodes[0]));

    const original = next.dialogues[0]?.editor.nodePositions[sourceId];
    const copied = next.dialogues[0]?.editor.nodePositions[copy?.id ?? ''];

    expect(copied?.x).toBe((original?.x ?? 0) + 40);
  });
});

describe('edge commands', () => {
  it('connecting an option handle creates a flow edge; ports can hold several edges', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const nodes = doc.dialogues[0]?.nodes ?? [];
    const choiceId = nodes[nodes.length - 1]?.id ?? '';
    const lineId = nodes[0]?.id ?? '';

    runCommand(d =>
      updateNode(d, dlg, choiceId, {
        options: [{id: 'opt1', text: 'Go', visibility: 'available'}],
      }),
    );
    runCommand(d => connectHandles(d, dlg, {source: choiceId, target: lineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;
    const optionEdges = doc.dialogues[0]?.edges.filter(e => e.sourceOption === 'opt1') ?? [];

    expect(optionEdges).toHaveLength(1);
    expect(optionEdges[0]).toMatchObject({source: choiceId, target: lineId, role: 'flow'});

    // A second target adds a second prioritizable edge on the same port.
    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    doc = $project.get() as ProjectDocument;
    const newLineId = doc.dialogues[0]?.nodes[doc.dialogues[0].nodes.length - 1]?.id ?? '';

    runCommand(d => connectHandles(d, dlg, {source: choiceId, target: newLineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;

    expect(doc.dialogues[0]?.edges.filter(e => e.sourceOption === 'opt1')).toHaveLength(2);
  });

  it('skips exact duplicate connections', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));

    const doc = $project.get() as ProjectDocument;
    const first = doc.dialogues[0]?.nodes[0]?.id ?? '';
    const second = doc.dialogues[0]?.nodes[1]?.id ?? '';

    runCommand(d => connectHandles(d, dlg, {source: first, target: second, sourceHandle: 'out'}));
    runCommand(d => connectHandles(d, dlg, {source: first, target: second, sourceHandle: 'out'}));

    expect(($project.get() as ProjectDocument).dialogues[0]?.edges).toHaveLength(1);
  });

  it('deleteEdges removes edges by id', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const choiceId = doc.dialogues[0]?.nodes[1]?.id ?? '';
    const lineId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => updateNode(d, dlg, choiceId, {options: [{id: 'opt1', text: 'Go', visibility: 'available'}]}));
    runCommand(d => connectHandles(d, dlg, {source: choiceId, target: lineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;
    const optionEdge = doc.dialogues[0]?.edges.find(e => e.sourceOption === 'opt1');

    runCommand(d => deleteEdges(d, dlg, [optionEdge?.id ?? '']));

    doc = $project.get() as ProjectDocument;

    expect(doc.dialogues[0]?.edges.some(e => e.sourceOption === 'opt1')).toBe(false);
  });

  it('reconnectEdge moves an endpoint while preserving id and routing metadata', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const nodes = doc.dialogues[0]?.nodes ?? [];
    const first = nodes[0]?.id ?? '';
    const second = nodes[1]?.id ?? '';
    const third = nodes[2]?.id ?? '';

    runCommand(d => connectHandles(d, dlg, {source: first, target: second, sourceHandle: 'out'}));

    doc = $project.get() as ProjectDocument;
    const edgeId = doc.dialogues[0]?.edges[0]?.id ?? '';

    runCommand(d =>
      updateEdge(d, dlg, edgeId, {label: 'Onward', priority: 3, conditions: ['hero.money > 0'], effects: ['x = 1']}),
    );
    runCommand(d => reconnectEdge(d, dlg, edgeId, {source: first, target: third, sourceHandle: 'out'}));

    doc = $project.get() as ProjectDocument;
    const edges = doc.dialogues[0]?.edges ?? [];

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: edgeId,
      source: first,
      target: third,
      role: 'flow',
      label: 'Onward',
      priority: 3,
      conditions: ['hero.money > 0'],
      effects: ['x = 1'],
    });
  });

  it('reconnectEdge refuses a move that duplicates another port and target', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const nodes = doc.dialogues[0]?.nodes ?? [];
    const first = nodes[0]?.id ?? '';
    const second = nodes[1]?.id ?? '';
    const third = nodes[2]?.id ?? '';

    runCommand(d => connectHandles(d, dlg, {source: first, target: second, sourceHandle: 'out'}));
    runCommand(d => connectHandles(d, dlg, {source: first, target: third, sourceHandle: 'out'}));

    doc = $project.get() as ProjectDocument;
    const before = doc.dialogues[0]?.edges ?? [];
    const movable = before.find(e => e.target === third)?.id ?? '';

    // Moving the second edge onto the first's target would duplicate the (first, out, flow) → second port.
    runCommand(d => reconnectEdge(d, dlg, movable, {source: first, target: second, sourceHandle: 'out'}));

    doc = $project.get() as ProjectDocument;

    expect(doc.dialogues[0]?.edges).toStrictEqual(before);
  });
});

describe('project-level commands', () => {
  it('addDialogue, renameDialogue, and deleteDialogue manage the dialogue list', () => {
    setup();

    runCommand(d => addDialogue(d, 'Second'));

    let doc = $project.get() as ProjectDocument;

    expect(doc.dialogues).toHaveLength(2);
    expect(doc.dialogues[1]?.name).toBe('Second');
    // New dialogues start with an entry line node so the canvas is never empty.
    expect(doc.dialogues[1]?.nodes.length).toBeGreaterThan(0);
    expect(doc.dialogues[1]?.entryNodeId).toBe(doc.dialogues[1]?.nodes[0]?.id);

    const secondId = doc.dialogues[1]?.id ?? '';

    runCommand(d => renameDialogue(d, secondId, 'Renamed'));
    doc = $project.get() as ProjectDocument;
    expect(doc.dialogues[1]?.name).toBe('Renamed');

    runCommand(d => deleteDialogue(d, secondId));
    doc = $project.get() as ProjectDocument;
    expect(doc.dialogues).toHaveLength(1);
  });

  it('upsertCharacter inserts then updates by id', () => {
    setup();

    runCommand(d => upsertCharacter(d, {id: 'c1', name: 'a', displayName: 'A', type: 'character', color: '#fff'}));
    runCommand(d =>
      upsertCharacter(d, {id: 'c1', name: 'a', displayName: 'Aurelia', type: 'character', color: '#fff'}),
    );

    const doc = $project.get() as ProjectDocument;
    const added = doc.characters.filter(c => c.id === 'c1');

    expect(added).toHaveLength(1);
    expect(added[0]?.displayName).toBe('Aurelia');
  });

  it('upsertVariable and deleteVariable manage the registry', () => {
    setup();

    runCommand(d => upsertVariable(d, {id: 'v9', name: 'Karma', key: 'hero.karma', type: 'number', defaultValue: 0}));

    let doc = $project.get() as ProjectDocument;

    expect(doc.variables.some(v => v.id === 'v9')).toBe(true);

    runCommand(d => deleteVariable(d, 'v9'));
    doc = $project.get() as ProjectDocument;
    expect(doc.variables.some(v => v.id === 'v9')).toBe(false);
  });
});

describe('history', () => {
  it('undo and redo walk the command history', () => {
    const {doc, dlg} = setup();

    expect($canUndo.get()).toBe(false);

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));

    expect($canUndo.get()).toBe(true);

    undo();

    expect($project.get()).toStrictEqual(doc);
    expect($canRedo.get()).toBe(true);

    redo();

    expect(($project.get() as ProjectDocument).dialogues[0]?.nodes).toHaveLength(2);
  });

  it('a new command clears the redo stack', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    undo();
    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    expect($canRedo.get()).toBe(false);
  });

  it('a command returning the same document adds no history entry', () => {
    setup();

    runCommand(d => d);

    expect($canUndo.get()).toBe(false);
  });
});

describe('coalesced commands', () => {
  it('merges consecutive same-key commands into one undo entry', () => {
    const {doc, dlg} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'H'})));
    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'He'})));
    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'Hey'})));

    expect(contentText(($project.get() as ProjectDocument).dialogues[0]?.nodes[0])).toBe('Hey');

    undo();

    expect($project.get()).toStrictEqual(doc);
    expect($canUndo.get()).toBe(false);
  });

  it('breaks the chain when a different command runs in between', () => {
    const {doc, dlg} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'A'})));
    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'AB'})));

    undo();

    // Only the second typing burst is undone; the added node remains.
    const current = $project.get() as ProjectDocument;

    expect(contentText(current.dialogues[0]?.nodes[0])).toBe('A');
    expect(current.dialogues[0]?.nodes).toHaveLength(2);
  });

  it('endCoalescing seals the current burst', () => {
    const {dlg, doc} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'A'})));
    endCoalescing();
    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'AB'})));

    undo();

    expect(contentText(($project.get() as ProjectDocument).dialogues[0]?.nodes[0])).toBe('A');
  });

  it('undo resets coalescing so redo history stays consistent', () => {
    const {dlg, doc} = setup();
    const nodeId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'A'})));
    undo();
    coalesced('edit-text', () => runCommand(d => updateNode(d, dlg, nodeId, {text: 'B'})));

    expect(contentText(($project.get() as ProjectDocument).dialogues[0]?.nodes[0])).toBe('B');

    undo();

    expect(contentText(($project.get() as ProjectDocument).dialogues[0]?.nodes[0])).toBe(
      contentText(doc.dialogues[0]?.nodes[0]),
    );
  });
});

describe('quick-add and check-target commands', () => {
  beforeEach(() => {
    setup();
  });

  const withChoice = (): {dlg: string; choiceId: string; optionId: string; targetId: string} => {
    const doc = $project.get() as ProjectDocument;
    const dlg = dialogueId(doc);
    const targetId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    const withNodes = addNode(doc, dlg, 'choice', {x: 200, y: 0});
    const choiceId = withNodes.dialogues[0]?.nodes.at(-1)?.id ?? '';
    const optionId = 'opt_1';
    const patched = updateNode(withNodes, dlg, choiceId, {
      options: [
        {
          id: optionId,
          text: 'Try it',
          visibility: 'available',
          skillCheck: {skillId: 'v_skill', baseDifficulty: 10, checkType: 'white'},
        },
      ],
    });

    $project.set(patched);
    resetHistory();

    return {dlg, choiceId, optionId, targetId};
  };

  it('addConnectedNode should create a node linked from the source', () => {
    const {doc, dlg} = {doc: $project.get() as ProjectDocument, dlg: dialogueId($project.get() as ProjectDocument)};
    const sourceId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => addConnectedNode(d, dlg, 'line', {nodeId: sourceId}));

    const next = ($project.get() as ProjectDocument).dialogues[0];
    const added = next?.nodes.at(-1);

    expect(next?.nodes).toHaveLength(2);
    expect(next?.edges).toHaveLength(1);
    expect(next?.edges[0]).toMatchObject({source: sourceId, target: added?.id});
    // Placed to the right of the source for left-to-right flow.
    const origin = next?.editor.nodePositions[sourceId] ?? {x: 0, y: 0};
    const placed = next?.editor.nodePositions[added?.id ?? ''] ?? {x: 0, y: 0};

    expect(placed.x).toBeGreaterThan(origin.x);
  });

  it('addConnectedNode should place the node at an explicit position when given', () => {
    const {doc, dlg} = {doc: $project.get() as ProjectDocument, dlg: dialogueId($project.get() as ProjectDocument)};
    const sourceId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d => addConnectedNode(d, dlg, 'choice', {nodeId: sourceId}, {x: 640, y: 320}));

    const next = ($project.get() as ProjectDocument).dialogues[0];
    const added = next?.nodes.at(-1);

    expect(added?.kind).toBe('choice');
    expect(next?.editor.nodePositions[added?.id ?? '']).toStrictEqual({x: 640, y: 320});
  });

  it('connectHandles should wire the role encoded in the source handle', () => {
    const {dlg, choiceId, optionId, targetId} = withChoice();

    runCommand(d => connectHandles(d, dlg, {source: choiceId, target: targetId, sourceHandle: `${optionId}:success`}));
    runCommand(d => connectHandles(d, dlg, {source: choiceId, target: targetId, sourceHandle: `${optionId}:failure`}));

    const dialogue = ($project.get() as ProjectDocument).dialogues[0];
    const outcomes = dialogue?.edges.filter(e => e.sourceOption === optionId) ?? [];

    expect(outcomes.map(e => e.role)).toStrictEqual(['success', 'failure']);
    expect(outcomes.every(e => e.target === targetId)).toBe(true);
  });

  it('connectHandles should create a flow edge for options without checks', () => {
    const {dlg, choiceId, targetId} = withChoice();
    const plainOption = {id: 'opt_plain', text: 'Go', visibility: 'available' as const};

    runCommand(d =>
      connectHandles(updateNode(d, dlg, choiceId, {options: [plainOption]}), dlg, {
        source: choiceId,
        target: targetId,
        sourceHandle: 'opt_plain',
      }),
    );

    const dialogue = ($project.get() as ProjectDocument).dialogues[0];

    expect(dialogue?.edges.find(e => e.sourceOption === 'opt_plain')).toMatchObject({target: targetId, role: 'flow'});
  });
});

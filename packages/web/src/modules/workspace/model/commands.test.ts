import {describe, expect, it, beforeEach} from 'vite-plus/test';

import {$project, createDefaultProject} from '@/modules/project/model/store';

import type {ProjectDocument} from '@lorequary/core';

import {
  $canRedo,
  $canUndo,
  addDialogue,
  addEdge,
  addNode,
  deleteDialogue,
  deleteEdges,
  deleteNodes,
  deleteVariable,
  duplicateNodes,
  moveNodes,
  redo,
  renameDialogue,
  resetHistory,
  runCommand,
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
    expect(added).toMatchObject({kind: 'line', text: ''});
    expect(added?.lineKey).toBe(`${dlg}.${added?.id}.text`);
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

    runCommand(d => addEdge(d, dlg, {source: first, target: second}));
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
    expect(copy?.text).toBe(nodes[0]?.text);

    const original = next.dialogues[0]?.editor.nodePositions[sourceId];
    const copied = next.dialogues[0]?.editor.nodePositions[copy?.id ?? ''];

    expect(copied?.x).toBe((original?.x ?? 0) + 40);
  });
});

describe('edge commands', () => {
  it('addEdge from a choice option handle syncs the option target and replaces the old edge', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    let nodes = doc.dialogues[0]?.nodes ?? [];
    const choiceId = nodes[nodes.length - 1]?.id ?? '';
    const lineId = nodes[0]?.id ?? '';

    runCommand(d =>
      updateNode(d, dlg, choiceId, {
        options: [{id: 'opt1', text: 'Go', targetNodeId: '', visibility: 'available'}],
      }),
    );
    runCommand(d => addEdge(d, dlg, {source: choiceId, target: lineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;
    nodes = doc.dialogues[0]?.nodes ?? [];
    const choice = nodes.find(n => n.id === choiceId);

    expect(choice?.options?.[0]?.targetNodeId).toBe(lineId);
    expect(doc.dialogues[0]?.edges.filter(e => e.sourceHandle === 'opt1')).toHaveLength(1);

    // Reconnect to a new node — the old option edge is replaced, not duplicated.
    runCommand(d => addNode(d, dlg, 'line', {x: 0, y: 0}));
    doc = $project.get() as ProjectDocument;
    const newLineId = doc.dialogues[0]?.nodes[doc.dialogues[0].nodes.length - 1]?.id ?? '';

    runCommand(d => addEdge(d, dlg, {source: choiceId, target: newLineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;

    expect(doc.dialogues[0]?.edges.filter(e => e.sourceHandle === 'opt1')).toHaveLength(1);
    expect(doc.dialogues[0]?.nodes.find(n => n.id === choiceId)?.options?.[0]?.targetNodeId).toBe(newLineId);
  });

  it('deleteEdges clears the linked option target', () => {
    const {dlg} = setup();

    runCommand(d => addNode(d, dlg, 'choice', {x: 0, y: 0}));

    let doc = $project.get() as ProjectDocument;
    const choiceId = doc.dialogues[0]?.nodes[1]?.id ?? '';
    const lineId = doc.dialogues[0]?.nodes[0]?.id ?? '';

    runCommand(d =>
      updateNode(d, dlg, choiceId, {options: [{id: 'opt1', text: 'Go', targetNodeId: '', visibility: 'available'}]}),
    );
    runCommand(d => addEdge(d, dlg, {source: choiceId, target: lineId, sourceHandle: 'opt1'}));

    doc = $project.get() as ProjectDocument;
    const edgeId = doc.dialogues[0]?.edges[0]?.id ?? '';

    runCommand(d => deleteEdges(d, dlg, [edgeId]));

    doc = $project.get() as ProjectDocument;

    expect(doc.dialogues[0]?.edges).toStrictEqual([]);
    expect(doc.dialogues[0]?.nodes.find(n => n.id === choiceId)?.options?.[0]?.targetNodeId).toBe('');
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

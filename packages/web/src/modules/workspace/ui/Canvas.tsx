import {useStore} from '@nanostores/react';
import {Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useReactFlow} from '@xyflow/react';
import {useCallback, useEffect, useMemo} from 'react';

import {$project} from '@/modules/project/model/store';
import {
  addEdge,
  addNode,
  deleteNodes,
  duplicateNodes,
  runCommand,
  moveNodes,
  setEntryNode,
} from '@/modules/workspace/model/commands';
import {$contextMenu, $currentDialogue, $dragPositions, $selection} from '@/modules/workspace/model/store';
import {$focusNodeId} from '@/modules/workspace/model/validation';

import type {DialogFlowNode} from '../flow/adapter';
import type {Connection, EdgeChange, NodeChange, NodeTypes} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {MouseEvent as ReactMouseEvent, ReactElement} from 'react';

import {toFlowEdges, toFlowNodes} from '../flow/adapter';
import {ChoiceNode, LineNode} from './nodes';

const NODE_TYPES: NodeTypes = {line: LineNode, choice: ChoiceNode};

const ContextMenu = (): ReactElement | null => {
  const menu = useStore($contextMenu);
  const dialogue = useStore($currentDialogue);

  if (menu === null || dialogue === null) return null;

  const close = (): void => $contextMenu.set(null);

  const itemClass = 'px-3 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-700';

  return (
    <div
      className='absolute z-50 flex w-40 flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-800 py-1 shadow-xl'
      style={{left: menu.x, top: menu.y}}
    >
      {menu.type === 'pane' ? (
        <>
          <button
            type='button'
            className={itemClass}
            onClick={() => {
              runCommand(doc => addNode(doc, dialogue.id, 'line', {x: menu.canvasX, y: menu.canvasY}));
              close();
            }}
          >
            + Line here
          </button>
          <button
            type='button'
            className={itemClass}
            onClick={() => {
              runCommand(doc => addNode(doc, dialogue.id, 'choice', {x: menu.canvasX, y: menu.canvasY}));
              close();
            }}
          >
            + Choice here
          </button>
        </>
      ) : (
        <>
          <button
            type='button'
            className={itemClass}
            onClick={() => {
              runCommand(doc => setEntryNode(doc, dialogue.id, menu.nodeId));
              close();
            }}
          >
            Set as entry
          </button>
          <button
            type='button'
            className={itemClass}
            onClick={() => {
              runCommand(doc => duplicateNodes(doc, dialogue.id, [menu.nodeId]));
              close();
            }}
          >
            Duplicate
          </button>
          <button
            type='button'
            className={`${itemClass} text-red-400`}
            onClick={() => {
              runCommand(doc => deleteNodes(doc, dialogue.id, [menu.nodeId]));
              close();
            }}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
};

ContextMenu.displayName = 'ContextMenu';

const CanvasInner = (): ReactElement | null => {
  const project = useStore($project);
  const dialogue = useStore($currentDialogue);
  const selection = useStore($selection);
  const dragPositions = useStore($dragPositions);
  const focusNodeId = useStore($focusNodeId);
  const {screenToFlowPosition, setCenter} = useReactFlow();

  useEffect(() => {
    if (focusNodeId === null || dialogue === null) return;

    const position = dialogue.editor.nodePositions[focusNodeId];

    if (position !== undefined) {
      void setCenter(position.x + 110, position.y + 40, {zoom: 1, duration: 300});
    }

    $focusNodeId.set(null);
  }, [focusNodeId, dialogue, setCenter]);

  const nodes = useMemo(() => {
    if (dialogue === null || project === null) return [];

    return toFlowNodes(dialogue, project.characters, new Set(selection.nodeIds)).map(node => {
      const dragged = dragPositions[node.id];

      return dragged === undefined ? node : {...node, position: dragged};
    });
  }, [dialogue, project, selection.nodeIds, dragPositions]);

  const edges = useMemo(
    () => (dialogue === null ? [] : toFlowEdges(dialogue, new Set(selection.edgeIds))),
    [dialogue, selection.edgeIds],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<DialogFlowNode>[]) => {
      if (dialogue === null) return;

      const settled: Record<string, {x: number; y: number}> = {};
      let selectionChanged = false;
      const selected = new Set($selection.get().nodeIds);

      for (const change of changes) {
        if (change.type === 'position' && change.position !== undefined) {
          if (change.dragging === true) {
            $dragPositions.set({...$dragPositions.get(), [change.id]: change.position});
          } else {
            settled[change.id] = $dragPositions.get()[change.id] ?? change.position;
          }
        }

        if (change.type === 'select') {
          selectionChanged = true;

          if (change.selected) {
            selected.add(change.id);
          } else {
            selected.delete(change.id);
          }
        }
      }

      if (Object.keys(settled).length > 0) {
        runCommand(doc => moveNodes(doc, dialogue.id, settled));

        const remaining = {...$dragPositions.get()};

        for (const id of Object.keys(settled)) delete remaining[id];

        $dragPositions.set(remaining);
      }

      if (selectionChanged) {
        $selection.set({...$selection.get(), nodeIds: [...selected]});
      }
    },
    [dialogue],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selected = new Set($selection.get().edgeIds);
    let selectionChanged = false;

    for (const change of changes) {
      if (change.type === 'select') {
        selectionChanged = true;

        if (change.selected) {
          selected.add(change.id);
        } else {
          selected.delete(change.id);
        }
      }
    }

    if (selectionChanged) {
      $selection.set({...$selection.get(), edgeIds: [...selected]});
    }
  }, []);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (dialogue === null) return;

      runCommand(doc =>
        addEdge(doc, dialogue.id, {
          source: connection.source,
          target: connection.target,
          ...(connection.sourceHandle === null ? {} : {sourceHandle: connection.sourceHandle}),
        }),
      );
    },
    [dialogue],
  );

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();

      const bounds = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
      const position = screenToFlowPosition({x: event.clientX, y: event.clientY});

      $contextMenu.set({
        type: 'pane',
        x: event.clientX - (bounds?.left ?? 0),
        y: event.clientY - (bounds?.top ?? 0),
        canvasX: position.x,
        canvasY: position.y,
      });
    },
    [screenToFlowPosition],
  );

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: DialogFlowNode) => {
    event.preventDefault();

    const bounds = (event.currentTarget as HTMLElement).closest('.react-flow')?.getBoundingClientRect();

    $contextMenu.set({
      type: 'node',
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
      nodeId: node.id,
    });
  }, []);

  if (dialogue === null) {
    return <div className='flex flex-1 items-center justify-center text-sm text-neutral-500'>No dialogue selected</div>;
  }

  return (
    <div className='relative flex-1'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        deleteKeyCode={null}
        fitView
        proOptions={{hideAttribution: true}}
        colorMode='dark'
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={() => $contextMenu.set(null)}
        onMoveStart={() => $contextMenu.set(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <ContextMenu />
    </div>
  );
};

CanvasInner.displayName = 'CanvasInner';

export const Canvas = (): ReactElement => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);

Canvas.displayName = 'Canvas';

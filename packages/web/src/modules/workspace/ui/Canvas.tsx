import {useStore} from '@nanostores/react';
import {Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useReactFlow} from '@xyflow/react';
import {useCallback, useEffect, useMemo} from 'react';

import {$project} from '@/modules/project/model/store';
import {
  addEdge,
  addNode,
  deleteNodes,
  duplicateNodes,
  renameGroup,
  runCommand,
  moveNodes,
  setEntryNode,
  ungroupNodes,
} from '@/modules/workspace/model/commands';
import {
  $activeGroupId,
  $contextMenu,
  $currentDialogue,
  $dragPositions,
  $selection,
  clearSelection,
} from '@/modules/workspace/model/store';
import {$focusNodeId} from '@/modules/workspace/model/validation';

import type {FlowNode} from '../flow/adapter';
import type {Connection, EdgeChange, NodeChange, NodeTypes} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {MouseEvent as ReactMouseEvent, ReactElement} from 'react';

import {toFlowEdges, toFlowNodes} from '../flow/adapter';
import {ChoiceNode, GroupNode, LineNode} from './nodes';

const NODE_TYPES: NodeTypes = {line: LineNode, choice: ChoiceNode, group: GroupNode};

const ITEM_CLASS = 'px-3 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-700';

const MenuItem = ({label, danger, onPick}: {label: string; danger?: boolean; onPick: () => void}): ReactElement => (
  <button
    type='button'
    className={danger === true ? `${ITEM_CLASS} text-red-400` : ITEM_CLASS}
    onClick={() => {
      onPick();
      $contextMenu.set(null);
    }}
  >
    {label}
  </button>
);

MenuItem.displayName = 'MenuItem';

const ContextMenu = (): ReactElement | null => {
  const menu = useStore($contextMenu);
  const dialogue = useStore($currentDialogue);

  if (menu === null || dialogue === null) return null;

  const renderItems = (): ReactElement => {
    if (menu.type === 'pane') {
      const groupId = $activeGroupId.get() ?? undefined;

      return (
        <>
          <MenuItem
            label='+ Line here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'line', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
          <MenuItem
            label='+ Choice here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'choice', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
        </>
      );
    }

    const group = dialogue.editor.groups?.find(g => g.id === menu.nodeId);

    if (group !== undefined) {
      return (
        <>
          <MenuItem
            label='Open group'
            onPick={() => {
              $activeGroupId.set(menu.nodeId);
              clearSelection();
            }}
          />
          <MenuItem
            label='Rename'
            onPick={() => {
              const name = window.prompt('Group name', group.name);

              if (name !== null && name.trim() !== '') {
                runCommand(doc => renameGroup(doc, dialogue.id, menu.nodeId, name.trim()));
              }
            }}
          />
          <MenuItem
            danger
            label='Ungroup'
            onPick={() => runCommand(doc => ungroupNodes(doc, dialogue.id, menu.nodeId))}
          />
        </>
      );
    }

    return (
      <>
        <MenuItem label='Set as entry' onPick={() => runCommand(doc => setEntryNode(doc, dialogue.id, menu.nodeId))} />
        <MenuItem label='Duplicate' onPick={() => runCommand(doc => duplicateNodes(doc, dialogue.id, [menu.nodeId]))} />
        <MenuItem
          danger
          label='Delete'
          onPick={() => runCommand(doc => deleteNodes(doc, dialogue.id, [menu.nodeId]))}
        />
      </>
    );
  };

  return (
    <div
      className='absolute z-50 flex w-40 flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-800 py-1 shadow-xl'
      style={{left: menu.x, top: menu.y}}
    >
      {renderItems()}
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
  const activeGroupId = useStore($activeGroupId);
  const {screenToFlowPosition, setCenter} = useReactFlow();
  const activeGroup = dialogue?.editor.groups?.find(group => group.id === activeGroupId);

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

    return toFlowNodes(dialogue, project.characters, new Set(selection.nodeIds), activeGroupId).map(node => {
      const dragged = dragPositions[node.id];

      return dragged === undefined ? node : {...node, position: dragged};
    });
  }, [dialogue, project, selection.nodeIds, dragPositions, activeGroupId]);

  const edges = useMemo(
    () => (dialogue === null ? [] : toFlowEdges(dialogue, new Set(selection.edgeIds), activeGroupId)),
    [dialogue, selection.edgeIds, activeGroupId],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
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

      // Group stubs are visual-only — connections must target real nodes.
      const isGroup = (id: string): boolean => dialogue.editor.groups?.some(group => group.id === id) === true;

      if (isGroup(connection.source) || isGroup(connection.target)) return;

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

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: FlowNode) => {
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
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'group') {
            $activeGroupId.set(node.id);
            clearSelection();
          }
        }}
        onPaneClick={() => $contextMenu.set(null)}
        onMoveStart={() => $contextMenu.set(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {activeGroup !== undefined && (
        <div className='absolute left-2 top-2 z-40 flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800/90 px-2 py-1 text-xs'>
          <button
            type='button'
            className='text-neutral-400 hover:text-neutral-100'
            onClick={() => {
              $activeGroupId.set(null);
              clearSelection();
            }}
          >
            {dialogue.name}
          </button>
          <span className='text-neutral-600'>▸</span>
          <span className='font-semibold text-neutral-100'>▣ {activeGroup.name}</span>
        </div>
      )}
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

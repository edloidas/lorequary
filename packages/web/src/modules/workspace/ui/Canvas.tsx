import {useStore} from '@nanostores/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import {useCallback, useEffect, useMemo, useRef} from 'react';

import {$playtest} from '@/modules/playtest/model/store';
import {$project} from '@/modules/project/model/store';
import {
  addConnectedNode,
  addNode,
  connectHandles,
  deleteEdges,
  deleteNodes,
  duplicateNodes,
  reconnectEdge,
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
  $nodeDimensions,
  $quickAdd,
  $selection,
  clearSelection,
} from '@/modules/workspace/model/store';
import {$focusNodeId} from '@/modules/workspace/model/validation';

import type {FlowNode} from '../flow/adapter';
import type {NodeKind} from '@lorequary/core';
import type {
  Connection,
  Edge,
  EdgeChange,
  FinalConnectionState,
  IsValidConnection,
  NodeChange,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {MouseEvent as ReactMouseEvent, ReactElement} from 'react';

import {IN_HANDLE, handleToPort, toFlowEdges, toFlowNodes} from '../flow/adapter';
import {ChoiceNode, GroupNode, HubNode, JumpNode, LineNode} from './nodes';

const NODE_TYPES: NodeTypes = {line: LineNode, choice: ChoiceNode, hub: HubNode, jump: JumpNode, group: GroupNode};

const SNAP_GRID: [number, number] = [8, 8];
const MINIMAP_FALLBACK = '#3d4453';
const MINIMAP_CHOICE = '#8b5cf6';
const MINIMAP_GROUP = '#38bdf8';
const MINIMAP_HUB = '#0ea5e9';
const MINIMAP_JUMP = '#f59e0b';

// Drops closer than this to the drag origin count as pin clicks, not placements.
const CLICK_DISTANCE = 24;

const ITEM_CLASS = 'px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-ink-700';

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

const MENU_CLASS =
  'absolute z-50 flex w-44 flex-col overflow-hidden rounded-md border border-ink-600 bg-ink-800 py-1 shadow-xl shadow-black/50';

//
// * Context menu
//

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
            label='＋ Line here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'line', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
          <MenuItem
            label='＋ Choice here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'choice', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
          <MenuItem
            label='＋ Hub here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'hub', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
          <MenuItem
            label='＋ Jump here'
            onPick={() =>
              runCommand(doc => addNode(doc, dialogue.id, 'jump', {x: menu.canvasX, y: menu.canvasY}, groupId))
            }
          />
        </>
      );
    }

    if (menu.type === 'edge') {
      return (
        <MenuItem
          danger
          label='Delete connection'
          onPick={() => runCommand(doc => deleteEdges(doc, dialogue.id, [menu.edgeId]))}
        />
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
    <div className={MENU_CLASS} style={{left: menu.x, top: menu.y}}>
      {renderItems()}
    </div>
  );
};

ContextMenu.displayName = 'ContextMenu';

//
// * Quick add menu
//

const QuickAddMenu = (): ReactElement | null => {
  const quickAdd = useStore($quickAdd);
  const dialogue = useStore($currentDialogue);

  if (quickAdd === null || dialogue === null) return null;

  const pick = (kind: NodeKind): void => {
    const position =
      quickAdd.canvasX === undefined || quickAdd.canvasY === undefined
        ? undefined
        : {x: quickAdd.canvasX, y: quickAdd.canvasY};

    runCommand(doc =>
      addConnectedNode(doc, dialogue.id, kind, quickAdd.source, position, $activeGroupId.get() ?? undefined),
    );
    $quickAdd.set(null);
  };

  return (
    <div className={MENU_CLASS} style={{left: quickAdd.x, top: quickAdd.y}}>
      <span className='px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500'>
        Add connected
      </span>
      <MenuItem label='▸ Line' onPick={() => pick('line')} />
      <MenuItem label='⑂ Choice' onPick={() => pick('choice')} />
      <MenuItem label='◇ Hub' onPick={() => pick('hub')} />
      <MenuItem label='↪ Jump' onPick={() => pick('jump')} />
    </div>
  );
};

QuickAddMenu.displayName = 'QuickAddMenu';

//
// * Canvas
//

const closeOverlays = (): void => {
  $contextMenu.set(null);
  $quickAdd.set(null);
};

const CanvasInner = (): ReactElement | null => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const reconnectSuccessful = useRef(true);
  const project = useStore($project);
  const dialogue = useStore($currentDialogue);
  const selection = useStore($selection);
  const dragPositions = useStore($dragPositions);
  const nodeDimensions = useStore($nodeDimensions);
  const focusNodeId = useStore($focusNodeId);
  const activeGroupId = useStore($activeGroupId);
  const playtest = useStore($playtest);
  const {screenToFlowPosition, setCenter, getZoom} = useReactFlow();
  const activeGroup = dialogue?.editor.groups?.find(group => group.id === activeGroupId);
  const playtestNodeId = playtest.active ? (playtest.view?.nodeId ?? null) : null;

  useEffect(() => {
    if (focusNodeId === null || dialogue === null) return;

    const position = dialogue.editor.nodePositions[focusNodeId];

    if (position !== undefined) {
      void setCenter(position.x + 128, position.y + 40, {zoom: 1, duration: 300});
    }

    $focusNodeId.set(null);
  }, [focusNodeId, dialogue, setCenter]);

  // Follow the active node while playtesting, panning straight over at the author's zoom.
  // Linear interpolation avoids the default smooth zoom-out-and-back-in even when zoom is unchanged.
  useEffect(() => {
    if (playtestNodeId === null || dialogue === null) return;

    const position = dialogue.editor.nodePositions[playtestNodeId];

    if (position !== undefined) {
      void setCenter(position.x + 128, position.y + 60, {zoom: getZoom(), duration: 350, interpolate: 'linear'});
    }
  }, [playtestNodeId, dialogue, setCenter, getZoom]);

  const nodes = useMemo(() => {
    if (dialogue === null || project === null) return [];

    return toFlowNodes(dialogue, project.characters, new Set(selection.nodeIds), activeGroupId).map(node => {
      const dragged = dragPositions[node.id];
      const measured = nodeDimensions[node.id];
      const positioned = {
        ...node,
        ...(dragged === undefined ? {} : {position: dragged}),
        ...(measured === undefined ? {} : {measured}),
      };

      if (playtestNodeId === null) return positioned;

      return {...positioned, className: positioned.id === playtestNodeId ? 'playtest-active' : 'playtest-dim'};
    });
  }, [dialogue, project, selection.nodeIds, dragPositions, nodeDimensions, activeGroupId, playtestNodeId]);

  const edges = useMemo(
    () => (dialogue === null ? [] : toFlowEdges(dialogue, new Set(selection.edgeIds), activeGroupId)),
    [dialogue, selection.edgeIds, activeGroupId],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      if (dialogue === null) return;

      const settled: Record<string, {x: number; y: number}> = {};
      const dimensions: Record<string, {width: number; height: number}> = {};
      let selectionChanged = false;
      const selected = new Set($selection.get().nodeIds);

      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions !== undefined) {
          dimensions[change.id] = change.dimensions;
        }

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

      if (Object.keys(dimensions).length > 0) {
        $nodeDimensions.set({...$nodeDimensions.get(), ...dimensions});
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

  const isGroupId = useCallback(
    (id: string): boolean => dialogue?.editor.groups?.some(group => group.id === id) === true,
    [dialogue],
  );

  // Structural hard blocks: self-loops, group endpoints, edges out of jumps,
  // outcome edges from check-less ports, wrong target handles, and duplicates.
  const isValidConnection: IsValidConnection = useCallback(
    connection => {
      const {source, target} = connection;

      if (dialogue === null || source === null || target === null) return false;
      if (source === target) return false;
      if (isGroupId(source) || isGroupId(target)) return false;
      if (connection.targetHandle !== null && connection.targetHandle !== IN_HANDLE) return false;

      const sourceNode = dialogue.nodes.find(node => node.id === source);

      if (sourceNode === undefined || sourceNode.kind === 'jump') return false;

      const {sourceOption, role} = handleToPort(connection.sourceHandle ?? undefined);

      if (role !== 'flow') {
        const checked =
          sourceNode.kind === 'line'
            ? sourceNode.check !== undefined
            : sourceNode.kind === 'choice' &&
              sourceNode.options.find(option => option.id === sourceOption)?.skillCheck !== undefined;

        if (!checked) return false;
      }

      return !dialogue.edges.some(
        edge =>
          edge.source === source && edge.sourceOption === sourceOption && edge.role === role && edge.target === target,
      );
    },
    [dialogue, isGroupId],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (dialogue === null) return;
      if (isGroupId(connection.source) || isGroupId(connection.target)) return;

      runCommand(doc =>
        connectHandles(doc, dialogue.id, {
          source: connection.source,
          target: connection.target,
          ...(connection.sourceHandle === null ? {} : {sourceHandle: connection.sourceHandle}),
        }),
      );
    },
    [dialogue, isGroupId],
  );

  // Dropping a connection on empty canvas (or clicking a pin) offers quick-add.
  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid === true) return;

      const fromHandle = connectionState.fromHandle;
      const fromNodeId = connectionState.fromNode?.id;

      if (fromHandle === null || fromHandle.type !== 'source' || fromNodeId === undefined) return;
      if (isGroupId(fromNodeId)) return;

      const point = 'changedTouches' in event ? event.changedTouches[0] : event;

      if (point === undefined) return;

      const bounds = wrapperRef.current?.getBoundingClientRect();

      if (bounds === undefined) return;

      const flowPoint = screenToFlowPosition({x: point.clientX, y: point.clientY});
      const from = connectionState.from;
      const isClick = from !== null && Math.hypot(flowPoint.x - from.x, flowPoint.y - from.y) < CLICK_DISTANCE;

      $contextMenu.set(null);
      $quickAdd.set({
        x: point.clientX - bounds.left,
        y: point.clientY - bounds.top,
        ...(isClick ? {} : {canvasX: flowPoint.x, canvasY: flowPoint.y - 20}),
        source: {
          nodeId: fromNodeId,
          ...(fromHandle.id === null || fromHandle.id === undefined ? {} : {handleId: fromHandle.id}),
        },
      });
    },
    [isGroupId, screenToFlowPosition],
  );

  //
  // * Edge reconnection
  //

  const handleReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false;
  }, []);

  const handleReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      reconnectSuccessful.current = true;

      if (dialogue === null) return;
      if (isGroupId(connection.source) || isGroupId(connection.target)) return;

      // Move the endpoint in place so the edge keeps its id, label, priority, conditions, and effects.
      runCommand(doc =>
        reconnectEdge(doc, dialogue.id, oldEdge.id, {
          source: connection.source,
          target: connection.target,
          ...(connection.sourceHandle === null ? {} : {sourceHandle: connection.sourceHandle}),
        }),
      );
    },
    [dialogue, isGroupId],
  );

  // Dropping an edge end on the pane detaches it.
  const handleReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSuccessful.current && dialogue !== null) {
        runCommand(doc => deleteEdges(doc, dialogue.id, [edge.id]));
      }

      reconnectSuccessful.current = true;
    },
    [dialogue],
  );

  //
  // * Context menus
  //

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();

      const bounds = wrapperRef.current?.getBoundingClientRect();
      const position = screenToFlowPosition({x: event.clientX, y: event.clientY});

      $quickAdd.set(null);
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

    const bounds = wrapperRef.current?.getBoundingClientRect();

    $quickAdd.set(null);
    $contextMenu.set({
      type: 'node',
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
      nodeId: node.id,
    });
  }, []);

  const handleEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();

    const bounds = wrapperRef.current?.getBoundingClientRect();

    $quickAdd.set(null);
    $contextMenu.set({
      type: 'edge',
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
      edgeId: edge.id,
    });
  }, []);

  if (dialogue === null) {
    return <div className='flex flex-1 items-center justify-center text-sm text-zinc-500'>No dialogue selected</div>;
  }

  return (
    <div ref={wrapperRef} className='relative flex-1'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{padding: 0.2, maxZoom: 1}}
        minZoom={0.15}
        proOptions={{hideAttribution: true}}
        colorMode='dark'
        snapToGrid
        snapGrid={SNAP_GRID}
        connectionRadius={38}
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'group') {
            $activeGroupId.set(node.id);
            clearSelection();
          }
        }}
        onPaneClick={closeOverlays}
        onMoveStart={closeOverlays}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} bgColor='#0a0c12' color='#232a3a' />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className='!h-32 !w-44'
          maskColor='rgb(10 12 18 / 0.75)'
          nodeColor={node => {
            if (node.type === 'choice') return MINIMAP_CHOICE;
            if (node.type === 'group') return MINIMAP_GROUP;
            if (node.type === 'hub') return MINIMAP_HUB;
            if (node.type === 'jump') return MINIMAP_JUMP;

            const color = (node.data as {speakerColor?: string}).speakerColor;

            return color ?? MINIMAP_FALLBACK;
          }}
          nodeStrokeWidth={0}
        />
      </ReactFlow>
      {activeGroup !== undefined && (
        <div className='absolute left-2 top-2 z-40 flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800/90 px-2 py-1 text-xs backdrop-blur'>
          <button
            type='button'
            className='cursor-pointer text-zinc-400 hover:text-zinc-100'
            onClick={() => {
              $activeGroupId.set(null);
              clearSelection();
            }}
          >
            {dialogue.name}
          </button>
          <span className='text-zinc-600'>▸</span>
          <span className='font-semibold text-zinc-100'>▣ {activeGroup.name}</span>
        </div>
      )}
      <ContextMenu />
      <QuickAddMenu />
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

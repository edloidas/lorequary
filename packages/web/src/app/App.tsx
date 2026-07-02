import {useStore} from '@nanostores/react';
import {useEffect, useState} from 'react';

import {Inspector} from '@/modules/inspector/ui/Inspector';
import {startAutosave} from '@/modules/persistence/autosave';
import {listProjectSummaries, saveProject} from '@/modules/persistence/db';
import {$playtest} from '@/modules/playtest/model/store';
import {PlaytestPanel} from '@/modules/playtest/ui/PlaytestPanel';
import {$appView} from '@/modules/project/model/navigation';
import {$project} from '@/modules/project/model/store';
import {createDemoProject} from '@/modules/project/model/template';
import {HomeScreen} from '@/modules/project/ui/HomeScreen';
import {ProjectDashboard} from '@/modules/project/ui/ProjectDashboard';
import {Sidebar} from '@/modules/project/ui/Sidebar';
import {
  addConnectedNode,
  deleteEdges,
  deleteNodes,
  duplicateNodes,
  redo,
  runCommand,
  undo,
  ungroupNodes,
} from '@/modules/workspace/model/commands';
import {$currentDialogue, $selection, clearSelection} from '@/modules/workspace/model/store';
import {Canvas} from '@/modules/workspace/ui/Canvas';
import {Toolbar} from '@/modules/workspace/ui/Toolbar';
import {ValidationPanel} from '@/modules/workspace/ui/ValidationPanel';
import {ResizablePanel} from '@/shared/ui/ResizablePanel';

import type {ReactElement} from 'react';

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

const handleShortcut = (event: KeyboardEvent): void => {
  if ($appView.get() !== 'dialogue') return;

  const mod = event.metaKey || event.ctrlKey;

  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault();

    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }

    return;
  }

  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
    return;
  }

  if (isEditableTarget(event.target)) return;

  const dialogue = $currentDialogue.get();
  const selection = $selection.get();

  if (dialogue === null) return;

  const hasSelection = selection.nodeIds.length > 0 || selection.edgeIds.length > 0;
  const groups = dialogue.editor.groups ?? [];
  const groupIds = selection.nodeIds.filter(id => groups.some(group => group.id === id));
  const nodeIds = selection.nodeIds.filter(id => !groupIds.includes(id));

  if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
    event.preventDefault();
    // Deleting a group stub dissolves the group; its members survive.
    runCommand(doc => {
      let next = deleteEdges(deleteNodes(doc, dialogue.id, nodeIds), dialogue.id, selection.edgeIds);

      for (const groupId of groupIds) next = ungroupNodes(next, dialogue.id, groupId);

      return next;
    });
    clearSelection();
    return;
  }

  if (mod && event.key.toLowerCase() === 'd' && nodeIds.length > 0) {
    event.preventDefault();
    runCommand(doc => duplicateNodes(doc, dialogue.id, nodeIds));
    return;
  }

  // Chain-authoring: Ctrl+Enter adds a connected line after the selected node.
  if (mod && event.key === 'Enter' && nodeIds.length === 1 && nodeIds[0] !== undefined) {
    event.preventDefault();

    const sourceId = nodeIds[0];

    runCommand(doc => addConnectedNode(doc, dialogue.id, 'line', {nodeId: sourceId}));
  }
};

const Workbench = (): ReactElement => {
  const playtest = useStore($playtest);

  return (
    <div className='flex h-screen bg-ink-950 text-zinc-200'>
      <ResizablePanel
        edge='right'
        storageKey='lorequary:panel:sidebar'
        defaultWidth={288}
        minWidth={220}
        maxWidth={480}
      >
        <Sidebar />
      </ResizablePanel>
      <main className='flex min-w-0 flex-1 flex-col'>
        <Toolbar />
        <Canvas />
        <ValidationPanel />
      </main>
      <ResizablePanel
        edge='left'
        storageKey='lorequary:panel:inspector'
        defaultWidth={360}
        minWidth={280}
        maxWidth={640}
      >
        {playtest.active ? <PlaytestPanel /> : <Inspector />}
      </ResizablePanel>
    </div>
  );
};

Workbench.displayName = 'Workbench';

export const App = (): ReactElement => {
  const project = useStore($project);
  const view = useStore($appView);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let stopAutosave: (() => void) | undefined;
    let cancelled = false;

    // First boot seeds the demo scene so the home screen has something to show.
    void listProjectSummaries().then(async summaries => {
      if (cancelled) return;

      if (summaries.length === 0) {
        await saveProject(createDemoProject());
      }

      stopAutosave = startAutosave($project, next => void saveProject(next));
      setBooted(true);
    });

    window.addEventListener('keydown', handleShortcut);

    return () => {
      cancelled = true;
      stopAutosave?.();
      window.removeEventListener('keydown', handleShortcut);
    };
  }, []);

  if (!booted) {
    return (
      <div className='flex h-screen items-center justify-center bg-ink-950 text-sm text-zinc-500'>
        Loading Lorequary…
      </div>
    );
  }

  if (view === 'home' || project === null) return <HomeScreen />;
  if (view === 'project') return <ProjectDashboard />;

  return <Workbench />;
};

App.displayName = 'App';

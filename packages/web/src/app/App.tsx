import {useStore} from '@nanostores/react';
import {useEffect, useState} from 'react';

import {Inspector} from '@/modules/inspector/ui/Inspector';
import {startAutosave} from '@/modules/persistence/autosave';
import {loadLastProject, saveProject} from '@/modules/persistence/db';
import {PlaytestBar} from '@/modules/playtest/ui/PlaytestBar';
import {$project, createDefaultProject} from '@/modules/project/model/store';
import {Sidebar} from '@/modules/project/ui/Sidebar';
import {
  deleteEdges,
  deleteNodes,
  duplicateNodes,
  redo,
  resetHistory,
  runCommand,
  undo,
} from '@/modules/workspace/model/commands';
import {$currentDialogue, $currentDialogueId, $selection, clearSelection} from '@/modules/workspace/model/store';
import {Canvas} from '@/modules/workspace/ui/Canvas';
import {Toolbar} from '@/modules/workspace/ui/Toolbar';

import type {ReactElement} from 'react';

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

const handleShortcut = (event: KeyboardEvent): void => {
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

  if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
    event.preventDefault();
    runCommand(doc => deleteEdges(deleteNodes(doc, dialogue.id, selection.nodeIds), dialogue.id, selection.edgeIds));
    clearSelection();
    return;
  }

  if (mod && event.key.toLowerCase() === 'd' && selection.nodeIds.length > 0) {
    event.preventDefault();
    runCommand(doc => duplicateNodes(doc, dialogue.id, selection.nodeIds));
  }
};

export const App = (): ReactElement => {
  const project = useStore($project);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let stopAutosave: (() => void) | undefined;
    let cancelled = false;

    void loadLastProject().then(loaded => {
      if (cancelled) return;

      const doc = loaded ?? createDefaultProject('My Project');

      $project.set(doc);
      $currentDialogueId.set(doc.dialogues[0]?.id ?? null);
      resetHistory();
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

  if (!booted || project === null) {
    return (
      <div className='flex h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500'>
        Loading project…
      </div>
    );
  }

  return (
    <div className='flex h-screen bg-neutral-950 text-neutral-200'>
      <Sidebar />
      <main className='flex min-w-0 flex-1 flex-col'>
        <Toolbar />
        <Canvas />
        <PlaytestBar />
      </main>
      <Inspector />
    </div>
  );
};

App.displayName = 'App';

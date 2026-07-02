import {useEffect, useState} from 'react';

import {deleteProject, listProjectSummaries, loadProject, saveProject} from '@/modules/persistence/db';
import {$appView} from '@/modules/project/model/navigation';
import {$project, createDefaultProject} from '@/modules/project/model/store';
import {createDemoProject} from '@/modules/project/model/template';
import {resetHistory} from '@/modules/workspace/model/commands';
import {$activeGroupId, $currentDialogueId, clearSelection} from '@/modules/workspace/model/store';

import type {ProjectSummary} from '@/modules/persistence/db';
import type {ProjectDocument} from '@lorequary/core';
import type {ReactElement} from 'react';

const activateProject = (doc: ProjectDocument): void => {
  $project.set(doc);
  $currentDialogueId.set(doc.dialogues[0]?.id ?? null);
  $activeGroupId.set(null);
  clearSelection();
  resetHistory();
  $appView.set('project');
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
};

const CARD_CLASS =
  'group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition-all hover:border-sky-700 hover:bg-ink-800 hover:shadow-[0_8px_30px_rgb(0_0_0/0.4)]';

export const HomeScreen = (): ReactElement => {
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);

  const refresh = (): void => {
    void listProjectSummaries().then(setSummaries);
  };

  useEffect(refresh, []);

  const handleOpen = (projectId: string): void => {
    void loadProject(projectId).then(doc => {
      if (doc !== null) activateProject(doc);
    });
  };

  const handleCreate = (build: () => ProjectDocument): void => {
    const doc = build();

    void saveProject(doc).then(() => activateProject(doc));
  };

  const handleNew = (): void => {
    const name = window.prompt('Project name', 'New Project');

    if (name === null || name.trim() === '') return;

    handleCreate(() => createDefaultProject(name.trim()));
  };

  const handleDelete = (summary: ProjectSummary): void => {
    if (!window.confirm(`Delete project "${summary.name}"? This cannot be undone.`)) return;

    void deleteProject(summary.id).then(() => {
      if ($project.get()?.meta.id === summary.id) $project.set(null);

      refresh();
    });
  };

  return (
    <div className='flex h-screen flex-col overflow-y-auto bg-ink-950 text-zinc-200'>
      <header className='border-b border-ink-800 bg-ink-900/60'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-8'>
          <h1 className='text-2xl font-bold tracking-tight text-zinc-100'>Lorequary</h1>
          <p className='text-sm text-zinc-500'>
            Visual editor for branching game dialogs — skill checks, internal voices, and living world state.
          </p>
        </div>
      </header>

      <main className='mx-auto w-full max-w-5xl flex-1 px-6 py-8'>
        <h2 className='mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500'>Projects</h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {(summaries ?? []).map(summary => (
            <div
              key={summary.id}
              role='button'
              tabIndex={0}
              className={CARD_CLASS}
              onClick={() => handleOpen(summary.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') handleOpen(summary.id);
              }}
            >
              <div className='flex items-start justify-between gap-2'>
                <span className='truncate text-sm font-semibold text-zinc-100'>{summary.name}</span>
                <button
                  type='button'
                  className='hidden shrink-0 cursor-pointer rounded px-1 text-xs text-zinc-500 hover:text-red-400 group-hover:block'
                  title='Delete project'
                  onClick={event => {
                    event.stopPropagation();
                    handleDelete(summary);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className='flex gap-3 text-[11px] text-zinc-500'>
                <span>{summary.dialogueCount} dialogue(s)</span>
                <span>{summary.nodeCount} node(s)</span>
                <span>{summary.characterCount} character(s)</span>
              </div>
              <span className='text-[10px] text-zinc-600'>Updated {formatDate(summary.updatedAt)}</span>
            </div>
          ))}

          <button type='button' className={CARD_CLASS} onClick={handleNew}>
            <span className='text-sm font-semibold text-sky-300'>＋ New project</span>
            <span className='text-[11px] text-zinc-500'>Start with a blank dialogue and a basic cast.</span>
          </button>

          <button type='button' className={CARD_CLASS} onClick={() => handleCreate(createDemoProject)}>
            <span className='text-sm font-semibold text-emerald-300'>✦ Demo scene</span>
            <span className='text-[11px] text-zinc-500'>
              The Harbor Gate — a Disco Elysium-style scene with skill checks, internal voices, and branching paths.
            </span>
          </button>
        </div>

        {summaries !== null && summaries.length === 0 && (
          <p className='mt-6 text-sm text-zinc-600'>
            No projects yet — create one, or open the demo scene to see what Lorequary can do.
          </p>
        )}
      </main>
    </div>
  );
};

HomeScreen.displayName = 'HomeScreen';

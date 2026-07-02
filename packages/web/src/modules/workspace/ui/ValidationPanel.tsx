import {useStore} from '@nanostores/react';

import {$project} from '@/modules/project/model/store';
import {$currentDialogueId, $selection} from '@/modules/workspace/model/store';
import {
  $focusNodeId,
  $validationIssues,
  $validationOpen,
  formatIssueLocation,
} from '@/modules/workspace/model/validation';
import {cn} from '@/shared/lib/cn';

import type {GraphIssue} from '@lorequary/core';
import type {ReactElement} from 'react';

const focusIssue = (issue: GraphIssue): void => {
  if (issue.dialogueId !== undefined) {
    $currentDialogueId.set(issue.dialogueId);
  }

  if (issue.nodeId !== undefined) {
    $selection.set({nodeIds: [issue.nodeId], edgeIds: []});
    $focusNodeId.set(issue.nodeId);
  }
};

export const ValidationPanel = (): ReactElement | null => {
  const open = useStore($validationOpen);
  const project = useStore($project);
  const issues = useStore($validationIssues);

  if (!open || project === null) return null;

  return (
    <div className='flex max-h-40 flex-col overflow-y-auto border-t border-ink-800 bg-ink-950'>
      <div className='flex items-center gap-2 px-3 py-1.5'>
        <span className='text-[11px] font-semibold uppercase tracking-wide text-zinc-400'>Validation</span>
        <span className='text-[11px] text-zinc-500'>
          {issues.length === 0 ? 'No issues — the project is valid' : `${issues.length} issue(s)`}
        </span>
        <div className='flex-1' />
        <button
          type='button'
          className='text-[11px] text-zinc-500 hover:text-zinc-300'
          onClick={() => $validationOpen.set(false)}
        >
          ✕ Close
        </button>
      </div>
      {issues.map((issue, index) => (
        <button
          // Issues have no stable identity; the list is regenerated wholesale on every change.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          type='button'
          className='flex items-baseline gap-2 px-3 py-1 text-left hover:bg-ink-800/60'
          onClick={() => focusIssue(issue)}
        >
          <span
            className={cn(
              'shrink-0 rounded px-1 text-[9px] font-bold uppercase',
              issue.severity === 'error' ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400',
            )}
          >
            {issue.severity}
          </span>
          <span className='shrink-0 text-[11px] text-zinc-500'>{formatIssueLocation(issue, project)}</span>
          <span className='truncate text-[11px] text-zinc-300'>{issue.message}</span>
        </button>
      ))}
    </div>
  );
};

ValidationPanel.displayName = 'ValidationPanel';

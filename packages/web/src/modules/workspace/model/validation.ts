import {validateProject} from '@lorequary/core';
import {atom, computed} from 'nanostores';

import {$project} from '@/modules/project/model/store';

import type {GraphIssue, ProjectDocument} from '@lorequary/core';

export const $validationOpen = atom(false);

// Live issue list — only evaluated while something subscribes (i.e. the panel is open).
export const $validationIssues = computed($project, (project): GraphIssue[] =>
  project === null ? [] : validateProject(project),
);

// Set to request the canvas to center on a node; the canvas clears it after focusing.
export const $focusNodeId = atom<string | null>(null);

export const formatIssueLocation = (issue: GraphIssue, project: ProjectDocument): string => {
  const parts: string[] = [];

  if (issue.dialogueId !== undefined) {
    const dialogue = project.dialogues.find(d => d.id === issue.dialogueId);

    parts.push(dialogue?.name ?? issue.dialogueId);
  }

  if (issue.nodeId !== undefined) parts.push(`node ${issue.nodeId}`);
  if (issue.optionId !== undefined) parts.push(`option ${issue.optionId}`);
  if (issue.edgeId !== undefined) parts.push(`edge ${issue.edgeId}`);
  if (issue.variableId !== undefined) parts.push(`variable ${issue.variableId}`);

  return parts.length === 0 ? 'project' : parts.join(' · ');
};

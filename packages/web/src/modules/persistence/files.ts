import {deserializeProject, exportRuntimeJson, serializeProject} from '@lorequary/core';

import {$project} from '@/modules/project/model/store';
import {resetHistory} from '@/modules/workspace/model/commands';
import {$currentDialogueId, clearSelection} from '@/modules/workspace/model/store';

import type {DeserializedProject, ProjectDocument, SerialError} from '@lorequary/core';
import type {Result} from '@lorequary/parser';

import {saveProject} from './db';

export const sanitizeFileName = (name: string): string => {
  const cleaned = name
    .toLowerCase()
    .replaceAll(/[^\w-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return cleaned === '' ? 'project' : cleaned;
};

const downloadText = (fileName: string, content: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([content], {type: mimeType}));
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const exportProjectFile = (doc: ProjectDocument): void => {
  downloadText(`${sanitizeFileName(doc.meta.name)}.lorequary`, serializeProject(doc), 'application/json');
};

export const exportRuntimeFile = (doc: ProjectDocument): void => {
  downloadText(`${sanitizeFileName(doc.meta.name)}.runtime.json`, exportRuntimeJson(doc), 'application/json');
};

export const importProjectText = (text: string): Result<DeserializedProject, SerialError> => deserializeProject(text);

export const applyImportedProject = (doc: ProjectDocument): void => {
  $project.set(doc);
  $currentDialogueId.set(doc.dialogues[0]?.id ?? null);
  clearSelection();
  resetHistory();
  void saveProject(doc);
};

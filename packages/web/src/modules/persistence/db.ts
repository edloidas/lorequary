import {zProjectDocument} from '@lorequary/core';
import {openDB} from 'idb';

import type {ProjectDocument} from '@lorequary/core';
import type {DBSchema, IDBPDatabase} from 'idb';

const DB_NAME = 'lorequary';
const DB_VERSION = 1;
const STORE = 'projects';
const LAST_PROJECT_KEY = 'lorequary:lastProjectId';

type LorequaryDB = DBSchema & {
  projects: {
    key: string;
    value: ProjectDocument;
  };
};

let dbPromise: Promise<IDBPDatabase<LorequaryDB>> | undefined;

const getDb = (): Promise<IDBPDatabase<LorequaryDB>> => {
  dbPromise ??= openDB<LorequaryDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });

  return dbPromise;
};

export const saveProject = async (doc: ProjectDocument): Promise<void> => {
  const db = await getDb();

  await db.put(STORE, doc, doc.meta.id);
  localStorage.setItem(LAST_PROJECT_KEY, doc.meta.id);
};

export const loadProject = async (projectId: string): Promise<ProjectDocument | null> => {
  const db = await getDb();
  const stored = await db.get(STORE, projectId);
  const parsed = zProjectDocument.safeParse(stored);

  return parsed.success ? parsed.data : null;
};

export const loadLastProject = async (): Promise<ProjectDocument | null> => {
  const lastId = localStorage.getItem(LAST_PROJECT_KEY);

  return lastId === null ? null : loadProject(lastId);
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  dialogueCount: number;
  characterCount: number;
  nodeCount: number;
};

export const listProjectSummaries = async (): Promise<ProjectSummary[]> => {
  const db = await getDb();
  const stored = await db.getAll(STORE);

  return stored
    .map(raw => zProjectDocument.safeParse(raw))
    .filter(parsed => parsed.success)
    .map(({data}) => ({
      id: data.meta.id,
      name: data.meta.name,
      updatedAt: data.meta.updatedAt,
      dialogueCount: data.dialogues.length,
      characterCount: data.characters.length,
      nodeCount: data.dialogues.reduce((sum, dialogue) => sum + dialogue.nodes.length, 0),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const db = await getDb();

  await db.delete(STORE, projectId);

  if (localStorage.getItem(LAST_PROJECT_KEY) === projectId) {
    localStorage.removeItem(LAST_PROJECT_KEY);
  }
};

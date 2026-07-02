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

export const loadLastProject = async (): Promise<ProjectDocument | null> => {
  const lastId = localStorage.getItem(LAST_PROJECT_KEY);

  if (lastId === null) return null;

  const db = await getDb();
  const stored = await db.get(STORE, lastId);
  const parsed = zProjectDocument.safeParse(stored);

  return parsed.success ? parsed.data : null;
};

import type {Dialogue, ProjectDocument} from '../schema';

// Runtime IR: the project document without editor layout state — what game runtimes consume.

export type RuntimeDialogue = Omit<Dialogue, 'editor'>;

export type RuntimeDocument = Omit<ProjectDocument, 'dialogues'> & {
  dialogues: RuntimeDialogue[];
};

export const toRuntimeDocument = (doc: ProjectDocument): RuntimeDocument => ({
  ...doc,
  dialogues: doc.dialogues.map(({editor: _editor, ...dialogue}) => dialogue),
});

export const exportRuntimeJson = (doc: ProjectDocument): string => JSON.stringify(toRuntimeDocument(doc), null, 2);

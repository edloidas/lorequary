import {err, ok} from '@lorequary/parser';
import {z} from 'zod';

import type {ProjectDocument} from '../schema';
import type {Result} from '@lorequary/parser';

import {SCHEMA_VERSION} from '../schema';
import {zProjectDocument} from '../validate/schemas';

export type SerialError = {
  message: string;
  issues?: string[];
};

const zVersionProbe = z.object({schemaVersion: z.number()});

export const serializeProject = (doc: ProjectDocument): string => JSON.stringify(doc, null, 2);

export const deserializeProject = (json: string): Result<ProjectDocument, SerialError> => {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch (error) {
    return err({message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`});
  }

  const probe = zVersionProbe.safeParse(data);

  if (probe.success && probe.data.schemaVersion > SCHEMA_VERSION) {
    return err({
      message: `Unsupported schema version ${probe.data.schemaVersion} — this build supports up to ${SCHEMA_VERSION}`,
    });
  }

  const parsed = zProjectDocument.safeParse(data);

  if (!parsed.success) {
    return err({
      message: 'Invalid project document',
      issues: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  return ok(parsed.data);
};

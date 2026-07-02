import {computed} from 'nanostores';

import type {Variable} from '@lorequary/core';
import type {VariableSchema} from '@lorequary/parser';

import {$project} from './store';

export const $variableSchema = computed($project, (project): VariableSchema => {
  const schema: VariableSchema = {};

  for (const variable of project?.variables ?? []) {
    schema[variable.key] = {type: variable.type === 'enum' ? 'string' : variable.type};
  }

  return schema;
});

export const $numericVariables = computed($project, (project): Variable[] =>
  (project?.variables ?? []).filter(variable => variable.type === 'number'),
);

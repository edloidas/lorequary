import {parseCondition, parseEffect, validate} from '@lorequary/parser';

import type {DialogNode, Dialogue, ProjectDocument} from '../schema';
import type {VariableSchema} from '@lorequary/parser';

export type GraphIssueCode =
  | 'missing-entry'
  | 'broken-edge'
  | 'duplicate-node-id'
  | 'orphaned-option'
  | 'empty-choice'
  | 'missing-character'
  | 'unknown-skill'
  | 'invalid-expression'
  | 'unreachable-node'
  | 'empty-text';

export type GraphIssue = {
  severity: 'error' | 'warning';
  code: GraphIssueCode;
  message: string;
  dialogueId?: string;
  nodeId?: string;
  edgeId?: string;
  optionId?: string;
  variableId?: string;
};

type Location = Pick<GraphIssue, 'dialogueId' | 'nodeId' | 'edgeId' | 'optionId' | 'variableId'>;

type ExpressionMode = 'condition' | 'effect' | 'computed';

class ProjectValidator {
  readonly issues: GraphIssue[] = [];

  private readonly schema: VariableSchema;
  private readonly variableIds: Set<string>;
  private readonly characterIds: Set<string>;

  constructor(private readonly project: ProjectDocument) {
    this.schema = {};
    for (const variable of project.variables) {
      // Enum variables hold string values at the expression level.
      this.schema[variable.key] = {type: variable.type === 'enum' ? 'string' : variable.type};
    }

    this.variableIds = new Set(project.variables.map(v => v.id));
    this.characterIds = new Set(project.characters.map(c => c.id));
  }

  run(): GraphIssue[] {
    for (const variable of this.project.variables) {
      if (variable.computed !== undefined) {
        this.checkExpression(variable.computed.expression, 'computed', {variableId: variable.id});
      }
    }

    for (const character of this.project.characters) {
      if (character.skillId !== undefined && !this.variableIds.has(character.skillId)) {
        this.report(
          'error',
          'unknown-skill',
          `Character \`${character.id}\` references unknown skill variable \`${character.skillId}\``,
          {},
        );
      }
    }

    for (const dialogue of this.project.dialogues) {
      this.validateDialogue(dialogue);
    }

    return this.issues;
  }

  private validateDialogue(dialogue: Dialogue): void {
    const at = {dialogueId: dialogue.id};
    const nodeIds = new Set<string>();

    for (const node of dialogue.nodes) {
      if (nodeIds.has(node.id)) {
        this.report('error', 'duplicate-node-id', `Duplicate node id \`${node.id}\``, {...at, nodeId: node.id});
      }

      nodeIds.add(node.id);
    }

    if (!nodeIds.has(dialogue.entryNodeId)) {
      this.report('error', 'missing-entry', `Entry node \`${dialogue.entryNodeId}\` does not exist`, at);
    }

    for (const edge of dialogue.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        this.report('error', 'broken-edge', `Edge \`${edge.id}\` references a missing node`, {...at, edgeId: edge.id});
      }

      for (const condition of edge.conditions ?? []) {
        this.checkExpression(condition, 'condition', {...at, edgeId: edge.id});
      }
    }

    for (const node of dialogue.nodes) {
      this.validateNode(node, nodeIds, at);
    }

    this.reportUnreachable(dialogue, nodeIds);
  }

  private validateNode(node: DialogNode, nodeIds: Set<string>, at: Location): void {
    const here = {...at, nodeId: node.id};

    if (node.characterId !== undefined && !this.characterIds.has(node.characterId)) {
      this.report('error', 'missing-character', `Node references unknown character \`${node.characterId}\``, here);
    }

    if (node.passiveCheck !== undefined && !this.variableIds.has(node.passiveCheck.skillId)) {
      this.report(
        'error',
        'unknown-skill',
        `Passive check references unknown skill variable \`${node.passiveCheck.skillId}\``,
        here,
      );
    }

    if (node.text.trim() === '') {
      this.report('warning', 'empty-text', 'Node has no text content', here);
    }

    for (const condition of node.conditions ?? []) this.checkExpression(condition, 'condition', here);
    for (const effect of node.effects ?? []) this.checkExpression(effect, 'effect', here);

    for (const variant of node.textVariants ?? []) {
      for (const condition of variant.conditions) this.checkExpression(condition, 'condition', here);
    }

    if (node.kind !== 'choice') return;

    if (node.options === undefined || node.options.length === 0) {
      this.report('error', 'empty-choice', 'Choice node has no options', here);
      return;
    }

    for (const option of node.options) {
      const location = {...here, optionId: option.id};

      if (!nodeIds.has(option.targetNodeId)) {
        this.report('error', 'orphaned-option', `Option targets missing node \`${option.targetNodeId}\``, location);
      }

      for (const condition of option.conditions ?? []) this.checkExpression(condition, 'condition', location);
      for (const effect of option.effects ?? []) this.checkExpression(effect, 'effect', location);

      const check = option.skillCheck;

      if (check === undefined) continue;

      if (!this.variableIds.has(check.skillId)) {
        this.report(
          'error',
          'unknown-skill',
          `Skill check references unknown skill variable \`${check.skillId}\``,
          location,
        );
      }

      for (const targetId of [check.successTargetId, check.failureTargetId]) {
        if (!nodeIds.has(targetId)) {
          this.report('error', 'orphaned-option', `Skill check targets missing node \`${targetId}\``, location);
        }
      }

      for (const modifier of check.modifiers ?? []) {
        this.checkExpression(modifier.condition, 'condition', location);
      }
    }
  }

  private reportUnreachable(dialogue: Dialogue, nodeIds: Set<string>): void {
    if (!nodeIds.has(dialogue.entryNodeId)) return;

    const nodesById = new Map(dialogue.nodes.map(node => [node.id, node]));
    const reachable = new Set<string>();
    const queue = [dialogue.entryNodeId];

    while (queue.length > 0) {
      const nodeId = queue.pop();

      if (nodeId === undefined || reachable.has(nodeId) || !nodesById.has(nodeId)) continue;

      reachable.add(nodeId);

      for (const edge of dialogue.edges) {
        if (edge.source === nodeId) queue.push(edge.target);
      }

      for (const option of nodesById.get(nodeId)?.options ?? []) {
        queue.push(option.targetNodeId);

        if (option.skillCheck !== undefined) {
          queue.push(option.skillCheck.successTargetId, option.skillCheck.failureTargetId);
        }
      }
    }

    for (const node of dialogue.nodes) {
      if (!reachable.has(node.id)) {
        this.report('warning', 'unreachable-node', `Node \`${node.id}\` is unreachable from the entry node`, {
          dialogueId: dialogue.id,
          nodeId: node.id,
        });
      }
    }
  }

  private checkExpression(expression: string, mode: ExpressionMode, location: Location): void {
    const parsed = mode === 'effect' ? parseEffect(expression) : parseCondition(expression);

    if (!parsed.ok) {
      this.report('error', 'invalid-expression', `\`${expression}\`: ${parsed.error.message}`, location);
      return;
    }

    const errors = validate(parsed.value, this.schema).filter(
      // Computed variables are numeric formulas — the boolean top-level rule does not apply.
      error => mode !== 'computed' || !error.message.startsWith('Condition must evaluate'),
    );

    for (const error of errors) {
      this.report('error', 'invalid-expression', `\`${expression}\`: ${error.message}`, location);
    }
  }

  private report(severity: GraphIssue['severity'], code: GraphIssueCode, message: string, location: Location): void {
    this.issues.push({severity, code, message, ...location});
  }
}

export const validateProject = (project: ProjectDocument): GraphIssue[] => new ProjectValidator(project).run();

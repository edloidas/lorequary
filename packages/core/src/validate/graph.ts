import {parseCondition, parseEffect, validate} from '@lorequary/parser';

import type {
  ChoiceNode,
  DialogEdge,
  DialogNode,
  Dialogue,
  EdgeRole,
  JumpNode,
  LineNode,
  ProjectDocument,
  SkillCheck,
} from '../schema';
import type {VariableSchema} from '@lorequary/parser';

export type GraphIssueCode =
  | 'missing-entry'
  | 'choice-entry'
  | 'broken-edge'
  | 'broken-option-ref'
  | 'role-mismatch'
  | 'broken-jump'
  | 'jump-has-edges'
  | 'duplicate-node-id'
  | 'empty-choice'
  | 'missing-character'
  | 'unknown-skill'
  | 'unknown-stage-slot'
  | 'invalid-expression'
  | 'missing-outcome'
  | 'dangling-option'
  | 'dead-hub'
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

// Roles present on each port, keyed by `${source}|${sourceOption ?? ''}`.
type PortRoles = Map<string, Set<EdgeRole>>;

const portKey = (nodeId: string, optionId?: string): string => `${nodeId}|${optionId ?? ''}`;

class ProjectValidator {
  readonly issues: GraphIssue[] = [];

  private readonly schema: VariableSchema;
  private readonly variableIds: Set<string>;
  private readonly characterIds: Set<string>;
  private readonly stageSlots: Map<string, Set<string>>;
  private readonly dialogueNodeIds: Map<string, Set<string>>;

  constructor(private readonly project: ProjectDocument) {
    this.schema = {};
    for (const variable of project.variables) {
      // Enum variables hold string values at the expression level.
      this.schema[variable.key] = {type: variable.type === 'enum' ? 'string' : variable.type};
    }

    this.variableIds = new Set(project.variables.map(v => v.id));
    this.characterIds = new Set(project.characters.map(c => c.id));
    this.stageSlots = new Map((project.settings.stageSlots ?? []).map(slot => [slot.id, new Set(slot.options)]));
    this.dialogueNodeIds = new Map(
      project.dialogues.map(dialogue => [dialogue.id, new Set(dialogue.nodes.map(node => node.id))]),
    );
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
    const nodesById = new Map<string, DialogNode>();

    for (const node of dialogue.nodes) {
      if (nodesById.has(node.id)) {
        this.report('error', 'duplicate-node-id', `Duplicate node id \`${node.id}\``, {...at, nodeId: node.id});
      } else {
        nodesById.set(node.id, node);
      }
    }

    const entry = nodesById.get(dialogue.entryNodeId);

    if (entry === undefined) {
      this.report('error', 'missing-entry', `Entry node \`${dialogue.entryNodeId}\` does not exist`, at);
    } else if (entry.kind === 'choice') {
      this.report('error', 'choice-entry', 'The entry node must not be a choice — threads open with content', {
        ...at,
        nodeId: entry.id,
      });
    }

    this.validateStage(dialogue.stageDefaults, at);

    // Single edge pass: structural integrity, port/role shape, expressions,
    // and the port-role index the node checks below consume.
    const portRoles: PortRoles = new Map();
    const jumpEdgeNodes = new Set<string>();

    for (const edge of dialogue.edges) {
      const location = {...at, edgeId: edge.id};

      if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
        this.report('error', 'broken-edge', `Edge \`${edge.id}\` references a missing node`, location);
      }

      for (const condition of edge.conditions ?? []) this.checkExpression(condition, 'condition', location);
      for (const effect of edge.effects ?? []) this.checkExpression(effect, 'effect', location);

      const source = nodesById.get(edge.source);

      if (source !== undefined) {
        this.validateEdgeShape(edge, source, location, jumpEdgeNodes);
      }

      const key = portKey(edge.source, edge.sourceOption);
      const roles = portRoles.get(key) ?? new Set<EdgeRole>();

      roles.add(edge.role);
      portRoles.set(key, roles);
    }

    for (const nodeId of jumpEdgeNodes) {
      this.report('error', 'jump-has-edges', 'Jump nodes route through their target and must have no outgoing edges', {
        ...at,
        nodeId,
      });
    }

    for (const node of dialogue.nodes) {
      this.validateNode(node, dialogue, portRoles, at);
    }

    this.reportUnreachable(dialogue, nodesById);
  }

  private validateEdgeShape(
    edge: DialogEdge,
    source: DialogNode,
    location: Location,
    jumpEdgeNodes: Set<string>,
  ): void {
    if (source.kind === 'jump') {
      jumpEdgeNodes.add(source.id);
      return;
    }

    if (source.kind === 'hub') {
      if (edge.sourceOption !== undefined) {
        this.report('error', 'broken-option-ref', `Hub \`${source.id}\` has no options`, location);
      }

      if (edge.role !== 'flow') {
        this.report(
          'error',
          'role-mismatch',
          `\`${edge.role}\` edge from hub \`${source.id}\` — hubs have no check`,
          location,
        );
      }

      return;
    }

    if (source.kind === 'line') {
      if (edge.sourceOption !== undefined) {
        this.report('error', 'broken-option-ref', `Line \`${source.id}\` has no options`, location);
      }

      this.validateRole(edge.role, source.check !== undefined, `line \`${source.id}\``, location);
      return;
    }

    if (edge.sourceOption === undefined) {
      this.report(
        'error',
        'broken-option-ref',
        `Edge from choice \`${source.id}\` must leave an option port`,
        location,
      );
      return;
    }

    const option = source.options.find(o => o.id === edge.sourceOption);

    if (option === undefined) {
      this.report(
        'error',
        'broken-option-ref',
        `Option \`${edge.sourceOption}\` not found on node \`${source.id}\``,
        location,
      );
      return;
    }

    this.validateRole(edge.role, option.skillCheck !== undefined, `option \`${option.id}\``, {
      ...location,
      optionId: option.id,
    });
  }

  private validateRole(role: EdgeRole, checked: boolean, port: string, location: Location): void {
    if (checked && role === 'flow') {
      this.report(
        'error',
        'role-mismatch',
        `Flow edge from checked ${port} — checks route through success/failure`,
        location,
      );
    }

    if (!checked && role !== 'flow') {
      this.report('error', 'role-mismatch', `\`${role}\` edge from ${port} without a check`, location);
    }
  }

  private validateNode(node: DialogNode, dialogue: Dialogue, portRoles: PortRoles, at: Location): void {
    const here = {...at, nodeId: node.id};

    for (const condition of node.conditions ?? []) this.checkExpression(condition, 'condition', here);
    for (const effect of node.effects ?? []) this.checkExpression(effect, 'effect', here);

    if (node.kind === 'jump') {
      this.validateJump(node, dialogue, here);
      return;
    }

    if (node.kind === 'hub') {
      if (!portRoles.has(portKey(node.id))) {
        this.report('warning', 'dead-hub', `Hub \`${node.id}\` has no outgoing edges`, here);
      }

      return;
    }

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

    for (const variant of node.textVariants ?? []) {
      for (const condition of variant.conditions) this.checkExpression(condition, 'condition', here);
    }

    if (node.kind === 'line') {
      this.validateLine(node, portRoles, here);
      return;
    }

    this.validateChoice(node, portRoles, here);
  }

  private validateLine(node: LineNode, portRoles: PortRoles, here: Location): void {
    this.validateStage(node.stage, here);

    if (node.check === undefined) return;

    this.validateCheck(node.check, here);
    this.reportMissingOutcomes(portRoles.get(portKey(node.id)), `line \`${node.id}\``, here);
  }

  private validateChoice(node: ChoiceNode, portRoles: PortRoles, here: Location): void {
    if (node.options.length === 0) {
      this.report('error', 'empty-choice', 'Choice node has no options', here);
      return;
    }

    for (const option of node.options) {
      const location = {...here, optionId: option.id};

      for (const condition of option.conditions ?? []) this.checkExpression(condition, 'condition', location);
      for (const effect of option.effects ?? []) this.checkExpression(effect, 'effect', location);

      if (option.skillCheck !== undefined) this.validateCheck(option.skillCheck, location);

      const roles = portRoles.get(portKey(node.id, option.id));

      if (roles === undefined) {
        this.report('warning', 'dangling-option', `Option \`${option.id}\` has no outgoing edges`, location);
        continue;
      }

      if (option.skillCheck !== undefined) {
        this.reportMissingOutcomes(roles, `option \`${option.id}\``, location);
      }
    }
  }

  private reportMissingOutcomes(roles: Set<EdgeRole> | undefined, port: string, location: Location): void {
    for (const role of ['success', 'failure'] as const) {
      if (roles?.has(role) !== true) {
        this.report('warning', 'missing-outcome', `Checked ${port} has no \`${role}\` edge`, location);
      }
    }
  }

  private validateJump(node: JumpNode, dialogue: Dialogue, here: Location): void {
    const target = node.jumpTarget;

    if (target === undefined) {
      this.report('error', 'broken-jump', `Jump \`${node.id}\` has no target`, here);
      return;
    }

    const {dialogueId, nodeId} = target;

    if (dialogueId !== undefined && dialogueId !== dialogue.id) {
      const nodes = this.dialogueNodeIds.get(dialogueId);

      if (nodes === undefined) {
        this.report('error', 'broken-jump', `Jump \`${node.id}\` targets unknown dialogue \`${dialogueId}\``, here);
      } else if (nodeId !== undefined && !nodes.has(nodeId)) {
        this.report(
          'error',
          'broken-jump',
          `Jump \`${node.id}\` targets missing node \`${nodeId}\` in dialogue \`${dialogueId}\``,
          here,
        );
      }

      return;
    }

    if (nodeId === undefined) {
      this.report('error', 'broken-jump', `Same-dialogue jump \`${node.id}\` must set a target node`, here);
    } else if (this.dialogueNodeIds.get(dialogue.id)?.has(nodeId) !== true) {
      this.report('error', 'broken-jump', `Jump \`${node.id}\` targets missing node \`${nodeId}\``, here);
    }
  }

  private validateStage(stage: Record<string, string> | undefined, location: Location): void {
    for (const [slotId, value] of Object.entries(stage ?? {})) {
      const options = this.stageSlots.get(slotId);

      if (options === undefined) {
        this.report('error', 'unknown-stage-slot', `Unknown stage slot \`${slotId}\``, location);
      } else if (!options.has(value)) {
        this.report('error', 'unknown-stage-slot', `Stage slot \`${slotId}\` has no option \`${value}\``, location);
      }
    }
  }

  private validateCheck(check: SkillCheck, location: Location): void {
    if (!this.variableIds.has(check.skillId)) {
      this.report(
        'error',
        'unknown-skill',
        `Skill check references unknown skill variable \`${check.skillId}\``,
        location,
      );
    }

    for (const modifier of check.modifiers ?? []) {
      this.checkExpression(modifier.condition, 'condition', location);
    }
  }

  private reportUnreachable(dialogue: Dialogue, nodesById: Map<string, DialogNode>): void {
    if (!nodesById.has(dialogue.entryNodeId)) return;

    const reachable = new Set<string>();
    const queue = [dialogue.entryNodeId];

    while (queue.length > 0) {
      const nodeId = queue.pop();

      if (nodeId === undefined || reachable.has(nodeId) || !nodesById.has(nodeId)) continue;

      reachable.add(nodeId);

      for (const edge of dialogue.edges) {
        if (edge.source === nodeId) queue.push(edge.target);
      }

      // Same-dialogue jump targets extend reachability; cross-dialogue targets are sinks here.
      const node = nodesById.get(nodeId);

      if (node?.kind === 'jump' && node.jumpTarget !== undefined) {
        const {dialogueId, nodeId: targetNodeId} = node.jumpTarget;

        if ((dialogueId === undefined || dialogueId === dialogue.id) && targetNodeId !== undefined) {
          queue.push(targetNodeId);
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

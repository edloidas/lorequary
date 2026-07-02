import {evaluateCondition, evaluateEffect, parseCondition, parseEffect} from '@lorequary/parser';

import type {CheckModifier, ChoiceVisibility, DialogNode, Dialogue, ProjectDocument, Variable} from '../schema';
import type {Context, Expr} from '@lorequary/parser';

export type RuntimeValue = string | number | boolean;

export type VariableState = Record<string, RuntimeValue>;

export type CheckMode = 'roll' | 'always_pass' | 'always_fail';

export type PlaythroughOptions = {
  rng?: () => number;
  checkMode?: CheckMode;
};

export type OptionState = ChoiceVisibility;

export type OptionView = {
  optionId: string;
  text: string;
  state: OptionState;
  lockReason?: string;
};

export type LineView = {
  kind: 'line';
  nodeId: string;
  text: string;
  characterId?: string;
};

export type ChoiceView = {
  kind: 'choice';
  nodeId: string;
  text: string;
  characterId?: string;
  options: OptionView[];
};

export type NodeView = LineView | ChoiceView;

export type CheckResult = {
  rolled: number;
  total: number;
  dc: number;
  passed: boolean;
  appliedModifiers: CheckModifier[];
};

export type ChooseResult = {
  check?: CheckResult;
};

export type RuntimeIssue = {
  source: 'condition' | 'effect' | 'modifier';
  expression: string;
  message: string;
  nodeId?: string;
};

type Snapshot = {
  currentNodeId: string | null;
  variables: VariableState;
  seenCounts: Record<string, number>;
  failedRedChecks: string[];
};

const MAX_COMPUTED_DEPTH = 10;
const MAX_SKIP_CHAIN = 1000;

const d6 = (rng: () => number): number => Math.floor(rng() * 6) + 1;

// Conditions parse to a boolean-rooted AST, but computed variables are numeric formulas —
// evaluate the raw expression tree through the effect evaluator instead.
const evaluateNumeric = (expression: Expr, context: Context): unknown => {
  const wrapped = evaluateEffect(
    {
      type: 'Effect',
      assignment: {type: 'Assignment', path: {type: 'Path', value: '__computed'}, op: '=', expr: expression},
    },
    context,
  );

  return wrapped.ok ? wrapped.value.value : undefined;
};

export class Playthrough {
  readonly errors: RuntimeIssue[] = [];

  private readonly nodesById = new Map<string, DialogNode>();
  private readonly variablesById = new Map<string, Variable>();
  private readonly computedByKey = new Map<string, Variable>();
  private readonly rng: () => number;
  private readonly checkMode: CheckMode;

  private state: VariableState = {};
  private seenCounts: Record<string, number> = {};
  private failedRedChecks = new Set<string>();
  private currentNodeId: string | null = null;
  private history: Snapshot[] = [];
  private initial: Snapshot;

  constructor(
    private readonly dialogue: Dialogue,
    variables: Variable[],
    options: PlaythroughOptions = {},
  ) {
    this.rng = options.rng ?? Math.random;
    this.checkMode = options.checkMode ?? 'roll';

    for (const node of dialogue.nodes) this.nodesById.set(node.id, node);
    for (const variable of variables) {
      this.variablesById.set(variable.id, variable);
      if (variable.computed) this.computedByKey.set(variable.key, variable);
      this.state[variable.key] = variable.defaultValue;
    }

    this.moveTo(dialogue.entryNodeId);
    this.initial = this.snapshot();
  }

  get ended(): boolean {
    return this.currentNodeId === null;
  }

  get variables(): Readonly<VariableState> {
    return {...this.state};
  }

  seenCount(nodeId: string): number {
    return this.seenCounts[nodeId] ?? 0;
  }

  current(): NodeView | null {
    if (this.currentNodeId === null) return null;

    const node = this.nodesById.get(this.currentNodeId);
    if (node === undefined) return null;

    const base = {
      nodeId: node.id,
      text: this.resolveText(node),
      ...(node.characterId === undefined ? {} : {characterId: node.characterId}),
    };

    if (node.kind === 'choice') {
      return {kind: 'choice', ...base, options: this.optionViews(node)};
    }

    return {kind: 'line', ...base};
  }

  advance(): void {
    if (this.currentNodeId === null) return;

    const node = this.nodesById.get(this.currentNodeId);
    if (node === undefined || node.kind === 'choice') return;

    this.history.push(this.snapshot());
    this.followEdges(this.currentNodeId);
  }

  choose(optionId: string, opts: {outcome?: 'success' | 'failure'} = {}): ChooseResult {
    const node = this.currentNodeId === null ? undefined : this.nodesById.get(this.currentNodeId);

    if (node === undefined || node.kind !== 'choice') {
      throw new Error('Cannot choose: the current node is not a choice');
    }

    const option = node.options?.find(o => o.id === optionId);

    if (option === undefined) {
      throw new Error(`Unknown option \`${optionId}\``);
    }

    if (this.optionState(node, option.id, option.conditions, option.visibility) !== 'available') {
      throw new Error(`Option \`${optionId}\` is not selectable`);
    }

    this.history.push(this.snapshot());
    this.applyEffects(option.effects, node.id);

    if (option.skillCheck === undefined) {
      this.moveTo(option.targetNodeId);
      return {};
    }

    const check = this.resolveCheck(node.id, option.skillCheck, opts.outcome);

    if (!check.passed && option.skillCheck.checkType === 'red') {
      this.failedRedChecks.add(option.id);
    }

    this.moveTo(check.passed ? option.skillCheck.successTargetId : option.skillCheck.failureTargetId);

    return {check};
  }

  back(): void {
    const previous = this.history.pop();
    if (previous !== undefined) this.restore(previous);
  }

  reset(): void {
    this.restore(this.initial);
    this.history = [];
    this.errors.length = 0;
  }

  //
  // * Movement
  //

  // Walk to the first eligible node starting at nodeId, skipping gated nodes through their edges.
  private moveTo(startNodeId: string): void {
    let nodeId: string | null = startNodeId;

    for (let hops = 0; hops < MAX_SKIP_CHAIN; hops += 1) {
      if (nodeId === null) break;

      const node = this.nodesById.get(nodeId);

      if (node === undefined) {
        this.currentNodeId = null;
        return;
      }

      if (this.isEligible(node)) {
        this.enter(node);
        return;
      }

      nodeId = this.nextTarget(node.id);
    }

    this.currentNodeId = null;
  }

  private followEdges(nodeId: string): void {
    const target = this.nextTarget(nodeId);

    if (target === null) {
      this.currentNodeId = null;
      return;
    }

    this.moveTo(target);
  }

  private nextTarget(nodeId: string): string | null {
    const edges = this.dialogue.edges
      .filter(edge => edge.source === nodeId)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const edge of edges) {
      if (this.evalConditions(edge.conditions, nodeId)) return edge.target;
    }

    return null;
  }

  private isEligible(node: DialogNode): boolean {
    if (node.passiveCheck !== undefined && this.skillValue(node.passiveCheck.skillId) < node.passiveCheck.threshold) {
      return false;
    }

    return this.evalConditions(node.conditions, node.id);
  }

  private enter(node: DialogNode): void {
    this.currentNodeId = node.id;
    this.seenCounts[node.id] = (this.seenCounts[node.id] ?? 0) + 1;
    this.applyEffects(node.effects, node.id);
  }

  //
  // * Views
  //

  private resolveText(node: DialogNode): string {
    for (const variant of node.textVariants ?? []) {
      if (this.evalConditions(variant.conditions, node.id)) return variant.text;
    }

    return node.text;
  }

  private optionViews(node: DialogNode): OptionView[] {
    return (node.options ?? []).map(option => {
      const state = this.optionState(node, option.id, option.conditions, option.visibility);

      return {
        optionId: option.id,
        text: option.text,
        state,
        ...(option.lockReason === undefined ? {} : {lockReason: option.lockReason}),
      };
    });
  }

  private optionState(
    node: DialogNode,
    optionId: string,
    conditions: string[] | undefined,
    visibility: ChoiceVisibility,
  ): OptionState {
    if (this.failedRedChecks.has(optionId)) return 'locked_used';
    if (this.evalConditions(conditions, node.id)) return 'available';

    // The authored visibility describes how the option presents while gated;
    // an ungated presentation with failing conditions falls back to hidden.
    return visibility === 'available' ? 'invisible' : visibility;
  }

  //
  // * Skill checks
  //

  private resolveCheck(
    nodeId: string,
    skillCheck: NonNullable<DialogNode['options']>[number]['skillCheck'] & {},
    forced?: 'success' | 'failure',
  ): CheckResult {
    const appliedModifiers = (skillCheck.modifiers ?? []).filter(modifier => {
      if (this.evalCondition(modifier.condition, nodeId, 'modifier')) return true;
      return false;
    });

    const rolled = d6(this.rng) + d6(this.rng);
    const bonus = appliedModifiers.reduce((sum, modifier) => sum + modifier.bonus, 0);
    const total = rolled + this.skillValue(skillCheck.skillId) + bonus;
    const dc = skillCheck.baseDifficulty;

    let passed: boolean;

    if (forced !== undefined) {
      passed = forced === 'success';
    } else if (this.checkMode === 'always_pass') {
      passed = true;
    } else if (this.checkMode === 'always_fail') {
      passed = false;
    } else if (rolled === 2) {
      passed = false;
    } else if (rolled === 12) {
      passed = true;
    } else {
      passed = total >= dc;
    }

    return {rolled, total, dc, passed, appliedModifiers};
  }

  private skillValue(variableId: string): number {
    const variable = this.variablesById.get(variableId);
    const value = variable === undefined ? undefined : this.resolveValue(variable.key, 0);

    return typeof value === 'number' ? value : 0;
  }

  //
  // * Expressions
  //

  private context(nodeId: string): Context {
    return {
      resolve: path => this.resolveValue(path, 0),
      seenCount: this.seenCounts[nodeId] ?? 0,
    };
  }

  private resolveValue(path: string, depth: number): unknown {
    const computed = this.computedByKey.get(path);

    if (computed?.computed !== undefined && depth < MAX_COMPUTED_DEPTH) {
      const parsed = parseCondition(computed.computed.expression);

      if (parsed.ok) {
        const evaluated = evaluateNumeric(parsed.value.expression, {
          resolve: inner => this.resolveValue(inner, depth + 1),
          seenCount: 0,
        });

        if (evaluated !== undefined) return evaluated;
      }
    }

    return this.state[path];
  }

  private evalConditions(conditions: string[] | undefined, nodeId: string): boolean {
    return (conditions ?? []).every(condition => this.evalCondition(condition, nodeId, 'condition'));
  }

  private evalCondition(expression: string, nodeId: string, source: 'condition' | 'modifier'): boolean {
    const parsed = parseCondition(expression);

    if (!parsed.ok) {
      this.errors.push({source, expression, message: parsed.error.message, nodeId});
      return false;
    }

    const result = evaluateCondition(parsed.value, this.context(nodeId));

    if (!result.ok) {
      this.errors.push({source, expression, message: result.error.message, nodeId});
      return false;
    }

    return result.value;
  }

  private applyEffects(effects: string[] | undefined, nodeId: string): void {
    for (const expression of effects ?? []) {
      const parsed = parseEffect(expression);

      if (!parsed.ok) {
        this.errors.push({source: 'effect', expression, message: parsed.error.message, nodeId});
        continue;
      }

      const result = evaluateEffect(parsed.value, this.context(nodeId));

      if (!result.ok) {
        this.errors.push({source: 'effect', expression, message: result.error.message, nodeId});
        continue;
      }

      const {path, value} = result.value;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        this.state[path] = value;
      } else {
        this.errors.push({source: 'effect', expression, message: 'Effect produced a non-primitive value', nodeId});
      }
    }
  }

  //
  // * Snapshots
  //

  private snapshot(): Snapshot {
    return {
      currentNodeId: this.currentNodeId,
      variables: {...this.state},
      seenCounts: {...this.seenCounts},
      failedRedChecks: [...this.failedRedChecks],
    };
  }

  private restore(snapshot: Snapshot): void {
    this.currentNodeId = snapshot.currentNodeId;
    this.state = {...snapshot.variables};
    this.seenCounts = {...snapshot.seenCounts};
    this.failedRedChecks = new Set(snapshot.failedRedChecks);
  }
}

export const startPlaythrough = (
  project: ProjectDocument,
  dialogueId: string,
  options?: PlaythroughOptions,
): Playthrough => {
  const dialogue = project.dialogues.find(d => d.id === dialogueId);

  if (dialogue === undefined) {
    throw new Error(`Unknown dialogue \`${dialogueId}\``);
  }

  return new Playthrough(dialogue, project.variables, options);
};

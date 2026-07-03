import {evaluateCondition, evaluateEffect, parseCondition, parseEffect} from '@lorequary/parser';

import type {
  CheckModifier,
  CheckRollSettings,
  ChoiceNode,
  ChoiceVisibility,
  DialogNode,
  Dialogue,
  EdgeRole,
  JumpTarget,
  LineNode,
  ProjectDocument,
  SkillCheck,
  Variable,
} from '../schema';
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
  // Entry check resolved when the line was shown.
  check?: CheckResult;
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
  // The option's spokenText, emitted as a player line after selection.
  spoken?: string;
};

export type RuntimeIssue = {
  source: 'condition' | 'effect' | 'modifier';
  expression: string;
  message: string;
  nodeId?: string;
};

type Snapshot = {
  dialogueId: string;
  currentNodeId: string | null;
  variables: VariableState;
  seenCounts: Record<string, number>;
  failedRedChecks: string[];
  entryChecks: Record<string, CheckResult>;
};

// A routing port: edges leave a node (optionally a specific option) with a role.
type Port = {
  nodeId: string;
  sourceOption?: string;
  role: EdgeRole;
};

const MAX_COMPUTED_DEPTH = 10;
const MAX_SKIP_CHAIN = 1000;

const die = (rng: () => number, sides: number): number => Math.floor(rng() * sides) + 1;

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

  private readonly dialoguesById = new Map<string, Dialogue>();
  private readonly nodesByDialogue = new Map<string, Map<string, DialogNode>>();
  private readonly variablesById = new Map<string, Variable>();
  private readonly computedByKey = new Map<string, Variable>();
  private readonly rng: () => number;
  private readonly checkMode: CheckMode;
  private readonly checkRoll: CheckRollSettings | undefined;

  private dialogueId: string;
  private state: VariableState = {};
  private seenCounts: Record<string, number> = {};
  private failedRedChecks = new Set<string>();
  // Resolved entry checks by node id: red results stick, white ones are re-rolled per visit.
  private entryChecks = new Map<string, CheckResult>();
  private currentNodeId: string | null = null;
  private history: Snapshot[] = [];
  private initial: Snapshot;

  constructor(project: ProjectDocument, dialogueId: string, options: PlaythroughOptions = {}) {
    const dialogue = project.dialogues.find(d => d.id === dialogueId);

    if (dialogue === undefined) {
      throw new Error(`Unknown dialogue \`${dialogueId}\``);
    }

    this.rng = options.rng ?? Math.random;
    this.checkMode = options.checkMode ?? 'roll';
    this.checkRoll = project.settings.checkRoll;
    this.dialogueId = dialogue.id;

    for (const each of project.dialogues) {
      this.dialoguesById.set(each.id, each);
      this.nodesByDialogue.set(each.id, new Map(each.nodes.map(node => [node.id, node])));
    }

    for (const variable of project.variables) {
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

  get activeDialogueId(): string {
    return this.dialogueId;
  }

  get variables(): Readonly<VariableState> {
    return {...this.state};
  }

  seenCount(nodeId: string): number {
    return this.seenCounts[nodeId] ?? 0;
  }

  current(): NodeView | null {
    if (this.currentNodeId === null) return null;

    const node = this.node(this.currentNodeId);

    // Hubs and jumps pass through in moveTo and are never the resting node.
    if (node === undefined || node.kind === 'hub' || node.kind === 'jump') return null;

    const base = {
      nodeId: node.id,
      ...(node.characterId === undefined ? {} : {characterId: node.characterId}),
    };

    if (node.kind === 'choice') {
      return {kind: 'choice', ...base, text: this.resolveText(node), options: this.optionViews(node)};
    }

    const check = node.check === undefined ? undefined : this.entryChecks.get(node.id);

    // Text variants apply to the success text; a failed entry check shows failureText.
    const text = check?.passed === false ? (node.failureText ?? node.text) : this.resolveText(node);

    return {kind: 'line', ...base, text, ...(check === undefined ? {} : {check})};
  }

  // Stage state for the current node: dialogue defaults overridden per slot by the line.
  currentStage(): Record<string, string> {
    const dialogue = this.dialoguesById.get(this.dialogueId);
    const node = this.currentNodeId === null ? undefined : this.node(this.currentNodeId);
    const overrides = node?.kind === 'line' ? node.stage : undefined;

    return {...dialogue?.stageDefaults, ...overrides};
  }

  advance(): void {
    if (this.currentNodeId === null) return;

    const node = this.node(this.currentNodeId);
    if (node === undefined || node.kind === 'choice') return;

    this.history.push(this.snapshot());

    // A checked line routes from the outcome port of its resolved entry check.
    let role: EdgeRole = 'flow';

    if (node.kind === 'line' && node.check !== undefined) {
      role = this.entryChecks.get(node.id)?.passed === false ? 'failure' : 'success';
    }

    this.routeFrom({nodeId: node.id, role});
  }

  choose(optionId: string, opts: {outcome?: 'success' | 'failure'} = {}): ChooseResult {
    const node = this.currentNodeId === null ? undefined : this.node(this.currentNodeId);

    if (node === undefined || node.kind !== 'choice') {
      throw new Error('Cannot choose: the current node is not a choice');
    }

    const option = node.options.find(o => o.id === optionId);

    if (option === undefined) {
      throw new Error(`Unknown option \`${optionId}\``);
    }

    if (this.optionState(node, option.id, option.conditions, option.visibility) !== 'available') {
      throw new Error(`Option \`${optionId}\` is not selectable`);
    }

    this.history.push(this.snapshot());
    this.applyEffects(option.effects, node.id);

    const spoken = option.spokenText === undefined ? {} : {spoken: option.spokenText};

    if (option.skillCheck === undefined) {
      this.routeFrom({nodeId: node.id, sourceOption: option.id, role: 'flow'});
      return {...spoken};
    }

    const check = this.resolveCheck(node.id, option.skillCheck, opts.outcome);

    if (!check.passed && option.skillCheck.checkType === 'red') {
      this.failedRedChecks.add(option.id);
    }

    this.routeFrom({nodeId: node.id, sourceOption: option.id, role: check.passed ? 'success' : 'failure'});

    return {check, ...spoken};
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

  private node(nodeId: string): DialogNode | undefined {
    return this.nodesByDialogue.get(this.dialogueId)?.get(nodeId);
  }

  private edges(): Dialogue['edges'] {
    return this.dialoguesById.get(this.dialogueId)?.edges ?? [];
  }

  // Walk to the first eligible line/choice starting at nodeId. Gated nodes are skipped
  // through their ports; hubs pass through applying effects; jumps follow their target.
  private moveTo(startNodeId: string): void {
    let nodeId: string | null = startNodeId;

    for (let hops = 0; hops < MAX_SKIP_CHAIN; hops += 1) {
      if (nodeId === null) break;

      const node = this.node(nodeId);

      if (node === undefined) {
        this.currentNodeId = null;
        return;
      }

      if (node.kind === 'jump') {
        nodeId = this.followJump(node.jumpTarget);
        continue;
      }

      const eligible = this.isEligible(node);

      if (node.kind === 'hub') {
        if (eligible) {
          this.seenCounts[node.id] = (this.seenCounts[node.id] ?? 0) + 1;
          this.applyEffects(node.effects, node.id);
        }

        nodeId = this.nextTarget({nodeId: node.id, role: 'flow'});
        continue;
      }

      if (eligible) {
        this.enter(node);
        return;
      }

      // A skipped checked line does not roll — it passes through its success port.
      const role: EdgeRole = node.kind === 'line' && node.check !== undefined ? 'success' : 'flow';

      nodeId = this.nextTarget({nodeId: node.id, role});
    }

    this.currentNodeId = null;
  }

  // Same-dialogue jumps move within the graph; cross-dialogue jumps switch the active
  // dialogue while variables, seen counts, and check results persist.
  private followJump(target: JumpTarget | undefined): string | null {
    if (target === undefined) return null;

    if (target.dialogueId === undefined || target.dialogueId === this.dialogueId) {
      return target.nodeId ?? null;
    }

    const dialogue = this.dialoguesById.get(target.dialogueId);

    if (dialogue === undefined) return null;

    this.dialogueId = dialogue.id;

    return target.nodeId ?? dialogue.entryNodeId;
  }

  private routeFrom(port: Port): void {
    const target = this.nextTarget(port);

    if (target === null) {
      this.currentNodeId = null;
      return;
    }

    this.moveTo(target);
  }

  // The routing primitive: priority-sorted edges of a port, first edge whose
  // conditions pass wins; the winning edge's effects apply on traversal.
  private nextTarget(port: Port): string | null {
    const edges = this.edges()
      .filter(edge => edge.source === port.nodeId && edge.sourceOption === port.sourceOption && edge.role === port.role)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const edge of edges) {
      if (this.evalConditions(edge.conditions, port.nodeId)) {
        this.applyEffects(edge.effects, port.nodeId);
        return edge.target;
      }
    }

    return null;
  }

  private isEligible(node: DialogNode): boolean {
    if (node.kind !== 'hub' && node.kind !== 'jump' && node.passiveCheck !== undefined) {
      const {skillId, threshold, mode} = node.passiveCheck;
      const value = this.skillValue(skillId);
      const passed = mode === 'below' ? value < threshold : value >= threshold;

      if (!passed) return false;
    }

    return this.evalConditions(node.conditions, node.id);
  }

  private enter(node: DialogNode): void {
    this.currentNodeId = node.id;
    this.seenCounts[node.id] = (this.seenCounts[node.id] ?? 0) + 1;
    this.applyEffects(node.effects, node.id);

    if (node.kind === 'line' && node.check !== undefined) {
      this.resolveEntryCheck(node);
    }
  }

  // Entry checks roll when the line is shown: white re-rolls on every visit,
  // red rolls once per playthrough and the result sticks on revisit.
  private resolveEntryCheck(node: LineNode): void {
    const check = node.check;

    if (check === undefined) return;
    if (check.checkType === 'red' && this.entryChecks.has(node.id)) return;

    this.entryChecks.set(node.id, this.resolveCheck(node.id, check));
  }

  //
  // * Views
  //

  private resolveText(node: LineNode | ChoiceNode): string {
    for (const variant of node.textVariants ?? []) {
      if (this.evalConditions(variant.conditions, node.id)) return variant.text;
    }

    return node.text;
  }

  private optionViews(node: ChoiceNode): OptionView[] {
    return node.options.map(option => {
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

  private roll(): number {
    if (this.checkRoll?.formula === '1d20') return die(this.rng, 20);

    return die(this.rng, 6) + die(this.rng, 6);
  }

  private rollBounds(): {min: number; max: number} {
    return this.checkRoll?.formula === '1d20' ? {min: 1, max: 20} : {min: 2, max: 12};
  }

  private resolveCheck(nodeId: string, skillCheck: SkillCheck, forced?: 'success' | 'failure'): CheckResult {
    const appliedModifiers = (skillCheck.modifiers ?? []).filter(modifier =>
      this.evalCondition(modifier.condition, nodeId, 'modifier'),
    );

    const rolled = this.roll();
    const bonus = appliedModifiers.reduce((sum, modifier) => sum + modifier.bonus, 0);
    const total = rolled + this.skillValue(skillCheck.skillId) + bonus;
    const dc = skillCheck.baseDifficulty;
    const {min, max} = this.rollBounds();

    let passed: boolean;

    if (forced !== undefined) {
      passed = forced === 'success';
    } else if (this.checkMode === 'always_pass') {
      passed = true;
    } else if (this.checkMode === 'always_fail') {
      passed = false;
    } else if (rolled === min && (this.checkRoll?.critFail ?? true)) {
      passed = false;
    } else if (rolled === max && (this.checkRoll?.critSuccess ?? true)) {
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
      dialogueId: this.dialogueId,
      currentNodeId: this.currentNodeId,
      variables: {...this.state},
      seenCounts: {...this.seenCounts},
      failedRedChecks: [...this.failedRedChecks],
      entryChecks: Object.fromEntries(this.entryChecks),
    };
  }

  private restore(snapshot: Snapshot): void {
    this.dialogueId = snapshot.dialogueId;
    this.currentNodeId = snapshot.currentNodeId;
    this.state = {...snapshot.variables};
    this.seenCounts = {...snapshot.seenCounts};
    this.failedRedChecks = new Set(snapshot.failedRedChecks);
    this.entryChecks = new Map(Object.entries(snapshot.entryChecks));
  }
}

export const startPlaythrough = (
  project: ProjectDocument,
  dialogueId: string,
  options?: PlaythroughOptions,
): Playthrough => new Playthrough(project, dialogueId, options);

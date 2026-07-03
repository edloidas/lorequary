export const SCHEMA_VERSION = 1;

//
// * Project
//

export type ProjectDocument = {
  schemaVersion: number;
  meta: ProjectMeta;
  settings: ProjectSettings;
  characters: Character[];
  variables: Variable[];
  dialogues: Dialogue[];
};

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSettings = {
  customCharacterFields?: FieldDefinition[];
  stageSlots?: StageSlot[];
  expressionSlots?: ExpressionSlot[];
  checkRoll?: CheckRollSettings;
};

export type FieldDefinition = {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  defaultValue?: string | number | boolean;
};

// Presentation slots (place, music, visual) with author-defined values.
// Dialogues set per-slot defaults; line nodes override per slot.
export type StageSlot = {
  id: string;
  name: string;
  options: string[];
};

// Per-character presentation slots (emotion, pose, outfit) selected per line node.
export type ExpressionSlot = {
  id: string;
  name: string;
  options: string[];
};

export type CheckRollSettings = {
  formula: '2d6' | '1d20';
  critFail?: boolean;
  critSuccess?: boolean;
};

//
// * Characters
//

export type CharacterType = 'character' | 'player' | 'skill_voice' | 'narrator';

export type Character = {
  id: string;
  name: string;
  displayName: string;
  type: CharacterType;
  color: string;
  portraitUrl?: string;
  spriteUrl?: string;
  expressions?: Expression[];
  skillId?: string;
  customFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type Expression = {
  id: string;
  name: string;
  portraitUrl?: string;
  spriteUrl?: string;
};

//
// * Variables
//

export type VariableType = 'string' | 'number' | 'boolean' | 'enum';

export type Variable = {
  id: string;
  name: string;
  key: string;
  type: VariableType;
  defaultValue: string | number | boolean;
  enumValues?: string[];
  description?: string;
  group?: string;
  computed?: ComputedExpression;
};

export type ComputedExpression = {
  expression: string;
  dependencies: string[];
};

//
// * Dialogues
//

export type Dialogue = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  entryNodeId: string;
  stageDefaults?: Record<string, string>;
  nodes: DialogNode[];
  edges: DialogEdge[];
  editor: DialogueEditorState;
};

export type DialogueEditorState = {
  nodePositions: Record<string, {x: number; y: number}>;
  nodeSizes?: Record<string, {width: number; height: number}>;
  nodeZIndices?: Record<string, number>;
  viewport?: Viewport;
  groups?: NodeGroup[];
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type NodeGroup = {
  id: string;
  name: string;
  nodeIds: string[];
  color?: string;
  collapsed: boolean;
};

//
// * Nodes
//

export type NodeKind = 'line' | 'choice' | 'hub' | 'jump';

// Conditions and effects are expression strings parsed by @lorequary/parser.
// A conditions array is implicitly AND-ed.
type NodeBase = {
  id: string;
  conditions?: string[];
  effects?: string[];
  metadata?: Record<string, unknown>;
};

type ContentNode = NodeBase & {
  characterId?: string;
  text: string;
  textVariants?: TextVariant[];
  lineKey?: string;
  passiveCheck?: PassiveCheck;
};

export type LineNode = ContentNode & {
  kind: 'line';
  // Entry check: rolls when the line is shown; text (success) or failureText (failure).
  check?: SkillCheck;
  failureText?: string;
  stage?: Record<string, string>;
  expression?: Record<string, string>;
};

export type ChoiceNode = ContentNode & {
  kind: 'choice';
  options: ChoiceOption[];
};

// Invisible junction: no content, applies effects and routes onward on pass-through.
export type HubNode = NodeBase & {
  kind: 'hub';
};

// Go-to reference: no outgoing edges, the target is the reference.
export type JumpNode = NodeBase & {
  kind: 'jump';
  jumpTarget?: JumpTarget;
};

export type DialogNode = LineNode | ChoiceNode | HubNode | JumpNode;

export type JumpTarget = {
  dialogueId?: string;
  nodeId?: string;
};

export type TextVariant = {
  id: string;
  conditions: string[];
  text: string;
  lineKey?: string;
};

export type PassiveCheck = {
  skillId: string;
  threshold: number;
  mode?: 'atLeast' | 'below';
};

//
// * Choice Options
//

export type ChoiceVisibility = 'available' | 'locked_visible' | 'locked_hidden' | 'locked_used' | 'invisible';

export type ChoiceOption = {
  id: string;
  text: string;
  spokenText?: string;
  lineKey?: string;
  conditions?: string[];
  visibility: ChoiceVisibility;
  lockReason?: string;
  skillCheck?: SkillCheck;
  effects?: string[];
};

export type SkillCheck = {
  skillId: string;
  baseDifficulty: number;
  checkType: 'white' | 'red';
  modifiers?: CheckModifier[];
};

export type CheckModifier = {
  id: string;
  condition: string;
  bonus: number;
  description: string;
};

//
// * Edges
//

// Every connection is a persisted edge leaving a port: (source, sourceOption?, role).
// Routing sorts a port's edges by priority and takes the first whose conditions pass.
export type EdgeRole = 'flow' | 'success' | 'failure';

export type DialogEdge = {
  id: string;
  source: string;
  sourceOption?: string;
  role: EdgeRole;
  target: string;
  conditions?: string[];
  effects?: string[];
  priority?: number;
  label?: string;
};

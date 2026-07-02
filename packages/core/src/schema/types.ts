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
};

export type FieldDefinition = {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  defaultValue?: string | number | boolean;
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

export type NodeKind = 'line' | 'choice';

// Conditions and effects are expression strings parsed by @lorequary/parser.
// A conditions array is implicitly AND-ed.
export type DialogNode = {
  id: string;
  kind: NodeKind;
  characterId?: string;
  expressionId?: string;
  text: string;
  textVariants?: TextVariant[];
  lineKey?: string;
  passiveCheck?: PassiveCheck;
  conditions?: string[];
  effects?: string[];
  options?: ChoiceOption[];
  metadata?: Record<string, unknown>;
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
};

//
// * Choice Options
//

export type ChoiceVisibility = 'available' | 'locked_visible' | 'locked_hidden' | 'locked_used' | 'invisible';

export type ChoiceOption = {
  id: string;
  text: string;
  lineKey?: string;
  targetNodeId: string;
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
  successTargetId: string;
  failureTargetId: string;
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

export type DialogEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  conditions?: string[];
  priority?: number;
};

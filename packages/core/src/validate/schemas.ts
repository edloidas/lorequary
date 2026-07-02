import {z} from 'zod';

const zPosition = z.object({x: z.number(), y: z.number()});
const zSize = z.object({width: z.number(), height: z.number()});

export const zProjectMeta = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const zFieldDefinition = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const zProjectSettings = z.object({
  customCharacterFields: z.array(zFieldDefinition).optional(),
});

export const zExpression = z.object({
  id: z.string(),
  name: z.string(),
  portraitUrl: z.string().optional(),
  spriteUrl: z.string().optional(),
});

export const zCharacter = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  type: z.enum(['character', 'player', 'skill_voice', 'narrator']),
  color: z.string(),
  portraitUrl: z.string().optional(),
  spriteUrl: z.string().optional(),
  expressions: z.array(zExpression).optional(),
  skillId: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const zComputedExpression = z.object({
  expression: z.string(),
  dependencies: z.array(z.string()),
});

export const zVariable = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  computed: zComputedExpression.optional(),
});

export const zTextVariant = z.object({
  id: z.string(),
  conditions: z.array(z.string()),
  text: z.string(),
  lineKey: z.string().optional(),
});

export const zPassiveCheck = z.object({
  skillId: z.string(),
  threshold: z.number(),
});

export const zCheckModifier = z.object({
  id: z.string(),
  condition: z.string(),
  bonus: z.number(),
  description: z.string(),
});

export const zSkillCheck = z.object({
  skillId: z.string(),
  baseDifficulty: z.number(),
  checkType: z.enum(['white', 'red']),
  modifiers: z.array(zCheckModifier).optional(),
  successTargetId: z.string(),
  failureTargetId: z.string(),
});

export const zChoiceOption = z.object({
  id: z.string(),
  text: z.string(),
  lineKey: z.string().optional(),
  targetNodeId: z.string(),
  conditions: z.array(z.string()).optional(),
  visibility: z.enum(['available', 'locked_visible', 'locked_hidden', 'locked_used', 'invisible']),
  lockReason: z.string().optional(),
  skillCheck: zSkillCheck.optional(),
  effects: z.array(z.string()).optional(),
});

export const zDialogNode = z.object({
  id: z.string(),
  kind: z.enum(['line', 'choice']),
  characterId: z.string().optional(),
  expressionId: z.string().optional(),
  text: z.string(),
  textVariants: z.array(zTextVariant).optional(),
  lineKey: z.string().optional(),
  passiveCheck: zPassiveCheck.optional(),
  conditions: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(),
  options: z.array(zChoiceOption).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const zDialogEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  priority: z.number().optional(),
});

export const zNodeGroup = z.object({
  id: z.string(),
  name: z.string(),
  nodeIds: z.array(z.string()),
  color: z.string().optional(),
  collapsed: z.boolean(),
});

export const zViewport = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const zDialogueEditorState = z.object({
  nodePositions: z.record(zPosition),
  nodeSizes: z.record(zSize).optional(),
  nodeZIndices: z.record(z.number()).optional(),
  viewport: zViewport.optional(),
  groups: z.array(zNodeGroup).optional(),
});

export const zDialogue = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  entryNodeId: z.string(),
  nodes: z.array(zDialogNode),
  edges: z.array(zDialogEdge),
  editor: zDialogueEditorState,
});

export const zProjectDocument = z.object({
  schemaVersion: z.number().int().positive(),
  meta: zProjectMeta,
  settings: zProjectSettings,
  characters: z.array(zCharacter),
  variables: z.array(zVariable),
  dialogues: z.array(zDialogue),
});

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

const zSlot = z.object({
  id: z.string(),
  name: z.string(),
  options: z.array(z.string()),
});

export const zStageSlot = zSlot;
export const zExpressionSlot = zSlot;

export const zCheckRollSettings = z.object({
  formula: z.enum(['2d6', '1d20']),
  critFail: z.boolean().optional(),
  critSuccess: z.boolean().optional(),
});

export const zProjectSettings = z.object({
  customCharacterFields: z.array(zFieldDefinition).optional(),
  stageSlots: z.array(zStageSlot).optional(),
  expressionSlots: z.array(zExpressionSlot).optional(),
  checkRoll: zCheckRollSettings.optional(),
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
  mode: z.enum(['atLeast', 'below']).optional(),
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
});

export const zChoiceOption = z.object({
  id: z.string(),
  text: z.string(),
  spokenText: z.string().optional(),
  lineKey: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  visibility: z.enum(['available', 'locked_visible', 'locked_hidden', 'locked_used', 'invisible']),
  lockReason: z.string().optional(),
  skillCheck: zSkillCheck.optional(),
  effects: z.array(z.string()).optional(),
});

export const zJumpTarget = z
  .object({
    dialogueId: z.string().optional(),
    nodeId: z.string().optional(),
  })
  .refine(target => target.dialogueId !== undefined || target.nodeId !== undefined, {
    message: 'Jump target must set dialogueId or nodeId',
  });

const zNodeBase = {
  id: z.string(),
  conditions: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
};

const zContentNode = {
  ...zNodeBase,
  characterId: z.string().optional(),
  text: z.string(),
  textVariants: z.array(zTextVariant).optional(),
  lineKey: z.string().optional(),
  passiveCheck: zPassiveCheck.optional(),
};

export const zLineNode = z.object({
  ...zContentNode,
  kind: z.literal('line'),
  check: zSkillCheck.optional(),
  failureText: z.string().optional(),
  stage: z.record(z.string()).optional(),
  expression: z.record(z.string()).optional(),
});

export const zChoiceNode = z.object({
  ...zContentNode,
  kind: z.literal('choice'),
  options: z.array(zChoiceOption),
});

export const zHubNode = z.object({
  ...zNodeBase,
  kind: z.literal('hub'),
});

export const zJumpNode = z.object({
  ...zNodeBase,
  kind: z.literal('jump'),
  jumpTarget: zJumpTarget.optional(),
});

export const zDialogNode = z.discriminatedUnion('kind', [zLineNode, zChoiceNode, zHubNode, zJumpNode]);

export const zDialogEdge = z.object({
  id: z.string(),
  source: z.string(),
  sourceOption: z.string().optional(),
  role: z.enum(['flow', 'success', 'failure']),
  target: z.string(),
  conditions: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(),
  priority: z.number().optional(),
  label: z.string().optional(),
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
  stageDefaults: z.record(z.string()).optional(),
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

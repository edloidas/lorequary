// Localization key builders. Keys are generated on creation and stay stable through edits.

export const nodeTextKey = (dialogueId: string, nodeId: string): string => `${dialogueId}.${nodeId}.text`;

export const failureTextKey = (dialogueId: string, nodeId: string): string => `${dialogueId}.${nodeId}.failureText`;

export const variantKey = (dialogueId: string, nodeId: string, variantId: string): string =>
  `${dialogueId}.${nodeId}.variant.${variantId}`;

export const optionKey = (dialogueId: string, nodeId: string, optionId: string): string =>
  `${dialogueId}.${nodeId}.option.${optionId}`;

export const optionSpokenKey = (dialogueId: string, nodeId: string, optionId: string): string =>
  `${optionKey(dialogueId, nodeId, optionId)}.spoken`;

export const lockReasonKey = (dialogueId: string, nodeId: string, optionId: string): string =>
  `${optionKey(dialogueId, nodeId, optionId)}.lock`;

export const modifierKey = (dialogueId: string, nodeId: string, optionId: string, modifierId: string): string =>
  `${optionKey(dialogueId, nodeId, optionId)}.mod.${modifierId}`;

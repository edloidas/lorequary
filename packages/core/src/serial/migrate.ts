// One-way migration of raw (pre-Zod) project JSON to the current schema version.
// Version 1 → 2: the edge-port model — every connection becomes a persisted edge.

export type MigrationResult = {
  data: unknown;
  notes: string[];
  changed: boolean;
};

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

const asObjArray = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObj) : []);

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

const uniqueEdgeId = (base: string, used: Set<string>): string => {
  let id = base;
  let counter = 2;

  while (used.has(id)) {
    id = `${base}_${counter}`;
    counter += 1;
  }

  used.add(id);

  return id;
};

const migrateDialogue = (dialogue: Obj, expressionSlotId: string | undefined, notes: string[]): void => {
  const dialogueId = nonEmptyString(dialogue.id) ? dialogue.id : '?';
  const nodes = asObjArray(dialogue.nodes);
  const edges = asObjArray(dialogue.edges);

  const optionIdsByNode = new Map<string, Set<string>>();

  for (const node of nodes) {
    if (!nonEmptyString(node.id)) continue;

    const optionIds = new Set(
      asObjArray(node.options)
        .map(option => option.id)
        .filter(nonEmptyString),
    );

    optionIdsByNode.set(node.id, optionIds);
  }

  const usedEdgeIds = new Set(edges.map(edge => edge.id).filter(nonEmptyString));

  // 1. Existing edges: role 'flow'; sourceHandle becomes sourceOption when it
  //    matches an option on the source node; targetHandle is dropped.
  const flowEdgeByPort = new Map<string, Obj>();

  for (const edge of edges) {
    const handle = edge.sourceHandle;

    delete edge.sourceHandle;
    delete edge.targetHandle;
    edge.role = 'flow';

    if (nonEmptyString(handle)) {
      const source = nonEmptyString(edge.source) ? edge.source : '';

      if (optionIdsByNode.get(source)?.has(handle) === true) {
        edge.sourceOption = handle;
        flowEdgeByPort.set(`${source}|${handle}`, edge);
      } else {
        notes.push(`${dialogueId}: edge \`${String(edge.id)}\` had a stale source handle \`${handle}\` — dropped it`);
      }
    }
  }

  // 2. Option targets and check outcome targets become edges; embedded fields drop.
  for (const node of nodes) {
    if (!nonEmptyString(node.id)) continue;

    for (const option of asObjArray(node.options)) {
      if (!nonEmptyString(option.id)) continue;

      const target = option.targetNodeId;

      delete option.targetNodeId;

      if (nonEmptyString(target)) {
        const existing = flowEdgeByPort.get(`${node.id}|${option.id}`);

        if (existing === undefined) {
          edges.push({
            id: uniqueEdgeId(`e_${node.id}_${option.id}`, usedEdgeIds),
            source: node.id,
            sourceOption: option.id,
            role: 'flow',
            target,
          });
        } else if (existing.target !== target) {
          notes.push(
            `${dialogueId}/${node.id}/${option.id}: option target \`${target}\` disagreed with edge ` +
              `\`${String(existing.id)}\` — kept the edge`,
          );
        }
      }

      const check = option.skillCheck;

      if (isObj(check)) {
        for (const [field, role] of [
          ['successTargetId', 'success'],
          ['failureTargetId', 'failure'],
        ] as const) {
          const outcomeTarget = check[field];

          delete check[field];

          if (nonEmptyString(outcomeTarget)) {
            edges.push({
              id: uniqueEdgeId(`e_${node.id}_${option.id}_${role}`, usedEdgeIds),
              source: node.id,
              sourceOption: option.id,
              role,
              target: outcomeTarget,
            });
          }
        }
      }
    }

    // 3. Single expressionId becomes a slot selection when slots exist, else drops.
    const expressionId = node.expressionId;

    delete node.expressionId;

    if (nonEmptyString(expressionId)) {
      if (expressionSlotId === undefined) {
        notes.push(
          `${dialogueId}/${node.id}: expression \`${expressionId}\` dropped — the project defines no expression slots`,
        );
      } else {
        node.expression = {[expressionSlotId]: expressionId};
      }
    }
  }

  dialogue.edges = edges;
};

export const migrateProjectData = (data: unknown): MigrationResult => {
  if (!isObj(data) || data.schemaVersion !== 1) {
    return {data, notes: [], changed: false};
  }

  const doc = structuredClone(data);
  const notes: string[] = [];
  const settings = isObj(doc.settings) ? doc.settings : {};
  const expressionSlotId = asObjArray(settings.expressionSlots)
    .map(slot => slot.id)
    .find(nonEmptyString);

  for (const dialogue of asObjArray(doc.dialogues)) {
    migrateDialogue(dialogue, expressionSlotId, notes);
  }

  doc.schemaVersion = 2;

  return {data: doc, notes, changed: true};
};

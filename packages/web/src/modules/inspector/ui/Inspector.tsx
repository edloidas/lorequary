import {optionKey} from '@lorequary/core';
import {useStore} from '@nanostores/react';
import {nanoid} from 'nanoid';

import {$numericVariables, $variableSchema} from '@/modules/project/model/derived';
import {$project} from '@/modules/project/model/store';
import {
  addEdge,
  deleteEdges,
  deleteNodes,
  renameDialogue,
  runCommand,
  setEntryNode,
  updateNode,
} from '@/modules/workspace/model/commands';
import {$currentDialogue, $selection, clearSelection} from '@/modules/workspace/model/store';
import {ExpressionInput} from '@/shared/ui/ExpressionInput';
import {Field, NumberInput, Select, SmallButton, TextArea, TextInput} from '@/shared/ui/fields';

import type {
  CheckModifier,
  ChoiceOption,
  DialogNode,
  Dialogue,
  ProjectDocument,
  SkillCheck,
  TextVariant,
} from '@lorequary/core';
import type {VariableSchema} from '@lorequary/parser';
import type {ReactElement} from 'react';

const NONE = '__none__';

const nodeLabel = (node: DialogNode): string => {
  const text = node.text.trim();

  return `${node.kind === 'choice' ? '◆' : '▸'} ${text === '' ? node.id : text.slice(0, 32)}`;
};

type PatchNode = (patch: Partial<DialogNode>) => void;

//
// * Expression lists
//

const ExpressionList = ({
  label,
  items,
  mode,
  schema,
  onChange,
}: {
  label: string;
  items: string[];
  mode: 'condition' | 'effect';
  schema: VariableSchema;
  onChange: (next: string[]) => void;
}): ReactElement => (
  <Field label={label}>
    <div className='flex flex-col gap-1'>
      {items.map((item, index) => (
        // Index keys are safe here: rows are edited in place, not reordered.
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className='flex items-start gap-1'>
          <div className='flex-1'>
            <ExpressionInput
              value={item}
              mode={mode}
              schema={schema}
              placeholder={mode === 'condition' ? 'hero.money > 50' : 'hero.money += 10'}
              onCommit={next => onChange(items.map((existing, i) => (i === index ? next : existing)))}
            />
          </div>
          <SmallButton danger onClick={() => onChange(items.filter((_, i) => i !== index))}>
            ×
          </SmallButton>
        </div>
      ))}
      <SmallButton onClick={() => onChange([...items, ''])}>+ Add {mode}</SmallButton>
    </div>
  </Field>
);

ExpressionList.displayName = 'ExpressionList';

//
// * Text variants
//

const VariantsEditor = ({
  variants,
  schema,
  onChange,
}: {
  variants: TextVariant[];
  schema: VariableSchema;
  onChange: (next: TextVariant[]) => void;
}): ReactElement => (
  <Field label='Text variants'>
    <div className='flex flex-col gap-2'>
      {variants.map(variant => (
        <div key={variant.id} className='flex flex-col gap-1 rounded border border-ink-800 p-2'>
          <ExpressionInput
            value={variant.conditions[0] ?? ''}
            mode='condition'
            schema={schema}
            placeholder='when…'
            onCommit={next =>
              onChange(variants.map(v => (v.id === variant.id ? {...v, conditions: next === '' ? [] : [next]} : v)))
            }
          />
          <TextArea
            value={variant.text}
            rows={2}
            placeholder='Variant text'
            onCommit={next => onChange(variants.map(v => (v.id === variant.id ? {...v, text: next} : v)))}
          />
          <SmallButton danger onClick={() => onChange(variants.filter(v => v.id !== variant.id))}>
            Remove variant
          </SmallButton>
        </div>
      ))}
      <SmallButton onClick={() => onChange([...variants, {id: nanoid(8), conditions: [], text: ''}])}>
        + Add variant
      </SmallButton>
    </div>
  </Field>
);

VariantsEditor.displayName = 'VariantsEditor';

//
// * Skill check
//

const SkillCheckEditor = ({
  check,
  nodes,
  schema,
  onChange,
}: {
  check: SkillCheck;
  nodes: DialogNode[];
  schema: VariableSchema;
  onChange: (next: SkillCheck | undefined) => void;
}): ReactElement => {
  const numericVariables = useStore($numericVariables);
  const nodeOptions = [
    {value: NONE, label: '— none —'},
    ...nodes.map(node => ({value: node.id, label: nodeLabel(node)})),
  ];

  const patchModifier = (modifierId: string, patch: Partial<CheckModifier>): void => {
    onChange({
      ...check,
      modifiers: check.modifiers?.map(modifier => (modifier.id === modifierId ? {...modifier, ...patch} : modifier)),
    });
  };

  return (
    <div className='flex flex-col gap-2 rounded border border-amber-900/50 p-2'>
      <Field label='Skill'>
        <Select
          value={check.skillId === '' ? NONE : check.skillId}
          options={[
            {value: NONE, label: '— pick a skill —'},
            ...numericVariables.map(v => ({value: v.id, label: v.name})),
          ]}
          onChange={next => onChange({...check, skillId: next === NONE ? '' : next})}
        />
      </Field>
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Difficulty'>
          <NumberInput value={check.baseDifficulty} onCommit={next => onChange({...check, baseDifficulty: next})} />
        </Field>
        <Field label='Type'>
          <Select
            value={check.checkType}
            options={[
              {value: 'white', label: 'White (retryable)'},
              {value: 'red', label: 'Red (one attempt)'},
            ]}
            onChange={next => onChange({...check, checkType: next === 'red' ? 'red' : 'white'})}
          />
        </Field>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <Field label='On success'>
          <Select
            value={check.successTargetId === '' ? NONE : check.successTargetId}
            options={nodeOptions}
            onChange={next => onChange({...check, successTargetId: next === NONE ? '' : next})}
          />
        </Field>
        <Field label='On failure'>
          <Select
            value={check.failureTargetId === '' ? NONE : check.failureTargetId}
            options={nodeOptions}
            onChange={next => onChange({...check, failureTargetId: next === NONE ? '' : next})}
          />
        </Field>
      </div>
      <Field label='Modifiers'>
        <div className='flex flex-col gap-2'>
          {(check.modifiers ?? []).map(modifier => (
            <div key={modifier.id} className='flex flex-col gap-1 rounded border border-ink-800 p-2'>
              <ExpressionInput
                value={modifier.condition}
                mode='condition'
                schema={schema}
                placeholder='quest.found_diary'
                onCommit={next => patchModifier(modifier.id, {condition: next})}
              />
              <div className='grid grid-cols-[80px_1fr] gap-1'>
                <NumberInput value={modifier.bonus} onCommit={next => patchModifier(modifier.id, {bonus: next})} />
                <TextInput
                  value={modifier.description}
                  placeholder='Found the diary (+1)'
                  onCommit={next => patchModifier(modifier.id, {description: next})}
                />
              </div>
              <SmallButton
                danger
                onClick={() => onChange({...check, modifiers: check.modifiers?.filter(m => m.id !== modifier.id)})}
              >
                Remove modifier
              </SmallButton>
            </div>
          ))}
          <SmallButton
            onClick={() =>
              onChange({
                ...check,
                modifiers: [...(check.modifiers ?? []), {id: nanoid(8), condition: '', bonus: 1, description: ''}],
              })
            }
          >
            + Add modifier
          </SmallButton>
        </div>
      </Field>
      <SmallButton danger onClick={() => onChange(undefined)}>
        Remove skill check
      </SmallButton>
    </div>
  );
};

SkillCheckEditor.displayName = 'SkillCheckEditor';

//
// * Choice options
//

const OptionEditor = ({
  dialogue,
  node,
  option,
  schema,
  patchNode,
}: {
  dialogue: Dialogue;
  node: DialogNode;
  option: ChoiceOption;
  schema: VariableSchema;
  patchNode: PatchNode;
}): ReactElement => {
  const patchOption = (patch: Partial<ChoiceOption>): void => {
    patchNode({options: node.options?.map(o => (o.id === option.id ? {...o, ...patch} : o))});
  };

  const handleTargetChange = (targetId: string): void => {
    runCommand(doc => {
      if (targetId === NONE) {
        const edgeIds = (doc.dialogues.find(d => d.id === dialogue.id)?.edges ?? [])
          .filter(edge => edge.source === node.id && edge.sourceHandle === option.id)
          .map(edge => edge.id);

        return deleteEdges(doc, dialogue.id, edgeIds);
      }

      // addEdge syncs option.targetNodeId and replaces the previous option edge.
      return addEdge(doc, dialogue.id, {source: node.id, target: targetId, sourceHandle: option.id});
    });
  };

  const handleRemove = (): void => {
    runCommand(doc => {
      const edgeIds = (doc.dialogues.find(d => d.id === dialogue.id)?.edges ?? [])
        .filter(edge => edge.source === node.id && edge.sourceHandle === option.id)
        .map(edge => edge.id);

      return deleteEdges(
        updateNode(doc, dialogue.id, node.id, {options: node.options?.filter(o => o.id !== option.id)}),
        dialogue.id,
        edgeIds,
      );
    });
  };

  return (
    <div className='flex flex-col gap-2 rounded border border-ink-800 bg-ink-900/60 p-2'>
      <TextInput value={option.text} placeholder='Option text' onCommit={next => patchOption({text: next})} />
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Target'>
          <Select
            value={option.targetNodeId === '' ? NONE : option.targetNodeId}
            options={[
              {value: NONE, label: '— none —'},
              ...dialogue.nodes.filter(n => n.id !== node.id).map(n => ({value: n.id, label: nodeLabel(n)})),
            ]}
            onChange={handleTargetChange}
          />
        </Field>
        <Field label='Visibility when gated'>
          <Select
            value={option.visibility}
            options={[
              {value: 'available', label: 'Hidden (default)'},
              {value: 'locked_visible', label: 'Locked — visible'},
              {value: 'locked_hidden', label: 'Locked — content hidden'},
              {value: 'invisible', label: 'Invisible'},
            ]}
            onChange={next => patchOption({visibility: next as ChoiceOption['visibility']})}
          />
        </Field>
      </div>
      {option.visibility === 'locked_visible' && (
        <Field label='Lock reason'>
          <TextInput
            value={option.lockReason ?? ''}
            placeholder='[Rhetoric 12 — Challenging]'
            onCommit={next => patchOption({lockReason: next === '' ? undefined : next})}
          />
        </Field>
      )}
      <ExpressionList
        label='Conditions'
        items={option.conditions ?? []}
        mode='condition'
        schema={schema}
        onChange={next => patchOption({conditions: next.length === 0 ? undefined : next})}
      />
      <ExpressionList
        label='Effects on select'
        items={option.effects ?? []}
        mode='effect'
        schema={schema}
        onChange={next => patchOption({effects: next.length === 0 ? undefined : next})}
      />
      {option.skillCheck === undefined ? (
        <SmallButton
          onClick={() =>
            patchOption({
              skillCheck: {
                skillId: '',
                baseDifficulty: 10,
                checkType: 'white',
                successTargetId: '',
                failureTargetId: '',
              },
            })
          }
        >
          + Add skill check
        </SmallButton>
      ) : (
        <SkillCheckEditor
          check={option.skillCheck}
          nodes={dialogue.nodes.filter(n => n.id !== node.id)}
          schema={schema}
          onChange={next => patchOption({skillCheck: next})}
        />
      )}
      <SmallButton danger onClick={handleRemove}>
        Remove option
      </SmallButton>
    </div>
  );
};

OptionEditor.displayName = 'OptionEditor';

//
// * Node inspector
//

const NodeInspector = ({
  project,
  dialogue,
  node,
}: {
  project: ProjectDocument;
  dialogue: Dialogue;
  node: DialogNode;
}): ReactElement => {
  const schema = useStore($variableSchema);
  const numericVariables = useStore($numericVariables);

  const patchNode: PatchNode = patch => {
    runCommand(doc => updateNode(doc, dialogue.id, node.id, patch));
  };

  const speaker = project.characters.find(character => character.id === node.characterId);

  const handleAddOption = (): void => {
    const id = nanoid(8);

    patchNode({
      options: [
        ...(node.options ?? []),
        {id, text: '', targetNodeId: '', visibility: 'available', lineKey: optionKey(dialogue.id, node.id, id)},
      ],
    });
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-semibold uppercase tracking-wide text-zinc-400'>
          {node.kind === 'choice' ? 'Choice node' : 'Line node'}
        </span>
        <span className='font-mono text-[10px] text-zinc-600'>{node.id}</span>
      </div>

      <Field label='Speaker'>
        <Select
          value={node.characterId ?? NONE}
          options={[
            {value: NONE, label: '— none —'},
            ...project.characters.map(character => ({value: character.id, label: character.displayName})),
          ]}
          onChange={next => patchNode({characterId: next === NONE ? undefined : next, expressionId: undefined})}
        />
      </Field>

      {speaker?.expressions !== undefined && speaker.expressions.length > 0 && (
        <Field label='Expression'>
          <Select
            value={node.expressionId ?? NONE}
            options={[
              {value: NONE, label: '— default —'},
              ...speaker.expressions.map(expression => ({value: expression.id, label: expression.name})),
            ]}
            onChange={next => patchNode({expressionId: next === NONE ? undefined : next})}
          />
        </Field>
      )}

      <Field label='Text'>
        <TextArea value={node.text} rows={4} placeholder='Node text…' onCommit={next => patchNode({text: next})} />
      </Field>

      <VariantsEditor
        variants={node.textVariants ?? []}
        schema={schema}
        onChange={next => patchNode({textVariants: next.length === 0 ? undefined : next})}
      />

      <ExpressionList
        label='Conditions'
        items={node.conditions ?? []}
        mode='condition'
        schema={schema}
        onChange={next => patchNode({conditions: next.length === 0 ? undefined : next})}
      />

      <ExpressionList
        label='Effects on enter'
        items={node.effects ?? []}
        mode='effect'
        schema={schema}
        onChange={next => patchNode({effects: next.length === 0 ? undefined : next})}
      />

      {node.kind === 'line' && (
        <Field label='Passive check'>
          {node.passiveCheck === undefined ? (
            <SmallButton
              onClick={() => patchNode({passiveCheck: {skillId: numericVariables[0]?.id ?? '', threshold: 8}})}
            >
              + Add passive check
            </SmallButton>
          ) : (
            <div className='flex flex-col gap-2 rounded border border-indigo-900/50 p-2'>
              <Select
                value={node.passiveCheck.skillId === '' ? NONE : node.passiveCheck.skillId}
                options={[
                  {value: NONE, label: '— pick a skill —'},
                  ...numericVariables.map(v => ({value: v.id, label: v.name})),
                ]}
                onChange={next =>
                  patchNode({
                    passiveCheck: {skillId: next === NONE ? '' : next, threshold: node.passiveCheck?.threshold ?? 8},
                  })
                }
              />
              <NumberInput
                value={node.passiveCheck.threshold}
                onCommit={next =>
                  patchNode({passiveCheck: {skillId: node.passiveCheck?.skillId ?? '', threshold: next}})
                }
              />
              <SmallButton danger onClick={() => patchNode({passiveCheck: undefined})}>
                Remove passive check
              </SmallButton>
            </div>
          )}
        </Field>
      )}

      {node.kind === 'choice' && (
        <Field label='Options'>
          <div className='flex flex-col gap-2'>
            {(node.options ?? []).map(option => (
              <OptionEditor
                key={option.id}
                dialogue={dialogue}
                node={node}
                option={option}
                schema={schema}
                patchNode={patchNode}
              />
            ))}
            <SmallButton onClick={handleAddOption}>+ Add option</SmallButton>
          </div>
        </Field>
      )}

      <div className='flex gap-2 border-t border-ink-800 pt-3'>
        {dialogue.entryNodeId !== node.id && (
          <SmallButton onClick={() => runCommand(doc => setEntryNode(doc, dialogue.id, node.id))}>
            Set as entry
          </SmallButton>
        )}
        <SmallButton
          danger
          onClick={() => {
            runCommand(doc => deleteNodes(doc, dialogue.id, [node.id]));
            clearSelection();
          }}
        >
          Delete node
        </SmallButton>
      </div>
    </div>
  );
};

NodeInspector.displayName = 'NodeInspector';

//
// * Dialogue inspector
//

const DialogueInspector = ({dialogue}: {dialogue: Dialogue}): ReactElement => (
  <div className='flex flex-col gap-3'>
    <span className='text-xs font-semibold uppercase tracking-wide text-zinc-400'>Dialogue</span>
    <Field label='Name'>
      <TextInput value={dialogue.name} onCommit={next => runCommand(doc => renameDialogue(doc, dialogue.id, next))} />
    </Field>
    <Field label='Entry node'>
      <Select
        value={dialogue.entryNodeId}
        options={dialogue.nodes.map(node => ({value: node.id, label: nodeLabel(node)}))}
        onChange={next => runCommand(doc => setEntryNode(doc, dialogue.id, next))}
      />
    </Field>
    <p className='text-[11px] leading-relaxed text-zinc-500'>
      Select a node on the canvas to edit its properties. Double-click a node to edit its text inline.
    </p>
  </div>
);

DialogueInspector.displayName = 'DialogueInspector';

export const Inspector = (): ReactElement | null => {
  const project = useStore($project);
  const dialogue = useStore($currentDialogue);
  const selection = useStore($selection);

  if (project === null || dialogue === null) return null;

  const selectedNode =
    selection.nodeIds.length === 1 ? dialogue.nodes.find(node => node.id === selection.nodeIds[0]) : undefined;

  return (
    <aside className='h-full w-full overflow-y-auto border-l border-ink-800 bg-ink-900 p-3'>
      {selectedNode === undefined ? (
        <DialogueInspector dialogue={dialogue} />
      ) : (
        <NodeInspector key={selectedNode.id} project={project} dialogue={dialogue} node={selectedNode} />
      )}
    </aside>
  );
};

Inspector.displayName = 'Inspector';

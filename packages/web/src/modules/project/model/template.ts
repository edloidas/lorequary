import {SCHEMA_VERSION, nodeTextKey, optionKey} from '@lorequary/core';
import {nanoid} from 'nanoid';

import type {Character, DialogNode, Dialogue, ProjectDocument, Variable} from '@lorequary/core';

// Demo scene: a Disco Elysium-style encounter that exercises every capability —
// passive skill voices, white/red checks with modifiers, gated options,
// conditional effects, text variants, and loop-back hubs.

const DLG = 'dlg_gate';

const line = (id: string, characterId: string, text: string, extra?: Partial<DialogNode>): DialogNode => ({
  id,
  kind: 'line',
  characterId,
  text,
  lineKey: nodeTextKey(DLG, id),
  ...extra,
});

const CHARACTERS: Character[] = [
  {id: 'char_you', name: 'you', displayName: 'You', type: 'player', color: '#5aa87a'},
  {id: 'char_sergeant', name: 'sergeant', displayName: 'Sgt. Maru', type: 'character', color: '#cf5a4a'},
  {
    id: 'char_empathy',
    name: 'empathy',
    displayName: 'Empathy',
    type: 'skill_voice',
    color: '#b085e0',
    skillId: 'var_empathy',
  },
  {
    id: 'char_logic',
    name: 'logic',
    displayName: 'Logic',
    type: 'skill_voice',
    color: '#56b8d8',
    skillId: 'var_logic',
  },
  {id: 'char_narrator', name: 'narrator', displayName: 'Narrator', type: 'narrator', color: '#8a8f9d'},
];

const VARIABLES: Variable[] = [
  {id: 'var_empathy', name: 'Empathy', key: 'skills.empathy', type: 'number', defaultValue: 8, group: 'Skills'},
  {id: 'var_logic', name: 'Logic', key: 'skills.logic', type: 'number', defaultValue: 6, group: 'Skills'},
  {id: 'var_rhetoric', name: 'Rhetoric', key: 'skills.rhetoric', type: 'number', defaultValue: 4, group: 'Skills'},
  {id: 'var_authority', name: 'Authority', key: 'skills.authority', type: 'number', defaultValue: 5, group: 'Skills'},
  {id: 'var_money', name: 'Money', key: 'hero.money', type: 'number', defaultValue: 30, group: 'Hero'},
  {id: 'var_attitude', name: 'Gate attitude', key: 'gate.attitude', type: 'number', defaultValue: 0, group: 'World'},
];

const NODES: DialogNode[] = [
  line(
    'n_intro',
    'char_narrator',
    'Rain hammers the corrugated roof of the harbor gatehouse. A sergeant blocks the turnstile, collar up against the wind.',
  ),
  line('n_greet', 'char_sergeant', "Gate's closed after dark. Nobody crosses into the terminal without a pass."),
  line(
    'n_empathy',
    'char_empathy',
    "Her voice is steady, but her eyes keep drifting to the black water. She's afraid of something out there.",
    {passiveCheck: {skillId: 'var_empathy', threshold: 7}},
  ),
  {
    id: 'n_choice1',
    kind: 'choice',
    characterId: 'char_you',
    text: 'The sergeant waits, rain dripping from the brim of her cap.',
    lineKey: nodeTextKey(DLG, 'n_choice1'),
    options: [
      {
        id: 'opt_boat',
        text: 'I just need to get to my boat.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_boat'),
        targetNodeId: 'n_boat',
        visibility: 'available',
      },
      {
        id: 'opt_persuade',
        text: 'Surely you can make an exception for a fellow harbor worker.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_persuade'),
        targetNodeId: '',
        visibility: 'available',
        skillCheck: {
          skillId: 'var_rhetoric',
          baseDifficulty: 10,
          checkType: 'white',
          modifiers: [
            {id: 'mod_warm', condition: 'gate.attitude >= 1', bonus: 2, description: 'She warmed to you (+2)'},
          ],
          successTargetId: 'n_persuade_ok',
          failureTargetId: 'n_persuade_fail',
        },
      },
      {
        id: 'opt_afraid',
        text: 'What are you afraid of, sergeant?',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_afraid'),
        targetNodeId: 'n_afraid',
        conditions: ['skills.empathy >= 7'],
        visibility: 'locked_visible',
        lockReason: '[Empathy 7]',
      },
      {
        id: 'opt_bribe',
        text: 'Slip her twenty réal, folded small.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_bribe'),
        targetNodeId: 'n_bribe',
        conditions: ['hero.money >= 20'],
        visibility: 'available',
        effects: ['hero.money -= 20', 'gate.attitude += 1'],
      },
      {
        id: 'opt_authority',
        text: 'Step aside. Now.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_authority'),
        targetNodeId: '',
        visibility: 'available',
        skillCheck: {
          skillId: 'var_authority',
          baseDifficulty: 12,
          checkType: 'red',
          successTargetId: 'n_intimidated',
          failureTargetId: 'n_mocked',
        },
      },
    ],
  },
  line('n_boat', 'char_sergeant', "Your boat can wait till sunrise like everyone else's."),
  line('n_persuade_ok', 'char_sergeant', '…Fine. You talk like a dockhand. One hour — and I never saw you.', {
    effects: ['gate.attitude += 1'],
  }),
  line('n_persuade_fail', 'char_sergeant', 'Nice try. The pass office opens at six.'),
  line(
    'n_afraid',
    'char_sergeant',
    'Three nights ago something dragged the mooring chains. The whole pier heard it. Nobody checks the water anymore.',
  ),
  line(
    'n_logic',
    'char_logic',
    'Dragged chains, no witnesses, no paperwork — she is improvising this curfew. There is no official order.',
    {passiveCheck: {skillId: 'var_logic', threshold: 6}},
  ),
  {
    id: 'n_choice2',
    kind: 'choice',
    characterId: 'char_you',
    text: 'She watches you, waiting for a reaction.',
    lineKey: nodeTextKey(DLG, 'n_choice2'),
    options: [
      {
        id: 'opt_callout',
        text: "There's no curfew order, is there?",
        lineKey: optionKey(DLG, 'n_choice2', 'opt_callout'),
        targetNodeId: 'n_caught',
        conditions: ['skills.logic >= 6'],
        visibility: 'locked_hidden',
        effects: ['gate.attitude -= 1'],
      },
      {
        id: 'opt_watch',
        text: "I'll keep an eye on the water for you.",
        lineKey: optionKey(DLG, 'n_choice2', 'opt_watch'),
        targetNodeId: 'n_watch',
        visibility: 'available',
        effects: ['gate.attitude += 1'],
      },
    ],
  },
  line(
    'n_caught',
    'char_sergeant',
    "…You're sharp. Fine — there's no order. But I'm still not opening that gate after what I heard.",
  ),
  line('n_watch', 'char_sergeant', "You'd do that? …Take the side rail, then. If anything moves out there, you shout."),
  line('n_bribe', 'char_sergeant', "She pockets the note without looking down. 'Wind's picking up. Walk fast.'"),
  line(
    'n_intimidated',
    'char_sergeant',
    "She stiffens. For a second the baton hand twitches — then she unlocks the turnstile. 'No need to shout.'",
  ),
  line('n_mocked', 'char_sergeant', "'Go home, hero.' Her hand rests on the baton now, and it isn't twitching.", {
    effects: ['gate.attitude -= 1'],
  }),
  line(
    'n_pass',
    'char_narrator',
    'The turnstile clanks open. Beyond it, the terminal lights smear across wet concrete.',
    {
      textVariants: [
        {
          id: 'tv_warm',
          conditions: ['gate.attitude >= 1'],
          text: "The turnstile clanks open. 'Stay dry,' she mutters — almost friendly. The terminal lights smear across wet concrete.",
        },
      ],
    },
  ),
];

const EDGES = [
  {id: 'e_intro_greet', source: 'n_intro', target: 'n_greet'},
  {id: 'e_greet_empathy', source: 'n_greet', target: 'n_empathy'},
  {id: 'e_empathy_choice1', source: 'n_empathy', target: 'n_choice1'},
  {id: 'e_c1_boat', source: 'n_choice1', target: 'n_boat', sourceHandle: 'opt_boat'},
  {id: 'e_c1_afraid', source: 'n_choice1', target: 'n_afraid', sourceHandle: 'opt_afraid'},
  {id: 'e_c1_bribe', source: 'n_choice1', target: 'n_bribe', sourceHandle: 'opt_bribe'},
  {id: 'e_boat_c1', source: 'n_boat', target: 'n_choice1'},
  {id: 'e_pfail_c1', source: 'n_persuade_fail', target: 'n_choice1'},
  {id: 'e_pok_pass', source: 'n_persuade_ok', target: 'n_pass'},
  {id: 'e_bribe_pass', source: 'n_bribe', target: 'n_pass'},
  {id: 'e_afraid_logic', source: 'n_afraid', target: 'n_logic'},
  {id: 'e_logic_c2', source: 'n_logic', target: 'n_choice2'},
  {id: 'e_c2_caught', source: 'n_choice2', target: 'n_caught', sourceHandle: 'opt_callout'},
  {id: 'e_c2_watch', source: 'n_choice2', target: 'n_watch', sourceHandle: 'opt_watch'},
  {id: 'e_caught_c1', source: 'n_caught', target: 'n_choice1'},
  {id: 'e_watch_pass', source: 'n_watch', target: 'n_pass'},
  {id: 'e_intim_pass', source: 'n_intimidated', target: 'n_pass'},
  {id: 'e_mocked_c1', source: 'n_mocked', target: 'n_choice1'},
];

// Left-to-right layout, one column per beat.
const POSITIONS: Record<string, {x: number; y: number}> = {
  n_intro: {x: 40, y: 360},
  n_greet: {x: 380, y: 360},
  n_empathy: {x: 720, y: 360},
  n_choice1: {x: 1060, y: 300},
  n_boat: {x: 1460, y: 40},
  n_persuade_ok: {x: 1460, y: 180},
  n_persuade_fail: {x: 1460, y: 320},
  n_afraid: {x: 1460, y: 460},
  n_bribe: {x: 1460, y: 620},
  n_intimidated: {x: 1460, y: 760},
  n_mocked: {x: 1460, y: 900},
  n_logic: {x: 1820, y: 460},
  n_choice2: {x: 2180, y: 440},
  n_caught: {x: 2560, y: 560},
  n_watch: {x: 2560, y: 400},
  n_pass: {x: 2920, y: 260},
};

const createGateDialogue = (): Dialogue => ({
  id: DLG,
  name: 'The Harbor Gate',
  description: 'Demo scene — talk, charm, bribe, or bully your way past a rattled gate sergeant.',
  entryNodeId: 'n_intro',
  nodes: NODES,
  edges: EDGES,
  editor: {nodePositions: POSITIONS},
});

export const createDemoProject = (): ProjectDocument => {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {id: nanoid(8), name: 'Harbor Gate (Demo)', createdAt: now, updatedAt: now},
    settings: {},
    characters: structuredClone(CHARACTERS),
    variables: structuredClone(VARIABLES),
    dialogues: [createGateDialogue()],
  };
};

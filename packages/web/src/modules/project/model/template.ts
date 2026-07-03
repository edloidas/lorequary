import {SCHEMA_VERSION, nodeTextKey, optionKey} from '@lorequary/core';
import {nanoid} from 'nanoid';

import type {
  Character,
  DialogEdge,
  DialogNode,
  Dialogue,
  LineNode,
  ProjectDocument,
  StageSlot,
  Variable,
} from '@lorequary/core';

// Demo scene: a Disco Elysium-style encounter that exercises every capability of the
// edge-port model — passive and anti-passive skill voices, white/red active checks,
// a red entry check with a shared target and per-edge effects, conditional outcome
// edges, a hub topic loop with prioritized routing, stage slots, locked and
// spoiler-safe options, and a cross-dialogue jump.

const DLG = 'dlg_gate';
const DLG_TERMINAL = 'dlg_terminal';

const line = (id: string, characterId: string, text: string, extra?: Partial<LineNode>): LineNode => ({
  id,
  characterId,
  text,
  lineKey: nodeTextKey(DLG, id),
  ...extra,
  kind: 'line',
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
  {
    id: 'char_doubt',
    name: 'doubt',
    displayName: 'Self-Doubt',
    type: 'skill_voice',
    color: '#8d97ab',
    skillId: 'var_authority',
  },
  {id: 'char_narrator', name: 'narrator', displayName: 'Narrator', type: 'narrator', color: '#8a8f9d'},
];

const VARIABLES: Variable[] = [
  {id: 'var_empathy', name: 'Empathy', key: 'skills.empathy', type: 'number', defaultValue: 8, group: 'Skills'},
  {id: 'var_logic', name: 'Logic', key: 'skills.logic', type: 'number', defaultValue: 6, group: 'Skills'},
  {id: 'var_rhetoric', name: 'Rhetoric', key: 'skills.rhetoric', type: 'number', defaultValue: 4, group: 'Skills'},
  {id: 'var_authority', name: 'Authority', key: 'skills.authority', type: 'number', defaultValue: 5, group: 'Skills'},
  {
    id: 'var_perception',
    name: 'Perception',
    key: 'skills.perception',
    type: 'number',
    defaultValue: 6,
    group: 'Skills',
  },
  {id: 'var_money', name: 'Money', key: 'hero.money', type: 'number', defaultValue: 30, group: 'Hero'},
  {id: 'var_attitude', name: 'Gate attitude', key: 'gate.attitude', type: 'number', defaultValue: 0, group: 'World'},
  {id: 'var_patience', name: 'Gate patience', key: 'gate.patience', type: 'number', defaultValue: 3, group: 'World'},
];

const STAGE_SLOTS: StageSlot[] = [{id: 'slot_place', name: 'place', options: ['gatehouse', 'pier', 'terminal']}];

const NODES: DialogNode[] = [
  line(
    'n_intro',
    'char_narrator',
    'Rain hammers the corrugated roof of the harbor gatehouse. A sergeant blocks the turnstile, collar up against the wind.',
  ),
  line('n_greet', 'char_sergeant', "Gate's closed after dark. Nobody crosses into the terminal without a pass."),
  // Anti-passive: this voice only surfaces while Authority is LOW.
  line(
    'n_doubt',
    'char_doubt',
    'She sounds very sure of herself. People this sure are usually right. Maybe just… go home?',
    {
      passiveCheck: {skillId: 'var_authority', threshold: 6, mode: 'below'},
    },
  ),
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
        visibility: 'available',
      },
      {
        id: 'opt_persuade',
        text: 'Surely you can make an exception for a fellow harbor worker.',
        spokenText: "Come on. Dockhands don't rat on dockhands. One hour, and you never saw me.",
        lineKey: optionKey(DLG, 'n_choice1', 'opt_persuade'),
        visibility: 'available',
        skillCheck: {
          skillId: 'var_rhetoric',
          baseDifficulty: 10,
          checkType: 'white',
          modifiers: [
            {id: 'mod_warm', condition: 'gate.attitude >= 1', bonus: 2, description: 'She warmed to you (+2)'},
          ],
        },
      },
      {
        id: 'opt_afraid',
        text: 'What are you afraid of, sergeant?',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_afraid'),
        conditions: ['skills.empathy >= 7'],
        visibility: 'locked_visible',
        lockReason: '[Empathy 7]',
      },
      {
        id: 'opt_bribe',
        text: 'Slip her twenty réal, folded small.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_bribe'),
        conditions: ['hero.money >= 20'],
        visibility: 'available',
        effects: ['hero.money -= 20', 'gate.attitude += 1'],
      },
      {
        id: 'opt_authority',
        text: 'Step aside. Now.',
        spokenText: 'Step aside. I will not ask twice.',
        lineKey: optionKey(DLG, 'n_choice1', 'opt_authority'),
        visibility: 'available',
        skillCheck: {
          skillId: 'var_authority',
          baseDifficulty: 12,
          checkType: 'red',
        },
      },
    ],
  },
  line('n_boat', 'char_sergeant', "Your boat can wait till sunrise like everyone else's."),
  // Conditional outcome edges pick the warmer read when she already likes you.
  line(
    'n_persuade_warm',
    'char_sergeant',
    "…You again. Fine — you've been straight with me. One hour, and walk fast.",
    {
      effects: ['gate.attitude += 1'],
    },
  ),
  line('n_persuade_ok', 'char_sergeant', '…Fine. You talk like a dockhand. One hour — and I never saw you.', {
    effects: ['gate.attitude += 1'],
  }),
  line('n_persuade_fail', 'char_sergeant', 'Nice try. The pass office opens at six.'),
  line(
    'n_afraid',
    'char_sergeant',
    'Three nights ago something dragged the mooring chains. The whole pier heard it. Nobody checks the water anymore.',
    {effects: ['gate.attitude += 1']},
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
        conditions: ['skills.logic >= 6'],
        visibility: 'locked_hidden',
        effects: ['gate.attitude -= 1'],
      },
      {
        id: 'opt_watch',
        text: "I'll keep an eye on the water for you.",
        lineKey: optionKey(DLG, 'n_choice2', 'opt_watch'),
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
  line(
    'n_watch',
    'char_sergeant',
    "You'd do that? …Take the side rail, then. If anything moves out there, you shout.",
    {
      stage: {slot_place: 'pier'},
    },
  ),
  // Red entry check: rolls the moment the line is shown; both outcomes share the
  // next node, each edge carrying its own consequences.
  line(
    'n_lookout',
    'char_narrator',
    'You catch it — a mooring chain, taut and trembling, dragging slow and sideways through the water.',
    {
      failureText: 'You stare into the dark until your eyes water. Rain. Chains. Nothing that moves on its own.',
      check: {skillId: 'var_perception', baseDifficulty: 10, checkType: 'red'},
      stage: {slot_place: 'pier'},
    },
  ),
  line(
    'n_watch_report',
    'char_sergeant',
    "'Keep those eyes open, then.' She unlocks the side gate without looking away from the water.",
    {
      stage: {slot_place: 'pier'},
    },
  ),
  line('n_bribe', 'char_sergeant', "She pockets the note without looking down. 'Wind's picking up. Walk fast.'"),
  line(
    'n_intimidated',
    'char_sergeant',
    "She stiffens. For a second the baton hand twitches — then she unlocks the turnstile. 'No need to shout.'",
  ),
  line('n_mocked', 'char_sergeant', "'Go home, hero.' Her hand rests on the baton now, and it isn't twitching.", {
    effects: ['gate.attitude -= 1'],
  }),
  // Hub topic loop: every rebuffed path returns here; each pass-through costs patience,
  // and the hub's prioritized edges cut the loop when it runs out.
  {
    id: 'n_hub_return',
    kind: 'hub',
    effects: ['gate.patience -= 1'],
  },
  line(
    'n_impatient',
    'char_sergeant',
    "'Enough.' She plants herself in front of the turnstile, done talking. The pass office opens at six.",
  ),
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
  // Cross-dialogue jump: the scene continues in the terminal.
  {
    id: 'n_jump_terminal',
    kind: 'jump',
    jumpTarget: {dialogueId: DLG_TERMINAL},
  },
];

const EDGES: DialogEdge[] = [
  {id: 'e_intro_greet', source: 'n_intro', role: 'flow', target: 'n_greet'},
  {id: 'e_greet_doubt', source: 'n_greet', role: 'flow', target: 'n_doubt'},
  {id: 'e_doubt_empathy', source: 'n_doubt', role: 'flow', target: 'n_empathy'},
  {id: 'e_empathy_choice1', source: 'n_empathy', role: 'flow', target: 'n_choice1'},
  {id: 'e_c1_boat', source: 'n_choice1', sourceOption: 'opt_boat', role: 'flow', target: 'n_boat'},
  // Conditional outcome edges: the warm read wins while she likes you.
  {
    id: 'e_c1_persuade_warm',
    source: 'n_choice1',
    sourceOption: 'opt_persuade',
    role: 'success',
    target: 'n_persuade_warm',
    conditions: ['gate.attitude >= 1'],
    priority: 1,
    label: 'warmed up',
  },
  {
    id: 'e_c1_persuade_ok',
    source: 'n_choice1',
    sourceOption: 'opt_persuade',
    role: 'success',
    target: 'n_persuade_ok',
    priority: 2,
  },
  {
    id: 'e_c1_persuade_fail',
    source: 'n_choice1',
    sourceOption: 'opt_persuade',
    role: 'failure',
    target: 'n_persuade_fail',
  },
  {id: 'e_c1_afraid', source: 'n_choice1', sourceOption: 'opt_afraid', role: 'flow', target: 'n_afraid'},
  {id: 'e_c1_bribe', source: 'n_choice1', sourceOption: 'opt_bribe', role: 'flow', target: 'n_bribe'},
  {id: 'e_c1_auth_ok', source: 'n_choice1', sourceOption: 'opt_authority', role: 'success', target: 'n_intimidated'},
  {id: 'e_c1_auth_fail', source: 'n_choice1', sourceOption: 'opt_authority', role: 'failure', target: 'n_mocked'},
  // Rebuffed paths feed the return hub.
  {id: 'e_boat_hub', source: 'n_boat', role: 'flow', target: 'n_hub_return'},
  {id: 'e_pfail_hub', source: 'n_persuade_fail', role: 'flow', target: 'n_hub_return'},
  {id: 'e_caught_hub', source: 'n_caught', role: 'flow', target: 'n_hub_return'},
  {id: 'e_mocked_hub', source: 'n_mocked', role: 'flow', target: 'n_hub_return'},
  // Hub routing: patience gone → she shuts the conversation down; otherwise loop back.
  {
    id: 'e_hub_impatient',
    source: 'n_hub_return',
    role: 'flow',
    target: 'n_impatient',
    conditions: ['gate.patience <= 0'],
    priority: 1,
    label: 'patience gone',
  },
  {id: 'e_hub_choice1', source: 'n_hub_return', role: 'flow', target: 'n_choice1', priority: 2},
  {id: 'e_pwarm_pass', source: 'n_persuade_warm', role: 'flow', target: 'n_pass'},
  {id: 'e_pok_pass', source: 'n_persuade_ok', role: 'flow', target: 'n_pass'},
  {id: 'e_bribe_pass', source: 'n_bribe', role: 'flow', target: 'n_pass'},
  {id: 'e_afraid_logic', source: 'n_afraid', role: 'flow', target: 'n_logic'},
  {id: 'e_logic_c2', source: 'n_logic', role: 'flow', target: 'n_choice2'},
  {id: 'e_c2_caught', source: 'n_choice2', sourceOption: 'opt_callout', role: 'flow', target: 'n_caught'},
  {id: 'e_c2_watch', source: 'n_choice2', sourceOption: 'opt_watch', role: 'flow', target: 'n_watch'},
  {id: 'e_watch_lookout', source: 'n_watch', role: 'flow', target: 'n_lookout'},
  // Entry-check outcomes share a target; each edge carries its own consequences.
  {
    id: 'e_lookout_ok',
    source: 'n_lookout',
    role: 'success',
    target: 'n_watch_report',
    effects: ['gate.attitude += 1'],
    label: 'saw it',
  },
  {
    id: 'e_lookout_fail',
    source: 'n_lookout',
    role: 'failure',
    target: 'n_watch_report',
    effects: ['gate.attitude -= 1'],
    label: 'jumping at shadows',
  },
  {id: 'e_report_pass', source: 'n_watch_report', role: 'flow', target: 'n_pass'},
  {id: 'e_intim_pass', source: 'n_intimidated', role: 'flow', target: 'n_pass'},
  {id: 'e_pass_jump', source: 'n_pass', role: 'flow', target: 'n_jump_terminal'},
];

// Left-to-right layout, one column per beat.
const POSITIONS: Record<string, {x: number; y: number}> = {
  n_intro: {x: 40, y: 360},
  n_greet: {x: 380, y: 360},
  n_doubt: {x: 720, y: 200},
  n_empathy: {x: 720, y: 400},
  n_choice1: {x: 1060, y: 300},
  n_boat: {x: 1460, y: 40},
  n_persuade_warm: {x: 1460, y: 160},
  n_persuade_ok: {x: 1460, y: 300},
  n_persuade_fail: {x: 1460, y: 440},
  n_afraid: {x: 1460, y: 580},
  n_bribe: {x: 1460, y: 720},
  n_intimidated: {x: 1460, y: 860},
  n_mocked: {x: 1460, y: 1000},
  n_hub_return: {x: 1100, y: 640},
  n_impatient: {x: 1100, y: 780},
  n_logic: {x: 1820, y: 580},
  n_choice2: {x: 2180, y: 560},
  n_caught: {x: 2560, y: 680},
  n_watch: {x: 2560, y: 460},
  n_lookout: {x: 2920, y: 460},
  n_watch_report: {x: 3280, y: 460},
  n_pass: {x: 3640, y: 260},
  n_jump_terminal: {x: 3980, y: 260},
};

const terminalLine = (id: string, characterId: string, text: string, extra?: Partial<LineNode>): LineNode => ({
  id,
  characterId,
  text,
  lineKey: nodeTextKey(DLG_TERMINAL, id),
  ...extra,
  kind: 'line',
});

const createGateDialogue = (): Dialogue => ({
  id: DLG,
  name: 'The Harbor Gate',
  description: 'Demo scene — talk, charm, bribe, or bully your way past a rattled gate sergeant.',
  entryNodeId: 'n_intro',
  stageDefaults: {slot_place: 'gatehouse'},
  nodes: NODES,
  edges: EDGES,
  editor: {nodePositions: POSITIONS},
});

const createTerminalDialogue = (): Dialogue => ({
  id: DLG_TERMINAL,
  name: 'The Terminal',
  description: 'Past the gate — the quiet other side of the harbor.',
  entryNodeId: 't_arrive',
  stageDefaults: {slot_place: 'terminal'},
  nodes: [
    terminalLine(
      't_arrive',
      'char_narrator',
      'The terminal hall is empty at this hour. Sodium lamps hum over rows of shuttered kiosks.',
      {
        textVariants: [
          {
            id: 'tv_friend',
            conditions: ['gate.attitude >= 2'],
            text: "The terminal hall is empty at this hour. Behind you, faint through the rain, the sergeant calls: 'One hour!' You made a friend tonight — more or less.",
          },
        ],
      },
    ),
    terminalLine(
      't_end',
      'char_narrator',
      'Somewhere behind you, chains rattle against the pier. Whatever moves in the water, you are past it now. For tonight.',
    ),
  ],
  edges: [{id: 'et_arrive_end', source: 't_arrive', role: 'flow', target: 't_end'}],
  editor: {nodePositions: {t_arrive: {x: 40, y: 200}, t_end: {x: 400, y: 200}}},
});

export const createDemoProject = (): ProjectDocument => {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {id: nanoid(8), name: 'Harbor Gate (Demo)', createdAt: now, updatedAt: now},
    settings: {stageSlots: structuredClone(STAGE_SLOTS)},
    characters: structuredClone(CHARACTERS),
    variables: structuredClone(VARIABLES),
    dialogues: [createGateDialogue(), createTerminalDialogue()],
  };
};

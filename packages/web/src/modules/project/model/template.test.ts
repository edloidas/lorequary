import {startPlaythrough, validateProject} from '@lorequary/core';
import {describe, expect, it} from 'vite-plus/test';

import {createDemoProject} from './template';

// rng stub: cycles through the given [0,1) values.
const seq = (...values: number[]): (() => number) => {
  let index = 0;

  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
};

describe('The Harbor Gate demo', () => {
  it('validates cleanly', () => {
    expect(validateProject(createDemoProject())).toStrictEqual([]);
  });

  it('plays the watch path through the entry check into the terminal', () => {
    // High rolls: the perception entry check passes.
    const run = startPlaythrough(createDemoProject(), 'dlg_gate', {rng: seq(0.99)});

    run.advance(); // intro → greet
    run.advance(); // greet → doubt (authority 5 < 6, anti-passive shows)

    expect(run.current()).toMatchObject({nodeId: 'n_doubt'});

    run.advance(); // → empathy voice
    run.advance(); // → choice 1
    run.choose('opt_afraid'); // she opens up, attitude +1
    run.advance(); // afraid → logic voice
    run.advance(); // → choice 2
    run.choose('opt_watch'); // attitude +1 → watch

    expect(run.currentStage()).toStrictEqual({slot_place: 'pier'});

    run.advance(); // watch → lookout: red entry check rolls

    const lookout = run.current();

    if (lookout?.kind !== 'line') {
      expect.unreachable('expected the lookout line');
    }

    expect(lookout.nodeId).toBe('n_lookout');
    expect(lookout.check).toMatchObject({passed: true});

    run.advance(); // success edge (+1 attitude) → report
    run.advance(); // report → pass
    run.advance(); // pass → jump → terminal

    expect(run.activeDialogueId).toBe('dlg_terminal');

    // attitude 3: opened up (+1), watch (+1), spotted the thing (+1) — the warm variant shows.
    const arrival = run.current();

    expect(arrival?.nodeId).toBe('t_arrive');
    expect(arrival?.text).toMatch(/friend/);
    expect(run.currentStage()).toStrictEqual({slot_place: 'terminal'});
  });

  it('cuts the topic loop through the hub when patience runs out', () => {
    const run = startPlaythrough(createDemoProject(), 'dlg_gate', {rng: seq(0)});

    run.advance();
    run.advance();
    run.advance();
    run.advance(); // → choice 1

    // Two rebuffs pass through the return hub (patience 3 → 1)…
    run.choose('opt_boat');
    run.advance();
    run.choose('opt_boat');
    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n_choice1'});

    // …the third exhausts her patience: the hub's prioritized edge ends the talk.
    run.choose('opt_boat');
    run.advance();

    expect(run.current()).toMatchObject({nodeId: 'n_impatient'});
  });

  it('locks the red authority check after a failed attempt', () => {
    const run = startPlaythrough(createDemoProject(), 'dlg_gate', {rng: seq(0)});

    run.advance();
    run.advance();
    run.advance();
    run.advance(); // → choice 1

    const outcome = run.choose('opt_authority'); // snake eyes → failure

    expect(outcome.check?.passed).toBe(false);
    expect(outcome.spoken).toMatch(/twice/);

    run.advance(); // mocked → hub → choice 1

    const view = run.current();

    if (view?.kind !== 'choice') {
      expect.unreachable('expected the choice view');
    }

    expect(view.options.find(option => option.optionId === 'opt_authority')).toMatchObject({state: 'locked_used'});
  });
});

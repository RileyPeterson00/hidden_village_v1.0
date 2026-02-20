import { interpret } from 'xstate';
import GameMachine from '../../../machines/gameMachine';

// Helper: spin up an interpreted machine with optional context overrides.
// Calling .stop() after each test keeps services from leaking between tests.
const startMachine = (contextOverrides = {}) => {
  const machine = GameMachine.withContext({
    ...GameMachine.initialState.context,
    ...contextOverrides,
  });
  return interpret(machine).start();
};

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------
describe('GameMachine - Initial State', () => {
  let service;

  beforeEach(() => {
    service = startMachine();
  });

  afterEach(() => {
    service.stop();
  });

  test('initial state is chapter', () => {
    expect(service.state.matches('chapter')).toBe(true);
  });

  test('initial sub-state is chapter.intro', () => {
    expect(service.state.matches({ chapter: 'intro' })).toBe(true);
  });

  test('currentConjectureIdx starts at 0', () => {
    expect(service.state.context.currentConjectureIdx).toBe(0);
  });

  test('conjectures starts as an empty array', () => {
    expect(service.state.context.conjectures).toEqual([]);
  });

  test('conjectureIdxToIntervention starts as null', () => {
    expect(service.state.context.conjectureIdxToIntervention).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tutorial State Transitions
// ---------------------------------------------------------------------------
describe('GameMachine - Tutorial State', () => {
  // Use machine.transition() for states that aren't reachable by sending
  // events from the default initial state (tutorial is not the initial state).
  test('NEXT transitions tutorial -> chapter', () => {
    // machine.transition() accepts a plain state value string in XState v4
    const next = GameMachine.transition('tutorial', 'NEXT');
    expect(next.matches('chapter')).toBe(true);
  });

  test('SET_CURRENT_CONJECTURE in tutorial transitions to chapter and sets index', () => {
    const next = GameMachine.transition('tutorial', {
      type: 'SET_CURRENT_CONJECTURE',
      currentConjectureIdx: 3,
    });
    expect(next.matches('chapter')).toBe(true);
    expect(next.context.currentConjectureIdx).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Chapter State Transitions
// ---------------------------------------------------------------------------
describe('GameMachine - Chapter State', () => {
  test('COMPLETE in chapter.intro transitions to chapter.outro', () => {
    const service = startMachine();
    service.send('COMPLETE');
    expect(service.state.matches({ chapter: 'outro' })).toBe(true);
    service.stop();
  });

  test('SET_CURRENT_CONJECTURE in chapter updates index without leaving chapter', () => {
    const service = startMachine();
    service.send({ type: 'SET_CURRENT_CONJECTURE', currentConjectureIdx: 5 });
    expect(service.state.matches('chapter')).toBe(true);
    expect(service.state.context.currentConjectureIdx).toBe(5);
    service.stop();
  });

  test('chapter.outro COMPLETE transitions back to chapter (default path)', () => {
    // Neither guard will match: idx becomes 1, conjectures=[] (length-1=-1), no intervention set.
    const service = startMachine({
      conjectures: [{}, {}, {}],
      conjectureIdxToIntervention: 10,
    });
    service.send('COMPLETE'); // intro -> outro
    service.send('COMPLETE'); // outro -> chapter_transition -> chapter (default)
    expect(service.state.matches('chapter')).toBe(true);
    service.stop();
  });
});

// ---------------------------------------------------------------------------
// Guard Conditions & chapter_transition Routing
// ---------------------------------------------------------------------------
describe('GameMachine - Guard Conditions', () => {
  test('chapter_transition routes to intervention when moveToIntervention is true', () => {
    // Entry action increments idx: 0 -> 1.
    // Guard: (1 + 1) === conjectureIdxToIntervention -> need 2.
    // Ensure moveToEnding doesn't trigger first: need conjectures.length - 1 !== 1.
    const service = startMachine({
      currentConjectureIdx: 0,
      conjectures: [{}, {}, {}], // length 3, ending fires when idx === 2
      conjectureIdxToIntervention: 2,
    });
    service.send('COMPLETE'); // intro -> outro
    service.send('COMPLETE'); // outro -> chapter_transition -> intervention
    expect(service.state.matches('intervention')).toBe(true);
    service.stop();
  });

  test('intervention transitions to chapter on NEXT', () => {
    const service = startMachine({
      currentConjectureIdx: 0,
      conjectures: [{}, {}, {}],
      conjectureIdxToIntervention: 2,
    });
    service.send('COMPLETE');
    service.send('COMPLETE'); // now in intervention
    service.send('NEXT');
    expect(service.state.matches('chapter')).toBe(true);
    service.stop();
  });

  test('chapter_transition routes to ending when moveToEnding is true', () => {
    // Entry action increments idx: 0 -> 1.
    // Guard: 1 === conjectures.length - 1 -> need length 2.
    // Ensure intervention guard doesn't fire first: conjectureIdxToIntervention !== 2.
    const service = startMachine({
      currentConjectureIdx: 0,
      conjectures: [{}, {}], // length 2, ending fires when idx === 1
      conjectureIdxToIntervention: null,
    });
    service.send('COMPLETE');
    service.send('COMPLETE'); // outro -> chapter_transition -> ending
    expect(service.state.matches('ending')).toBe(true);
    service.stop();
  });

  test('ending state is a final state', () => {
    const service = startMachine({
      currentConjectureIdx: 0,
      conjectures: [{}, {}],
      conjectureIdxToIntervention: null,
    });
    service.send('COMPLETE');
    service.send('COMPLETE');
    expect(service.state.done).toBe(true);
    service.stop();
  });
});

// ---------------------------------------------------------------------------
// Context Updates
// ---------------------------------------------------------------------------
describe('GameMachine - Context Updates', () => {
  test('updateCurrentConjecture increments currentConjectureIdx during chapter_transition', () => {
    const service = startMachine({
      currentConjectureIdx: 2,
      conjectures: [{}, {}, {}, {}, {}], // large enough that ending won't fire at idx 3
      conjectureIdxToIntervention: 10,   // won't fire intervention at idx 3
    });
    service.send('COMPLETE');
    service.send('COMPLETE'); // triggers chapter_transition
    expect(service.state.context.currentConjectureIdx).toBe(3);
    service.stop();
  });

  test('SET_CURRENT_CONJECTURE sets exact index value in chapter', () => {
    const service = startMachine();
    service.send({ type: 'SET_CURRENT_CONJECTURE', currentConjectureIdx: 7 });
    expect(service.state.context.currentConjectureIdx).toBe(7);
    service.stop();
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------
describe('GameMachine - Edge Cases', () => {
  test('unhandled event in chapter state does not change state', () => {
    const service = startMachine();
    service.send('UNKNOWN_EVENT');
    expect(service.state.matches({ chapter: 'intro' })).toBe(true);
    expect(service.state.context.currentConjectureIdx).toBe(0);
    service.stop();
  });

  test('machine with null conjectureIdxToIntervention does not crash on transition', () => {
    const service = startMachine({
      conjectures: [{}, {}, {}],
      conjectureIdxToIntervention: null,
    });
    expect(() => {
      service.send('COMPLETE');
      service.send('COMPLETE');
    }).not.toThrow();
    service.stop();
  });

  test('multiple SET_CURRENT_CONJECTURE events accumulate to the last sent value', () => {
    const service = startMachine();
    service.send({ type: 'SET_CURRENT_CONJECTURE', currentConjectureIdx: 2 });
    service.send({ type: 'SET_CURRENT_CONJECTURE', currentConjectureIdx: 5 });
    expect(service.state.context.currentConjectureIdx).toBe(5);
    service.stop();
  });
});

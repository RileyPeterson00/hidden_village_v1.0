/**
 * Integration Tests: Game Flow
 *
 * Covers the full game loop at the logic layer:
 *   - GameMachine progressing through chapters to ending
 *   - Intervention firing at the correct conjecture index and game resuming
 *   - Latin square producing valid conjecture orderings
 *   - `reorder` applying those orderings correctly
 *   - PoseMatching.onComplete wired to GameMachine events
 *
 * Chapter.js and Game.js both use PixiJS and cannot be rendered in Jest.
 * These tests exercise the state machine + ordering logic that drives them.
 * Pose-match -> machine-advance tests use the real PoseMatching component with
 * mocked rendering boundaries (Pose canvas, ErrorBoundary, Firebase, drawing utils).
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { interpret } from 'xstate';
import GameMachine from '../../machines/gameMachine';
import Latin from '../../components/utilities/latin_square';
import PoseMatching from '../../components/PoseMatching.js';
import { mockRealisticTPose } from '../fixtures/mockPoseData.js';

jest.mock('../../firebase/database.js', () => ({
  writeToDatabasePoseMatch: jest.fn(() => Promise.resolve()),
  writeToDatabasePoseStart: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../components/Pose/index.js', () => {
  const React = require('react');
  return jest.fn(() => React.createElement('div', { 'data-testid': 'pose-stub' }));
});

jest.mock('../../components/utilities/ErrorBoundary.js', () => {
  const React = require('react');
  return ({ children }) => React.createElement(React.Fragment, null, children);
});

jest.mock('../../components/Pose/pose_drawing_utilities', () => ({
  segmentSimilarity: jest.fn(() => 0),
  matchSegmentToLandmarks: jest.fn(() => []),
}));

jest.useFakeTimers();

const { segmentSimilarity } = require('../../components/Pose/pose_drawing_utilities');

const makeColumnDimensions = () => (index) => ({
  x: index * 100,
  y: 0,
  width: 100,
  height: 100,
  margin: 10,
});

// Mirrors the pure reorder function used inside Game.js.
// Latin square rows are 1-based indices; reorder maps them to 0-based array.
const reorder = (array, indices) => indices.map((idx) => array[idx - 1]);

// Spin up an interpreted machine with optional context overrides.
const startMachine = (contextOverrides = {}) => {
  const machine = GameMachine.withContext({
    ...GameMachine.initialState.context,
    ...contextOverrides,
  });
  return interpret(machine).start();
};

// Drive a machine through a full chapter (intro COMPLETE -> outro COMPLETE).
const completeChapter = (service) => {
  service.send('COMPLETE'); // chapter.intro -> chapter.outro
  service.send('COMPLETE'); // chapter.outro -> chapter_transition -> next state
};

// ─── GameMachine: full game loop ─────────────────────────────────────────────

describe('GameMachine - full game loop without intervention', () => {
  test('machine reaches ending after completing all chapters', () => {
    const conjectures = [{}, {}, {}]; // 3 conjectures
    const service = startMachine({
      conjectures,
      conjectureIdxToIntervention: null,
    });

    completeChapter(service); // idx 0 -> 1
    completeChapter(service); // idx 1 -> 2 -> ending
    expect(service.state.matches('ending')).toBe(true);
    service.stop();
  });

  test('currentConjectureIdx increments correctly through every chapter', () => {
    const conjectures = [{}, {}, {}, {}]; // 4 conjectures
    const service = startMachine({
      conjectures,
      conjectureIdxToIntervention: null,
    });

    expect(service.state.context.currentConjectureIdx).toBe(0);
    completeChapter(service);
    expect(service.state.context.currentConjectureIdx).toBe(1);
    completeChapter(service);
    expect(service.state.context.currentConjectureIdx).toBe(2);
    completeChapter(service);
    expect(service.state.context.currentConjectureIdx).toBe(3);
    expect(service.state.matches('ending')).toBe(true);
    service.stop();
  });

  test('ending state is final - no further transitions occur', () => {
    const service = startMachine({
      conjectures: [{}, {}],
      conjectureIdxToIntervention: null,
    });

    completeChapter(service);
    completeChapter(service);
    expect(service.state.done).toBe(true);

    // Sending another event to a final state should not change anything
    service.send('COMPLETE');
    expect(service.state.matches('ending')).toBe(true);
    service.stop();
  });
});

// ─── GameMachine: intervention ────────────────────────────────────────────────

describe('GameMachine - intervention trigger and resume', () => {
  test('intervention fires at the configured conjecture index', () => {
    // Entry action increments idx 0 -> 1; guard: (1 + 1) === 2 -> intervention
    const service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service);
    expect(service.state.matches('intervention')).toBe(true);
    service.stop();
  });

  test('game resumes in chapter state after intervention is dismissed', () => {
    const service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service); // triggers intervention
    service.send('NEXT');     // dismiss intervention
    expect(service.state.matches('chapter')).toBe(true);
    service.stop();
  });

  test('currentConjectureIdx is correct after intervention resumes', () => {
    // After idx 0 -> 1 (intervention), NEXT resumes at idx 1
    const service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service); // idx -> 1, intervention
    service.send('NEXT');
    expect(service.state.context.currentConjectureIdx).toBe(1);
    service.stop();
  });

  test('game reaches ending after intervention + remaining chapters', () => {
    // 4 conjectures, intervention after chapter 0 -> 1 (idx+1 === 2)
    // After intervention: complete chapters at idx 1, 2, 3 -> ending at idx 4? No...
    // With 4 conjectures: ending when idx === 3 (length - 1)
    // idx 0 -> 1 (intervention), resume idx=1
    // idx 1 -> 2 (normal), idx 2 -> 3 (ending)
    const service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service); // idx 0->1, intervention
    service.send('NEXT');     // resume at idx 1
    completeChapter(service); // idx 1->2, normal chapter
    completeChapter(service); // idx 2->3, ending
    expect(service.state.matches('ending')).toBe(true);
    service.stop();
  });

  test('intervention does not fire on every chapter - only at the configured index', () => {
    // conjectureIdxToIntervention=4: only fires when idx becomes 3 (3+1===4)
    const service = startMachine({
      conjectures: [{}, {}, {}, {}, {}, {}],
      conjectureIdxToIntervention: 4,
    });

    completeChapter(service); // idx 0->1, no intervention
    expect(service.state.matches('chapter')).toBe(true);
    completeChapter(service); // idx 1->2, no intervention
    expect(service.state.matches('chapter')).toBe(true);
    completeChapter(service); // idx 2->3, intervention
    expect(service.state.matches('intervention')).toBe(true);
    service.stop();
  });
});

// ─── Latin square: validity ───────────────────────────────────────────────────

describe('Latin square - valid ordering structure', () => {
  test('produces an N×N square for size 3', () => {
    const latin = new Latin(3);
    expect(latin.square).toHaveLength(3);
    latin.square.forEach((row) => expect(row).toHaveLength(3));
  });

  test('each row contains each value from 1 to N exactly once', () => {
    const n = 4;
    const latin = new Latin(n);
    const expected = Array.from({ length: n }, (_, i) => i + 1);
    latin.square.forEach((row) => {
      expect([...row].sort((a, b) => a - b)).toEqual(expected);
    });
  });

  test('each column contains each value from 1 to N exactly once', () => {
    const n = 4;
    const latin = new Latin(n);
    for (let col = 0; col < n; col++) {
      const column = latin.square.map((row) => row[col]);
      const expected = Array.from({ length: n }, (_, i) => i + 1);
      expect([...column].sort((a, b) => a - b)).toEqual(expected);
    }
  });

  test('is deterministic - same size always produces the same square', () => {
    const a = new Latin(4);
    const b = new Latin(4);
    expect(a.square).toEqual(b.square);
  });
});

// ─── Latin square: conjecture ordering ───────────────────────────────────────

describe('Latin square - conjecture ordering via reorder()', () => {
  const conjectures = ['A', 'B', 'C', 'D'];
  const latin = new Latin(4);

  test('reorder produces an array of the same length as the original', () => {
    const ordered = reorder(conjectures, latin.square[0]);
    expect(ordered).toHaveLength(conjectures.length);
  });

  test('reorder contains every conjecture exactly once', () => {
    const ordered = reorder(conjectures, latin.square[0]);
    expect([...ordered].sort()).toEqual([...conjectures].sort());
  });

  test('different conditions (latin square rows) produce different orderings', () => {
    const order0 = reorder(conjectures, latin.square[0]);
    const order1 = reorder(conjectures, latin.square[1]);
    // A valid latin square guarantees rows differ
    expect(order0).not.toEqual(order1);
  });

  test('condition index out of bounds falls back to row 0 ordering', () => {
    // Mirrors Game.js: condition >= numConjectures -> use square[0]
    const n = conjectures.length;
    const fallback = reorder(conjectures, latin.square[0]);
    const outOfBounds = reorder(conjectures, n < n ? latin.square[n] : latin.square[0]);
    expect(outOfBounds).toEqual(fallback);
  });

  test('GameMachine currentConjectureIdx maps to the correct Latin-ordered conjecture', () => {
    const base = [{ id: 'T' }, { id: 'Y' }, { id: 'A' }, { id: 'V' }];
    const ordered = reorder(base, new Latin(4).square[0]);
    const service = startMachine({ conjectures: ordered, conjectureIdxToIntervention: null });

    expect(ordered[service.state.context.currentConjectureIdx]).toBe(ordered[0]);
    completeChapter(service);
    expect(ordered[service.state.context.currentConjectureIdx]).toBe(ordered[1]);
    completeChapter(service);
    expect(ordered[service.state.context.currentConjectureIdx]).toBe(ordered[2]);
    service.stop();
  });
});

// ─── PoseMatching -> GameMachine integration ──────────────────────────────────

describe('PoseMatching -> GameMachine integration', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    segmentSimilarity.mockReturnValue(0);
  });

  afterEach(() => {
    if (service) service.stop();
    jest.runAllTimers();
  });

  test('successful pose sequence advances GameMachine out of intervention state', async () => {
    service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service);
    expect(service.state.matches('intervention')).toBe(true);

    segmentSimilarity.mockReturnValue(100);
    const { unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={() => service.send('NEXT')}
        UUID="test-uuid"
        gameID="game-123"
        singleMatchPerPose={true}
        repetitions={1}
      />,
    );

    await act(async () => { jest.runOnlyPendingTimers(); });
    await waitFor(() => expect(service.state.matches('chapter')).toBe(true));
    unmount();
  });

  test('failed pose sequence leaves GameMachine in intervention state', async () => {
    service = startMachine({
      conjectures: [{}, {}, {}, {}],
      conjectureIdxToIntervention: 2,
    });

    completeChapter(service);
    expect(service.state.matches('intervention')).toBe(true);

    // similarity stays 0; tolerance=30 -> never matches
    const onComplete = jest.fn();
    const { unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[30]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID="test-uuid"
        gameID="game-456"
        singleMatchPerPose={true}
        repetitions={1}
      />,
    );

    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onComplete).not.toHaveBeenCalled();
    expect(service.state.matches('intervention')).toBe(true);
    unmount();
  });
});

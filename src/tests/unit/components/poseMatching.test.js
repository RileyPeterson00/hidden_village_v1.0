/**
 * Unit tests for PoseMatching component - pose recognition and game progression.
 * Covers: match detection via segmentSimilarity thresholds, repetition counting,
 * Firebase write triggers (start/match), tolerance boundaries, falsy gameID
 * blocking writes, missing landmark handling, and onComplete firing exactly once.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import PoseMatching from '../../../components/PoseMatching.js';
import { mockRealisticTPose } from '../../fixtures/mockPoseData.js';

jest.mock('../../../firebase/database.js', () => ({
  writeToDatabasePoseMatch: jest.fn(() => Promise.resolve()),
  writeToDatabasePoseStart: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../components/Pose/index.js', () => {
  const React = require('react');
  return jest.fn(() => <div data-testid="pose" />);
});

jest.mock('../../../components/utilities/ErrorBoundary.js', () => {
  const React = require('react');
  return ({ children }) => <>{children}</>;
});

// Control similarity calculations so we can deterministically trigger matches
jest.mock('../../../components/Pose/pose_drawing_utilities', () => {
  // Default to 0 so no matches happen unless a test explicitly overrides.
  const segmentSimilarity = jest.fn(() => 0);
  const matchSegmentToLandmarks = jest.fn((_config, _pose, _colAttr) => []);
  return { segmentSimilarity, matchSegmentToLandmarks };
});

// Use Jest fake timers for TRANSITION_DELAY
jest.useFakeTimers();

const {
  writeToDatabasePoseMatch,
  writeToDatabasePoseStart,
} = require('../../../firebase/database.js');

const { segmentSimilarity } = require('../../../components/Pose/pose_drawing_utilities.js');

const makeColumnDimensions = () => (index) => ({
  x: index * 100,
  y: 0,
  width: 100,
  height: 100,
  margin: 10,
});

describe('PoseMatching logic', () => {
  const UUID = 'test-uuid';
  const gameID = 'game-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs pose start on mount in singleMatchPerPose mode', async () => {
    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[30]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={1}
      />
    );

    await waitFor(() => {
      expect(writeToDatabasePoseStart).toHaveBeenCalledWith('Pose 1-1', UUID, gameID);
    });
  });

  it('advances linearPoseIndex and calls onComplete in legacy (multi-match) mode', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose, mockRealisticTPose]}
        tolerances={[0, 0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(writeToDatabasePoseMatch.mock.calls.map((args) => args[0])).toEqual([
      'Pose 1-1',
      'Pose 1-2',
    ]);
  });

  it('cycles subPoseIndex and repIndex correctly in singleMatchPerPose mode', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    const { unmount } = render(
      <PoseMatching
        posesToMatch={[
          mockRealisticTPose,
          mockRealisticTPose,
          mockRealisticTPose,
          mockRealisticTPose,
        ]}
        tolerances={[0, 0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={2}
      />
    );

    // Drive timers step-by-step so we don't loop indefinitely
    for (let i = 1; i <= 4; i += 1) {
      await waitFor(() => {
        expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(i);
      });
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    }

    const labels = writeToDatabasePoseMatch.mock.calls.map((args) => args[0]);
    expect(labels).toEqual(['Pose 1-1', 'Pose 1-2', 'Pose 2-1', 'Pose 2-2']);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Clean up any remaining timers tied to this component
    unmount();
  });

  it('sets isTransitioning to prevent duplicate matches during transition', async () => {
    segmentSimilarity.mockReturnValue(100);
    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
    });

    expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
  });

  it('uses pose-specific tolerance values (match when similarity > tolerance)', async () => {
    segmentSimilarity.mockReturnValue(50);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[40]} // threshold below similarity -> should match
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
    });
  });

  it('does not match when similarity <= tolerance', async () => {
    segmentSimilarity.mockReturnValue(50);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[60]} // threshold above similarity -> no match
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    // Advance timers to allow any transitions if a match had occurred
    await act(async () => {
      jest.runAllTimers();
    });

    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('falls back to default tolerance when tolerance array is missing', async () => {
    segmentSimilarity.mockReturnValue(40); // below default threshold (45)

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={undefined}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => {
      jest.runAllTimers();
    });

    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('falls back to default tolerance for invalid entries', async () => {
    segmentSimilarity.mockReturnValue(40);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[NaN]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => {
      jest.runAllTimers();
    });

    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('returns null when posesToMatch is empty', () => {
    const { container } = render(
      <PoseMatching
        posesToMatch={[]}
        tolerances={[]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('does not write to database when gameID is missing', async () => {
    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={null}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => {
      jest.runAllTimers();
    });

    expect(writeToDatabasePoseStart).not.toHaveBeenCalled();
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('does not match when only 3 of 4 segments exceed threshold', async () => {
    let callCount = 0;
    segmentSimilarity.mockImplementation(() => {
      callCount++;
      return callCount % 4 === 0 ? 0 : 100; // every 4th segment fails
    });

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[50]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={1}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('score exactly equal to tolerance does NOT match (strict > required)', async () => {
    segmentSimilarity.mockReturnValue(45);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[45]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('score one above tolerance DOES match', async () => {
    segmentSimilarity.mockReturnValue(46);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[45]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
  });

  it('falls back to default threshold when tolerances[i] is a negative number', async () => {
    segmentSimilarity.mockReturnValue(40); // below default 45

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[-10]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('uses tolerance = 0 as a valid threshold (any positive score triggers match)', async () => {
    segmentSimilarity.mockReturnValue(0.1); // 0.1 > 0 → match

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
  });

  it('score of exactly 0 does NOT match even with tolerance = 0', async () => {
    segmentSimilarity.mockReturnValue(0);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('a string tolerance "50" is treated as invalid and falls back to default 45', async () => {
    // With default 45: score 48 > 45 = true → match fires
    // If "50" were used: 48 > 50 = false → no match
    segmentSimilarity.mockReturnValue(48);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={['50']}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
  });

  it('does not write to database when gameID is empty string', async () => {
    segmentSimilarity.mockReturnValue(100);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID=""
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseStart).not.toHaveBeenCalled();
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('does not write to database when gameID is numeric 0', async () => {
    segmentSimilarity.mockReturnValue(100);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={0}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseStart).not.toHaveBeenCalled();
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('does not trigger a match when poseData has no poseLandmarks property', async () => {
    segmentSimilarity.mockReturnValue(100);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={{}}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('does not trigger a match when poseData.poseLandmarks is null', async () => {
    segmentSimilarity.mockReturnValue(100);

    render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={{ poseLandmarks: null }}
        columnDimensions={makeColumnDimensions()}
        onComplete={jest.fn()}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={false}
        repetitions={3}
      />
    );

    await act(async () => { jest.runAllTimers(); });
    expect(writeToDatabasePoseMatch).not.toHaveBeenCalled();
  });

  it('does not throw when poseData.poseLandmarks is undefined', () => {
    expect(() =>
      render(
        <PoseMatching
          posesToMatch={[mockRealisticTPose]}
          tolerances={[0]}
          poseData={{ poseLandmarks: undefined }}
          columnDimensions={makeColumnDimensions()}
          onComplete={jest.fn()}
          UUID={UUID}
          gameID={gameID}
          singleMatchPerPose={false}
          repetitions={3}
        />
      )
    ).not.toThrow();
  });

  it('repetitions = 0 is treated as 1 (Math.max), completes after 1 rep', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    const { unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={0}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('negative repetitions are treated as 1, completes after 1 rep', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    const { unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={-3}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('calls onComplete exactly once even if matching conditions persist after completion', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    const { rerender, unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={1}
      />
    );

    await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Force re-renders with still-matching data
    rerender(
      <PoseMatching
        posesToMatch={[mockRealisticTPose]}
        tolerances={[0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={1}
      />
    );
    await act(async () => { jest.runAllTimers(); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not call onComplete before the final rep is matched', async () => {
    const onComplete = jest.fn();
    segmentSimilarity.mockReturnValue(100);

    const { unmount } = render(
      <PoseMatching
        posesToMatch={[mockRealisticTPose, mockRealisticTPose, mockRealisticTPose, mockRealisticTPose]}
        tolerances={[0, 0]}
        poseData={mockRealisticTPose}
        columnDimensions={makeColumnDimensions()}
        onComplete={onComplete}
        UUID={UUID}
        gameID={gameID}
        singleMatchPerPose={true}
        repetitions={2}
      />
    );

    // Only 3 of 4 matches
    for (let i = 1; i <= 3; i++) {
      await waitFor(() => expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(i));
      await act(async () => { jest.runOnlyPendingTimers(); });
    }

    expect(onComplete).not.toHaveBeenCalled();
    unmount();
  });
});


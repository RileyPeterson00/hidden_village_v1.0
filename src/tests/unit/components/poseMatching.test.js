import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import PoseMatching from '../../../components/PoseMatching.js';
import { mockRealisticTPose } from '../../fixtures/mockPoseData.js';

// Mock Firebase database calls
jest.mock('../../../firebase/database.js', () => ({
  writeToDatabasePoseMatch: jest.fn(() => Promise.resolve()),
  writeToDatabasePoseStart: jest.fn(() => Promise.resolve()),
}));

// Mock heavy Pose rendering to keep tests focused on logic
jest.mock('../../../components/Pose/index.js', () => {
  const React = require('react');
  return jest.fn(() => <div data-testid="pose" />);
});

// Simplify ErrorBoundary to a pass-through
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

// Simple columnDimensions stub
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

    // First pose match
    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
    });

    // Let transition complete and move to second pose
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    // Second pose match
    await waitFor(() => {
      expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(2);
    });

    // Let final transition complete and trigger onComplete
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

    // Four matches: rep/sub indices should produce this sequence
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

    // While timer is pending, additional similarity evaluations should not cause more matches
    expect(writeToDatabasePoseMatch).toHaveBeenCalledTimes(1);
  });

  it('uses pose-specific tolerance values (match when similarity > tolerance)', async () => {
    // similarity score 50 for all segments
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

    // With default tolerance > 40, no match should occur
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
});


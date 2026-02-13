/**
 * Mock Pose Data Fixtures
 * 
 * MediaPipe Holistic returns 33 pose landmarks for body tracking.
 * These mocks provide test data without requiring actual pose detection.
 * 
 * Landmark indices (0-32):
 * 0: nose, 1-10: eyes/ears/mouth, 11-22: shoulders/arms/hands, 23-32: hips/legs/feet
 */

/**
 * Helper to create a pose with all 33 landmarks
 * @param {number} x - X coordinate (0-1)
 * @param {number} y - Y coordinate (0-1)
 * @param {number} z - Z coordinate (depth)
 * @param {number} visibility - Visibility score (0-1)
 */
const createFullPose = (x = 0.5, y = 0.5, z = 0, visibility = 1) => ({
  poseLandmarks: Array(33).fill(null).map((_, index) => ({
    x: x + (index * 0.001), // Slight variation per landmark
    y: y + (index * 0.001),
    z,
    visibility
  }))
});

// Basic pose - all landmarks at same position (simple test data)
export const mockBasicPose = createFullPose(0.5, 0.5, 0, 1);

// Identical pose for testing equality
export const mockIdenticalPose = createFullPose(0.5, 0.5, 0, 1);

// Different pose for testing non-matching
export const mockDifferentPose = createFullPose(0.7, 0.6, 0, 1);

// Pose with low visibility (simulates occlusion)
export const mockLowVisibilityPose = createFullPose(0.5, 0.5, 0, 0.3);

// Incomplete pose (only 10 landmarks - tests error handling)
export const mockIncompletePose = {
  poseLandmarks: Array(10).fill(null).map((_, index) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1
  }))
};

// Empty pose (tests null/undefined handling)
export const mockEmptyPose = {
  poseLandmarks: []
};

// Invalid pose (missing poseLandmarks key)
export const mockInvalidPose = {
  // No poseLandmarks property
};

// Realistic T-pose
export const mockRealisticTPose = {
  poseLandmarks: [
    // Head (0-10)
    { x: 0.50, y: 0.20, z: 0, visibility: 1 }, // 0: nose
    { x: 0.48, y: 0.19, z: -0.01, visibility: 1 }, // 1: left eye inner
    { x: 0.47, y: 0.19, z: -0.01, visibility: 1 }, // 2: left eye
    { x: 0.46, y: 0.19, z: -0.01, visibility: 1 }, // 3: left eye outer
    { x: 0.52, y: 0.19, z: -0.01, visibility: 1 }, // 4: right eye inner
    { x: 0.53, y: 0.19, z: -0.01, visibility: 1 }, // 5: right eye
    { x: 0.54, y: 0.19, z: -0.01, visibility: 1 }, // 6: right eye outer
    { x: 0.45, y: 0.22, z: -0.02, visibility: 1 }, // 7: left ear
    { x: 0.55, y: 0.22, z: -0.02, visibility: 1 }, // 8: right ear
    { x: 0.48, y: 0.24, z: 0, visibility: 1 }, // 9: mouth left
    { x: 0.52, y: 0.24, z: 0, visibility: 1 }, // 10: mouth right
    
    // Upper body (11-16)
    { x: 0.45, y: 0.35, z: 0, visibility: 1 }, // 11: left shoulder
    { x: 0.55, y: 0.35, z: 0, visibility: 1 }, // 12: right shoulder
    { x: 0.30, y: 0.40, z: 0, visibility: 1 }, // 13: left elbow
    { x: 0.70, y: 0.40, z: 0, visibility: 1 }, // 14: right elbow
    { x: 0.15, y: 0.40, z: 0, visibility: 1 }, // 15: left wrist
    { x: 0.85, y: 0.40, z: 0, visibility: 1 }, // 16: right wrist
    
    // Hands (17-22)
    { x: 0.13, y: 0.40, z: 0, visibility: 1 }, // 17: left pinky
    { x: 0.12, y: 0.39, z: 0, visibility: 1 }, // 18: left index
    { x: 0.14, y: 0.41, z: 0, visibility: 1 }, // 19: left thumb
    { x: 0.87, y: 0.40, z: 0, visibility: 1 }, // 20: right pinky
    { x: 0.88, y: 0.39, z: 0, visibility: 1 }, // 21: right index
    { x: 0.86, y: 0.41, z: 0, visibility: 1 }, // 22: right thumb
    
    // Lower body (23-32)
    { x: 0.47, y: 0.55, z: 0, visibility: 1 }, // 23: left hip
    { x: 0.53, y: 0.55, z: 0, visibility: 1 }, // 24: right hip
    { x: 0.47, y: 0.70, z: 0, visibility: 1 }, // 25: left knee
    { x: 0.53, y: 0.70, z: 0, visibility: 1 }, // 26: right knee
    { x: 0.47, y: 0.90, z: 0, visibility: 1 }, // 27: left ankle
    { x: 0.53, y: 0.90, z: 0, visibility: 1 }, // 28: right ankle
    { x: 0.46, y: 0.95, z: 0, visibility: 1 }, // 29: left heel
    { x: 0.54, y: 0.95, z: 0, visibility: 1 }, // 30: right heel
    { x: 0.47, y: 0.98, z: 0, visibility: 1 }, // 31: left foot index
    { x: 0.53, y: 0.98, z: 0, visibility: 1 }, // 32: right foot index
  ]
};

// Export helper function for custom poses
export { createFullPose };

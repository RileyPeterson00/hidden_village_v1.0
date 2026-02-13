import { mockBasicPose, mockDifferentPose, mockIncompletePose } from './mockPoseData';
import { mockStudent, mockTeacher, mockAdmin } from './mockUserData';
import { mockGameSession, mockClass } from './mockGameData';

describe('Fixture Validation', () => {
  test('mockBasicPose has 33 landmarks', () => {
    expect(mockBasicPose.poseLandmarks).toHaveLength(33);
  });

  test('mockDifferentPose has 33 landmarks', () => {
    expect(mockDifferentPose.poseLandmarks).toHaveLength(33);
  });

  test('mockIncompletePose has fewer landmarks', () => {
    expect(mockIncompletePose.poseLandmarks.length).toBeLessThan(33);
  });

  test('mockStudent has correct role', () => {
    expect(mockStudent.role).toBe('student');
  });

  test('mockTeacher has correct role', () => {
    expect(mockTeacher.role).toBe('teacher');
  });

  test('mockAdmin has correct role', () => {
    expect(mockAdmin.role).toBe('admin');
  });

  test('mockGameSession has gameID', () => {
    expect(mockGameSession.gameID).toBeDefined();
  });

  test('mockGameSession has conjectureOrder with 8 items', () => {
    expect(mockGameSession.conjectureOrder).toHaveLength(8);
  });

  test('mockClass has studentIds array', () => {
    expect(Array.isArray(mockClass.studentIds)).toBe(true);
  });

  test('pose landmarks have required properties', () => {
    const landmark = mockBasicPose.poseLandmarks[0];
    expect(landmark).toHaveProperty('x');
    expect(landmark).toHaveProperty('y');
    expect(landmark).toHaveProperty('z');
    expect(landmark).toHaveProperty('visibility');
  });
});

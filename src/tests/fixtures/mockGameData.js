/**
 * Mock Game Data Fixtures
 * 
 * Provides test data for game sessions, chapters, and conjectures.
 * Based on the game state structure used in Hidden Village.
 */

// Basic game session
export const mockGameSession = {
  gameID: 'game-session-001',
  userID: 'student-test-uid-001',
  condition: 0, // Latin square condition
  currentChapter: 1,
  currentConjecture: 0,
  startTime: 1706640000000, // Unix timestamp
  endTime: null,
  completed: false,
  conjectureOrder: [1, 2, 3, 4, 5, 6, 7, 8]
};

// Completed game session
export const mockCompletedSession = {
  gameID: 'game-session-002',
  userID: 'student-test-uid-001',
  condition: 1,
  currentChapter: 8,
  currentConjecture: 7,
  startTime: 1706640000000,
  endTime: 1706643600000, // 1 hour later
  completed: true,
  conjectureOrder: [2, 3, 4, 5, 6, 7, 8, 1]
};

// In-progress game session (mid-game)
export const mockInProgressSession = {
  gameID: 'game-session-003',
  userID: 'student-test-uid-001',
  condition: 2,
  currentChapter: 4,
  currentConjecture: 3,
  startTime: 1706640000000,
  endTime: null,
  completed: false,
  conjectureOrder: [3, 4, 5, 6, 7, 8, 1, 2]
};

// Chapter data
export const mockChapter = {
  chapterId: 'chapter-001',
  title: 'Introduction to Shapes',
  conjectureId: 1,
  dialogue: [
    'Welcome to the village!',
    'Today we will learn about shapes.'
  ],
  poseSequence: ['pose-1', 'pose-2', 'pose-3'],
  completed: false
};

// Conjecture data
export const mockConjecture = {
  conjectureId: 1,
  name: 'Triangle Properties',
  description: 'Learn about triangle angles',
  poses: [
    { poseId: 'pose-1', tolerance: 45 },
    { poseId: 'pose-2', tolerance: 50 },
    { poseId: 'pose-3', tolerance: 45 }
  ],
  repetitions: 3
};

// Pose match data (logged to Firebase)
export const mockPoseMatchData = {
  gameID: 'game-session-001',
  userID: 'student-test-uid-001',
  poseName: 'Pose 1-1',
  timestamp: 1706640000000,
  attemptNumber: 1,
  matched: true,
  similarityScore: 95.5,
  timeToMatch: 3500 // milliseconds
};

// Pose start data (logged when pose begins)
export const mockPoseStartData = {
  gameID: 'game-session-001',
  userID: 'student-test-uid-001',
  poseName: 'Pose 1-1',
  timestamp: 1706640000000,
  conjectureId: 1,
  chapterId: 'chapter-001'
};

// Class data (for teacher features)
export const mockClass = {
  classId: 'class-456',
  className: 'Math Period 1',
  teacherId: 'teacher-test-uid-002',
  organizationId: 'org-123',
  studentIds: [
    'student-test-uid-001',
    'student-test-uid-005',
    'student-test-uid-006'
  ],
  assignedContent: [1, 2, 3, 4], // Conjecture IDs
  createdAt: 1706640000000
};

// Organization data
export const mockOrganization = {
  organizationId: 'org-123',
  name: 'Test School District',
  adminIds: ['admin-test-uid-003', 'org-admin-test-uid-004'],
  createdAt: 1706640000000,
  settings: {
    allowStudentSignup: false,
    requireEmailVerification: true
  }
};

// Tutorial completion data
export const mockTutorialCompletion = {
  userID: 'student-test-uid-001',
  completed: true,
  completionTime: 1706640000000,
  tutorialSteps: [
    { step: 1, completed: true, timestamp: 1706640000000 },
    { step: 2, completed: true, timestamp: 1706640060000 },
    { step: 3, completed: true, timestamp: 1706640120000 }
  ]
};

// Helper to create custom game session
export const createMockGameSession = (overrides = {}) => ({
  gameID: `game-${Date.now()}`,
  userID: 'student-test-uid-001',
  condition: 0,
  currentChapter: 1,
  currentConjecture: 0,
  startTime: Date.now(),
  endTime: null,
  completed: false,
  conjectureOrder: [1, 2, 3, 4, 5, 6, 7, 8],
  ...overrides
});

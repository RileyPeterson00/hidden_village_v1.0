/**
 * Fixture data for common Firebase responses
 * Used by Firebase mocks in tests
 */

// Auth fixtures
const FIXTURE_USER = {
  uid: '12345',
  displayName: 'Test User',
  email: 'testuser@example.com',
};

const FIXTURE_USER_ALT = {
  uid: '67890',
  displayName: 'Alternate User',
  email: 'alt@example.com',
};

// Database fixtures
const FIXTURE_CONJECTURE = {
  uuid: 'conj-123',
  name: 'Test Conjecture',
  isPublic: true,
  authorId: '12345',
};

const FIXTURE_CONJECTURE_LIST = [
  { uuid: '1', name: 'Conjecture 1', isPublic: true },
  { uuid: '2', name: 'Conjecture 2', isPublic: true },
];

const FIXTURE_ORGANIZATION = {
  orgId: 'org-1',
  name: 'Test Organization',
  isDefault: true,
};

const FIXTURE_GAME = {
  gameId: 'game-123',
  userId: 'user-1',
  score: 100,
  completed: true,
};

const FIXTURE_USER_PROFILE = {
  name: 'John',
  email: 'john@example.com',
};

// Snapshot helper
const createMockSnapshot = (data = null) => ({
  exists: () => data !== null,
  val: () => data,
  key: 'test-key',
});

module.exports = {
  FIXTURE_USER,
  FIXTURE_USER_ALT,
  FIXTURE_CONJECTURE,
  FIXTURE_CONJECTURE_LIST,
  FIXTURE_ORGANIZATION,
  FIXTURE_GAME,
  FIXTURE_USER_PROFILE,
  createMockSnapshot,
};

/**
 * Mock User Data Fixtures
 * 
 * Provides test data for different user roles in the Hidden Village system.
 * Based on Firebase Authentication user structure.
 */

// Student user
export const mockStudent = {
  uid: 'student-test-uid-001',
  email: 'student@test.com',
  emailVerified: true,
  displayName: 'Test Student',
  photoURL: null,
  role: 'student',
  metadata: {
    creationTime: '2024-01-15T10:00:00.000Z',
    lastSignInTime: '2024-01-30T14:30:00.000Z'
  },
  organizationId: 'org-123',
  classId: 'class-456'
};

// Teacher user
export const mockTeacher = {
  uid: 'teacher-test-uid-002',
  email: 'teacher@test.com',
  emailVerified: true,
  displayName: 'Test Teacher',
  photoURL: null,
  role: 'teacher',
  metadata: {
    creationTime: '2024-01-10T09:00:00.000Z',
    lastSignInTime: '2024-01-30T08:00:00.000Z'
  },
  organizationId: 'org-123',
  classIds: ['class-456', 'class-789'] // Teachers can have multiple classes
};

// Admin user
export const mockAdmin = {
  uid: 'admin-test-uid-003',
  email: 'admin@test.com',
  emailVerified: true,
  displayName: 'Test Admin',
  photoURL: null,
  role: 'admin',
  metadata: {
    creationTime: '2024-01-01T00:00:00.000Z',
    lastSignInTime: '2024-01-30T07:00:00.000Z'
  },
  organizationId: 'org-123',
  permissions: ['manage_users', 'manage_classes', 'view_all_data']
};

// Organization Admin (can manage one organization)
export const mockOrgAdmin = {
  uid: 'org-admin-test-uid-004',
  email: 'orgadmin@test.com',
  emailVerified: true,
  displayName: 'Test Org Admin',
  photoURL: null,
  role: 'org_admin',
  metadata: {
    creationTime: '2024-01-05T00:00:00.000Z',
    lastSignInTime: '2024-01-30T09:00:00.000Z'
  },
  organizationId: 'org-123',
  permissions: ['manage_org_users', 'manage_org_classes']
};

// Unauthenticated user (null)
export const mockUnauthenticated = null;

// User with minimal data (tests defaults)
export const mockMinimalUser = {
  uid: 'minimal-test-uid-005',
  email: 'minimal@test.com',
  emailVerified: false
};

// Array of all users for batch testing
export const mockAllUsers = [
  mockStudent,
  mockTeacher,
  mockAdmin,
  mockOrgAdmin
];

// Helper to create custom user
export const createMockUser = (overrides = {}) => ({
  uid: `custom-uid-${Date.now()}`,
  email: 'custom@test.com',
  emailVerified: true,
  displayName: 'Custom User',
  photoURL: null,
  role: 'student',
  metadata: {
    creationTime: new Date().toISOString(),
    lastSignInTime: new Date().toISOString()
  },
  ...overrides
});

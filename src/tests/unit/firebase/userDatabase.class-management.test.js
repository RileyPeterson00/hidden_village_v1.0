/**
 * Unit tests — src/firebase/userDatabase.js
 * Scope: class CRUD, student/game assignments, edit permissions, and class-context helpers.
 *
 * Functions tested:
 *   createClass, createDefaultClass, getClassesInOrg, getClassInfo, deleteClass,
 *   getUserClassesInOrg, canEditWithoutPIN,
 *   assignStudentsToClasses, removeUserFromClass,
 *   assignGamesToClasses, removeGameFromClass,
 *   switchUserClass, getCurrentClassContext, ensureDefaultClass
 *
 * No live Firebase project required.
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'cls-uuid-1') }));
jest.mock('../../../firebase/init', () => ({ app: {}, auth: {}, storage: {} }));

import { get, set, ref, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import {
  createClass,
  createDefaultClass,
  getClassesInOrg,
  getClassInfo,
  deleteClass,
  getUserClassesInOrg,
  canEditWithoutPIN,
  assignStudentsToClasses,
  removeUserFromClass,
  assignGamesToClasses,
  removeGameFromClass,
  switchUserClass,
  getCurrentClassContext,
  ensureDefaultClass,
} from '../../../firebase/userDatabase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const snap = (data) => ({
  exists: () => data !== null && data !== undefined,
  val: () => data,
});
const noSnap = () => snap(null);

const MOCK_APP = {};
const UID = '12345';

beforeEach(() => {
  jest.clearAllMocks();
  getAuth.mockReturnValue({ currentUser: { uid: UID, email: 'test@example.com' } });
});

// ─────────────────────────────────────────────────────────────────────────────
// createClass
// ─────────────────────────────────────────────────────────────────────────────

describe('createClass', () => {
  test('returns the generated classId', async () => {
    const classId = await createClass('org-1', 'Math 101', 'teacher-uid', MOCK_APP);

    expect(classId).toBe('cls-uuid-1');
  });

  test('writes class data to orgs/{orgId}/classes/{classId}', async () => {
    await createClass('org-1', 'Science', 'teacher-uid', MOCK_APP);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'orgs/org-1/classes/cls-uuid-1')).toBe(true);

    const classWrite = set.mock.calls.find((c) => c[0]?.path === 'orgs/org-1/classes/cls-uuid-1');
    expect(classWrite[1].name).toBe('Science');
    expect(classWrite[1].createdBy).toBe('teacher-uid');
    expect(classWrite[1].isDefault).toBe(false);
  });

  test('also writes to users/{creatorUid}/orgs/{orgId}/classes/{classId} with role teacher', async () => {
    await createClass('org-2', 'Art', 'creator-99', MOCK_APP);

    const userProfileCall = set.mock.calls.find(
      (c) => c[0]?.path === 'users/creator-99/orgs/org-2/classes/cls-uuid-1'
    );
    expect(userProfileCall).toBeDefined();
    expect(userProfileCall[1].role).toBe('teacher');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createDefaultClass
// ─────────────────────────────────────────────────────────────────────────────

describe('createDefaultClass', () => {
  test('writes default class schema to orgs/{orgId}/classes/default and returns "default"', async () => {
    const classId = await createDefaultClass('org-1', MOCK_APP);

    expect(classId).toBe('default');

    const classWrite = set.mock.calls.find(
      (c) => c[0]?.path === 'orgs/org-1/classes/default'
    );
    expect(classWrite[1].name).toBe('Default Class');
    expect(classWrite[1].isDefault).toBe(true);
  });

  test('throws on database error', async () => {
    set.mockRejectedValueOnce(new Error('write failed'));

    await expect(createDefaultClass('org-err', MOCK_APP)).rejects.toThrow(/write failed/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getClassesInOrg
// ─────────────────────────────────────────────────────────────────────────────

describe('getClassesInOrg', () => {
  test('returns classes map when snapshot exists', async () => {
    const classesData = {
      default: { name: 'Default Class', isDefault: true },
      'cls-uuid-1': { name: 'Math 101', isDefault: false },
    };
    get.mockResolvedValueOnce(snap(classesData));

    const result = await getClassesInOrg('org-1', MOCK_APP);

    expect(result).toEqual(classesData);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'orgs/org-1/classes')).toBe(true);
  });

  test('returns empty object when org has no classes', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getClassesInOrg('org-empty', MOCK_APP);

    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getClassInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('getClassInfo', () => {
  test('returns class data when snapshot exists', async () => {
    const classData = { name: 'Math 101', isDefault: false, teachers: {}, students: {} };
    get.mockResolvedValueOnce(snap(classData));

    const result = await getClassInfo('org-1', 'cls-uuid-1', MOCK_APP);

    expect(result).toEqual(classData);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'orgs/org-1/classes/cls-uuid-1')).toBe(true);
  });

  test('returns null when class does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getClassInfo('org-1', 'cls-missing', MOCK_APP);

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteClass
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteClass', () => {
  test('throws Class not found when class snapshot does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    await expect(deleteClass('org-1', 'cls-ghost', MOCK_APP)).rejects.toThrow(/class not found/i);
    expect(remove).not.toHaveBeenCalled();
  });

  test('throws when attempting to delete the default class', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Class', isDefault: true }));

    await expect(deleteClass('org-1', 'default', MOCK_APP)).rejects.toThrow(
      /cannot delete default class/i
    );
    expect(remove).not.toHaveBeenCalled();
  });

  test('happy path: removes class node and all member user-profile entries', async () => {
    const classData = {
      name: 'Art Class',
      isDefault: false,
      teachers: { 'teacher-1': { addedAt: '2025-01-01' } },
      students: { 'student-1': {}, 'student-2': {} },
    };
    get.mockResolvedValueOnce(snap(classData));

    const result = await deleteClass('org-1', 'cls-art', MOCK_APP);

    expect(result).toBe(true);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'orgs/org-1/classes/cls-art')).toBe(true);

    for (const uid of ['teacher-1', 'student-1', 'student-2']) {
      expect(
        removePaths.some((p) => p === `users/${uid}/orgs/org-1/classes/cls-art`)
      ).toBe(true);
    }
    expect(remove).toHaveBeenCalledTimes(4); // 3 members + 1 class node
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserClassesInOrg
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserClassesInOrg', () => {
  test('returns classes map when snapshot exists', async () => {
    const classesData = { 'cls-1': { role: 'teacher' }, 'cls-2': { role: 'student' } };
    get.mockResolvedValueOnce(snap(classesData));

    const result = await getUserClassesInOrg('uid-1', 'org-1', MOCK_APP);

    expect(result).toEqual(classesData);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'users/uid-1/orgs/org-1/classes')).toBe(true);
  });

  test('returns empty object when no classes', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getUserClassesInOrg('uid-1', 'org-empty', MOCK_APP);

    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canEditWithoutPIN
// ─────────────────────────────────────────────────────────────────────────────

describe('canEditWithoutPIN', () => {
  test('returns false when resource is from a different org', async () => {
    const result = await canEditWithoutPIN(
      'user-1', 'owner-1', 'org-different', 'Admin', 'org-mine', MOCK_APP
    );
    expect(result).toBe(false);
  });

  test('returns true for Admin role in same org', async () => {
    const result = await canEditWithoutPIN(
      'user-1', 'owner-1', 'org-1', 'Admin', 'org-1', MOCK_APP
    );
    expect(result).toBe(true);
  });

  test('returns true for Developer role in same org', async () => {
    const result = await canEditWithoutPIN(
      'user-1', 'owner-1', 'org-1', 'Developer', 'org-1', MOCK_APP
    );
    expect(result).toBe(true);
  });

  test('Teacher: returns true when resource owner is a student in one of the teacher classes', async () => {
    get
      .mockResolvedValueOnce(snap({ 'cls-1': { role: 'teacher' } })) // getUserClassesInOrg
      .mockResolvedValueOnce(snap({ addedAt: '2025-01-01' }));         // student found in class

    const result = await canEditWithoutPIN(
      'teacher-1', 'student-1', 'org-1', 'Teacher', 'org-1', MOCK_APP
    );
    expect(result).toBe(true);
  });

  test('Teacher: returns false when resource owner is not in any teacher class', async () => {
    get
      .mockResolvedValueOnce(snap({ 'cls-1': { role: 'teacher' } }))
      .mockResolvedValueOnce(noSnap());

    const result = await canEditWithoutPIN(
      'teacher-1', 'outsider', 'org-1', 'Teacher', 'org-1', MOCK_APP
    );
    expect(result).toBe(false);
  });

  test('returns false for Student role', async () => {
    const result = await canEditWithoutPIN(
      'student-1', 'other-student', 'org-1', 'Student', 'org-1', MOCK_APP
    );
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assignStudentsToClasses
// ─────────────────────────────────────────────────────────────────────────────

describe('assignStudentsToClasses', () => {
  test('adds student to new class and updates currentClassId', async () => {
    get
      .mockResolvedValueOnce(snap({}))                           // no current classes
      .mockResolvedValueOnce(snap({ roleSnapshot: 'Student' })); // user org data

    const result = await assignStudentsToClasses(
      'org-1', ['student-1'], ['class-new'], 'assigner-uid', MOCK_APP
    );

    expect(result).toBe(true);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(
      setPaths.some((p) => p === 'orgs/org-1/classes/class-new/students/student-1')
    ).toBe(true);
    expect(
      setPaths.some((p) => p === 'users/student-1/orgs/org-1/currentClassId')
    ).toBe(true);
  });

  test('skips class when student is already enrolled', async () => {
    get
      .mockResolvedValueOnce(snap({ 'class-existing': { role: 'student' } }))
      .mockResolvedValueOnce(snap({ roleSnapshot: 'Student' }));

    const result = await assignStudentsToClasses(
      'org-1', ['student-1'], ['class-existing'], 'assigner-uid', MOCK_APP
    );

    expect(result).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeUserFromClass
// ─────────────────────────────────────────────────────────────────────────────

describe('removeUserFromClass', () => {
  test('removes user from class students, teachers, and user profile', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Regular Org' })); // isDefaultOrganization → false

    const result = await removeUserFromClass('org-1', 'cls-1', 'user-1', MOCK_APP);

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledTimes(3);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'orgs/org-1/classes/cls-1/students/user-1')).toBe(true);
    expect(removePaths.some((p) => p === 'orgs/org-1/classes/cls-1/teachers/user-1')).toBe(true);
    expect(removePaths.some((p) => p === 'users/user-1/orgs/org-1/classes/cls-1')).toBe(true);
  });

  test('throws when removing from the Default Class in Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    await expect(
      removeUserFromClass('org-default', 'default', 'user-1', MOCK_APP)
    ).rejects.toThrow(/Cannot remove users from Default Class/i);

    expect(remove).not.toHaveBeenCalled();
  });

  test('allows removing from a non-default class even in Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    const result = await removeUserFromClass('org-default', 'cls-custom', 'user-1', MOCK_APP);

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assignGamesToClasses
// ─────────────────────────────────────────────────────────────────────────────

describe('assignGamesToClasses', () => {
  test('sets an assignedGames entry for every game × class combination', async () => {
    const result = await assignGamesToClasses(
      'org-1', ['game-a', 'game-b'], ['cls-1', 'cls-2'], 'assigner-uid', MOCK_APP
    );

    expect(result).toBe(true);
    expect(set).toHaveBeenCalledTimes(4); // 2 × 2

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(
      setPaths.some((p) => p === 'orgs/org-1/classes/cls-1/assignedGames/game-a')
    ).toBe(true);
    expect(
      setPaths.some((p) => p === 'orgs/org-1/classes/cls-2/assignedGames/game-b')
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeGameFromClass
// ─────────────────────────────────────────────────────────────────────────────

describe('removeGameFromClass', () => {
  test('calls remove at the assignedGames path and returns true', async () => {
    const result = await removeGameFromClass('org-1', 'cls-1', 'game-1', MOCK_APP);

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(
      removePaths.some((p) => p === 'orgs/org-1/classes/cls-1/assignedGames/game-1')
    ).toBe(true);
  });

  test('throws on database error', async () => {
    remove.mockRejectedValueOnce(new Error('write rejected'));

    await expect(
      removeGameFromClass('org-1', 'cls-1', 'game-fail', MOCK_APP)
    ).rejects.toThrow(/write rejected/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// switchUserClass
// ─────────────────────────────────────────────────────────────────────────────

describe('switchUserClass', () => {
  test('writes new classId to currentClassId path and returns true', async () => {
    const result = await switchUserClass('uid-1', 'org-1', 'cls-new', MOCK_APP);

    expect(result).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(
      setPaths.some((p) => p === 'users/uid-1/orgs/org-1/currentClassId')
    ).toBe(true);
    expect(set.mock.calls[0][1]).toBe('cls-new');
  });

  test('throws on database error', async () => {
    set.mockRejectedValueOnce(new Error('write failed'));

    await expect(switchUserClass('uid-1', 'org-1', 'cls-err', MOCK_APP)).rejects.toThrow(
      /write failed/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentClassContext
// ─────────────────────────────────────────────────────────────────────────────

describe('getCurrentClassContext', () => {
  test('returns classId, className, and orgId for an authenticated user', async () => {
    // Sequence: getCurrentUserContext (3 gets) → currentClassId get → getClassInfo get
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-ctx' }))
      .mockResolvedValueOnce(snap('Teacher'))
      .mockResolvedValueOnce(snap('Ctx Org'))
      .mockResolvedValueOnce(snap('cls-active'))
      .mockResolvedValueOnce(snap({ name: 'Active Class', isDefault: false }));

    const result = await getCurrentClassContext(MOCK_APP);

    expect(result.classId).toBe('cls-active');
    expect(result.className).toBe('Active Class');
    expect(result.orgId).toBe('org-ctx');
  });

  test('falls back to classId "default" when no currentClassId is stored', async () => {
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-ctx' }))
      .mockResolvedValueOnce(snap('Teacher'))
      .mockResolvedValueOnce(snap('Ctx Org'))
      .mockResolvedValueOnce(noSnap()) // no currentClassId stored
      .mockResolvedValueOnce(snap({ name: 'Default Class', isDefault: true }));

    const result = await getCurrentClassContext(MOCK_APP);

    expect(result.classId).toBe('default');
  });

  test('returns null values when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const result = await getCurrentClassContext(MOCK_APP);

    expect(result).toMatchObject({ classId: null, className: null, orgId: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureDefaultClass
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureDefaultClass', () => {
  test('returns true immediately when org is not Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Science Dept' })); // isDefaultOrganization → false

    const result = await ensureDefaultClass('org-sci', MOCK_APP);

    expect(result).toBe(true);
    expect(set).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  test('returns true without creating class when default class already exists', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Default Organization' }))
      .mockResolvedValueOnce(snap({ name: 'Default Class', isDefault: true }));

    const result = await ensureDefaultClass('org-def', MOCK_APP);

    expect(result).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  test('creates default class when org is Default Organization but class is missing', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Default Organization' }))
      .mockResolvedValueOnce(noSnap()); // class missing

    const result = await ensureDefaultClass('org-def', MOCK_APP);

    expect(result).toBe(true);
    expect(set).toHaveBeenCalled();
    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'orgs/org-def/classes/default')).toBe(true);
  });
});

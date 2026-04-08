/**
 * Unit tests — src/firebase/userDatabase.js
 * Scope: organization CRUD, membership, role hierarchy, and new-user registration.
 *
 * Functions tested:
 *   isDefaultOrganization, getOrganizationInfo, findOrganizationByName,
 *   createOrganization, deleteOrganization,
 *   addUserToOrganization, removeUserFromOrganization,
 *   leaveOrganization, switchPrimaryOrganization,
 *   updateUserRoleInOrg, registerNewUser
 *
 * No live Firebase project required.
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'gen-uuid-1') }));
jest.mock('../../../firebase/init', () => ({ app: {}, auth: {}, storage: {} }));

import { get, set, ref, remove, update } from 'firebase/database';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  isDefaultOrganization,
  getOrganizationInfo,
  findOrganizationByName,
  createOrganization,
  deleteOrganization,
  addUserToOrganization,
  removeUserFromOrganization,
  leaveOrganization,
  switchPrimaryOrganization,
  updateUserRoleInOrg,
  registerNewUser,
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
// isDefaultOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('isDefaultOrganization', () => {
  test('returns true when org name matches the DEFAULT_ORG_NAME constant', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    const result = await isDefaultOrganization('org-default', MOCK_APP);

    expect(result).toBe(true);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'orgs/org-default')).toBe(true);
  });

  test('returns false when org name does not match', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Science Department' }));

    const result = await isDefaultOrganization('org-sci', MOCK_APP);

    expect(result).toBe(false);
  });

  test('returns false when org does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await isDefaultOrganization('org-ghost', MOCK_APP);

    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOrganizationInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrganizationInfo', () => {
  test('returns org object with id when snapshot exists', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Test Org', ownerUid: 'uid-1' }));

    const result = await getOrganizationInfo('org-1', MOCK_APP);

    expect(result).toMatchObject({ id: 'org-1', name: 'Test Org', ownerUid: 'uid-1' });
  });

  test('returns null when org does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getOrganizationInfo('org-ghost', MOCK_APP);

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findOrganizationByName
// ─────────────────────────────────────────────────────────────────────────────

describe('findOrganizationByName', () => {
  test('returns orgId when org with matching name is found', async () => {
    get.mockResolvedValueOnce(
      snap({ 'org-aaa': { name: 'Alpha School' }, 'org-bbb': { name: 'Beta School' } })
    );

    const result = await findOrganizationByName('Beta School', MOCK_APP);

    expect(result).toBe('org-bbb');
  });

  test('returns null when no org with that name exists', async () => {
    get.mockResolvedValueOnce(snap({ 'org-x': { name: 'Other Org' } }));

    const result = await findOrganizationByName('Nonexistent School', MOCK_APP);

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('createOrganization', () => {
  test('non-default org: writes org data and user-org record, returns generated orgId', async () => {
    const orgId = await createOrganization('Science Dept', 'owner-uid', MOCK_APP);

    expect(orgId).toBe('gen-uuid-1');

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'orgs/gen-uuid-1')).toBe(true);
    expect(setPaths.some((p) => p === 'users/owner-uid/orgs/gen-uuid-1')).toBe(true);

    const orgWrite = set.mock.calls.find((c) => c[0]?.path === 'orgs/gen-uuid-1');
    expect(orgWrite[1].name).toBe('Science Dept');
    expect(orgWrite[1].ownerUid).toBe('owner-uid');
    expect(orgWrite[1].isArchived).toBe(false);
  });

  test('Default Organization: also creates default class and assigns owner as teacher', async () => {
    const orgId = await createOrganization('Default Organization', 'owner-uid', MOCK_APP);

    expect(orgId).toBe('gen-uuid-1');

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'orgs/gen-uuid-1/classes/default')).toBe(true);
    expect(
      setPaths.some((p) => p === 'orgs/gen-uuid-1/classes/default/teachers/owner-uid')
    ).toBe(true);

    const userOrgWrite = set.mock.calls.find(
      (c) => c[0]?.path === 'users/owner-uid/orgs/gen-uuid-1'
    );
    expect(userOrgWrite[1].currentClassId).toBe('default');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteOrganization', () => {
  test('happy path: removes all member user-records and the org node', async () => {
    const orgData = {
      name: 'Delete Me',
      members: { [UID]: { role: 'Admin' }, 'other-user': { role: 'Student' } },
    };
    get
      .mockResolvedValueOnce(snap(orgData)) // isDefaultOrganization
      .mockResolvedValueOnce(snap(orgData)); // org snapshot for auth check

    const result = await deleteOrganization('org-del', MOCK_APP);

    expect(result).toMatchObject({ success: true, memberCount: 2 });

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === `users/${UID}/orgs/org-del`)).toBe(true);
    expect(removePaths.some((p) => p === 'users/other-user/orgs/org-del')).toBe(true);
    expect(removePaths.some((p) => p === 'orgs/org-del')).toBe(true);
  });

  test('throws when org is Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    await expect(deleteOrganization('org-protected', MOCK_APP)).rejects.toThrow(
      /Cannot delete Default Organization/i
    );
  });

  test('throws when org does not exist', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Regular Org' }))
      .mockResolvedValueOnce(noSnap());

    await expect(deleteOrganization('org-gone', MOCK_APP)).rejects.toThrow(
      /Organization not found/i
    );
  });

  test('throws when current user is not Admin', async () => {
    const orgData = { name: 'Restricted', members: { [UID]: { role: 'Teacher' } } };
    get
      .mockResolvedValueOnce(snap(orgData))
      .mockResolvedValueOnce(snap(orgData));

    await expect(deleteOrganization('org-restricted', MOCK_APP)).rejects.toThrow(
      /Only Admins can delete/i
    );
  });

  test('throws when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    await expect(deleteOrganization('org-1', MOCK_APP)).rejects.toThrow(
      /No authenticated user/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addUserToOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('addUserToOrganization', () => {
  test('with existing default class: sets class membership and org membership', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Class', isDefault: true }));

    const result = await addUserToOrganization('new-user', 'org-1', 'Student', MOCK_APP);

    expect(result).toBe(true);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(
      setPaths.some((p) => p === 'orgs/org-1/classes/default/students/new-user')
    ).toBe(true);

    const userOrgCall = set.mock.calls.find(
      (c) => c[0]?.path === 'users/new-user/orgs/org-1'
    );
    expect(userOrgCall[1].currentClassId).toBe('default');
  });

  test('without default class: adds org membership only, no class path set', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await addUserToOrganization('new-user', 'org-2', 'Teacher', MOCK_APP);

    expect(result).toBe(true);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p.includes('classes/default/'))).toBe(false);

    const userOrgCall = set.mock.calls.find(
      (c) => c[0]?.path === 'users/new-user/orgs/org-2'
    );
    expect(userOrgCall[1].currentClassId).toBeUndefined();
  });

  test('returns false on database error', async () => {
    get.mockRejectedValueOnce(new Error('DB down'));

    const result = await addUserToOrganization('uid', 'org', 'Student', MOCK_APP);

    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeUserFromOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('removeUserFromOrganization', () => {
  test('removes user from org and members node', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Regular Org' })); // isDefaultOrganization → false

    const result = await removeUserFromOrganization('uid-1', 'org-1', MOCK_APP);

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledTimes(2);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'users/uid-1/orgs/org-1')).toBe(true);
    expect(removePaths.some((p) => p === 'orgs/org-1/members/uid-1')).toBe(true);
  });

  test('throws when org is Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    await expect(
      removeUserFromOrganization('uid-1', 'org-default', MOCK_APP)
    ).rejects.toThrow(/Cannot remove users from Default Organization/i);

    expect(remove).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// leaveOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('leaveOrganization', () => {
  test('throws when org is Default Organization', async () => {
    get.mockResolvedValueOnce(snap({ name: 'Default Organization' }));

    await expect(leaveOrganization('user-1', 'org-default', MOCK_APP)).rejects.toThrow(
      /Cannot leave Default Organization/i
    );
  });

  test('throws when user has no organizations snapshot', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Regular Org' }))
      .mockResolvedValueOnce(noSnap());

    await expect(leaveOrganization('user-1', 'org-1', MOCK_APP)).rejects.toThrow(
      /User has no organizations/i
    );
  });

  test('throws when org is the only membership', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Regular Org' }))
      .mockResolvedValueOnce(snap({ 'org-1': { roleSnapshot: 'Student' } }));

    await expect(leaveOrganization('user-1', 'org-1', MOCK_APP)).rejects.toThrow(
      /Cannot leave your only organization/i
    );
  });

  test('happy path (no classes, not primary org): removes user from org nodes', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Regular Org' }))
      .mockResolvedValueOnce(snap({ 'org-leave': {}, 'org-stay': {} }))
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-stay' }))
      .mockResolvedValueOnce(noSnap()); // no classes

    const result = await leaveOrganization('user-1', 'org-leave', MOCK_APP);

    expect(result).toBe(true);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'users/user-1/orgs/org-leave')).toBe(true);
    expect(removePaths.some((p) => p === 'orgs/org-leave/members/user-1')).toBe(true);
    expect(set).not.toHaveBeenCalled(); // not the primary org, so no primaryOrgId update
  });

  test('switches primaryOrgId when leaving the current primary org', async () => {
    get
      .mockResolvedValueOnce(snap({ name: 'Regular Org' }))
      .mockResolvedValueOnce(snap({ 'org-leave': {}, 'org-stay': {} }))
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-leave' })) // leaving the primary
      .mockResolvedValueOnce(noSnap());

    const result = await leaveOrganization('user-1', 'org-leave', MOCK_APP);

    expect(result).toBe(true);
    expect(set).toHaveBeenCalled();
    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'users/user-1/primaryOrgId')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// switchPrimaryOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('switchPrimaryOrganization', () => {
  test('happy path: updates primaryOrgId and dispatches userContextChanged event', async () => {
    get.mockResolvedValueOnce(snap({ 'org-new': { roleSnapshot: 'Teacher' } }));
    const dispatched = [];
    const original = window.dispatchEvent;
    window.dispatchEvent = (e) => dispatched.push(e.type);

    const result = await switchPrimaryOrganization(UID, 'org-new', MOCK_APP);

    window.dispatchEvent = original;
    expect(result).toBe(true);
    expect(update).toHaveBeenCalled();
    expect(dispatched).toContain('userContextChanged');
  });

  test('throws Unauthorized when uid does not match current user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: { uid: 'different-uid' } });

    await expect(
      switchPrimaryOrganization(UID, 'org-new', MOCK_APP)
    ).rejects.toThrow(/Unauthorized/i);
  });

  test('throws when user is not a member of the target org', async () => {
    get.mockResolvedValueOnce(snap({ 'org-other': {} }));

    await expect(
      switchPrimaryOrganization(UID, 'org-new', MOCK_APP)
    ).rejects.toThrow(/not a member/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUserRoleInOrg
// ─────────────────────────────────────────────────────────────────────────────

describe('updateUserRoleInOrg', () => {
  test('happy path with changerRole provided: updates role in three DB paths', async () => {
    get.mockResolvedValueOnce(snap('Student')); // target's current role

    const result = await updateUserRoleInOrg(
      'target-uid', 'org-1', 'Teacher', MOCK_APP, 'Admin'
    );

    expect(result).toBe(true);
    expect(set).toHaveBeenCalledTimes(3);

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'users/target-uid/orgs/org-1/roleSnapshot')).toBe(true);
    expect(setPaths.some((p) => p === 'orgs/org-1/members/target-uid/role')).toBe(true);
  });

  test('happy path without changerRole: fetches changer role from DB', async () => {
    get
      .mockResolvedValueOnce(snap('Student')) // target's current role
      .mockResolvedValueOnce(snap('Admin'));   // changer's role from DB

    const result = await updateUserRoleInOrg('target-uid', 'org-1', 'Teacher', MOCK_APP);

    expect(result).toBe(true);
    expect(set).toHaveBeenCalledTimes(3);
  });

  test('throws when target has a higher role than the changer', async () => {
    get.mockResolvedValueOnce(snap('Admin')); // target is Admin, changer is Teacher

    await expect(
      updateUserRoleInOrg('target-uid', 'org-1', 'Student', MOCK_APP, 'Teacher')
    ).rejects.toThrow(/Cannot change role of Admin/i);

    expect(set).not.toHaveBeenCalled();
  });

  test('throws when trying to assign a role higher than the changer role', async () => {
    get.mockResolvedValueOnce(snap('Student')); // target is Student

    await expect(
      updateUserRoleInOrg('target-uid', 'org-1', 'Admin', MOCK_APP, 'Teacher')
    ).rejects.toThrow(/Cannot assign role Admin/i);

    expect(set).not.toHaveBeenCalled();
  });

  test('throws when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    await expect(
      updateUserRoleInOrg('target-uid', 'org-1', 'Teacher', MOCK_APP, 'Admin')
    ).rejects.toThrow(/No authenticated user/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerNewUser
// ─────────────────────────────────────────────────────────────────────────────

describe('registerNewUser', () => {
  test('assigns Student role when Default Organization already exists', async () => {
    get
      .mockResolvedValueOnce(snap({ 'org-def': { name: 'Default Organization' } })) // orgs scan
      .mockResolvedValueOnce(snap({ name: 'Default Class', isDefault: true }));      // default class exists

    const result = await registerNewUser('new@test.com', 'pass123', MOCK_APP);

    expect(result).toMatchObject({ success: true, uid: UID });

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === `users/${UID}`)).toBe(true);
    expect(set).toHaveBeenCalled();
  });

  test('creates Default Organization and assigns Admin role when none exists', async () => {
    get
      .mockResolvedValueOnce(noSnap())  // no orgs exist
      .mockResolvedValueOnce(noSnap()); // no default class in newly-created org

    const result = await registerNewUser('founder@test.com', 'pass456', MOCK_APP);

    expect(result).toMatchObject({ success: true, uid: UID });

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'orgs/gen-uuid-1')).toBe(true);
    expect(setPaths.some((p) => p === 'orgs/gen-uuid-1/classes/default')).toBe(true);
    expect(setPaths.some((p) => p === `users/${UID}`)).toBe(true);
  });
});

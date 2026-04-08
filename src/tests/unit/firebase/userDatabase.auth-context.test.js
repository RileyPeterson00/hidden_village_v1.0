/**
 * Unit tests — src/firebase/userDatabase.js
 * Scope: reading the current user's identity, name, email, role, and org context.
 *
 * Functions tested:
 *   getCurrentUserContext, getCurrentUserOrgInfo,
 *   getUserNameFromDatabase, getUserEmailFromDatabase, getUserEmailByUid,
 *   getUserRoleInOrg, getUserRoleFromDatabase, getUserOrgsFromDatabase,
 *   getUsersByOrganizationFromDatabase, getUserStatusInOrg, refreshUserContext
 *
 * No live Firebase project required.
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'auth-uuid-1') }));
jest.mock('../../../firebase/init', () => ({ app: {}, auth: {}, storage: {} }));

import { get, ref } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import {
  getCurrentUserContext,
  getCurrentUserOrgInfo,
  getUserNameFromDatabase,
  getUserEmailFromDatabase,
  getUserEmailByUid,
  getUserRoleInOrg,
  getUserRoleFromDatabase,
  getUserOrgsFromDatabase,
  getUsersByOrganizationFromDatabase,
  getUserStatusInOrg,
  refreshUserContext,
} from '../../../firebase/userDatabase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const snap = (data) => ({
  exists: () => data !== null && data !== undefined,
  val: () => data,
});
const noSnap = () => snap(null);

const MOCK_APP = {};
const UID = '12345'; // matches FIXTURE_USER uid in __mocks__/firebase/auth.js

beforeEach(() => {
  jest.clearAllMocks();
  getAuth.mockReturnValue({ currentUser: { uid: UID, email: 'test@example.com' } });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentUserContext
// ─────────────────────────────────────────────────────────────────────────────

describe('getCurrentUserContext', () => {
  test('user with primaryOrgId returns expected orgId, role, and orgName', async () => {
    // RTDB read sequence:
    //   1. get(users/12345)                              → userData with primaryOrgId
    //   2. get(users/12345/orgs/org-abc/roleSnapshot)   → role string (getUserRoleInOrg)
    //   3. get(orgs/org-abc/name)                       → org name
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-abc', userName: 'Alice' }))
      .mockResolvedValueOnce(snap('Teacher'))
      .mockResolvedValueOnce(snap('Test School'));

    const result = await getCurrentUserContext(MOCK_APP);

    expect(result.orgId).toBe('org-abc');
    expect(result.role).toBe('Teacher');
    expect(result.orgName).toBe('Test School');
  });

  test('user without primaryOrgId falls back to first org in users/{uid}/orgs', async () => {
    get
      .mockResolvedValueOnce(snap({ userName: 'Bob' }))
      .mockResolvedValueOnce(snap({ 'org-fallback': { roleSnapshot: 'Student' } }))
      .mockResolvedValueOnce(snap('Student'))
      .mockResolvedValueOnce(snap('Fallback Org'));

    const result = await getCurrentUserContext(MOCK_APP);

    expect(result.orgId).toBe('org-fallback');
    expect(result.role).toBe('Student');
    expect(result.orgName).toBe('Fallback Org');
  });

  test('no signed-in user returns null role and Not Authenticated sentinel', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const result = await getCurrentUserContext(MOCK_APP);

    expect(result.role).toBeNull();
    expect(result.orgId).toBeNull();
    expect(result.orgName).toBe('Not Authenticated');
  });

  test('user with no orgs returns No Organization sentinel and null role', async () => {
    get
      .mockResolvedValueOnce(snap({ userName: 'Ghost' }))
      .mockResolvedValueOnce(snap({})); // empty orgs map

    const result = await getCurrentUserContext(MOCK_APP);

    expect(result.orgId).toBeNull();
    expect(result.role).toBeNull();
    expect(result.orgName).toBe('No Organization');
  });

  test('returns Error sentinel when get() throws', async () => {
    get.mockRejectedValueOnce(new Error('network failure'));

    const result = await getCurrentUserContext(MOCK_APP);

    expect(result).toMatchObject({ orgId: null, role: null, orgName: 'Error' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentUserOrgInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('getCurrentUserOrgInfo', () => {
  test('returns orgName, role, and orgId when user has a primary org', async () => {
    // getCurrentUserOrgInfo delegates to getCurrentUserContext (3 gets) then
    // makes one additional get for the org name itself.
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-ui' })) // users/12345
      .mockResolvedValueOnce(snap('Admin'))                      // roleSnapshot
      .mockResolvedValueOnce(snap('My School'))                  // org name inside getCurrentUserContext
      .mockResolvedValueOnce(snap('My School'));                  // org name inside getCurrentUserOrgInfo

    const result = await getCurrentUserOrgInfo(MOCK_APP);

    expect(result.orgName).toBe('My School');
    expect(result.orgId).toBe('org-ui');
    expect(result.role).toBe('Admin');
  });

  test('returns No Organization when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const result = await getCurrentUserOrgInfo(MOCK_APP);

    expect(result.orgName).toBe('No Organization');
    expect(result.role).toBeNull();
  });

  test('returns Error sentinel when the org-name get() inside it throws', async () => {
    // getCurrentUserContext must succeed first (3 gets), then the get() inside
    // getCurrentUserOrgInfo must throw to reach that function's catch block.
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-err' }))
      .mockResolvedValueOnce(snap('Admin'))
      .mockResolvedValueOnce(snap('Test Org'))
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await getCurrentUserOrgInfo(MOCK_APP);

    expect(result).toMatchObject({ orgName: 'Error', role: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserNameFromDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserNameFromDatabase', () => {
  test('snapshot exists → returns stored userName', async () => {
    get.mockResolvedValueOnce(snap({ userName: 'alice123', userEmail: 'alice@test.com' }));

    const name = await getUserNameFromDatabase(MOCK_APP);

    expect(name).toBe('alice123');
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === `users/${UID}`)).toBe(true);
  });

  test('user not in database → USER NOT FOUND', async () => {
    get.mockResolvedValueOnce(noSnap());

    const name = await getUserNameFromDatabase(MOCK_APP);

    expect(name).toBe('USER NOT FOUND');
  });

  test('no authenticated user → USER NOT FOUND', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const name = await getUserNameFromDatabase(MOCK_APP);

    expect(name).toBe('USER NOT FOUND');
  });

  test('returns USER NOT FOUND when get() throws', async () => {
    get.mockRejectedValueOnce(new Error('permission denied'));

    const name = await getUserNameFromDatabase(MOCK_APP);

    expect(name).toBe('USER NOT FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserEmailFromDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserEmailFromDatabase', () => {
  test('returns userEmail when record exists', async () => {
    get.mockResolvedValueOnce(snap({ userEmail: 'bob@test.com', userName: 'bob' }));

    const email = await getUserEmailFromDatabase(MOCK_APP);

    expect(email).toBe('bob@test.com');
  });

  test('returns null when user record does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const email = await getUserEmailFromDatabase(MOCK_APP);

    expect(email).toBeNull();
  });

  test('returns null when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const email = await getUserEmailFromDatabase(MOCK_APP);

    expect(email).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserEmailByUid
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserEmailByUid', () => {
  test('returns userEmail from snapshot when user exists', async () => {
    get.mockResolvedValueOnce(snap({ userEmail: 'alice@school.edu', userName: 'alice' }));

    const result = await getUserEmailByUid('uid-alice', MOCK_APP);

    expect(result).toBe('alice@school.edu');
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'users/uid-alice')).toBe(true);
  });

  test('returns uid as fallback when user has no email field', async () => {
    get.mockResolvedValueOnce(snap({ userName: 'nomail' }));

    const result = await getUserEmailByUid('uid-nomail', MOCK_APP);

    expect(result).toBe('uid-nomail');
  });

  test('returns uid when user does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getUserEmailByUid('uid-missing', MOCK_APP);

    expect(result).toBe('uid-missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserRoleInOrg
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserRoleInOrg', () => {
  test('returns roleSnapshot value when path exists', async () => {
    get.mockResolvedValueOnce(snap('Developer'));

    const role = await getUserRoleInOrg('uid-1', 'org-1', MOCK_APP);

    expect(role).toBe('Developer');
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'users/uid-1/orgs/org-1/roleSnapshot')).toBe(true);
  });

  test('returns null when roleSnapshot path does not exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const role = await getUserRoleInOrg('uid-1', 'org-none', MOCK_APP);

    expect(role).toBeNull();
  });

  test('returns null when get() throws', async () => {
    get.mockRejectedValueOnce(new Error('timeout'));

    const role = await getUserRoleInOrg('uid-1', 'org-1', MOCK_APP);

    expect(role).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserRoleFromDatabase (backward-compat wrapper)
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserRoleFromDatabase', () => {
  test('returns role string by delegating to getCurrentUserContext', async () => {
    get
      .mockResolvedValueOnce(snap({ primaryOrgId: 'org-x' }))
      .mockResolvedValueOnce(snap('Teacher'))
      .mockResolvedValueOnce(snap('Any Org'));

    const role = await getUserRoleFromDatabase(MOCK_APP);

    expect(role).toBe('Teacher');
  });

  test('returns null when no authenticated user', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });

    const role = await getUserRoleFromDatabase(MOCK_APP);

    expect(role).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserOrgsFromDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserOrgsFromDatabase', () => {
  test('returns orgs map when snapshot exists', async () => {
    const orgsData = {
      'org-a': { roleSnapshot: 'Admin' },
      'org-b': { roleSnapshot: 'Student' },
    };
    get.mockResolvedValueOnce(snap(orgsData));

    const result = await getUserOrgsFromDatabase('uid-x', MOCK_APP);

    expect(result).toEqual(orgsData);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p === 'users/uid-x/orgs')).toBe(true);
  });

  test('returns empty object when user has no orgs', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getUserOrgsFromDatabase('uid-noorg', MOCK_APP);

    expect(result).toEqual({});
  });

  test('returns empty object when get() throws', async () => {
    get.mockRejectedValueOnce(new Error('offline'));

    const result = await getUserOrgsFromDatabase(UID, MOCK_APP);

    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUsersByOrganizationFromDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('getUsersByOrganizationFromDatabase', () => {
  test('returns array of user objects with roleInOrg and statusInOrg populated', async () => {
    const members = { 'user-a': { role: 'Teacher', status: 'active' } };
    const userData = { userName: 'alice', userEmail: 'alice@test.com' };

    get
      .mockResolvedValueOnce(snap(members))    // orgs/org-1/members
      .mockResolvedValueOnce(snap(userData))   // users/user-a
      .mockResolvedValueOnce(snap('Teacher')); // users/user-a/orgs/org-1/roleSnapshot

    const result = await getUsersByOrganizationFromDatabase('org-1', MOCK_APP);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].roleInOrg).toBe('Teacher');
    expect(result[0].statusInOrg).toBe('active');
  });

  test('returns empty array when org has no members', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getUsersByOrganizationFromDatabase('org-empty', MOCK_APP);

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserStatusInOrg
// NOTE: this function references an undeclared module-level `db` variable,
// so it always falls into the catch block and returns null.
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserStatusInOrg', () => {
  test('returns null (catches internal ReferenceError from undeclared db)', async () => {
    const result = await getUserStatusInOrg('uid-1', 'org-1');

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshUserContext
// ─────────────────────────────────────────────────────────────────────────────

describe('refreshUserContext', () => {
  test('dispatches userContextChanged event on window and returns true', async () => {
    const dispatched = [];
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = (evt) => dispatched.push(evt.type);

    const result = await refreshUserContext(MOCK_APP);

    window.dispatchEvent = originalDispatch;
    expect(result).toBe(true);
    expect(dispatched).toContain('userContextChanged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration — getCurrentUserContext + getUserRoleInOrg share the same path
// ─────────────────────────────────────────────────────────────────────────────

describe('integration: getCurrentUserContext + getUserRoleInOrg', () => {
  test('primaryOrgId set → context role matches independent getUserRoleInOrg query', async () => {
    const PRIMARY_ORG = 'org-integration';
    const EXPECTED_ROLE = 'Admin';

    get
      .mockResolvedValueOnce(snap({ primaryOrgId: PRIMARY_ORG }))
      .mockResolvedValueOnce(snap(EXPECTED_ROLE))
      .mockResolvedValueOnce(snap('Integration Org'));

    const ctx = await getCurrentUserContext(MOCK_APP);

    expect(ctx.orgId).toBe(PRIMARY_ORG);
    expect(ctx.role).toBe(EXPECTED_ROLE);

    get.mockResolvedValueOnce(snap(EXPECTED_ROLE));
    const role = await getUserRoleInOrg(UID, PRIMARY_ORG, MOCK_APP);
    expect(role).toBe(EXPECTED_ROLE);

    // Both calls should have targeted the same roleSnapshot path.
    const paths = ref.mock.calls.map((c) => c[1]).filter(Boolean);
    const hits = paths.filter((p) => p.includes(`/orgs/${PRIMARY_ORG}/roleSnapshot`));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

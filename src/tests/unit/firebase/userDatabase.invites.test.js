/**
 * Unit tests — src/firebase/userDatabase.js
 * Scope: invite code lifecycle — generation, validation, redemption, and management.
 *
 * Functions tested:
 *   generateInviteCode, validateInviteCode, useInviteCode,
 *   getInvitesForOrganization, deleteInviteCode
 *
 * No live Firebase project required.
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'inv-uuid-1') }));
jest.mock('../../../firebase/init', () => ({ app: {}, auth: {}, storage: {} }));

import { get, set, ref, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import {
  generateInviteCode,
  validateInviteCode,
  useInviteCode,
  getInvitesForOrganization,
  deleteInviteCode,
} from '../../../firebase/userDatabase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const snap = (data) => ({
  exists: () => data !== null && data !== undefined,
  val: () => data,
});
const noSnap = () => snap(null);

const MOCK_APP = {};

beforeEach(() => {
  jest.clearAllMocks();
  getAuth.mockReturnValue({ currentUser: { uid: '12345', email: 'test@example.com' } });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateInviteCode
// ─────────────────────────────────────────────────────────────────────────────

describe('generateInviteCode', () => {
  test('saves invite at invites/{code} with correct orgId, role, creatorUid, and status:active', async () => {
    // get #1: uniqueness check — invite slot is free
    // get #2: org snapshot to read org name
    get
      .mockResolvedValueOnce(noSnap())
      .mockResolvedValueOnce(snap({ name: 'Math Class Org' }));

    const code = await generateInviteCode('org-inv', 'Teacher', 'creator-uid', MOCK_APP);

    expect(code).toBe('inv-uuid-1');

    const setPaths = ref.mock.calls.map((c) => c[1]);
    expect(setPaths.some((p) => p === 'invites/inv-uuid-1')).toBe(true);
    expect(set).toHaveBeenCalled();

    const setCall = set.mock.calls.find((c) => c[0]?.path?.includes('invites/'));
    expect(setCall).toBeDefined();
    const inviteData = setCall[1];
    expect(inviteData.orgId).toBe('org-inv');
    expect(inviteData.role).toBe('Teacher');
    expect(inviteData.createdBy).toBe('creator-uid');
    expect(inviteData.status).toBe('active');
    expect(inviteData.orgName).toBe('Math Class Org');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateInviteCode
// ─────────────────────────────────────────────────────────────────────────────

describe('validateInviteCode', () => {
  test('active code → { valid: true, invite }', async () => {
    const inviteData = { orgId: 'org-1', role: 'Student', status: 'active', orgName: 'Test Org' };
    get.mockResolvedValueOnce(snap(inviteData));

    const result = await validateInviteCode('code-active', MOCK_APP);

    expect(result.valid).toBe(true);
    expect(result.invite).toEqual(inviteData);
  });

  test('code does not exist → { valid: false, error }', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await validateInviteCode('code-missing', MOCK_APP);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not exist/i);
  });

  test('code has already been used → { valid: false, error }', async () => {
    get.mockResolvedValueOnce(
      snap({ orgId: 'org-1', role: 'Student', status: 'used', orgName: 'X' })
    );

    const result = await validateInviteCode('code-used', MOCK_APP);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already been used/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useInviteCode
// ─────────────────────────────────────────────────────────────────────────────

describe('useInviteCode', () => {
  test('happy path: adds user to org, removes invite, and returns org info', async () => {
    const inviteData = {
      orgId: 'org-join',
      role: 'Student',
      status: 'active',
      orgName: 'Join Org',
    };
    // get #1: validateInviteCode — invite is active
    // get #2: addUserToOrganization — no default class in org-join
    get
      .mockResolvedValueOnce(snap(inviteData))
      .mockResolvedValueOnce(noSnap());

    const result = await useInviteCode('code-join', 'user-joiner', MOCK_APP);

    expect(result.success).toBe(true);
    expect(result.orgId).toBe('org-join');
    expect(result.orgName).toBe('Join Org');
    expect(result.role).toBe('Student');

    expect(remove).toHaveBeenCalled();
    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'invites/code-join')).toBe(true);
  });

  test('invalid code → throws with the error from validateInviteCode', async () => {
    get.mockResolvedValueOnce(noSnap());

    await expect(useInviteCode('code-bad', 'user-1', MOCK_APP)).rejects.toThrow(
      /does not exist/i
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInvitesForOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('getInvitesForOrganization', () => {
  test('returns only active invites belonging to the given orgId', async () => {
    const allInvites = {
      'inv-a': { orgId: 'org-target', status: 'active', role: 'Student' },
      'inv-b': { orgId: 'org-other', status: 'active', role: 'Teacher' },
      'inv-c': { orgId: 'org-target', status: 'used', role: 'Student' },
    };
    get.mockResolvedValueOnce(snap(allInvites));

    const result = await getInvitesForOrganization('org-target', MOCK_APP);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe('Student');
    expect(result[0].orgId).toBe('org-target');
  });

  test('returns empty array when no invites exist', async () => {
    get.mockResolvedValueOnce(noSnap());

    const result = await getInvitesForOrganization('org-1', MOCK_APP);

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteInviteCode
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteInviteCode', () => {
  test('calls remove at invites/{code} and returns { success: true }', async () => {
    const result = await deleteInviteCode('code-del', MOCK_APP);

    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledTimes(1);

    const removePaths = ref.mock.calls.map((c) => c[1]);
    expect(removePaths.some((p) => p === 'invites/code-del')).toBe(true);
  });

  test('throws on database error', async () => {
    remove.mockRejectedValueOnce(new Error('permission denied'));

    await expect(deleteInviteCode('code-fail', MOCK_APP)).rejects.toThrow(
      /permission denied/i
    );
  });
});

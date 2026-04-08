# Firebase Unit Test Guide

Unit tests for `src/firebase/userDatabase.js` — the Realtime Database layer that backs
authentication context, organizations, classes, and invite codes.

---

## Quick start

```bash
# Run only these tests
npx jest src/tests/unit/firebase/userDatabase

# Run with a coverage report scoped to this file
npx jest src/tests/unit/firebase/userDatabase --coverage --collectCoverageFrom="src/firebase/userDatabase.js"

# Watch mode (re-runs on save)
npx jest src/tests/unit/firebase/userDatabase --watch
```

---

## File map

| File | Functions under test |
|---|---|
| `userDatabase.auth-context.test.js` | `getCurrentUserContext`, `getCurrentUserOrgInfo`, `getUserNameFromDatabase`, `getUserEmailFromDatabase`, `getUserEmailByUid`, `getUserRoleInOrg`, `getUserRoleFromDatabase`, `getUserOrgsFromDatabase`, `getUsersByOrganizationFromDatabase`, `getUserStatusInOrg`, `refreshUserContext` |
| `userDatabase.org-management.test.js` | `isDefaultOrganization`, `getOrganizationInfo`, `findOrganizationByName`, `createOrganization`, `deleteOrganization`, `addUserToOrganization`, `removeUserFromOrganization`, `leaveOrganization`, `switchPrimaryOrganization`, `updateUserRoleInOrg`, `registerNewUser` |
| `userDatabase.class-management.test.js` | `createClass`, `createDefaultClass`, `getClassesInOrg`, `getClassInfo`, `deleteClass`, `getUserClassesInOrg`, `canEditWithoutPIN`, `assignStudentsToClasses`, `removeUserFromClass`, `assignGamesToClasses`, `removeGameFromClass`, `switchUserClass`, `getCurrentClassContext`, `ensureDefaultClass` |
| `userDatabase.invites.test.js` | `generateInviteCode`, `validateInviteCode`, `useInviteCode`, `getInvitesForOrganization`, `deleteInviteCode` |

Current coverage for `userDatabase.js`: ~86% statements, ~81% branches, ~88% functions.

---

## How mocking works

No live Firebase project is used. Three layers of mocking intercept all SDK calls:

### 1. Global Firebase mocks (`jest.setup.js` + `moduleNameMapper`)

`jest.config.js` maps every `firebase/auth` and `firebase/database` import to hand-written
stubs in `src/__mocks__/`. Those stubs expose Jest mock functions (`get`, `set`, `ref`,
`remove`, `update`, `getAuth`, etc.) that return resolved Promises by default.

Each test file can therefore call `get.mockResolvedValueOnce(...)` without any extra
`jest.mock('firebase/...')` boilerplate.

### 2. Firebase init mock (per file)

Every test file opens with:

```js
jest.mock('../../../firebase/init', () => ({ app: {}, auth: {}, storage: {} }));
```

This prevents `initializeApp` and `setPersistence` from running, which would throw in a
Node environment.

### 3. `uuid` mock (per file)

`userDatabase.js` calls `uuidv4()` when creating new records (org IDs, class IDs, invite
codes). Each test file mocks `uuid` to a deterministic value so assertions about RTDB paths
stay stable:

```js
// examples — value varies by file
jest.mock('uuid', () => ({ v4: jest.fn(() => 'inv-uuid-1') }));  // invites
jest.mock('uuid', () => ({ v4: jest.fn(() => 'gen-uuid-1') }));  // org-management
jest.mock('uuid', () => ({ v4: jest.fn(() => 'cls-uuid-1') }));  // class-management
```

---

## Snapshot helper pattern

Every test file defines two local helpers rather than importing from a shared fixture, so
each file is fully self-contained:

```js
const snap = (data) => ({
  exists: () => data !== null && data !== undefined,
  val:    () => data,
});
const noSnap = () => snap(null);
```

`snap(value)` simulates a Firebase `DataSnapshot` that exists and returns `value`.
`noSnap()` simulates a snapshot where `exists()` is false (record not found).

---

## Writing a new test

### Arrange: queue up `get` return values in call order

`userDatabase.js` functions often chain several `get` calls. Mock them in the exact order
they fire:

```js
get
  .mockResolvedValueOnce(snap({ primaryOrgId: 'org-abc' }))  // 1st get — users/{uid}
  .mockResolvedValueOnce(snap('Teacher'))                      // 2nd get — roleSnapshot
  .mockResolvedValueOnce(snap('My School'));                   // 3rd get — org name
```

If a `get` you didn't anticipate fires, Jest returns `undefined` by default — the test will
fail with a confusing error. Count the `get` calls inside the function you're testing by
reading `userDatabase.js` before writing the mock chain.

### Assert: check both return values and RTDB paths

```js
// Verify the return value
expect(result.orgId).toBe('org-abc');

// Verify the correct RTDB path was targeted
const paths = ref.mock.calls.map((c) => c[1]);
expect(paths.some((p) => p === 'users/uid-1/orgs/org-abc')).toBe(true);

// Verify write count
expect(set).toHaveBeenCalledTimes(2);
```

### Test error branches

Swap one `mockResolvedValueOnce` for `mockRejectedValueOnce` to exercise catch blocks:

```js
get.mockRejectedValueOnce(new Error('network failure'));
const result = await getCurrentUserContext(app);
expect(result.orgName).toBe('Error');
```

---

## Known bugs in `userDatabase.js`

These are existing issues in the production code, documented here so tests don't
accidentally mask them or confusingly fail.

### `getUserStatusInOrg` — undeclared `db` variable

`getUserStatusInOrg` references a module-level `db` variable that is never declared.
Every call immediately throws a `ReferenceError` and falls into the catch block, which
returns `null`. The test for this function documents the symptom:

```js
test('returns null (catches internal ReferenceError from undeclared db)', async () => {
  const result = await getUserStatusInOrg('uid-1', 'org-1');
  expect(result).toBeNull();
});
```

Fix: replace the bare `db` reference with `getDatabase(app)` (matching the pattern used
by all other functions in the file).

### `writeCurrentUserToDatabaseNewUser` — same undeclared `db`

Same root cause. Functions that call this internally will fail at runtime for the same
reason.

---

## Coverage gaps (remaining ~14%)

The uncovered lines fall into three categories:

1. **`writeCurrentUserToDatabaseNewUser`** — the `db` bug makes the function untestable
   without a code fix first.
2. **Multi-step class assignment edge cases** — `assignStudentsToClasses` has a branch for
   handling teachers that is only partially exercised.
3. **`getUsersByOrganizationFromDatabase` with multiple members** — only the
   single-member happy path is tested; iterating over a larger members map would add
   branch coverage.

---

## Adding tests for new `userDatabase.js` functions

1. Identify which group the function belongs to (auth context, org management, class
   management, or invite codes) and add it to the matching file.
2. If the function doesn't fit any group, create a new file named
   `userDatabase.<group>.test.js` and follow the same boilerplate at the top (uuid mock,
   init mock, snap helpers, `beforeEach` auth reset).
3. Run coverage after adding tests to confirm the new lines are reached:
   ```bash
   npx jest userDatabase --coverage --collectCoverageFrom="src/firebase/userDatabase.js"
   ```

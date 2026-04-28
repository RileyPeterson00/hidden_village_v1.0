# Testing Framework - Hidden Village v1.0

**Status:** Current — operational  
**Last updated:** April 24, 2026  
**Stack:** Jest + React Testing Library (unit and integration) · Playwright (E2E)

---

## Overview

This document describes the project testing setup for Hidden Village. **Unit and integration** tests use Jest: they cover pose-matching behavior, state machines, and Firebase-related code with mocks and RTDB fakes, so you do not need a camera for those runs. **End-to-end** tests use Playwright against a real browser; they exercise full flows and may require a configured Firebase test account (see the E2E guide).

**Related docs**

| Doc | Use when |
|-----|----------|
| [`src/tests/TESTING_README.md`](src/tests/TESTING_README.md) | Day-to-day commands and quick patterns |
| [`src/tests/integration/README.md`](src/tests/integration/README.md) | Writing or debugging integration tests (real modules, boundary mocks) |
| [`src/tests/e2e/E2E_GUIDE.md`](src/tests/e2e/E2E_GUIDE.md) | Running, extending, or debugging Playwright; `.env.e2e`, auth, scenarios |

---

## Quick start

```bash
# All Jest tests (unit + integration)
npm test

# Watch mode (Jest, re-runs on changes)
npm run test:watch

# Coverage (Jest)
npm run test:coverage

# End-to-end (Playwright — separate from `npm test`)
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

**First time E2E:** `npx playwright install` and configure `.env.e2e` from `.env.e2e.example` per [E2E guide](src/tests/e2e/E2E_GUIDE.md).

---

## Test organization

```
src/tests/
├── fixtures/              # Reusable mock data
│   ├── mockPoseData.js    # Pose fixtures (e.g. 33-landmark pose)
│   ├── mockUserData.js    # User role fixtures
│   ├── mockGameData.js    # Game session / class / org fixtures
│   └── index.js
├── unit/                  # Fast, isolated tests (and focused Firebase module tests)
│   ├── auth/
│   ├── components/
│   ├── firebase/
│   ├── machines/
│   ├── pose/
│   └── utils/
├── integration/          # Jest: multiple real modules, mocks at boundaries
└── e2e/                  # Playwright: browser specs and auth setup helpers
```

**Naming**

- Jest: `*.test.js`
- Playwright: `*.spec.js`
- Fixtures: `mock*.js` and shared exports via `fixtures/index.js`

There are **44** Jest test files in `src/tests/` (including integration). E2E lives only under `e2e/` and is not included in `npm test`.

---

## Testing strategy


1. **Unit tests**  
   - Single functions, components, and modules with dependencies mocked.  
   - **Directional target:** a broad set across utilities, pose, machines, and Firebase (order of tens to low hundreds of individual tests as the suite grows).

2. **Integration tests (Jest)**  
   - Real module wiring (e.g. `database` import chains) with boundaries mocked (Firebase network, heavy UI).  
   - **Directional target:** grow coverage of cross-module and data-flow behavior.

3. **E2E tests (Playwright)**  
   - Critical user journeys in a real browser.  
   - **Directional target:** a focused set; full matrix and flakiness are called out in the E2E guide.


---

**Priority 1 - Critical Paths:**
-Pose matching algorithms
-Game state machines
-Firebase data operations
-Authentication flows

**Priority 2 - Supporting Systems:**
- Class management
- User management
- Tutorial system

**Priority 3 - UI/Polish:**
- Component rendering
- User interactions
- Error boundaries

---

## Test Writing Guidelines

### Basic pattern (Jest)

```javascript
import { mockBasicPose } from '../fixtures';

describe('Component/Feature Name', () => {
  test('should do something specific', () => {
    // Arrange - setup
    const input = mockBasicPose;
    
    // Act - execute
    const result = processFunction(input);
    
    // Assert - verify
    expect(result).toBeDefined();
  });
});
```

### Test Names
Use clear, descriptive names:
- ✅ `'should return 100 for identical poses'`
- ✅ `'mockStudent has correct role'`
- ❌ `'test 1'` or `'it works'`

---

## Using Fixtures

### Available Fixtures

**Pose Data:**
- `mockBasicPose` - Standard 33-landmark pose
- `mockDifferentPose` - For comparison tests
- `mockIncompletePose` - Error handling (10 landmarks)

**User Data:**
- `mockStudent` - Student with classId
- `mockTeacher` - Teacher with permissions
- `mockAdmin` - Full admin access

**Game Data:**
- `mockGameSession` - Active game session
- `mockClass` - Classroom data
- `mockOrganization` - Organization data

### Import Pattern

```javascript
import { mockBasicPose, mockStudent } from '../fixtures';
```

---

## Mocking Strategy

1. **Firebase** — database and related APIs (see `jest.setup.js` and `__mocks__/` as applicable).  
2. **MediaPipe** — pose detection in unit tests.  
3. **PixiJS** — canvas / rendering.

### Example (Firebase in Jest)

```javascript
jest.mock('firebase/database');

import { ref, set } from 'firebase/database';

test('should write to Firebase', async () => {
  await writeToDatabase('data');
  expect(set).toHaveBeenCalled();
});
```

---

## Coverage Goals

| Area | Target Coverage | Priority |
|------|----------------|----------|
| **Critical Paths** | 80%+ | High |
| **Utilities** | 90%+ | High |
| **Overall Project** | 60-70% | Medium |

**View Coverage:**
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## Current status

### In place

- Jest (unit + integration) and React Testing Library configured  
- Playwright for E2E, with `playwright.config.js` and [E2E guide](src/tests/e2e/E2E_GUIDE.md)  
- Fixtures for poses, users, and game data; Firebase mocking patterns in use  
- Broad coverage: pose and segment utilities, state machines, many Firebase `database` / `userDatabase` areas, key components, and integration suites for auth, game flow, database writes, and pose pipeline (see `src/tests/` tree)  
- 44 Jest test files; multiple Playwright `*.spec.js` flows  


- More unit tests for any new or high-risk code paths  
- Tighter coverage in areas that stay below targets  
- Broader or more stable E2E coverage as described under “improving the tests” in the E2E guide  

## Best Practices

### DO ✅
- Write tests for new features
- Use fixtures for common data
- Mock external dependencies
- Keep tests fast (<100ms for unit tests)
- Run tests before committing

### DON'T ❌
- Test implementation details
- Write tests that depend on other tests
- Mock the code you're testing
- Commit failing tests
- Skip tests that are "too hard"

---

## Running Tests

**Do:** write tests for new features; use fixtures; mock external I/O; keep unit tests quick; run `npm test` before committing.  
**Don’t:** over-specify implementation details; create ordering dependencies between tests; mock the system under test; commit failing or skipped tests as the norm.

### Before Commit
```bash
npm test             # Run all tests
npm run test:coverage # Check coverage
```

### CI/CD (Future)
Tests will run automatically on:
- Every pull request
- Merge to main
- Nightly full suite

---

## Troubleshooting

### Tests Won't Run
```bash
# Remove git lock if stuck
rm .git/index.lock

- Stuck git index: remove `.git/index.lock` if present, then retry.  
- Dependency issues: `npm install` (or your package manager’s equivalent).

**Failures**

- Match production code and fixture shapes.  
- For integration tests that import `database.js`, follow patterns in [integration README](src/tests/integration/README.md) (e.g. auth listener mocks, `CurricularModule` stub).

**Slow Jest**

- Unmocked network or heavy imports in unit files — confine to integration or E2E, or add mocks.  
- E2E is expected to be slower; run selectively when iterating.

### Tests Failing
1. Check if code changed
2. Update fixtures if data structure changed
3. Verify mocks are up-to-date

- See [E2E_GUIDE.md](src/tests/e2e/E2E_GUIDE.md): env file, `npx playwright install`, and known limitations.

---

## Framework Evolution

- **Phase 1 — Foundation**
  - Jest and React Testing Library
  - Shared fixtures (poses, users, game data) and Firebase mocks
  - First unit tests on utilities and core modules

- **Phase 2 — Depth**
  - More unit coverage on algorithms, components, and Firebase modules
  - Integration tests that exercise real import graphs
  - Database-related flows, with I/O and heavy UI still mocked at boundaries

- **Phase 3 — E2E**
  - Playwright specs for main roles and user journeys
  - Ongoing hardening (stability, env, and scenarios per the E2E guide)
  - CI and broader automation as a later step, not a prerequisite for the suite

The three layers are all **in use**; remaining work is expansion and automation, not “standing up” the stack.

---

## Resources

- **Jest:** https://jestjs.io/  
- **React Testing Library:** https://testing-library.com/react  
- **Playwright:** https://playwright.dev/  
- **Project entry points:** `src/tests/`, this file, [`src/tests/TESTING_README.md`](src/tests/TESTING_README.md)

---

**Document version:** 1.0 (current framework)  

# Testing Framework - Hidden Village v1.0

**Status:** Prototype - Operational  
**Last Updated:** February 12, 2026  
**Framework:** Jest + React Testing Library

---

## Overview

This document describes our testing framework prototype for Hidden Village. The framework is designed to test pose-matching gameplay, state management, and Firebase integration without requiring cameras or network access during testing.

---

## Quick Start

```bash
# Run all tests
npm test

# Watch mode (re-runs on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Test Organization

```
src/tests/
├── fixtures/           # Reusable mock data
│   ├── mockPoseData.js    # Pose fixtures (33 landmarks)
│   ├── mockUserData.js    # User role fixtures
│   └── mockGameData.js    # Game session fixtures
├── unit/              # Unit tests
│   └── utils/         # Utility function tests
├── integration/       # Integration tests (future)
└── e2e/              # End-to-end tests (future)
```

**Naming Convention:**
- Test files: `*.test.js`
- Fixtures: `mock*.js`

---

## Testing Strategy

### Test Order (Implementation Priority)

1. **Unit Tests** (Current - Week 1-2)
   - Individual functions and utilities
   - Fast, isolated, no dependencies
   - **Target:** 60-80 tests

2. **Integration Tests** (Week 3-4)
   - Component interactions
   - Database operations with mocks
   - **Target:** 30-50 tests

3. **E2E Tests** (Week 5-6)
   - Complete user journeys
   - Critical paths only
   - **Target:** 10-15 tests

### What We Test

**Priority 1 - Critical Paths:**
- Pose matching algorithms
- Game state machines
- Firebase data operations
- Authentication flows

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

### Basic Pattern

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
// Import from fixtures index (recommended)
import { mockBasicPose, mockStudent } from '../fixtures';
```

---

## Mocking Strategy

### What We Mock

1. **Firebase** - Database operations
2. **MediaPipe** - Pose detection
3. **PixiJS** - Canvas rendering

### Firebase Mock Example

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

## Current Status (Prototype)

### ✅ Completed
- Jest framework installed & configured
- Test fixtures created (poses, users, game data)
- Firebase mocks implemented
- 25 passing tests
- Coverage tracking operational

### 🔄 In Progress
- Additional unit tests for core algorithms
- Integration test setup

### 📅 Planned
- Pose matching algorithm tests
- State machine tests
- Integration tests
- E2E test setup

---

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

### Daily Development
```bash
npm run test:watch   # Auto-runs on file changes
```

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

# Reinstall dependencies
npm install
```

### Tests Failing
1. Check if code changed
2. Update fixtures if data structure changed
3. Verify mocks are up-to-date

### Slow Tests
- Unit tests should be <5 seconds total
- Check for unmocked external calls
- Consider moving to integration/E2E

---

## Framework Evolution

### Phase 1 (Current) - Prototype
- Basic infrastructure
- Core utilities tested
- Fixtures library established

### Phase 2 (Weeks 3-4) - Comprehensive
- Critical path coverage
- Integration tests added
- 100+ tests total

### Phase 3 (Weeks 5-6) - Production-Ready
- E2E tests for user journeys
- CI/CD integration
- Performance testing

---

## Resources

- **Jest Documentation:** https://jestjs.io/
- **React Testing Library:** https://testing-library.com/react
- **Project Tests:** `src/tests/`
- **Quick Reference:** See `src/tests/README.md`

---

**Framework Version:** 1.0 (Prototype)  
**Next Review:** After Check-in #2 (Feb 27, 2026)

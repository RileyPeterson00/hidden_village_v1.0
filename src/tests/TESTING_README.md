# Tests Quick Reference

Quick guide for writing and running tests in Hidden Village.

**Last reviewed:** April 24, 2026

---

## Run Tests

```bash
# Unit + integration (Jest)
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage

# End-to-end (Playwright; not part of `npm test`)
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
# Equivalent: npm run test:e2e -- --headed  or  -- --ui
```

---

## Test Structure

```
src/tests/
├── fixtures/         # Reusable test data
├── unit/             # Fast, isolated tests
├── integration/      # Real-module interaction tests
└── e2e/              # Playwright browser flows
```

---

## Using Fixtures

```javascript
// Import mock data
import { mockBasicPose, mockStudent, mockGameSession } from './fixtures';

test('example test', () => {
  const result = processData(mockBasicPose);
  expect(result).toBeDefined();
});
```

**Available Fixtures:**
- **Poses:** `mockBasicPose`, `mockDifferentPose`, `mockIncompletePose`
- **Users:** `mockStudent`, `mockTeacher`, `mockAdmin`
- **Game:** `mockGameSession`, `mockClass`, `mockOrganization`

---

## Writing Tests

### Basic Test

```javascript
test('should do something', () => {
  const result = myFunction(input);
  expect(result).toBe(expected);
});
```

### Test with Mock

```javascript
jest.mock('firebase/database');

test('should call Firebase', async () => {
  await writeData('test');
  expect(set).toHaveBeenCalled();
});
```

### Grouped Tests

```javascript
describe('Feature Name', () => {
  test('case 1', () => {});
  test('case 2', () => {});
});
```

---

## Common Assertions

```javascript
expect(value).toBe(5);                    // Exact equality
expect(value).toEqual({a: 1});            // Deep equality
expect(value).toBeDefined();              // Not undefined
expect(value).toBeNull();                 // Is null
expect(array).toHaveLength(3);            // Array length
expect(obj).toHaveProperty('name');       // Has property
expect(fn).toThrow();                     // Throws error
expect(mock).toHaveBeenCalled();          // Mock was called
expect(value).toBeGreaterThan(0);         // Number comparison
```

---

## File Naming

- Test files: `fileName.test.js`
- Place tests near source code or in `src/tests/unit/`
- Group related tests in folders

---

## Tips

✅ **DO:**
- Use descriptive test names
- Import fixtures for common data
- Keep tests fast and focused
- Run tests before committing

❌ **DON'T:**
- Make tests depend on each other
- Test implementation details
- Commit failing tests

---

## Need Help?

- **Full overview:** `TESTING_FRAMEWORK.md` (repo root)
- **Integration tests:** `src/tests/integration/README.md`
- **E2E (Playwright, env, scenarios):** `src/tests/e2e/E2E_GUIDE.md`
- **Fixture source:** `fixtures/*.js` and `fixtures/index.js`

---

**Quick start:** `npm test` runs the full Jest suite (unit + integration). E2E: `npm run test:e2e`.

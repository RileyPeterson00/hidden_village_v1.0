# Tests - Quick Reference

Quick guide for writing and running tests in Hidden Village.

---

## Run Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

---

## Test Structure

```
src/tests/
├── fixtures/         # Mock data - import these in tests
├── unit/            # Unit tests for individual functions
├── integration/     # Integration tests (future)
└── e2e/            # End-to-end tests (future)
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

- Full documentation: `TESTING_FRAMEWORK.md` (root)
- Fixture examples: Check `fixtures/*.js` files
- Ask team lead for guidance

---

**Quick Start:** Run `npm test` to see all tests pass! ✅

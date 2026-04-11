/**
 * jsonTOcsv.test.js — unit tests for src/firebase/jsonTOcsv.js
 *
 * convertJsonToCsv parses a JSON string, builds CSV rows from a nested
 * date → role → session → conjecture → pose structure, creates a browser
 * Blob download, and returns { success, rowCount, csvContent }.
 *
 * The source has a known typo: `formattedgame` (lowercase g) instead of the
 * parameter name `formattedGame`.  Global properties are accessible as bare
 * identifiers in the scope chain, so setting global.formattedgame before the
 * call lets the function proceed past that line without a ReferenceError.
 */

import { convertJsonToCsv } from '../../../firebase/jsonTOcsv.js';

// ─── Fixture data ─────────────────────────────────────────────────────────────

/**
 * Minimal but realistic fixture: one date, one role, one session with one
 * conjecture that contains two pose-like entries (Pose 1-1 and Intuition)
 * and one non-pose key ("TF Given Answer") that exercises the false branch of
 * the `poseName.startsWith("Pose") || poseName === "Intuition"` guard.
 * Expected rowCount: 2.
 */
const FIXTURE_TWO_POSES = JSON.stringify({
  '2024-01-15': {
    student: {
      UserId: 'user-abc',
      'session-ts-001': {
        DaRep: 1,
        Hints: { HintCount: 2 },
        LatinSquareOrder: 'ABC',
        'conjecture-001': {
          'TF Given Answer': 'true',
          'TF Correct': 'yes',
          'TF Correct Answer': 'true',
          'MCQ Given Answer': 'A',
          'MCQ Correct': 'yes',
          'MCQ Correct Answer': 'A',
          'Pose 1-1': {
            StartGMT: '2024-01-15T10:00:00.000Z',
            Start: 1705312800000,
            MatchGMT: '2024-01-15T10:00:05.000Z',
          },
          Intuition: {
            StartGMT: '2024-01-15T10:01:00.000Z',
            Start: 1705312860000,
            MatchGMT: '2024-01-15T10:01:05.000Z',
          },
        },
      },
    },
  },
});

/**
 * Session with a UserId entry only — no conjecture/pose entries.
 * Expected rowCount: 0.
 */
const FIXTURE_NO_POSES = JSON.stringify({
  '2024-01-15': {
    student: {
      UserId: 'user-abc',
    },
  },
});

/**
 * Fixture with ALL optional fields absent so every `??` operator's right-hand
 * ("null" fallback) branch is exercised:
 *   - roleData.UserId absent          → line 39  ?? right branch
 *   - sessionData.DaRep absent        → line 45  ?? right branch
 *   - sessionData.Hints absent        → line 46  ?. + ?? right branches
 *   - sessionData.LatinSquareOrder    → line 47  ?? right branch
 *   - TF / MCQ fields absent          → lines 56-61 ?? right branches
 *   - poseDetails.StartGMT absent     → line 67  ?? right branch
 *   - poseDetails.Start absent        → line 68  ?? right branch
 *   - poseDetails.MatchGMT absent     → line 87  ?? right branch
 */
const FIXTURE_SPARSE_FIELDS = JSON.stringify({
  '2024-02-01': {
    teacher: {
      // No UserId key
      'session-ts-002': {
        // No DaRep, Hints, or LatinSquareOrder
        'conjecture-sparse': {
          // No TF or MCQ answer keys; empty pose details
          'Pose 2-1': {
            // No StartGMT, Start, or MatchGMT
          },
        },
      },
    },
  },
});

// ─── Browser API mocks ────────────────────────────────────────────────────────

let mockLink;

beforeAll(() => {
  // Fix the `formattedgame` typo in the source: the global scope sits at the
  // top of the scope chain, so a property set here is accessible as a bare
  // identifier inside the function body.
  global.formattedgame = 'test-game';

  // jsdom does not implement URL.createObjectURL / revokeObjectURL.
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLink = { href: '', download: '', click: jest.fn() };
  jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('convertJsonToCsv', () => {
  test('returns success:true for a valid JSON fixture', async () => {
    const result = await convertJsonToCsv(FIXTURE_TWO_POSES, 'GameA', '2024-01-01', '2024-01-31');
    expect(result.success).toBe(true);
  });

  test('returns rowCount of 2 for a fixture with Pose and Intuition entries', async () => {
    const result = await convertJsonToCsv(FIXTURE_TWO_POSES, 'GameA', '2024-01-01', '2024-01-31');
    expect(result.rowCount).toBe(2);
  });

  test('CSV output includes all required column headers on the first line', async () => {
    const result = await convertJsonToCsv(FIXTURE_TWO_POSES, 'GameA', '2024-01-01', '2024-01-31');
    const headerLine = result.csvContent.split('\n')[0];
    expect(headerLine).toContain('UTC Time');
    expect(headerLine).toContain('Unix Time Stamp');
    expect(headerLine).toContain('ID');
    expect(headerLine).toContain('ROLE');
    expect(headerLine).toContain('Pose');
    expect(headerLine).toContain('Start Match');
  });

  test('data rows contain userId, role, and StartGMT from the fixture', async () => {
    const result = await convertJsonToCsv(FIXTURE_TWO_POSES, 'GameA', '2024-01-01', '2024-01-31');
    const lines = result.csvContent.split('\n');
    // lines[0] = headers; lines[1] = first data row (Pose 1-1)
    const firstDataRow = lines[1];
    expect(firstDataRow).toContain('user-abc');
    expect(firstDataRow).toContain('student');
    expect(firstDataRow).toContain('2024-01-15T10:00:00.000Z');
  });

  test('returns rowCount of 0 when the session has no pose entries', async () => {
    const result = await convertJsonToCsv(FIXTURE_NO_POSES, 'GameA', '2024-01-01', '2024-01-31');
    expect(result.rowCount).toBe(0);
  });

  test('throws a wrapped error message when the input is not valid JSON', async () => {
    await expect(
      convertJsonToCsv('not-valid-json', 'GameA', '2024-01-01', '2024-01-31')
    ).rejects.toThrow('Failed to convert file:');
  });

  test('uses "null" string fallbacks for all absent optional fields', async () => {
    const result = await convertJsonToCsv(
      FIXTURE_SPARSE_FIELDS, 'GameB', '2024-02-01', '2024-02-28'
    );
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(1); // Pose 2-1 is the only pose entry

    // Every ?? right branch produces the literal string "null" in the CSV
    const dataRow = result.csvContent.split('\n')[1];
    // ID column: no UserId → "null"
    // DA Rep: no DaRep → "null"
    // UTC Time: no StartGMT → "null"
    expect(dataRow).toContain('"null"');
  });
});

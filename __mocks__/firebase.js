/**
 * Firebase mocks - entry point
 *
 * Mocks are applied via moduleNameMapper in jest.config.js.
 * Individual mocks live in __mocks__/firebase/:
 *
 * - app.js      → firebase/app (initializeApp)
 * - auth.js     → firebase/auth (getAuth, onAuthStateChanged, setPersistence)
 * - database.js → firebase/database (getDatabase, ref, set, get, push, update, etc.)
 * - storage.js  → firebase/storage (getStorage)
 * - fixtures.js → shared fixture data (FIXTURE_USER, FIXTURE_CONJECTURE, etc.)
 *
 * Usage: Import Firebase in tests as usual - mocks are applied automatically.
 */

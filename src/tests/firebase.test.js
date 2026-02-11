/**
 * Firebase Mocks Smoke Test
 * Verifies Firebase mocks can be imported and used without errors
 */

describe('Firebase Mocks Smoke Test', () => {
  it('should import and use all Firebase modules without errors', async () => {
    const { initializeApp } = require('firebase/app');
    const { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } = require('firebase/auth');
    const { getDatabase, ref, set, get, push, setGetMockData } = require('firebase/database');
    const { getStorage } = require('firebase/storage');

    const config = { projectId: 'test-project', apiKey: 'test-key' };
    const app = initializeApp(config);

    const auth = getAuth(app);
    expect(auth.currentUser).toBeDefined();

    onAuthStateChanged(auth, () => {});
    await setPersistence(auth, browserSessionPersistence);

    const db = getDatabase(app);
    const dbRef = ref(db, 'test/path');
    setGetMockData({ test: 'data' });

    const snapshot = await get(dbRef);
    expect(snapshot.exists()).toBe(true);

    await set(dbRef, { foo: 'bar' });
    await push(dbRef, { score: 100 });

    const storage = getStorage(app);
    expect(storage).toBeDefined();
  });
});

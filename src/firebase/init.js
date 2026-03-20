// Firebase Init
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getStorage } from "firebase/storage";

// console.log('[Firebase Init] Starting initialization...');


// Firebase config
const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId,
};

// console.log('[Firebase Init] Config:', {
//   projectId: firebaseConfig.projectId,
//   authDomain: firebaseConfig.authDomain,
//   hasApiKey: !!firebaseConfig.apiKey
// });

// Initialize Firebase with modular API
let app;
try {
  app = initializeApp(firebaseConfig);
  // console.log('[Firebase Init] App initialized successfully:', app.options.projectId);
} catch (error) {
  console.error('[Firebase Init] Error initializing app:', error);
  throw error;
}

const auth = getAuth(app);
const storage = getStorage(app);

// console.log('[Firebase Init] Auth and Storage initialized');

// Set session persistence
setPersistence(auth, browserSessionPersistence)
  .then(() => {
    // console.log('[Firebase Init] Session persistence set successfully');
  })
  .catch((error) => {
    console.error('[Firebase Init] Error setting session persistence:', error);
  });

// console.log('[Firebase Init] Exporting app, auth, storage');
export { app, auth, storage };


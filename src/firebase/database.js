// Firebase Init
import { ref, push, getDatabase, set, query, equalTo, get, orderByChild, orderByKey, onValue, child, startAt, endAt, remove, update, limitToFirst } from "firebase/database";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { app } from "./init";

import { Curriculum } from "../components/CurricularModule/CurricularModule";
import { parse } from "querystring-es3";

import { convertJsonToCsv, } from "../firebase/jsonTOcsv.js";

// Import the uuid library
import { v4 as uuidv4 } from 'uuid';

const db = getDatabase(app);

// Get the Firebase authentication instance
const auth = getAuth(app);

// Declare variables that change on user change -> these represent paths in the Firebase
let userId;
let userEmail;
let userName;
let userRole;
let date;
let readableDate;
let loginTime;

// --- Device identity (minimal) ---
let deviceId, deviceNickname, deviceSlug;
const sanitize = (s) => (s || "").toString().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);

const ensureDeviceIdentity = () => {
  let id = localStorage.getItem("thvo_device_id");
  if (!id) {
    id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : uuidv4();
    localStorage.setItem("thvo_device_id", id);
  }
  let nick = localStorage.getItem("thvo_device_nickname");
  if (!nick || !nick.trim()) {
    const plat = navigator?.userAgentData?.platform || navigator?.platform || "device";
    nick = sanitize(plat);
    localStorage.setItem("thvo_device_nickname", nick);
  }
  deviceId = id;
  deviceNickname = nick;
  deviceSlug = sanitize(`${nick}-${id.substring(0, 8)}`);
};

const padTo2Digits = (num) => {
  return num.toString().padStart(2, '0');
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = padTo2Digits(date.getMonth() + 1);
  const day = padTo2Digits(date.getDate());

  return `${year}-${month}-${day}`;
};

// Declare variables that change on game state change
let eventType;
let gameId;
let conjectureId;

// Listen for changes to the authentication state
// and update the userId variable accordingly
onAuthStateChanged(auth, (user) => {
  if (user) {
    userId = user.uid;
    userEmail = user.email;
    userName = userEmail.split('@')[0];
    date = new Date();
    loginTime = date.toUTCString();
    readableDate = formatDate(date);

    // NEW: ensure we have a stable per-device identity
    ensureDeviceIdentity();
  } else {
    // User is signed out or not authenticated
    userId = null;
    userEmail = null;
    userName = null;
  }
});

// Define data keys for the text inputs of conjectures
export const keysToPush = [
  "Conjecture Name",
  "Author Name",
  "PIN",
  "Conjecture Keywords",
  "Conjecture Statement",
  "Intuition Description",
  "Intuition Correct Answer",
  "MCQ Question",
  "Conjecture Description", // Kept for backward compatibility
  "Multiple Choice 1",
  "Multiple Choice 2",
  "Multiple Choice 3",
  "Multiple Choice 4",
  "Correct Answer",
];

// text boxes for the curricular editor
export const curricularTextBoxes = [ 
  "CurricularName", // if these are renamed, keep the order the same
  "CurricularAuthor", 
  "CurricularKeywords",
  "CurricularPIN",
]

// Frame buffer to store poses before batch writing
let frameBuffer = [];
// Use Map to track initialized sessions per user/device/session combination
const initializedSessions = new Map(); // Key: sessionKey (userId_deviceSlug_loginTime_UUID), Value: true
let flushPromises = []; // Track batch write promises for promise checking
let lastEventType = null; // Track last known event type for change detection
let isFlushing = false; // Flag to prevent concurrent flush operations

// Timing trackers for analytics
let gameStartTime = null;
let lastEventTime = null;

// Helper function to generate unique session key
const getSessionKey = (userId, deviceSlug, loginTime, UUID) => {
  return `${userId}_${deviceSlug}_${loginTime}_${UUID}`;
};

// Initialize session with static data (call once per session)
export const initializeSession = async (gameId, frameRate, UUID, orgId) => {
  // Generate unique session key for this user/device/session combination
  const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
  
  // Prevent duplicate initialization for this specific session
  if (initializedSessions.has(sessionKey)) {
    return;
  }
  
  const dateObj = new Date();
  const timestampGMT = dateObj.toUTCString();
  const unixTimestamp = Date.now();
  gameStartTime = unixTimestamp;
  lastEventTime = unixTimestamp;
  
  // Initialize session regardless of eventType - eventType will be set when pose starts
  const sessionRef = ref(db, `_PoseData/${orgId}/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${UUID}`);
  
  // All static data
  const sessionData = {
    userId,
    userName,
    deviceId,
    deviceNickname,
    frameRate,
    loginTime,
    sessionStartTime: timestampGMT,
  };
  
  // Store session metadata once
  await set(sessionRef, sessionData);
  initializedSessions.set(sessionKey, true);
  lastEventType = null; // Start with null so first event gets detected
};

// Buffer frame data (called every frame)
export const bufferPoseData = async (poseData, gameId, UUID, frameRate = 12, orgId) => {
  if (eventType === null) return;
  
  const frameData = {
    pose: JSON.stringify(poseData),
    timestamp: new Date().toUTCString(),
  };
  
  frameBuffer.push(frameData);
};

// Batch write all buffered frames (call periodically)
export const flushFrameBuffer = async (gameId, UUID, frameRate = 12, orgId, targetEventType = null) => {
  // Use targetEventType if provided, otherwise use current eventType
  const eventTypeToUse = targetEventType !== null ? targetEventType : eventType;
  
  if (frameBuffer.length === 0 || eventTypeToUse === null) return;
  
  // Prevent concurrent flush operations
  if (isFlushing) {
    return;
  }
  
  // Ensure session is initialized before writing frames
  const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
  if (!initializedSessions.has(sessionKey)) {
    console.warn('Session not initialized. Call initializeSession() first.');
    return;
  }
  
  isFlushing = true;
  
  try {
    const framesRef = ref(db, `_PoseData/${orgId}/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${UUID}/frames/${eventTypeToUse}`);
    
    // Create batch update object
    const updates = {};
    
    // Use padded timestamp to ensure chronological ordering in Firebase
    const batchTimestamp = Date.now();
    const paddedBatchId = batchTimestamp.toString().padStart(15, '0'); // Pad to 15 digits for proper sorting
    
    frameBuffer.forEach((frame, index) => {
      // Create keys that will sort chronologically: batch_000001692123456789_frame_00001
      const paddedIndex = index.toString().padStart(5, '0');
      updates[`batch_${paddedBatchId}_frame_${paddedIndex}`] = frame;
    });
    
    // Write all frames at once and track the promise
    const flushPromise = update(framesRef, updates);
    flushPromises.push(flushPromise);
    
    // Run promise checker to detect data loss
    promiseChecker(frameRate, flushPromises);
    
    await flushPromise;
    
    // Clear the buffer and update last known event type
    // Use the eventTypeToUse for lastEventType to maintain correct state
    frameBuffer = [];
    lastEventType = eventTypeToUse;
    
    isFlushing = false;
    return true;
  } catch (error) {
    console.error('Error flushing frame buffer:', error);
    isFlushing = false;
    return false;
  }
};

// Check for event type change and flush if needed
const checkEventTypeChange = async (gameId, UUID, frameRate = 12, orgId) => {
  if (eventType !== lastEventType && frameBuffer.length > 0) {
    // Check if session is initialized before flushing
    const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
    if (!initializedSessions.has(sessionKey)) {
      console.warn(`Cannot flush buffer: Session not initialized yet. Event type changed from ${lastEventType} to ${eventType}`);
      return false;
    }
    
    await flushFrameBuffer(gameId, UUID, frameRate, orgId);
    return true;
  }
  return false;
};

// Get current buffer size (useful for monitoring)
export const getBufferSize = () => frameBuffer.length;

// Force flush and reset session (call on session end)
export const endSession = async (gameId, UUID, frameRate = 12, orgId) => {
  // Generate unique session key for this user/device/session combination
  const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
  
  // Save the event type before flushing - use lastEventType if available, otherwise current eventType
  // This ensures we flush with the correct event type even if eventType has already changed
  const eventTypeToFlush = lastEventType !== null ? lastEventType : eventType;
  
  // Flush any remaining frames with the saved event type
  if (eventTypeToFlush !== null && frameBuffer.length > 0) {
    await flushFrameBuffer(gameId, UUID, frameRate, orgId, eventTypeToFlush);
  }
  
  // Wait for all pending flush promises to settle (like original implementation)
  await Promise.allSettled(flushPromises);
  
  // Reset session state only for this specific session
  initializedSessions.delete(sessionKey);
  frameBuffer = [];
  flushPromises = []; // Clear promise tracking
  lastEventType = null; // Reset event type tracking
  isFlushing = false; // Reset flush flag
  
  console.log('Session ended and cleaned up for session:', sessionKey);
};

// Hybrid flush strategy
let MAX_BUFFER_SIZE = 50; // Make it mutable so it can be updated by options

export const bufferPoseDataWithAutoFlush = async (poseData, gameId, UUID, frameRate = 12, orgId) => {
  if (eventType === null) return;
  
  // Check for event type change first and flush if needed
  await checkEventTypeChange(gameId, UUID, frameRate, orgId);
  
  // Add to buffer
  await bufferPoseData(poseData, gameId, UUID, frameRate, orgId);
  
  // Immediate flush if buffer is getting too big (uses MAX_BUFFER_SIZE)
  if (frameBuffer.length >= MAX_BUFFER_SIZE) {
    // Check if session is initialized before flushing
    const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
    if (!initializedSessions.has(sessionKey)) {
      console.warn(`Cannot flush buffer: Session not initialized yet. Buffer size: ${frameBuffer.length}`);
      return;
    }
    
    await flushFrameBuffer(gameId, UUID, frameRate, orgId);
  }
};

// Enhanced buffer function that checks for event changes
export const bufferPoseDataWithEventCheck = async (poseData, gameId, UUID, frameRate = 12, orgId) => {
  if (eventType === null) return;
  
  // Check for event type change and flush if needed
  const flushedDueToEventChange = await checkEventTypeChange(gameId, UUID, frameRate, orgId);
  
  // Add to buffer after potential flush
  await bufferPoseData(poseData, gameId, UUID, frameRate, orgId);
  
  return flushedDueToEventChange;
};

// Start hybrid auto-flush (time-based + size-based + event-change-based)
export const startSmartAutoFlush = (gameId, UUID, orgId, options = {}) => {
  const { 
    maxBufferSize = 100,     // This sets MAX_BUFFER_SIZE for immediate flushes
    flushIntervalMs = 8000,
    minBufferSize = 5,      // Don't flush tiny batches too often
    frameRate = 12          // Pass frameRate for promise checker
  } = options;
  
  // Update the global MAX_BUFFER_SIZE based on options
  MAX_BUFFER_SIZE = maxBufferSize;
  
  return setInterval(async () => {
    // Check for event type change first
    const flushedDueToEventChange = await checkEventTypeChange(gameId, UUID, frameRate, orgId);
    
    // Only do time-based flush if we didn't just flush due to event change
    if (!flushedDueToEventChange && frameBuffer.length >= minBufferSize) {
      await flushFrameBuffer(gameId, UUID, frameRate, orgId);
    }
  }, flushIntervalMs);
};

export const stopAutoFlush = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
  }
};

// Utility function to manually trigger event change check
export const forceEventTypeCheck = async (gameId, UUID, frameRate = 12, orgId) => {
  return await checkEventTypeChange(gameId, UUID, frameRate, orgId);
};

export const loadGameDialoguesFromFirebase = async (gameId, orgId) => {
  if (!gameId) {
    alert("No gameId provided!");
    return [];
  }
  const dbRef = ref(db, `orgs/${orgId}/games/${gameId}/Dialogues`);
  const snapshot = await get(dbRef);
  return snapshot.exists() ? snapshot.val() : [];
};

// Helper function to get current user's organization context
export const getCurrentOrgContext = async () => {
  try {
    // Import here to avoid circular dependency
    const userDatabaseModule = await import('./userDatabase.js');
    const getCurrentUserContext = userDatabaseModule?.getCurrentUserContext;
    if (!getCurrentUserContext || typeof getCurrentUserContext !== 'function') {
      console.error('getCurrentOrgContext: getCurrentUserContext is not a function');
      return { orgId: null, role: null };
    }
    const result = await getCurrentUserContext(app);
    return result;
  } catch (error) {
    console.error('getCurrentOrgContext: Error getting current org context:', error);
    return { orgId: null, role: null };
  }
};

// Wrapper functions for backward compatibility - automatically use current user's org
export const writeToDatabaseConjectureWithCurrentOrg = async (existingUUID) => {
  // Check if level is from another organization - use source org ID
  const isFromOtherOrg = localStorage.getItem('_isFromOtherOrg') === 'true';
  const sourceOrgId = localStorage.getItem('_sourceOrgId');
  
  let orgId;
  if (isFromOtherOrg && sourceOrgId) {
    // Use the source organization ID for levels from other organizations
    orgId = sourceOrgId;
  } else {
    // Use current user's organization for levels from current organization
    const context = await getCurrentOrgContext();
    orgId = context.orgId;
    if (!orgId) {
      alert("User is not in any organization. Please contact administrator.");
      return false;
    }
  }
  
  return writeToDatabaseConjecture(existingUUID, orgId);
};

export const writeToDatabaseConjectureDraftWithCurrentOrg = async (existingUUID) => {
  // Check if level is from another organization - use source org ID
  const isFromOtherOrg = localStorage.getItem('_isFromOtherOrg') === 'true';
  const sourceOrgId = localStorage.getItem('_sourceOrgId');
  
  let orgId;
  if (isFromOtherOrg && sourceOrgId) {
    // Use the source organization ID for levels from other organizations
    orgId = sourceOrgId;
  } else {
    // Use current user's organization for levels from current organization
    const context = await getCurrentOrgContext();
    orgId = context.orgId;
    if (!orgId) {
      alert("User is not in any organization. Please contact administrator.");
      return false;
    }
  }
  
  return writeToDatabaseConjectureDraft(existingUUID, orgId);
};

export const deleteFromDatabaseConjectureWithCurrentOrg = async (existingUUID) => {
  // Check if level is from another organization - use source org ID
  const isFromOtherOrg = localStorage.getItem('_isFromOtherOrg') === 'true';
  const sourceOrgId = localStorage.getItem('_sourceOrgId');
  
  let orgId;
  if (isFromOtherOrg && sourceOrgId) {
    // Use the source organization ID for levels from other organizations
    orgId = sourceOrgId;
  } else {
    // Use current user's organization for levels from current organization
    const context = await getCurrentOrgContext();
    orgId = context.orgId;
    if (!orgId) {
      alert("User is not in any organization. Please contact administrator.");
      return false;
    }
  }
  
  return deleteFromDatabaseConjecture(existingUUID, orgId);
};

export const getConjectureListWithCurrentOrg = async (final, includePublicFromOtherOrgs = false) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return [];
  }
  
  // Get all levels in organization
  const allLevels = await getConjectureList(final, orgId);
  
  // Handle null/undefined case
  let result = allLevels || [];
  
  // If requested, also get public levels from other organizations
  if (includePublicFromOtherOrgs) {
    try {
      const db = getDatabase(app);
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        for (const [otherOrgId, orgData] of Object.entries(orgs)) {
          if (otherOrgId === orgId) continue; // Skip current org
          
          const levelsRef = ref(db, `orgs/${otherOrgId}/levels`);
          const levelsSnapshot = await get(levelsRef);
          
          if (levelsSnapshot.exists()) {
            const otherLevels = levelsSnapshot.val();
            for (const [levelId, levelData] of Object.entries(otherLevels)) {
              // Only include public levels
              if (levelData.isPublic === true) {
                // Mark as from other organization for filtering and save source org ID
                result.push({ ...levelData, _isFromOtherOrg: true, _sourceOrgId: otherOrgId });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching public levels from other orgs:', error);
    }
  }
  
  return result;
};

export const getCurricularListWithCurrentOrg = async (final, includePublicFromOtherOrgs = false) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return [];
  }
  
  // Get all games in organization
  const allGames = await getCurricularList(final, orgId);
  
  // Handle null/undefined case
  let result = allGames || [];
  
  // If requested, also get public games from other organizations
  if (includePublicFromOtherOrgs) {
    try {
      const db = getDatabase(app);
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        for (const [otherOrgId, orgData] of Object.entries(orgs)) {
          if (otherOrgId === orgId) continue; // Skip current org
          
          const gamesRef = ref(db, `orgs/${otherOrgId}/games`);
          const gamesSnapshot = await get(gamesRef);
          
          if (gamesSnapshot.exists()) {
            const otherGames = gamesSnapshot.val();
            for (const [gameId, gameData] of Object.entries(otherGames)) {
              // Only include public games
              if (gameData.isPublic === true) {
                // Mark as from other organization for filtering and save source org ID
                result.push({ ...gameData, _isFromOtherOrg: true, _sourceOrgId: otherOrgId });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching public games from other orgs:', error);
    }
  }
  
  return result;
};

export const searchConjecturesByWordWithCurrentOrg = async (searchWord) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return [];
  }
  
  // Get search results from current organization
  const searchResults = await searchConjecturesByWord(searchWord, orgId);
  
  // Handle null/undefined case
  let result = searchResults || [];
  
  // Also search public levels from other organizations
  try {
    const db = getDatabase(app);
    const orgsRef = ref(db, 'orgs');
    const orgsSnapshot = await get(orgsRef);
    
    if (orgsSnapshot.exists()) {
      const orgs = orgsSnapshot.val();
      const normalizedSearchWord = searchWord?.toLowerCase?.() || "";
      const isCleared = normalizedSearchWord.trim() === "";
      
      for (const [otherOrgId, orgData] of Object.entries(orgs)) {
        if (otherOrgId === orgId) continue; // Skip current org
        
        const levelsRef = ref(db, `orgs/${otherOrgId}/levels`);
        const levelsSnapshot = await get(levelsRef);
        
        if (levelsSnapshot.exists()) {
          const otherLevels = levelsSnapshot.val();
          for (const [levelId, levelData] of Object.entries(otherLevels)) {
            // Only include public levels
            if (levelData.isPublic === true) {
              // Apply the same search logic
              if (isCleared) {
                // If cleared or empty, include all public levels
                result.push({ ...levelData, _isFromOtherOrg: true, _sourceOrgId: otherOrgId });
              } else {
                // Check if search word matches
                const searchWords = levelData?.['Search Words'];
                if (searchWords) {
                  for (const word of Object.keys(searchWords)) {
                    if (word.toLowerCase() === normalizedSearchWord) {
                      result.push({ ...levelData, _isFromOtherOrg: true, _sourceOrgId: otherOrgId });
                      break; // stop checking more keys
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching public levels from other orgs in search:', error);
  }
  
  return result;
};

export const saveGameWithCurrentOrg = async (UUID = null, isFinal = false) => {
  // Check if game is from another organization - use source org ID
  const isFromOtherOrg = localStorage.getItem('Game_isFromOtherOrg') === 'true';
  const sourceOrgId = localStorage.getItem('Game_sourceOrgId');
  
  let orgId;
  if (isFromOtherOrg && sourceOrgId) {
    // Use the source organization ID for games from other organizations
    orgId = sourceOrgId;
  } else {
    // Use current user's organization for games from current organization
    const context = await getCurrentOrgContext();
    orgId = context.orgId;
    if (!orgId) {
      alert("User is not in any organization. Please contact administrator.");
      return false;
    }
  }
  
  return saveGame(UUID, isFinal, orgId);
};

export const deleteFromDatabaseCurricularWithCurrentOrg = async (UUID) => {
  // Check if game is from another organization - use source org ID
  const isFromOtherOrg = localStorage.getItem('Game_isFromOtherOrg') === 'true';
  const sourceOrgId = localStorage.getItem('Game_sourceOrgId');
  
  let orgId;
  if (isFromOtherOrg && sourceOrgId) {
    // Use the source organization ID for games from other organizations
    orgId = sourceOrgId;
  } else {
    // Use current user's organization for games from current organization
    const context = await getCurrentOrgContext();
    orgId = context.orgId;
    if (!orgId) {
      alert("User is not in any organization. Please contact administrator.");
      return false;
    }
  }
  
  return deleteFromDatabaseCurricular(UUID, orgId);
};

export const saveNarrativeDraftToFirebaseWithCurrentOrg = async (UUID, dialogues) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    alert("User is not in any organization. Please contact administrator.");
    return;
  }
  return saveNarrativeDraftToFirebase(UUID, dialogues, orgId);
};

// Wrapper functions for data retrieval with current org
export const getConjectureDataByUUIDWithCurrentOrg = async (conjectureID, includePublicFromOtherOrgs = true, forceLoadPrivate = false) => {
  console.log('getConjectureDataByUUIDWithCurrentOrg: Called with conjectureID:', conjectureID, 'includePublicFromOtherOrgs:', includePublicFromOtherOrgs, 'forceLoadPrivate:', forceLoadPrivate);
  const { orgId } = await getCurrentOrgContext();
  console.log('getConjectureDataByUUIDWithCurrentOrg: Current orgId:', orgId);
  if (!orgId) {
    console.warn("getConjectureDataByUUIDWithCurrentOrg: User is not in any organization.");
    return null;
  }
  
  // First, try to find in current organization
  console.log('getConjectureDataByUUIDWithCurrentOrg: Calling getConjectureDataByUUID with:', { conjectureID, orgId });
  let result = await getConjectureDataByUUID(conjectureID, orgId);
  console.log('getConjectureDataByUUIDWithCurrentOrg: Result from current org:', result);
  
  // If not found in current org, search in all other organizations
  // Search if includePublicFromOtherOrgs is true OR if forceLoadPrivate is true (to load private levels from game's level list)
  if (!result && (includePublicFromOtherOrgs || forceLoadPrivate)) {
    console.log('getConjectureDataByUUIDWithCurrentOrg: Level not found in current org, searching in other organizations...');
    try {
      const db = getDatabase(app);
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        for (const [otherOrgId, orgData] of Object.entries(orgs)) {
          if (otherOrgId === orgId) continue; // Skip current org (already searched)
          
          const levelsRef = ref(db, `orgs/${otherOrgId}/levels`);
          const levelsSnapshot = await get(levelsRef);
          
          if (levelsSnapshot.exists()) {
            const otherLevels = levelsSnapshot.val();
            for (const [levelId, levelData] of Object.entries(otherLevels)) {
              if (levelData.UUID === conjectureID) {
                // If forceLoadPrivate is true, load regardless of isPublic status
                // Otherwise, only include public levels from other organizations
                if (forceLoadPrivate || levelData.isPublic === true) {
                  console.log(`getConjectureDataByUUIDWithCurrentOrg: Found level in organization ${otherOrgId} (forceLoadPrivate: ${forceLoadPrivate}, isPublic: ${levelData.isPublic})`);
                  
                  // Check structure of levelData before returning
                  const levelDataKeys = Object.keys(levelData);
                  const hasStartPose = levelData['Start Pose'] !== undefined;
                  const hasIntermediatePose = levelData['Intermediate Pose'] !== undefined;
                  const hasEndPose = levelData['End Pose'] !== undefined;
                  
                  console.log('getConjectureDataByUUIDWithCurrentOrg: Level data structure check:', {
                    'levelData keys': levelDataKeys,
                    'has Start Pose': hasStartPose,
                    'has Intermediate Pose': hasIntermediatePose,
                    'has End Pose': hasEndPose,
                    'Start Pose structure': hasStartPose ? Object.keys(levelData['Start Pose']) : null,
                    'Intermediate Pose structure': hasIntermediatePose ? Object.keys(levelData['Intermediate Pose']) : null,
                    'End Pose structure': hasEndPose ? Object.keys(levelData['End Pose']) : null
                  });
                  
                  // Return the level data with UUID as key to match expected format in LevelPlay.js
                  const result = { [conjectureID]: { ...levelData, _isFromOtherOrg: true, _sourceOrgId: otherOrgId } };
                  console.log('getConjectureDataByUUIDWithCurrentOrg: Returning result with structure:', {
                    'result keys': Object.keys(result),
                    'result[UUID] keys': result[conjectureID] ? Object.keys(result[conjectureID]) : null
                  });
                  return result;
                } else {
                  console.log(`getConjectureDataByUUIDWithCurrentOrg: Found level in organization ${otherOrgId} but it is not public`);
                }
              }
            }
          }
        }
        console.log('getConjectureDataByUUIDWithCurrentOrg: Level not found in any organization');
      }
    } catch (error) {
      console.error('getConjectureDataByUUIDWithCurrentOrg: Error searching in other organizations:', error);
      // Return null if search fails
    }
  } else if (!result && !includePublicFromOtherOrgs && !forceLoadPrivate) {
    console.log('getConjectureDataByUUIDWithCurrentOrg: Level not found in current org and includePublicFromOtherOrgs is false and forceLoadPrivate is false, skipping search in other organizations');
  }
  
  // Log final result structure before returning
  if (result) {
    const resultKeys = Object.keys(result);
    const uuidKey = resultKeys[0];
    if (uuidKey && result[uuidKey]) {
      const levelData = result[uuidKey];
      const levelDataKeys = Object.keys(levelData);
      const hasStartPose = levelData['Start Pose'] !== undefined;
      const hasIntermediatePose = levelData['Intermediate Pose'] !== undefined;
      const hasEndPose = levelData['End Pose'] !== undefined;
      
      console.log('getConjectureDataByUUIDWithCurrentOrg: Final result structure:', {
        'result keys': resultKeys,
        'levelData keys': levelDataKeys,
        'has Start Pose': hasStartPose,
        'has Intermediate Pose': hasIntermediatePose,
        'has End Pose': hasEndPose,
        'Start Pose keys': hasStartPose ? Object.keys(levelData['Start Pose']) : null,
        'Intermediate Pose keys': hasIntermediatePose ? Object.keys(levelData['Intermediate Pose']) : null,
        'End Pose keys': hasEndPose ? Object.keys(levelData['End Pose']) : null
      });
    } else {
      console.warn('getConjectureDataByUUIDWithCurrentOrg: Result structure is unexpected:', result);
    }
  } else {
    console.warn('getConjectureDataByUUIDWithCurrentOrg: Returning null - level not found');
  }
  
  return result;
};

export const getCurricularDataByUUIDWithCurrentOrg = async (curricularID) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return null;
  }
  return getCurricularDataByUUID(curricularID, orgId);
};

export const getLevelNameByUUIDWithCurrentOrg = async (levelUUID) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return 'UnknownLevel';
  }
  return getLevelNameByUUID(levelUUID, orgId);
};

export const getGameNameByUUIDWithCurrentOrg = async (gameID) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return 'UnknownGame';
  }
  return getGameNameByUUID(gameID, orgId);
};

export const loadGameDialoguesFromFirebaseWithCurrentOrg = async (gameId) => {
  const { orgId } = await getCurrentOrgContext();
  if (!orgId) {
    console.warn("User is not in any organization.");
    return [];
  }
  return loadGameDialoguesFromFirebase(gameId, orgId);
};


export const writeToDatabasePoseAuth = async (poseData, state, tolerance) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();

  // Create a reference to the Firebase Realtime Database
  const dbRef = ref(db, "/PoseAuthoring");

  // Create an object to send to the database
  // This object includes the userId, poseData, conjectureId, frameRate, and timestamp
  const dataToSend = {
    userId,
    poseData,
    timestamp,
    state,
    tolerance,
  };

  // Push the data to the database using the dbRef reference
  const promise = push(dbRef, dataToSend);

  // Return the promise that push() returns
  return promise;
};

export const writeToDatabaseConjecture = async (existingUUID, orgId) => {
  try {
    const dateObj = new Date();
    const timestamp = dateObj.toISOString();
    const conjectureID = existingUUID ?? uuidv4();

    const dataToPush = {};

    // Auto-fill "Conjecture Statement" from old fields for backward compatibility when loading old levels
    const conjectureStatement = localStorage.getItem('Conjecture Statement');
    const intuitionDesc = localStorage.getItem('Intuition Description');
    const mcqQuestion = localStorage.getItem('MCQ Question');
    const conjectureDesc = localStorage.getItem('Conjecture Description');
    
    // If Conjecture Statement doesn't exist, try to create it from old fields
    if ((!conjectureStatement || conjectureStatement.trim() === '')) {
      if (intuitionDesc && intuitionDesc.trim() !== '') {
        localStorage.setItem('Conjecture Statement', intuitionDesc);
        console.log('writeToDatabaseConjecture: Auto-filled Conjecture Statement from Intuition Description');
      } else if (mcqQuestion && mcqQuestion.trim() !== '') {
        localStorage.setItem('Conjecture Statement', mcqQuestion);
        console.log('writeToDatabaseConjecture: Auto-filled Conjecture Statement from MCQ Question');
      } else if (conjectureDesc && conjectureDesc.trim() !== '') {
        localStorage.setItem('Conjecture Statement', conjectureDesc);
        console.log('writeToDatabaseConjecture: Auto-filled Conjecture Statement from Conjecture Description');
      }
    }

    // Auto-fill old fields from "Conjecture Statement" for backward compatibility
    // This ensures old levels that use "Intuition Description" and "MCQ Question" still work
    const finalConjectureStatement = localStorage.getItem('Conjecture Statement');
    if (finalConjectureStatement && finalConjectureStatement.trim() !== '') {
      if (!intuitionDesc || intuitionDesc.trim() === '') {
        localStorage.setItem('Intuition Description', finalConjectureStatement);
        console.log('writeToDatabaseConjecture: Auto-filled Intuition Description from Conjecture Statement');
      }
      if (!mcqQuestion || mcqQuestion.trim() === '') {
        localStorage.setItem('MCQ Question', finalConjectureStatement);
        console.log('writeToDatabaseConjecture: Auto-filled MCQ Question from Conjecture Statement');
      }
      if (!conjectureDesc || conjectureDesc.trim() === '') {
        localStorage.setItem('Conjecture Description', finalConjectureStatement);
        console.log('writeToDatabaseConjecture: Auto-filled Conjecture Description from Conjecture Statement');
      }
    }

    // Collect empty fields for better error message
    const emptyFields = keysToPush.filter((key) => {
      const value = localStorage.getItem(key);
      return value === null || value === undefined || value.trim() === '';
    });

    if (emptyFields.length > 0) {
      const fieldsList = emptyFields.join(', ');
      alert(`One or more text values are empty. Cannot publish conjecture to database.\n\nEmpty fields: ${fieldsList}`);
      return false;
    }

    const startJson = localStorage.getItem('start.json');
    const intermediateJson = localStorage.getItem('intermediate.json');
    const endJson = localStorage.getItem('end.json');

    if (!startJson || !intermediateJson || !endJson) {
      alert("One or more poses are missing. Cannot publish conjecture to database.");
      return false;
    }

    // Create pose objects
    const startPoseData = await createPoseObjects(startJson, 'StartPose', localStorage.getItem('Start Tolerance'));
    const intermediatePoseData = await createPoseObjects(intermediateJson, 'IntermediatePose', localStorage.getItem('Intermediate Tolerance'));
    const endPoseData = await createPoseObjects(endJson, 'EndPose', localStorage.getItem('End Tolerance'));

    // Populate dataToPush with text boxes
    await Promise.all(keysToPush.map(async (key) => {
      const value = localStorage.getItem(key);
      if (value && value.trim() !== '') {
        Object.assign(dataToPush, await createTextObjects(key, value));
      }
    }));

    // Prepare search words
    const searchWordsToPush = {
      "Author Name": dataToPush["Author Name"],
      "Conjecture Description": dataToPush["Conjecture Description"],
      "Conjecture Keywords": dataToPush["Conjecture Keywords"],
      "Conjecture Name": dataToPush["Conjecture Name"]
    };

    const concatenatedSearchWords = Object.values(searchWordsToPush).join(" ").toLowerCase();
    const wordsArray = concatenatedSearchWords.split(" ");
    const searchWordsToPushToDatabase = {};

    wordsArray.forEach(word => {
      const cleanWord = word.replace(/[.#$/\[\]/]/g, '');
      if (cleanWord) searchWordsToPushToDatabase[cleanWord] = cleanWord;
    });

    // Firebase path - now under organization
    const conjecturePath = `orgs/${orgId}/levels/${conjectureID}`;

    // Get isPublic flag from localStorage (default to false)
    const isPublic = localStorage.getItem('isPublic') === 'true';

    // Push to Firebase
    const promises = [
      set(ref(db, `${conjecturePath}/Time`), timestamp),
      set(ref(db, `${conjecturePath}/AuthorID`), userId),
      set(ref(db, `${conjecturePath}/UUID`), conjectureID),
      set(ref(db, `${conjecturePath}/PIN`), localStorage.getItem("PIN")),
      set(ref(db, `${conjecturePath}/Start Pose`), startPoseData),
      set(ref(db, `${conjecturePath}/Intermediate Pose`), intermediatePoseData),
      set(ref(db, `${conjecturePath}/End Pose`), endPoseData),
      set(ref(db, `${conjecturePath}/Text Boxes`), dataToPush),
      set(ref(db, `${conjecturePath}/Search Words`), searchWordsToPushToDatabase),
      set(ref(db, `${conjecturePath}/Name`), dataToPush["Conjecture Name"]),
      set(ref(db, `${conjecturePath}/Start Tolerance`), localStorage.getItem('Start Tolerance')),
      set(ref(db, `${conjecturePath}/Intermediate Tolerance`), localStorage.getItem('Intermediate Tolerance')),
      set(ref(db, `${conjecturePath}/End Tolerance`), localStorage.getItem('End Tolerance')),
      set(ref(db, `${conjecturePath}/isFinal`), true),
      set(ref(db, `${conjecturePath}/isPublic`), isPublic),
      set(ref(db, `${conjecturePath}/createdBy`), userId),
      set(ref(db, `${conjecturePath}/createdAt`), timestamp),
      set(ref(db, `${conjecturePath}/updatedAt`), timestamp)
    ];

    await Promise.all(promises);
    
    // If user is a student, automatically assign level to their class
    try {
      const userDatabaseModule = await import('./userDatabase.js');
      const getCurrentUserContext = userDatabaseModule?.getCurrentUserContext;
      if (getCurrentUserContext && typeof getCurrentUserContext === 'function') {
        const userContext = await getCurrentUserContext(app);
        if (userContext?.role === 'Student' && userContext?.orgId === orgId) {
        // Get current class ID from user profile
        const userClassRef = ref(db, `users/${userId}/orgs/${orgId}/currentClassId`);
        const classSnapshot = await get(userClassRef);
        const classId = classSnapshot.exists() ? classSnapshot.val() : null;
        
        if (classId) {
          // Store the level assignment in the class
          await set(ref(db, `orgs/${orgId}/classes/${classId}/assignedLevels/${conjectureID}`), {
            addedAt: timestamp,
            addedBy: userId
          });
        }
      }
      }
    } catch (error) {
      console.error('Error assigning level to class:', error);
      // Don't fail the save if class assignment fails
    }
    
    alert("Conjecture successfully published to database.");
    return true;

  } catch (error) {
    console.error("Error writing conjecture to database:", error);
    alert("An unexpected error occurred. Could not publish conjecture.");
    return false;
  }
};


// save a draft of the current conjecture so it can be published later
export const writeToDatabaseConjectureDraft = async (existingUUID, orgId) => {
  try {
    const dateObj = new Date();
    const timestamp = dateObj.toISOString();
    const conjectureID = existingUUID ?? uuidv4();

    const dataToPush = {};
    let noName = false;

    // Auto-fill "Conjecture Statement" from old fields for backward compatibility when loading old levels
    const conjectureStatement = localStorage.getItem('Conjecture Statement');
    const intuitionDesc = localStorage.getItem('Intuition Description');
    const mcqQuestion = localStorage.getItem('MCQ Question');
    const conjectureDesc = localStorage.getItem('Conjecture Description');
    
    // If Conjecture Statement doesn't exist, try to create it from old fields
    if ((!conjectureStatement || conjectureStatement.trim() === '')) {
      if (intuitionDesc && intuitionDesc.trim() !== '') {
        localStorage.setItem('Conjecture Statement', intuitionDesc);
        console.log('writeToDatabaseConjectureDraft: Auto-filled Conjecture Statement from Intuition Description');
      } else if (mcqQuestion && mcqQuestion.trim() !== '') {
        localStorage.setItem('Conjecture Statement', mcqQuestion);
        console.log('writeToDatabaseConjectureDraft: Auto-filled Conjecture Statement from MCQ Question');
      } else if (conjectureDesc && conjectureDesc.trim() !== '') {
        localStorage.setItem('Conjecture Statement', conjectureDesc);
        console.log('writeToDatabaseConjectureDraft: Auto-filled Conjecture Statement from Conjecture Description');
      }
    }

    // Auto-fill old fields from "Conjecture Statement" for backward compatibility
    // This ensures old levels that use "Intuition Description" and "MCQ Question" still work
    const finalConjectureStatement = localStorage.getItem('Conjecture Statement');
    if (finalConjectureStatement && finalConjectureStatement.trim() !== '') {
      if (!intuitionDesc || intuitionDesc.trim() === '') {
        localStorage.setItem('Intuition Description', finalConjectureStatement);
        console.log('writeToDatabaseConjectureDraft: Auto-filled Intuition Description from Conjecture Statement');
      }
      if (!mcqQuestion || mcqQuestion.trim() === '') {
        localStorage.setItem('MCQ Question', finalConjectureStatement);
        console.log('writeToDatabaseConjectureDraft: Auto-filled MCQ Question from Conjecture Statement');
      }
      if (!conjectureDesc || conjectureDesc.trim() === '') {
        localStorage.setItem('Conjecture Description', finalConjectureStatement);
        console.log('writeToDatabaseConjectureDraft: Auto-filled Conjecture Description from Conjecture Statement');
      }
    }

    // Process text box values
    await Promise.all(keysToPush.map(async (key) => {
      const value = localStorage.getItem(key);

      // If the value is undefined or empty, save it as "undefined" and flag noName if needed
      const sanitizedValue = value === undefined || value === null || value.trim() === '' ? "undefined" : value;

      Object.assign(dataToPush, await createTextObjects(key, sanitizedValue));

      if (key === "Conjecture Name" && sanitizedValue === "undefined") {
        noName = true;
      }
    }));

    if (noName) {
      alert("Please name your level before saving a draft.");
      return false;
    }

    // Prepare search words
    const searchWordsToPush = {
      "Author Name": dataToPush["Author Name"],
      "Conjecture Description": dataToPush["Conjecture Description"],
      "Conjecture Keywords": dataToPush["Conjecture Keywords"],
      "Conjecture Name": dataToPush["Conjecture Name"]
    };

    const concatenatedSearchWords = Object.values(searchWordsToPush).join(" ").toLowerCase();
    const wordsArray = concatenatedSearchWords.split(" ");
    const searchWordsToPushToDatabase = {};

    wordsArray.forEach(word => {
      const cleanWord = word.replace(/[.#$/\[\]/]/g, '');
      if (cleanWord) searchWordsToPushToDatabase[cleanWord] = cleanWord;
    });

    // Create pose data
    const startJson = localStorage.getItem('start.json');
    const intermediateJson = localStorage.getItem('intermediate.json');
    const endJson = localStorage.getItem('end.json');

    const startPoseData = await createPoseObjects(startJson, 'StartPose', localStorage.getItem('Start Tolerance'));
    const intermediatePoseData = await createPoseObjects(intermediateJson, 'IntermediatePose', localStorage.getItem('Intermediate Tolerance'));
    const endPoseData = await createPoseObjects(endJson, 'EndPose', localStorage.getItem('End Tolerance'));

    // Firebase path - now under organization
    const conjecturePath = `orgs/${orgId}/levels/${conjectureID}`;

    const promises = [
      set(ref(db, `${conjecturePath}/Time`), timestamp),
      set(ref(db, `${conjecturePath}/Start Pose`), startPoseData),
      set(ref(db, `${conjecturePath}/Intermediate Pose`), intermediatePoseData),
      set(ref(db, `${conjecturePath}/End Pose`), endPoseData),
      set(ref(db, `${conjecturePath}/Text Boxes`), dataToPush),
      set(ref(db, `${conjecturePath}/Search Words`), searchWordsToPushToDatabase),
      set(ref(db, `${conjecturePath}/UUID`), conjectureID),
      set(ref(db, `${conjecturePath}/Start Tolerance`), localStorage.getItem('Start Tolerance')),
      set(ref(db, `${conjecturePath}/Intermediate Tolerance`), localStorage.getItem('Intermediate Tolerance')),
      set(ref(db, `${conjecturePath}/End Tolerance`), localStorage.getItem('End Tolerance')),
      set(ref(db, `${conjecturePath}/isFinal`), false),
      set(ref(db, `${conjecturePath}/isPublic`), localStorage.getItem('isPublic') === 'true'),
      set(ref(db, `${conjecturePath}/createdBy`), userId),
      set(ref(db, `${conjecturePath}/createdAt`), timestamp),
      set(ref(db, `${conjecturePath}/updatedAt`), timestamp)
    ];

    await Promise.all(promises);
    alert("Draft saved.");
    return true;

  } catch (error) {
    console.error("Error saving draft:", error);
    alert("An unexpected error occurred. Draft not saved.");
    return false;
  }
};



export const deleteFromDatabaseConjecture = async (existingUUID, orgId) => {
  if (!existingUUID) {
    return alert("No level ID provided for deletion.");
  }
  
  try {
    // First, remove the level from any curricular games that reference it within the organization
    await removeLevelFromCurricularGames(existingUUID, orgId);
    
    // Then, remove the level itself from the database
    const conjecturePath = `orgs/${orgId}/levels/${existingUUID}`;
    const dbRef = ref(db, conjecturePath);
    
    // Remove the entire level from database
    await remove(dbRef);

    return alert("Level deleted successfully and removed from all games.");
  } catch (error) {
    console.error('Error deleting level:', error);
    return alert("Error deleting level. Please try again.");
  }
};

// Helper function to remove a level from all curricular games that reference it within an organization
const removeLevelFromCurricularGames = async (levelUUID, orgId) => {
  try {
    // Get all games from the organization
    const gamesRef = ref(db, `orgs/${orgId}/games`);
    const gamesSnapshot = await get(gamesRef);
    
    if (!gamesSnapshot.exists()) {
      console.log("No games found in organization");
      return;
    }
    
    const games = gamesSnapshot.val();
    const updatePromises = [];
    
    // Iterate through all games to find ones that reference the level
    for (const gameKey in games) {
      const game = games[gameKey];
      
      // Check if this game has levelIds and if it contains the level we're deleting
      if (game.levelIds && Array.isArray(game.levelIds)) {
        const levelIndex = game.levelIds.indexOf(levelUUID);
        
        if (levelIndex !== -1) {
          // Remove the level UUID from the array
          const updatedLevelIds = game.levelIds.filter(uuid => uuid !== levelUUID);
          
          // Update the game in the database
          const gameRef = ref(db, `orgs/${orgId}/games/${gameKey}/levelIds`);
          updatePromises.push(set(gameRef, updatedLevelIds));
          
          console.log(`Removed level ${levelUUID} from game ${game.name || gameKey}`);
        }
      }
    }
    
    // Execute all updates
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`Level ${levelUUID} removed from ${updatePromises.length} games`);
    } else {
      console.log(`Level ${levelUUID} was not referenced in any games`);
    }
    
  } catch (error) {
    console.error('Error removing level from curricular games:', error);
    throw error;
  }
};


// Helper function to create pose objects for the writeToDatabaseConjecture function 
const createPoseObjects = async (poseData, state, tolerance) => {
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();

  const dataToSend = {
    userId,
    poseData,
    timestamp,
    state,
    tolerance,
  };

  // Returns pose data
  return dataToSend;
}

// Helper function to create text objects for the writeToDatabaseConjecture function 
const createTextObjects = async (key, value) => {
  const dataToSend = {
    [key]: value,
  };

  // Returns text data 
  return dataToSend;
}

// Set the initial time of the last alert to the current time
let lastAlertTime = Date.now();

// Define a function to check the status of a set of promises
export const promiseChecker = async (frameRate, promises) => {
  // Set the data loss threshold and check interval in seconds
  const dataLossThresholdInSeconds = 2;
  const checkIntervalInSeconds = 10;

  // Calculate the number of frame packages and the data loss threshold in frames
  const totalFramePackages = checkIntervalInSeconds * frameRate;
  const dataLossThreshold = dataLossThresholdInSeconds * frameRate;

  // Calculate the starting index for the promises to check
  const startIndex = Math.max(promises.length - totalFramePackages - 1, 0);

  // Get the promises to check
  const promisesToCheck = promises.slice(startIndex);

  // Count the number of rejected promises
  const totalRejections = await countRejectedPromises(promisesToCheck);

  // If the number of rejected promises is greater than the data loss threshold, alert the user
  if (totalRejections > dataLossThreshold) {
    // Get the current time
    const currentTime = Date.now();

    // Check if enough time has passed since the last alert
    if (currentTime - lastAlertTime > checkIntervalInSeconds * 1000) {
      // Alert the user
      alert(
        "The program is not sending enough data to the database. Please check the internet connection/connection speed to make sure that it can support data collection for this experiment."
      );

      // Update the last alert time
      lastAlertTime = currentTime;
    }
  } else {
    // If there is no data loss, log a message to the console
    console.log("No data loss detected");
  }
};

// Define a function to count the number of rejected promises
const countRejectedPromises = async (promises) => {
  let rejectedCount = 0;

  // Use Promise.allSettled to check the status of each promise
  await Promise.allSettled(
    promises.map((promise) => {
      return promise
        .then(() => {
          // If the promise is resolved, do nothing
        })
        .catch(() => {
          // If the promise is rejected, increment the rejected count
          rejectedCount++;
        });
    })
  );

  // Return the total number of rejected promises
  return rejectedCount;
};

  /**
   * @function handleSave
   * @description Saves the current game as a draft or publishes it.
   * It performs a check to ensure the game name is unique within the organization before saving.
   * @param {string|null} UUID - The unique identifier for the game. If null, a new UUID will be generated.
   * @param {boolean} isFinal - True to publish, false to save as a draft.
   * @param {string} orgId - The organization ID where the game will be saved.
   * @returns {Promise<boolean>} - Returns true if the save was successful, false otherwise.
   * Files using this function: CurricularModule.js
   * TODO: Add a last edited by field
   */
  export const saveGame = async (UUID = null, isFinal = false, orgId) => {
    const db = getDatabase(app);
    const auth = getAuth(app);
    const user = auth.currentUser;

    if (!user) {
      alert("You must be logged in to save a game.");
      return false;
    }

    const gameName = localStorage.getItem('CurricularName');
    const currentUUID = UUID || uuidv4();

    if (!gameName || gameName.trim() === "") {
      alert("Please enter a game name before saving.");
      return false;
    }

    const gameNameKey = gameName.trim();

    // --- START: UNIQUE NAME VALIDATION WITHIN ORGANIZATION ---
    const gamesRef = ref(db, `orgs/${orgId}/games`);
    const gamesSnapshot = await get(gamesRef);
    
    if (gamesSnapshot.exists()) {
      const games = gamesSnapshot.val();
      for (const gameKey in games) {
        const game = games[gameKey];
        if (game.name === gameNameKey && gameKey !== currentUUID) {
          alert("This game name is already taken in this organization. Please choose a different name.");
          return false;
        }
      }
    }
    // --- END: UNIQUE NAME VALIDATION ---

    // --- START: VALIDATION FOR PUBLISHING ---
    if (isFinal) {
      const missingFields = curricularTextBoxes.filter((key) => {
        const val = localStorage.getItem(key);
        return val == null || val.trim() === "";
      });

      if (missingFields.length > 0) {
        alert("One or more text fields are empty. Please fill out all required fields before publishing.");
        return false;
      }

      const conjectures = Curriculum.getCurrentConjectures();
      if (!conjectures || conjectures.length === 0) {
        alert("Please add at least one level (conjecture) to your game before publishing.");
        return false;
      }
    }
    // --- END: VALIDATION FOR PUBLISHING ---

    // Proceed with saving the game
    try {
      const levelIds = Curriculum.getCurrentConjectures().map(c => c.UUID);
      const existingDialogues = await loadGameDialoguesFromFirebase(currentUUID, orgId) || [];
      const userId = user.uid;
      const userName = user.email.split('@')[0];

      // Get isPublic flag from localStorage (default to false)
      const isPublic = localStorage.getItem('GameIsPublic') === 'true';

      const gameData = {
        name: gameName,
        author: localStorage.getItem('CurricularAuthor') || "Unknown",
        keywords: localStorage.getItem('CurricularKeywords') || "",
        pin: localStorage.getItem('CurricularPIN') || "",
        levelIds: levelIds,
        isFinal: isFinal,
        isPublic: isPublic,
        UUID: currentUUID,
        Time: new Date().toISOString(),
        Author: userName,
        AuthorID: userId,
        Dialogues: existingDialogues,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const gamePath = `orgs/${orgId}/games/${currentUUID}`;
      await set(ref(db, gamePath), gameData);

      // If user is a student, automatically assign game to their class
      try {
        const userDatabaseModule = await import('./userDatabase.js');
        const getCurrentUserContext = userDatabaseModule?.getCurrentUserContext;
        if (getCurrentUserContext && typeof getCurrentUserContext === 'function') {
          const userContext = await getCurrentUserContext(app);
          if (userContext?.role === 'Student' && userContext?.orgId === orgId) {
          // Get current class ID from user profile
          const userClassRef = ref(db, `users/${userId}/orgs/${orgId}/currentClassId`);
          const classSnapshot = await get(userClassRef);
          const classId = classSnapshot.exists() ? classSnapshot.val() : null;
          
          if (classId) {
            // Store the game assignment in the class
            await set(ref(db, `orgs/${orgId}/classes/${classId}/assignedGames/${currentUUID}`), {
              addedAt: new Date().toISOString(),
              addedBy: userId
            });
          }
        }
        }
      } catch (error) {
        console.error('Error assigning game to class:', error);
        // Don't fail the save if class assignment fails
      }

      alert(`Game ${isFinal ? "published" : "saved as draft"} successfully!`);
      Curriculum.setCurrentUUID(currentUUID);
      return true;

    } catch (error) {
      console.error("Error saving game:", error);
      alert("An error occurred while saving the game. Please see the console for details.");
      return false;
    }
};

export const deleteFromDatabaseCurricular = async (UUID, orgId) => {
  if (!UUID) {
    return alert("No game ID provided for deletion.");
  }

  try {
    const CurricularPath = `orgs/${orgId}/games/${UUID}`;
    const dbRef = ref(db, CurricularPath);
    
    // Remove the entire game from database
    await remove(dbRef);
    
    return alert("Game deleted successfully.");
  } catch (error) {
    console.error('Error deleting game:', error);
    return alert("Error deleting game. Please try again.");
  }
};


// save dialogues to firebase within an organization
export const saveNarrativeDraftToFirebase = async (UUID, dialogues, orgId) => {
  const auth = getAuth(app);
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("User is not authenticated");
  }
  
  const timestamp = new Date().toISOString();
  const gameId = UUID ?? uuidv4(); // Use provided UUID or create new one
  const userId = user.uid;
  const userName = user.email ? user.email.split('@')[0] : 'Unknown';

  const promises = [
    set(ref(db, `orgs/${orgId}/games/${gameId}/Dialogues`), dialogues),
    set(ref(db, `orgs/${orgId}/games/${gameId}/LastSaved`), timestamp),
    set(ref(db, `orgs/${orgId}/games/${gameId}/UUID`), gameId),
    //set(ref(db, `orgs/${orgId}/games/${gameId}/isFinal`), false),   DONT MODIFY THE ORIGINAL VALUE
    // Optional: auto-set author again for traceability
    set(ref(db, `orgs/${orgId}/games/${gameId}/AuthorID`), userId),
    set(ref(db, `orgs/${orgId}/games/${gameId}/Author`), userName),
  ];

  await Promise.all(promises);
};


// Define a function to retrieve a conjecture based on UUID within an organization
export const getConjectureDataByUUID = async (conjectureID, orgId) => {
  try {
    console.log('getConjectureDataByUUID: Called with:', { conjectureID, orgId });
    // ref the realtime db - now under organization
    const dbRef = ref(db, `orgs/${orgId}/levels`);
    console.log('getConjectureDataByUUID: Database ref:', `orgs/${orgId}/levels`);
    
    // Load all levels and find by UUID (avoiding index requirement)
    console.log('getConjectureDataByUUID: Loading all levels to find by UUID...');
    const snapshot = await get(dbRef);
    console.log('getConjectureDataByUUID: Snapshot exists:', snapshot.exists());
    
    if (snapshot.exists()) {
      const allLevels = snapshot.val();
      console.log('getConjectureDataByUUID: Total levels loaded:', Object.keys(allLevels).length);
      
      // Find the level with matching UUID
      for (const [levelId, levelData] of Object.entries(allLevels)) {
        if (levelData.UUID === conjectureID) {
          console.log('getConjectureDataByUUID: Found matching level:', levelId);
          
          // Check structure of levelData before returning
          const levelDataKeys = Object.keys(levelData);
          const hasStartPose = levelData['Start Pose'] !== undefined;
          const hasIntermediatePose = levelData['Intermediate Pose'] !== undefined;
          const hasEndPose = levelData['End Pose'] !== undefined;
          
          console.log('getConjectureDataByUUID: Level data structure check:', {
            'levelId': levelId,
            'levelData keys': levelDataKeys,
            'has Start Pose': hasStartPose,
            'has Intermediate Pose': hasIntermediatePose,
            'has End Pose': hasEndPose,
            'Start Pose structure': hasStartPose ? Object.keys(levelData['Start Pose']) : null,
            'Intermediate Pose structure': hasIntermediatePose ? Object.keys(levelData['Intermediate Pose']) : null,
            'End Pose structure': hasEndPose ? Object.keys(levelData['End Pose']) : null,
            'Start Pose has poseData': hasStartPose ? !!levelData['Start Pose'].poseData : null
          });
          
          // Return with UUID as key to match expected format in LevelPlay.js
          const result = { [conjectureID]: levelData };
          console.log('getConjectureDataByUUID: Returning result with structure:', {
            'result keys': Object.keys(result),
            'result[UUID] keys': result[conjectureID] ? Object.keys(result[conjectureID]) : null
          });
          return result;
        }
      }
      
      console.log('getConjectureDataByUUID: No level found with UUID:', conjectureID);
      return null;
    } else {
      console.log('getConjectureDataByUUID: No levels found in organization');
      return null;
    }
  } catch (error) {
    console.error('getConjectureDataByUUID: Error occurred:', error);
    throw error; // this is an actual bad thing
  }
};

// Define a function to retrieve a game based on UUID within an organization
export const getCurricularDataByUUID = async (curricularID, orgId) => {
  try {
    if (!curricularID || !orgId) {
      console.warn('getCurricularDataByUUID: Missing required parameters', { curricularID, orgId });
      return null;
    }
    
    // ref the realtime db - now under organization
    const dbRef = ref(db, `orgs/${orgId}/games`);
    // query to find data with the UUID
    const q = query(dbRef, orderByChild('UUID'), equalTo(curricularID));
    
    // Execute the query
    const querySnapshot = await get(q);

    // check the snapshot
    if (querySnapshot.exists()) {
      const data = querySnapshot.val();
      return data; // return the data if its good
    } else {
      return null; // This will happen if data not found
    }
  } catch (error) {
    // Handle index errors gracefully - Firebase requires index to be defined in rules
    // This is a performance optimization suggestion, not a critical error
    if (error.message && error.message.includes('index')) {
      // Use console.debug instead of console.warn for less critical messages
      console.debug('getCurricularDataByUUID: Performance tip - Consider adding ".indexOn": "UUID" to Firebase rules for path "/orgs/{orgId}/games" to improve query performance', {
        curricularID,
        orgId
      });
    } else {
      console.error('getCurricularDataByUUID: Error querying database', {
        curricularID,
        orgId,
        error: error.message
      });
    }
    return null; // Return null instead of throwing to allow graceful fallback
  }
};

// Define a function to retrieve an array of conjectures based on AuthorID
export const getConjectureDataByAuthorID = async (authorID) => {
  try {
    // ref the realtime db
    const dbRef = ref(db, 'Level');
    // query to find data with the AuthorID
    const q = query(dbRef, orderByChild('AuthorID'), equalTo(authorID));
    
    // Execute the query
    const querySnapshot = await get(q);

    // check the snapshot
    if (querySnapshot.exists()) {
      // get all the conjectures in an array
      const conjectures = [];
      querySnapshot.forEach((conjectureSnapshot) => {
        conjectures.push(conjectureSnapshot.val());
      });
      return conjectures; // return the data if its good
    } else {
      return null; // This will happen if data not found
    }
  } catch (error) {
    throw error; // this is an actual bad thing
  }
};

// Define a function to retrieve an array of conjectures based on PIN
export const getConjectureDataByPIN = async (PIN) => {
  try {
    // ref the realtime db
    const dbRef = ref(db, 'Level');
    // query to find data with the PIN
    const q = query(dbRef, orderByChild('PIN'), equalTo(PIN));
    
    // Execute the query
    const querySnapshot = await get(q);

    // check the snapshot
    if (querySnapshot.exists()) {
      // get all the conjectures in an array
      const conjectures = [];
      querySnapshot.forEach((conjectureSnapshot) => {
        conjectures.push(conjectureSnapshot.val());
      });
      return conjectures; // return the data if its good
    } else {
      return null; // This will happen if data not found
    }
  } catch (error) {
    throw error; // this is an actual bad thing
  }
};

// get a list of all the levels within an organization
export const getConjectureList = async (final, orgId) => {
  try {
    // ref the realtime db - now under organization
    const dbRef = ref(db, `orgs/${orgId}/levels`);

    // query to find data - temporarily always use direct ref to avoid index issues
    let q;
    q = dbRef; // Always get all data without filtering for now
    
    // Execute the query
    const querySnapshot = await get(q);

    // check the snapshot
    if (querySnapshot.exists()) {
      // get all the conjectures in an array
      const conjectures = [];
      querySnapshot.forEach((conjectureSnapshot) => {
        conjectures.push(conjectureSnapshot.val());
      });
      return conjectures; // return the data if its good
    } else {
      return null; // This will happen if data not found
    }
  } catch (error) {
    throw error; // this is an actual bad thing
  }
};


// get a list of all the games within an organization
export const getCurricularList = async (final, orgId) => {
  try {
    // ref the realtime db - now under organization
    const dbRef = ref(db, `orgs/${orgId}/games`);

    // query to find data - temporarily always use direct ref to avoid index issues
    let q;
    q = dbRef; // Always get all data without filtering for now
    
    // Execute the query
    const querySnapshot = await get(q);

    // check the snapshot
    if (querySnapshot.exists()) {
      // get all the games in an array
      const curricular = [];
      querySnapshot.forEach((curricularSnapshot) => {
        curricular.push(curricularSnapshot.val());
      });
      return curricular; // return the data if its good
    } else {
      return null; // This will happen if data not found
    }
  } catch (error) {
    throw error; 
  }
};

export const searchConjecturesByWord = async (searchWord, orgId) => {
  try {
    // Reference the realtime db - now under organization
    const dbRef = ref(db, `orgs/${orgId}/levels`);

    // Query to find data
    const q = query(dbRef, orderByChild('Search Words'));

    // Execute the query
    const querySnapshot = await get(q);

    // Array to store matching conjectures
    const matchingConjectures = [];

    // This takes forever..............
    const normalizedSearchWord = searchWord?.toLowerCase?.() || "";
    const isCleared = normalizedSearchWord.trim() === ""; // Treat "" or all-spaces as cleared

    querySnapshot.forEach((snapshot) => {
      const searchData = snapshot.val();
      const searchWords = searchData?.['Search Words'];

      if (isCleared) {
        // If cleared or empty, show all
        matchingConjectures.push(searchData);
      } else if (searchWords) {
        // Case-insensitive check against searchWords keys
        for (const word of Object.keys(searchWords)) {
          if (word.toLowerCase() === normalizedSearchWord) {
            matchingConjectures.push(searchData);
            break; // stop checking more keys
          }
        }
      }
    });

    // Return the list of matching conjectures
    return matchingConjectures;
  } catch (error) {
    console.error('Error searching conjectures:', error);
    // Handle error appropriately
    return []; // Return an empty array in case of error
  }
};


// Write a new game select into database under gameid>>date>>studentid>>sessionid
export const writeToDatabaseNewSession = async (CurrId, CurrName, role) => {
  // Create a new date object to get a timestamp and readable timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();
  const unixTimestamp = Date.now();
 
  // Change game ID appropriately
  gameId = CurrName;
  userRole = role;
  
  // Get game mode
  const isPlayMode = getPlayGame();
  const gameMode = isPlayMode ? 'Teaching' : 'Research';

  // UPDATED: include device layer
  const sessionRoot = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}`;

  // Create an object to send to the database
  // Some of these are placeholders for future values that aren't implemented yet i.e. Hints
  const promises = [
    set(ref(db, `_GameData/${gameId}/CurricularID`), CurrId),
    set(ref(db, `${sessionRoot}/UserId`), userId),
    set(ref(db, `${sessionRoot}/UserRole`), userRole),
    set(ref(db, `${sessionRoot}/DeviceID`), deviceId),               // NEW
    set(ref(db, `${sessionRoot}/DeviceNickname`), deviceNickname),   // NEW
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${sessionRoot}/GameStart`), timestamp),
    set(ref(db, `${sessionRoot}/GameStartGMT`), timestampGMT),
    set(ref(db, `${sessionRoot}/GameMode`), gameMode),
    set(ref(db, `${sessionRoot}/DaRep`), 'null'),
    set(ref(db, `${sessionRoot}/Hints/HintEnabled`), "null"),
    set(ref(db, `${sessionRoot}/Hints/HintCount`), "null"),
    set(ref(db, `${sessionRoot}/Hints/HintOrder`), "null"),
    set(ref(db, `${sessionRoot}/LatinSquareOrder`), "null"),
  ];

  // Return the promise that push() returns
  return promises;
};

// Write timestamp for pose start to the database
export const writeToDatabasePoseStart = async (poseNumber, ConjectureId, gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // set event type to pose start
  eventType = poseNumber
  conjectureId = ConjectureId;

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/${poseNumber} Begin`), timestamp),
    set(ref(db, `${userSession}/${poseNumber} Begin GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  return promises;
};

// Writes a pose match into the database. Separated for simplicity
export const writeToDatabasePoseMatch = async (poseNumber, gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/${poseNumber} Match`), timestamp),
    set(ref(db, `${userSession}/${poseNumber} Match GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the start of the pose matching phase
export const writeToDatabasePoseMatchingStart = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Pose Matching Start GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the pose matching phase
export const writeToDatabasePoseMatchingEnd = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Pose Matching End GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the start of the tween phase
export const writeToDatabaseTweenStart = async (gameId, conjectureId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Tween Start GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the tween phase
export const writeToDatabaseTweenEnd = async (gameId, conjectureId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Tween End GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the start of the truefalse phase
export const writeToDatabaseIntuitionStart = async (gameId, question) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // Save the current event type before changing it
  // Use lastEventType if available (more reliable), otherwise use current eventType
  const eventTypeToFlush = lastEventType !== null ? lastEventType : eventType;
  
  // Flush any remaining frames for the previous event type before changing to Intuition
  // This ensures data for the last pose (e.g., Pose 1-3) is saved before transition
  const UUID = conjectureId;
  if (UUID) {
    const sessionKey = getSessionKey(userId, deviceSlug, loginTime, UUID);
    if (eventTypeToFlush !== null && frameBuffer.length > 0 && initializedSessions.has(sessionKey)) {
      try {
        const { orgId } = await getCurrentOrgContext();
        const frameRate = 12; // Default frame rate
        if (orgId) {
          await flushFrameBuffer(gameId, UUID, frameRate, orgId, eventTypeToFlush);
          console.log(`Flushed buffer for ${eventTypeToFlush} before transitioning to Intuition`);
        }
      } catch (error) {
        console.error('Error flushing buffer before Intuition start:', error);
      }
    }
  }

  // event type for pose data
  eventType = "Intuition";

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/Intuition Start`), timestamp),
    set(ref(db, `${userSession}/TF Answer Time GMT`), timestampGMT),
    set(ref(db, `${userSession}/TF Question`), question || ''),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the truefalse phase. 
export const writeToDatabaseIntuitionEnd = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // event type for pose data
  eventType = "Insight";

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/Intuition End/`), timestamp),
    set(ref(db, `${userSession}/Intuition End GMT/`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write True/False answer to database
export const writeToDatabaseTFAnswer = async (answer, correctAnswer, gameId, question) => {
  const isCorrect = answer === correctAnswer;
  
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;
  
  const promises = [
    set(ref(db, `${userSession}/TF Given Answer`), answer),
    set(ref(db, `${userSession}/TF Correct`), isCorrect),
    set(ref(db, `${userSession}/TF Correct Answer`), correctAnswer || ''),
  ];
  
  await Promise.all(promises);
};

// Write Multiple Choice answer to database
export const writeToDatabaseMCAnswer = async (answer, correctAnswer, gameId, question) => {
  const dateObj = new Date();
  const timestampGMT = dateObj.toUTCString();
  const unixTimestamp = Date.now();
  
  const isCorrect = answer === correctAnswer;
  
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;
  
  const promises = [
    set(ref(db, `${userSession}/MCQ Given Answer`), answer),
    set(ref(db, `${userSession}/MCQ Correct`), isCorrect),
    set(ref(db, `${userSession}/MCQ Correct Answer`), correctAnswer || ''),
    set(ref(db, `${userSession}/MCQ Answer Time GMT`), timestampGMT),
  ];
  
  await Promise.all(promises);
};

// Write in the second part of the true false phase
export const writeToDatabaseInsightStart = async (gameId) => {
  if (!gameId) return;
  
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/Insight Start/`), timestamp),
    set(ref(db, `${userSession}/Insight Start GMT/`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the second part of the true false phase
export const writeToDatabaseInsightEnd = async (gameId) => {
  if (!gameId) return;
  
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    // TODO: Uncomment line below to also store ISO format timestamp
    // set(ref(db, `${userSession}/Insight End`), timestamp),
    set(ref(db, `${userSession}/Insight End GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the start of the MCQ phase
export const writeToDatabaseMCQStart = async (gameId, question) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/MCQ Start GMT`), timestampGMT),
    set(ref(db, `${userSession}/MCQ Question`), question || ''),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the MCQ phase
export const writeToDatabaseMCQEnd = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/MCQ End GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the start of the outro dialogue phase
export const writeToDatabaseOutroStart = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Outro Start GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Write in the end of the outro dialogue phase
export const writeToDatabaseOutroEnd = async (gameId) => {
  // Create a new date object to get a timestamp
  const dateObj = new Date();
  const timestamp = dateObj.toISOString();
  const timestampGMT = dateObj.toUTCString();

  // UPDATED: include device layer
  const userSession = `_GameData/${gameId}/${readableDate}/${userName}/${deviceSlug}/${loginTime}/${conjectureId}`;

  // Create an object to send to the database
  const promises = [
    set(ref(db, `${userSession}/Outro End GMT`), timestampGMT),
  ];

  // Return the promise that push() returns
  await Promise.all(promises);
};

// Recursive function to load pose data with automatic splitting on "payload too large" error
// Automatically breaks down requests by structure levels: user -> device -> loginTime -> UUID
async function loadPoseDataRecursive(dbPath, maxDepth = 4) {
  // Analyze path structure for diagnostics
  const pathSegments = dbPath.split('/').filter(seg => seg.length > 0);
  const pathDepth = pathSegments.length;
  const pathLevel = pathSegments.length >= 5 ? pathSegments[4] : 'unknown'; // Usually: _PoseData/org/game/date/user
  
  console.log(`[loadPoseDataRecursive] ========== STARTING LOAD ==========`);
  console.log(`[loadPoseDataRecursive] Path: ${dbPath}`);
  console.log(`[loadPoseDataRecursive] Path depth: ${pathDepth} segments`);
  console.log(`[loadPoseDataRecursive] Path segments:`, pathSegments);
  console.log(`[loadPoseDataRecursive] Path level: ${pathLevel} (likely: ${pathSegments.length >= 5 ? 'user' : pathSegments.length >= 4 ? 'date' : 'other'})`);
  console.log(`[loadPoseDataRecursive] Max depth: ${maxDepth}`);
  
  // Try to get child keys for diagnostics (without loading data)
  let childKeysCount = null;
  let childKeysSample = null;
  try {
    const diagnosticRef = ref(db, dbPath);
    const diagnosticSnapshot = await get(query(diagnosticRef, limitToFirst(100)));
    if (diagnosticSnapshot.exists()) {
      const diagnosticData = diagnosticSnapshot.val();
      childKeysCount = Object.keys(diagnosticData).length;
      childKeysSample = Object.keys(diagnosticData).slice(0, 10);
      console.log(`[loadPoseDataRecursive] DIAGNOSTIC: Found ${childKeysCount} child keys (showing first 10):`, childKeysSample);
      if (childKeysCount >= 100) {
        console.log(`[loadPoseDataRecursive] DIAGNOSTIC: WARNING - 100+ child keys detected, data may be very large!`);
      }
    } else {
      console.log(`[loadPoseDataRecursive] DIAGNOSTIC: No child keys found (path may not exist or be empty)`);
    }
  } catch (diagnosticError) {
    const diagnosticErrorMsg = diagnosticError?.message || String(diagnosticError);
    console.warn(`[loadPoseDataRecursive] DIAGNOSTIC: Could not get child keys for diagnostics:`, diagnosticErrorMsg);
  }
  
  try {
    // Try to load data directly
    console.log(`[loadPoseDataRecursive] Attempting direct load from ${dbPath}...`);
    const snapshot = await get(ref(db, dbPath));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const dataSize = JSON.stringify(data).length;
      const dataSizeMB = (dataSize / 1024 / 1024).toFixed(2);
      const dataSizeKB = (dataSize / 1024).toFixed(2);
      console.log(`[loadPoseDataRecursive] ========== SUCCESS: DIRECT LOAD ==========`);
      console.log(`[loadPoseDataRecursive] Path: ${dbPath}`);
      console.log(`[loadPoseDataRecursive] Data size: ${dataSize} bytes (${dataSizeKB} KB / ${dataSizeMB} MB)`);
      console.log(`[loadPoseDataRecursive] Child keys count: ${childKeysCount !== null ? childKeysCount : 'unknown'}`);
      if (childKeysCount !== null) {
        const avgSizePerChild = childKeysCount > 0 ? (dataSize / childKeysCount) : 0;
        console.log(`[loadPoseDataRecursive] Average size per child: ${(avgSizePerChild / 1024).toFixed(2)} KB`);
      }
      console.log(`[loadPoseDataRecursive] ==========================================`);
      return data;
    }
    console.log(`[loadPoseDataRecursive] No data found at ${dbPath}`);
    return null;
  } catch (error) {
    // If data is too large, split into child nodes
    // Firebase may throw errors in different formats, check multiple properties
    const errorMessage = error?.message || error?.code || String(error);
    const errorString = errorMessage.toLowerCase();
    
    // Check for "too large" error in various formats
    if ((errorString.includes('too large') || 
         errorString.includes('payload') && errorString.includes('large') ||
         errorString.includes('exceeds') ||
         error?.code === 'payload-too-large') && maxDepth > 0) {
      console.log(`[loadPoseDataRecursive] ========== ERROR: PAYLOAD TOO LARGE ==========`);
      console.log(`[loadPoseDataRecursive] Path: ${dbPath}`);
      console.log(`[loadPoseDataRecursive] Path depth: ${pathDepth} segments`);
      console.log(`[loadPoseDataRecursive] Path level: ${pathLevel}`);
      console.log(`[loadPoseDataRecursive] Error message: ${errorMessage}`);
      console.log(`[loadPoseDataRecursive] Child keys count (from diagnostic): ${childKeysCount !== null ? childKeysCount : 'unknown'}`);
      if (childKeysSample) {
        console.log(`[loadPoseDataRecursive] Child keys sample:`, childKeysSample);
      }
      console.log(`[loadPoseDataRecursive] Estimated data size: TOO LARGE (exceeds Firebase limit ~256MB)`);
      console.log(`[loadPoseDataRecursive] Will split into child nodes (remaining depth: ${maxDepth})...`);
      console.log(`[loadPoseDataRecursive] ==========================================`);
      
      try {
        // Get list of child keys using limitToFirst to avoid loading all data
        console.log(`[loadPoseDataRecursive] Getting list of child keys from ${dbPath}...`);
        const parentRef = ref(db, dbPath);
        const childrenSnapshot = await get(query(parentRef, limitToFirst(1000)));
        
        if (!childrenSnapshot.exists()) {
          console.log(`[loadPoseDataRecursive] No child nodes found at ${dbPath}`);
          return null;
        }
        
        const children = Object.keys(childrenSnapshot.val());
        console.log(`[loadPoseDataRecursive] ========== SPLITTING INTO CHILD NODES ==========`);
        console.log(`[loadPoseDataRecursive] Parent path: ${dbPath}`);
        console.log(`[loadPoseDataRecursive] Found ${children.length} child nodes`);
        console.log(`[loadPoseDataRecursive] Child keys:`, children.slice(0, 20), children.length > 20 ? `... (${children.length} total)` : '');
        console.log(`[loadPoseDataRecursive] ==========================================`);
        
        const result = {};
        let successCount = 0;
        let failCount = 0;
        let totalSize = 0;
        
        // Load each child node separately
        for (let i = 0; i < children.length; i++) {
          const childKey = children[i];
          const childPath = `${dbPath}/${childKey}`;
          
          console.log(`[loadPoseDataRecursive] [${i + 1}/${children.length}] Loading child: ${childKey} from ${childPath}`);
          
          try {
            const childStartTime = Date.now();
            const childData = await loadPoseDataRecursive(childPath, maxDepth - 1);
            const childLoadTime = Date.now() - childStartTime;
            
            if (childData !== null) {
              const childSize = JSON.stringify(childData).length;
              const childSizeMB = (childSize / 1024 / 1024).toFixed(2);
              totalSize += childSize;
              result[childKey] = childData;
              successCount++;
              console.log(`[loadPoseDataRecursive] [${i + 1}/${children.length}] SUCCESS: ${childKey} - ${childSize} bytes (${childSizeMB} MB) in ${childLoadTime}ms`);
            } else {
              console.log(`[loadPoseDataRecursive] [${i + 1}/${children.length}] No data returned for ${childKey}`);
            }
          } catch (childError) {
            failCount++;
            const childErrorMsg = childError?.message || childError?.code || String(childError);
            const childErrorString = childErrorMsg.toLowerCase();
            console.warn(`[loadPoseDataRecursive] [${i + 1}/${children.length}] ERROR loading child ${childKey}:`, childErrorMsg);
            if (childErrorString.includes('too large')) {
              console.warn(`[loadPoseDataRecursive] [${i + 1}/${children.length}] Child ${childKey} is also too large - recursive splitting should handle this`);
            }
            // Continue with other children even if one fails
          }
        }
        
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
        console.log(`[loadPoseDataRecursive] ========== SPLITTING COMPLETED ==========`);
        console.log(`[loadPoseDataRecursive] Parent path: ${dbPath}`);
        console.log(`[loadPoseDataRecursive] Total children: ${children.length}`);
        console.log(`[loadPoseDataRecursive] Successfully loaded: ${successCount}`);
        console.log(`[loadPoseDataRecursive] Failed: ${failCount}`);
        console.log(`[loadPoseDataRecursive] Total size of loaded data: ${totalSize} bytes (${totalSizeMB} MB)`);
        if (children.length > 0) {
          const avgSizePerChild = totalSize / children.length;
          console.log(`[loadPoseDataRecursive] Average size per child: ${(avgSizePerChild / 1024).toFixed(2)} KB`);
        }
        console.log(`[loadPoseDataRecursive] ==========================================`);
        
        return result;
      } catch (splitError) {
        const splitErrorMessage = splitError?.message || String(splitError);
        console.error(`[loadPoseDataRecursive] FATAL ERROR splitting ${dbPath}:`, splitErrorMessage);
        console.error(`[loadPoseDataRecursive] Split error details:`, splitError);
        throw splitError;
      }
    }
    // Re-throw error if it's not "too large" or maxDepth reached
    console.error(`[loadPoseDataRecursive] ERROR at ${dbPath}:`, errorMessage);
    console.error(`[loadPoseDataRecursive] Error is not "too large" or maxDepth (${maxDepth}) reached. Re-throwing...`);
    throw error;
  }
}

// Search functionality that downloads a set of child nodes from a game based on inputted dates
export const getFromDatabaseByGame = async (selectedGame, gameId, selectedStart, selectedEnd, orgId, selectedUser = null) => {
  try {
    console.log('[getFromDatabaseByGame] Starting download...', { selectedGame, gameId, selectedStart, selectedEnd, orgId, selectedUser });
    
    // Get orgId if not provided
    if (!orgId) {
      console.warn('[getFromDatabaseByGame] orgId is missing, trying to get from context...');
      const context = await getCurrentOrgContext();
      orgId = context?.orgId;
      if (!orgId) {
        throw new Error('orgId is required for pose data retrieval');
      }
      console.log('[getFromDatabaseByGame] Retrieved orgId from context:', orgId);
    }
    
    // Create reference to the realtime database
    const eventdbRef = ref(db, `_GameData/${gameId}`);
    
    console.log('[getFromDatabaseByGame] Query paths:', {
      eventPath: `_GameData/${gameId}`,
      note: 'Pose data will be loaded per user/date using loadPoseDataRecursive'
    });

    // NEW APPROACH: Load only event data first (it's usually much smaller)
    // Then load pose data only for users/dates that exist in event data
    // This avoids "payload too large" errors when pose data is huge
    console.log('[getFromDatabaseByGame] Fetching event data (source of truth)...');
    const eventSnapshot = await get(eventdbRef);
    
    console.log('[getFromDatabaseByGame] Event data fetched:', {
      eventDataExists: eventSnapshot.exists(),
    });

    // Helper function to extract users and dates from data
    const extractUsersFromData = (data, dataType) => {
      if (!data) return { dates: {}, allUsers: new Set() };
      
      const result = { dates: {}, allUsers: new Set() };
      for (const dateKey in data) {
        if (data[dateKey] && typeof data[dateKey] === 'object') {
          const users = Object.keys(data[dateKey]);
          result.dates[dateKey] = users;
          users.forEach(user => result.allUsers.add(user));
        }
      }
      return result;
    };

    // Helper function to filter data by date range
    const filterByDateRange = (data, startDate, endDate) => {
      if (!data) {
        console.log('[getFromDatabaseByGame] filterByDateRange: No data to filter');
        return null;
      }
      
      console.log('[getFromDatabaseByGame] filterByDateRange: Filtering with range:', { startDate, endDate });
      
      const filtered = {};
      const allDates = Object.keys(data);
      console.log('[getFromDatabaseByGame] filterByDateRange: All dates in data:', allDates);
      
      for (const dateKey of allDates) {
        const dateComparison = dateKey >= startDate && dateKey <= endDate;
        console.log(`[getFromDatabaseByGame] filterByDateRange: Date ${dateKey} - ${dateComparison ? 'INCLUDED' : 'EXCLUDED'} (${dateKey} >= ${startDate} && ${dateKey} <= ${endDate})`);
        
        if (dateComparison) {
          filtered[dateKey] = data[dateKey];
        }
      }
      
      const filteredDates = Object.keys(filtered);
      console.log('[getFromDatabaseByGame] filterByDateRange: Filtered dates:', filteredDates);
      console.log('[getFromDatabaseByGame] filterByDateRange: Result has', filteredDates.length, 'date(s)');
      
      return filteredDates.length > 0 ? filtered : null;
    };

    // NEW APPROACH: Filter event data first, then load pose data only for users/dates in event data
    let eventData = eventSnapshot.exists() ? filterByDateRange(eventSnapshot.val(), selectedStart, selectedEnd) : null;
    
    if (!eventData) {
      console.warn('[getFromDatabaseByGame] No event data found for the specified date range');
      alert('No data found for the specified game and date range.');
      return null;
    }

    console.log('[getFromDatabaseByGame] ========== EVENT DATA LOADED ==========');
    const eventUsers = extractUsersFromData(eventData, 'EVENT');
    console.log('[getFromDatabaseByGame] EVENT DATA users:', Array.from(eventUsers.allUsers).sort());
    console.log('[getFromDatabaseByGame] EVENT DATA dates:', Object.keys(eventUsers.dates));
    console.log('[getFromDatabaseByGame] ===============================================================');

    // NEW APPROACH: Load pose data only for users/dates that exist in event data
    // This avoids loading all pose data at once, which causes "payload too large" errors
    console.log('[getFromDatabaseByGame] ========== LOADING POSE DATA FOR EVENT USERS ==========');
    console.log('[getFromDatabaseByGame] Will load pose data for users/dates from event data using loadPoseDataRecursive');
    
    // Initialize poseData structure
    let poseData = {};
    
    // Get all organizations to search in
    let allOrgIds = [orgId];
    try {
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        const orgIdsList = Object.keys(orgs);
        allOrgIds = [orgId, ...orgIdsList.filter(id => id !== orgId)];
        console.log(`[getFromDatabaseByGame] Will search in ${allOrgIds.length} organizations:`, allOrgIds);
      }
    } catch (error) {
      console.warn('[getFromDatabaseByGame] Could not get list of organizations:', error.message);
      console.warn('[getFromDatabaseByGame] Will only search in game organization:', orgId);
    }
    
    // Filter by selectedUser if specified
    const usersToLoad = selectedUser && selectedUser !== 'ALL' 
      ? [selectedUser].filter(user => eventUsers.allUsers.has(user))
      : Array.from(eventUsers.allUsers);
    
    console.log(`[getFromDatabaseByGame] Users to load pose data for:`, usersToLoad);
    
    // Load pose data for each user/date from event data
    for (const user of usersToLoad) {
      for (const dateKey of Object.keys(eventUsers.dates)) {
        if (eventUsers.dates[dateKey].includes(user)) {
          console.log(`[getFromDatabaseByGame] Loading pose data for user: ${user}, date: ${dateKey}...`);
          
          let userDataLoaded = false;
          
          // Try to load from each organization until found
          for (const checkOrgId of allOrgIds) {
            try {
              const userPath = `_PoseData/${checkOrgId}/${gameId}/${dateKey}/${user}`;
              console.log(`[getFromDatabaseByGame] Trying org ${checkOrgId}: ${userPath}`);
              
              const startTime = Date.now();
              const userData = await loadPoseDataRecursive(userPath);
              const loadTime = Date.now() - startTime;
              
              if (userData !== null && Object.keys(userData).length > 0) {
                const dataSize = JSON.stringify(userData).length;
                const dataSizeMB = (dataSize / 1024 / 1024).toFixed(2);
                console.log(`[getFromDatabaseByGame] SUCCESS: Loaded pose data for ${user} on ${dateKey} from org ${checkOrgId}`);
                console.log(`[getFromDatabaseByGame] Data size: ${dataSize} bytes (${dataSizeMB} MB), Load time: ${loadTime}ms`);
                
                // Add to poseData
                if (!poseData[dateKey]) {
                  poseData[dateKey] = {};
                }
                poseData[dateKey][user] = userData;
                userDataLoaded = true;
                break; // Found it, no need to check other orgs
              }
            } catch (error) {
              const errorMessage = error?.message || error?.code || String(error);
              const errorString = errorMessage.toLowerCase();
              if (errorString.includes('too large')) {
                console.warn(`[getFromDatabaseByGame] Data too large for ${user} on ${dateKey} in org ${checkOrgId} - recursive loader should handle this`);
              } else {
                console.warn(`[getFromDatabaseByGame] Error loading ${user} on ${dateKey} from org ${checkOrgId}:`, errorMessage);
              }
              // Continue checking other orgs
            }
          }
          
          if (!userDataLoaded) {
            console.warn(`[getFromDatabaseByGame] Could not load pose data for ${user} on ${dateKey} from any organization`);
          }
        }
      }
    }
    
    console.log('[getFromDatabaseByGame] ========== POSE DATA LOADING COMPLETED ==========');
    const loadedPoseUsers = extractUsersFromData(poseData, 'POSE');
    console.log('[getFromDatabaseByGame] POSE DATA users loaded:', Array.from(loadedPoseUsers.allUsers).sort());
    console.log('[getFromDatabaseByGame] POSE DATA dates loaded:', Object.keys(loadedPoseUsers.dates));
    
    // Check if we have pose data for all event users
    const missingPoseUsers = Array.from(eventUsers.allUsers).filter(user => !loadedPoseUsers.allUsers.has(user));
    if (missingPoseUsers.length > 0) {
      console.warn('[getFromDatabaseByGame] WARNING: Some users from EVENT DATA have no POSE DATA:', missingPoseUsers);
      console.warn('[getFromDatabaseByGame] This may indicate data is in a different organization or Firebase security rules are blocking access');
    }
    console.log('[getFromDatabaseByGame] ===============================================================');
    
    // Convert poseData to null if empty (for consistency with old code)
    if (Object.keys(poseData).length === 0) {
      poseData = null;
    }

    // Filter by user if selectedUser is specified
    if (selectedUser && selectedUser !== 'ALL') {
      console.log('[getFromDatabaseByGame] ========== FILTERING BY USER ==========');
      console.log('[getFromDatabaseByGame] Selected user:', selectedUser);
      
      // Log users before filtering
      const getUsersBeforeFilter = (data) => {
        if (!data) return {};
        const usersByDate = {};
        for (const dateKey in data) {
          if (data[dateKey] && typeof data[dateKey] === 'object') {
            usersByDate[dateKey] = Object.keys(data[dateKey]);
          }
        }
        return usersByDate;
      };
      
      const poseUsersBefore = getUsersBeforeFilter(poseData);
      const eventUsersBefore = getUsersBeforeFilter(eventData);
      
      console.log('[getFromDatabaseByGame] Users in POSE DATA before filter:', poseUsersBefore);
      console.log('[getFromDatabaseByGame] Users in EVENT DATA before filter:', eventUsersBefore);
      
      // Check if selected user exists in data
      let poseUserExists = false;
      let eventUserExists = false;
      for (const dateKey in poseUsersBefore) {
        if (poseUsersBefore[dateKey].includes(selectedUser)) {
          poseUserExists = true;
          console.log(`[getFromDatabaseByGame] Selected user ${selectedUser} found in POSE DATA for date: ${dateKey}`);
        }
      }
      for (const dateKey in eventUsersBefore) {
        if (eventUsersBefore[dateKey].includes(selectedUser)) {
          eventUserExists = true;
          console.log(`[getFromDatabaseByGame] Selected user ${selectedUser} found in EVENT DATA for date: ${dateKey}`);
        }
      }
      
      if (!poseUserExists && eventUserExists) {
        console.warn(`[getFromDatabaseByGame] WARNING: Selected user ${selectedUser} exists in EVENT DATA but NOT in POSE DATA!`);
        console.warn(`[getFromDatabaseByGame] This indicates Firebase security rules may be blocking access to pose data for this user.`);
      } else if (!poseUserExists && !eventUserExists) {
        console.warn(`[getFromDatabaseByGame] WARNING: Selected user ${selectedUser} does not exist in either POSE or EVENT data!`);
      }
      
      const filterByUser = (data, dataType) => {
        if (!data) {
          console.log(`[getFromDatabaseByGame] filterByUser (${dataType}): No data to filter`);
          return null;
        }
        
        const filtered = {};
        const datesWithUser = [];
        const datesWithoutUser = [];
        
        for (const dateKey in data) {
          const dateData = data[dateKey];
          if (dateData && typeof dateData === 'object' && dateData[selectedUser]) {
            filtered[dateKey] = { [selectedUser]: dateData[selectedUser] };
            datesWithUser.push(dateKey);
          } else {
            datesWithoutUser.push(dateKey);
            if (dateData && typeof dateData === 'object') {
              const availableUsers = Object.keys(dateData);
              console.log(`[getFromDatabaseByGame] filterByUser (${dataType}): Date ${dateKey} does not have user ${selectedUser}. Available users:`, availableUsers);
            }
          }
        }
        
        const filteredDates = Object.keys(filtered);
        console.log(`[getFromDatabaseByGame] filterByUser (${dataType}): Dates with user:`, datesWithUser);
        console.log(`[getFromDatabaseByGame] filterByUser (${dataType}): Dates without user:`, datesWithoutUser);
        console.log(`[getFromDatabaseByGame] filterByUser (${dataType}): Result has ${filteredDates.length} date(s)`);
        
        return filteredDates.length > 0 ? filtered : null;
      };
      
      const poseDataBeforeUserFilter = poseData ? Object.keys(poseData).length : 0;
      const eventDataBeforeUserFilter = eventData ? Object.keys(eventData).length : 0;
      
      poseData = poseData ? filterByUser(poseData, 'POSE') : null;
      eventData = eventData ? filterByUser(eventData, 'EVENT') : null;
      
      const poseDataAfterUserFilter = poseData ? Object.keys(poseData).length : 0;
      const eventDataAfterUserFilter = eventData ? Object.keys(eventData).length : 0;
      
      console.log('[getFromDatabaseByGame] User filter results:', {
        selectedUser: selectedUser,
        poseDataBefore: poseDataBeforeUserFilter,
        poseDataAfter: poseDataAfterUserFilter,
        poseDataLost: poseDataBeforeUserFilter - poseDataAfterUserFilter,
        eventDataBefore: eventDataBeforeUserFilter,
        eventDataAfter: eventDataAfterUserFilter,
        eventDataLost: eventDataBeforeUserFilter - eventDataAfterUserFilter
      });
      
      if (poseDataAfterUserFilter === 0 && eventDataAfterUserFilter > 0) {
        console.error(`[getFromDatabaseByGame] ERROR: User ${selectedUser} has EVENT data but NO POSE data after filtering!`);
        console.error(`[getFromDatabaseByGame] This strongly suggests Firebase security rules are blocking pose data access.`);
      }
      
      console.log('[getFromDatabaseByGame] =========================================');
    } else {
      console.log('[getFromDatabaseByGame] No user filter applied (selectedUser:', selectedUser, ')');
    }

    // Log final pose data structure
    if (poseData) {
      const poseDates = Object.keys(poseData);
      console.log('[getFromDatabaseByGame] ========== FINAL POSE DATA STRUCTURE ==========');
      console.log('[getFromDatabaseByGame] Dates:', poseDates);
      for (const dateKey of poseDates) {
        const users = Object.keys(poseData[dateKey] || {});
        console.log(`[getFromDatabaseByGame] Date ${dateKey}: ${users.length} user(s)`, users);
      }
      console.log('[getFromDatabaseByGame] ===============================================================');
    }

    console.log('[getFromDatabaseByGame] Filtered data:', {
      selectedUser: selectedUser || 'ALL',
      poseDataExists: poseData !== null,
      eventDataExists: eventData !== null,
      poseDataSize: poseData ? JSON.stringify(poseData).length : 0,
      eventDataSize: eventData ? JSON.stringify(eventData).length : 0
    });

    const formattedStart = selectedStart.replace(/[^a-zA-Z0-9]/g, '_');
    const formattedEnd = selectedEnd.replace(/[^a-zA-Z0-9]/g, '_');
    const formattedGame = selectedGame.replace(/[^a-zA-Z0-9]/g, '_');

    // Check if any data exists
    if (poseData || eventData) {
      console.log('[getFromDatabaseByGame] Data found, preparing downloads...');

      // Determine device label for filenames (use event data if available, otherwise pose data)
      const collectDeviceLabel = (tree) => {
        if (!tree) return "MULTI_DEVICE";
        const setD = new Set();
        for (const day in (tree || {})) {
          const users = tree[day] || {};
          for (const uname in users) {
            const devs = users[uname] || {};
            for (const dslug in devs) setD.add(dslug);
          }
        }
        return setD.size === 1 ? [...setD][0] : "MULTI_DEVICE";
      };
      
      // Use event data for device label if available, otherwise use pose data
      const deviceLabel = sanitize(collectDeviceLabel(eventData || poseData));
      console.log('[getFromDatabaseByGame] Device label:', deviceLabel);

      // Download event data if it exists
      if (eventData) {
        console.log('[getFromDatabaseByGame] Creating event log download...');
        const eventjsonStr = JSON.stringify(eventData, null, 2);
        const eventFilename = `${formattedGame}__${deviceLabel}__event_log_${formattedStart}_to_${formattedEnd}.json`;
        console.log('[getFromDatabaseByGame] Event log filename:', eventFilename);
        
        const eventDownload = document.createElement('a');
        eventDownload.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(eventjsonStr));
        eventDownload.setAttribute('download', eventFilename);
        document.body.appendChild(eventDownload);
        console.log('[getFromDatabaseByGame] Clicking event download link...');
        eventDownload.click();
        document.body.removeChild(eventDownload);
        console.log('[getFromDatabaseByGame] Event log download initiated');
      } else {
        console.log('[getFromDatabaseByGame] Event data not available, skipping event log download');
      }

      // Download pose data if it exists
      if (poseData) {
        console.log('[getFromDatabaseByGame] Creating pose data download...');
        
        // Log final pose data structure before stringifying
        console.log('[getFromDatabaseByGame] ========== FINAL POSE DATA BEFORE JSON STRINGIFY ==========');
        const finalDates = Object.keys(poseData);
        console.log('[getFromDatabaseByGame] Final dates count:', finalDates.length);
        console.log('[getFromDatabaseByGame] Final dates:', finalDates);
        
        for (const dateKey of finalDates) {
          const users = Object.keys(poseData[dateKey]);
          console.log(`[getFromDatabaseByGame] Final - Date ${dateKey}: ${users.length} user(s)`, users);
          for (const userKey of users) {
            const devices = Object.keys(poseData[dateKey][userKey]);
            console.log(`[getFromDatabaseByGame] Final - Date ${dateKey}, User ${userKey}: ${devices.length} device(s)`, devices);
            for (const deviceKey of devices) {
              const loginTimes = Object.keys(poseData[dateKey][userKey][deviceKey]);
              console.log(`[getFromDatabaseByGame] Final - Date ${dateKey}, User ${userKey}, Device ${deviceKey}: ${loginTimes.length} loginTime(s)`, loginTimes);
              for (const loginTimeKey of loginTimes) {
                const uuids = Object.keys(poseData[dateKey][userKey][deviceKey][loginTimeKey]);
                console.log(`[getFromDatabaseByGame] Final - Date ${dateKey}, User ${userKey}, Device ${deviceKey}, LoginTime ${loginTimeKey}: ${uuids.length} UUID(s)`, uuids);
              }
            }
          }
        }
        console.log('[getFromDatabaseByGame] ============================================================');
        
        const posejsonStr = JSON.stringify(poseData, null, 2);
        const poseFilename = `${formattedGame}__${deviceLabel}__pose_data_${formattedStart}_to_${formattedEnd}.json`;
        console.log('[getFromDatabaseByGame] Pose data filename:', poseFilename);
        console.log('[getFromDatabaseByGame] Pose data JSON size:', posejsonStr.length, 'bytes');
        console.log('[getFromDatabaseByGame] Pose data JSON size (MB):', (posejsonStr.length / 1024 / 1024).toFixed(2));
        
        // Check if JSON stringification lost any data
        const parsedBack = JSON.parse(posejsonStr);
        const parsedDates = Object.keys(parsedBack);
        console.log('[getFromDatabaseByGame] After JSON parse: dates count:', parsedDates.length);
        console.log('[getFromDatabaseByGame] After JSON parse: dates:', parsedDates);
        
        const poseDownload = document.createElement('a');
        poseDownload.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(posejsonStr));
        poseDownload.setAttribute('download', poseFilename);
        document.body.appendChild(poseDownload);
        console.log('[getFromDatabaseByGame] Clicking pose download link...');
        poseDownload.click();
        document.body.removeChild(poseDownload);
        console.log('[getFromDatabaseByGame] Pose data download initiated');
      } else {
        console.log('[getFromDatabaseByGame] Pose data not available, skipping pose data download');
      }
      
      console.log('[getFromDatabaseByGame] Downloads completed');
      
    } else {
      console.warn('[getFromDatabaseByGame] No data found for the specified criteria');
      console.warn('[getFromDatabaseByGame] Pose data exists:', poseData !== null);
      console.warn('[getFromDatabaseByGame] Event data exists:', eventData !== null);
      alert('No data found for the specified game and date range.');
      return null;
    }
  } catch (error) {
    console.error('[getFromDatabaseByGame] Error:', error);
    alert('Error downloading data: ' + error.message);
    throw error; 
  }
};

export const getFromDatabaseByGameCSV = async (selectedGame, gameId, selectedStart, selectedEnd) => {
  try {
    const eventdbRef = ref(db, `_GameData/${gameId}`);
    const eventq = query(eventdbRef, orderByKey(), startAt(selectedStart), endAt(selectedEnd));
    const eventQuerySnapshot = await get(eventq);

    const formattedStart = selectedStart.replace(/[^a-zA-Z0-9]/g, '_');
    const formattedEnd = selectedEnd.replace(/[^a-zA-Z0-9]/g, '_');
    const formattedGame = selectedGame.replace(/[^a-zA-Z0-9]/g, '_');

    if (eventQuerySnapshot.exists()) {
      const eventData = eventQuerySnapshot.val();

      // Determine device label (same logic as JSON export)
      const collectDeviceLabel = (tree) => {
        const setD = new Set();
        for (const day in (tree || {})) {
          const users = tree[day] || {};
          for (const uname in users) {
            const devs = users[uname] || {};
            for (const dslug in devs) setD.add(dslug);
          }
        }
        return setD.size === 1 ? [...setD][0] : "MULTI_DEVICE";
      };
      const deviceLabel = sanitize(collectDeviceLabel(eventData));
      
      // Convert to JSON string and let convertJsonToCsv handle the download
      const eventjsonStr = JSON.stringify(eventData);
      const result = await convertJsonToCsv(eventjsonStr, `${formattedGame}__${deviceLabel}`, formattedStart, formattedEnd);
      
      return result;
    } else {
      return null;
    }
  } catch (error) {
    throw error; 
  }
};

export const removeFromDatabaseByGame = async (selectedGame, selectedStart, selectedEnd) => {
  try {
    // Create reference to the realtime database
    const dbRef = ref(db, `_PoseData/${selectedGame}`);

    // Query to find data
    const q = query(dbRef, orderByKey(), startAt(selectedStart), endAt(selectedEnd));
    
    // Execute the query
    const querySnapshot = await get(q);

    // Check if the data exists
    if (querySnapshot.exists()) {
      const data = {};

      // Set each snapshot to null, deleting data
      querySnapshot.forEach((snapshot) => {
        data[snapshot.key] = null;
      })
      // Using await to handle errors
      const itemRef = ref(db, `_PoseData/${selectedGame}`);
      await remove(itemRef, data);
      
      return { success: true, message: 'Data removed.' };
    } else {
      return { success: false, message: 'No data to remove.' };
    }
  } catch (error) {
    throw error; // this is an actual bad thing
  }
};

export const checkGameAuthorization = async (gameName, orgId) => {
  try {
    // Check games in current organization
    const dbRef = ref(db, `orgs/${orgId}/games`);
    const qSnapshot = await get(dbRef);

    if (qSnapshot.exists()) {
      let foundInCurrentOrg = false;
      qSnapshot.forEach((gameSnapshot) => {
        const gameData = gameSnapshot.val();
        if (gameData && gameData.name === gameName) {
          foundInCurrentOrg = true;
        }
      });
      
      if (foundInCurrentOrg) {
        // Game found in current organization - allow access
        return true;
      }
    }

    // If not found in current organization, check public games from other organizations
    try {
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        for (const [otherOrgId, orgData] of Object.entries(orgs)) {
          if (otherOrgId === orgId) continue; // Skip current org
          
          const gamesRef = ref(db, `orgs/${otherOrgId}/games`);
          const gamesSnapshot = await get(gamesRef);
          
          if (gamesSnapshot.exists()) {
            const games = gamesSnapshot.val();
            for (const [gameId, gameData] of Object.entries(games)) {
              // Check if this is the game we're looking for and it's public
              if (gameData && gameData.name === gameName && gameData.isPublic === true) {
                // Found as public game from another org
                return true;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking public games from other orgs:', error);
    }

    // Game not found in current org or as public game from other orgs
    return null;
  } catch (error) {
    throw error;
  }
};

export const getAuthorizedGameList = async (orgId) => {
  try {
    const authorizedCurricular = [];
    
    // Get all games from current organization
    const dbRef = ref(db, `orgs/${orgId}/games`);
    const querySnapshot = await get(dbRef);

    if (querySnapshot.exists()) {
      querySnapshot.forEach((gameSnapshot) => {
        const gameData = gameSnapshot.val();
        if (gameData && gameData.name) {
          authorizedCurricular.push(gameData.name);
        }
      });
    }

    // Get public games from other organizations
    try {
      const orgsRef = ref(db, 'orgs');
      const orgsSnapshot = await get(orgsRef);
      
      if (orgsSnapshot.exists()) {
        const orgs = orgsSnapshot.val();
        for (const [otherOrgId, orgData] of Object.entries(orgs)) {
          if (otherOrgId === orgId) continue; // Skip current org
          
          const gamesRef = ref(db, `orgs/${otherOrgId}/games`);
          const gamesSnapshot = await get(gamesRef);
          
          if (gamesSnapshot.exists()) {
            gamesSnapshot.forEach((gameSnapshot) => {
              const gameData = gameSnapshot.val();
              // Only include public games
              if (gameData && gameData.isPublic === true && gameData.name) {
                authorizedCurricular.push(gameData.name);
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching public games from other orgs:', error);
    }

    return authorizedCurricular.length > 0 ? authorizedCurricular : null;
  } catch (error) {
    console.error("Error getting game list", error);
    throw error;
  }
};

// Get game name using game UUID within an organization
export const getGameNameByUUID = async (gameID, orgId) => {
  try {
    // Validate input parameters
    if (!gameID) {
      console.warn('getGameNameByUUID: gameID is missing');
      return 'UnknownGame';
    }
    
    if (!orgId) {
      console.warn('getGameNameByUUID: orgId is missing', { gameID });
      return 'UnknownGame';
    }
    
    const gameData = await getCurricularDataByUUID(gameID, orgId);
    
    if (gameData && Object.keys(gameData).length > 0) {
      const gameKey = Object.keys(gameData)[0];
      const game = gameData[gameKey];
      // Try name first, then fallback to CurricularName
      const gameName = game.name || game.CurricularName;
      if (gameName) {
        console.log('getGameNameByUUID: Found game name', { gameID, gameName, source: game.name ? 'name' : 'CurricularName' });
        return gameName;
      } else {
        console.debug('getGameNameByUUID: Game data found but name is missing, using fallback', { gameID, gameKey, availableKeys: Object.keys(game) });
      }
    } else {
      console.debug('getGameNameByUUID: Game data not found, using fallback name', { gameID, orgId });
    }
    
    return 'UnknownGame';
  } catch (error) {
    console.error('getGameNameByUUID: Error getting game name', {
      gameID,
      orgId,
      error: error.message
    });
    return 'GameNameNotFound';
  }
};

// Get level name using level UUID within an organization
export const getLevelNameByUUID = async (levelUUID, orgId) => {
  try {
    // Validate input parameters
    if (!levelUUID) {
      console.warn('getLevelNameByUUID: levelUUID is missing');
      return 'UnknownLevel';
    }
    
    if (!orgId) {
      console.warn('getLevelNameByUUID: orgId is missing', { levelUUID });
      return 'UnknownLevel';
    }
    
    const levelData = await getConjectureDataByUUID(levelUUID, orgId);
    if (levelData && Object.keys(levelData).length > 0) {
      const levelKey = Object.keys(levelData)[0];
      const level = levelData[levelKey];
      
      // Try multiple name sources in order of preference
      // 1. Name field (capital N)
      if (level.Name) {
        console.log('getLevelNameByUUID: Found level name from Name field', { levelUUID, name: level.Name });
        return level.Name;
      }
      
      // 2. CurricularName field
      if (level.CurricularName) {
        console.log('getLevelNameByUUID: Found level name from CurricularName field', { levelUUID, name: level.CurricularName });
        return level.CurricularName;
      }
      
      // 3. Text Boxes -> Conjecture Name
      if (level['Text Boxes'] && level['Text Boxes']['Conjecture Name']) {
        const conjectureName = level['Text Boxes']['Conjecture Name'];
        console.log('getLevelNameByUUID: Found conjecture name from Text Boxes', { levelUUID, name: conjectureName });
        return conjectureName;
      }
      
      // Log available keys for debugging
      console.debug('getLevelNameByUUID: Level data found but name is missing, using fallback', { 
        levelUUID, 
        levelKey,
        availableKeys: Object.keys(level),
        hasTextBoxes: !!level['Text Boxes'],
        textBoxesKeys: level['Text Boxes'] ? Object.keys(level['Text Boxes']) : null
      });
      return 'UnknownLevel';
    }
    console.debug('getLevelNameByUUID: Level data not found, using fallback name', { levelUUID, orgId });
    return 'UnknownLevel';
  } catch (error) {
    console.error('getLevelNameByUUID: Error getting level name', {
      levelUUID,
      orgId,
      error: error.message
    });
    return 'UnknownLevel';
  }
};

// Find game that contains a specific level UUID within an organization
export const findGameByLevelUUID = async (levelUUID, orgId) => {
  try {
    if (!levelUUID) return null;
    
    const gamesRef = ref(db, `orgs/${orgId}/games`);
    const gamesSnapshot = await get(gamesRef);
    
    if (!gamesSnapshot.exists()) return null;
    
    const games = gamesSnapshot.val();
    
    for (const gameKey in games) {
      const game = games[gameKey];
      if (game.levelIds && Array.isArray(game.levelIds) && 
          game.levelIds.includes(levelUUID)) {
        // console.log('Game found:', game.name);
        return game;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding game by level UUID:', error);
    return null;
  }
};

// Get game name from level UUID by finding the game that contains this level within an organization
export const getGameNameByLevelUUID = async (levelUUID, orgId) => {
  try {
    const game = await findGameByLevelUUID(levelUUID, orgId);
    return game?.name || 'UnknownGame';
  } catch (error) {
    console.error('Error getting game name by level UUID:', error);
    return 'UnknownGame';
  }
};


// Not Database function but attached to data menu search
export const checkDateFormat = (dateStr) => {
  // Regular expression to match the date format 'mm/dd/yyyy', 'm/dd/yyyy', 'mm/d/yyyy', 'm/d/yyyy', 'mm-dd-yyyy', 'm-dd-yyyy', 'mm-d-yyyy', or 'm-d-yyyy'
  const regex = /^(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12][0-9]|3[01])[-\/](\d{4})$/;

  // Test the date string against the regular expression
  if (!regex.test(dateStr)) {
    console.log('Invalid date format');
    return false;
    
  }
};

export const convertDateFormat = (dateStr) => {
    // Check if the date string contains '/' or '-'
    const separator = dateStr.includes('/') ? '/' : '-';
  
    // Split the date string into parts
    // Input format is mm/dd/yyyy, so first element is month, second is day
    const [month, day, year] = dateStr.split(separator);
    
    // Return the date string in the format 'yyyy-mm-dd' (matching database format)
    return `${year}-${month}-${day}`;
};

export const findGameIdByName = async (name, orgId) => {
  try {
    if (!name) return null;
    
    const gamesRef = ref(db, `orgs/${orgId}/games`);
    const gamesSnapshot = await get(gamesRef);
    
    if (!gamesSnapshot.exists()) return null;
    
    const games = gamesSnapshot.val();
    
    for (const gameKey in games) {
      const game = games[gameKey];
      if (game.name && game.name.includes(name)) {
        // console.log('Game found:', game.name);
        return game.UUID;
      }
    }
  
    return null;
  } catch (error) {
    console.error('Error finding gameId by name:', error);
    return null;
  }
};

export const findGameIdByNameAcrossOrgs = async (name, currentOrgId) => {
  try {
    console.log('[findGameIdByNameAcrossOrgs] Starting search for:', name, 'in org:', currentOrgId);
    
    if (!name) {
      console.warn('[findGameIdByNameAcrossOrgs] name is missing');
      return null;
    }
    if (!currentOrgId) {
      console.warn('[findGameIdByNameAcrossOrgs] currentOrgId is missing');
      return null;
    }
    
    // 1. First search in current organization
    console.log('[findGameIdByNameAcrossOrgs] Searching in current org:', currentOrgId);
    const currentOrgGamesRef = ref(db, `orgs/${currentOrgId}/games`);
    const currentOrgSnapshot = await get(currentOrgGamesRef);
    
    if (currentOrgSnapshot.exists()) {
      const games = currentOrgSnapshot.val();
      console.log('[findGameIdByNameAcrossOrgs] Found', Object.keys(games).length, 'games in current org');
      
      for (const gameKey in games) {
        const game = games[gameKey];
        console.log('[findGameIdByNameAcrossOrgs] Checking game:', game.name, 'UUID:', game.UUID);
        
        if (game.name && (game.name === name || game.name.includes(name))) {
          console.log('[findGameIdByNameAcrossOrgs] Match found in current org!', { gameId: game.UUID, orgId: currentOrgId });
          return { gameId: game.UUID, orgId: currentOrgId };
        }
      }
      console.log('[findGameIdByNameAcrossOrgs] No match in current org');
    } else {
      console.log('[findGameIdByNameAcrossOrgs] No games found in current org');
    }
    
    // 2. If not found, search in public games of other organizations
    console.log('[findGameIdByNameAcrossOrgs] Searching in other orgs for public games...');
    const orgsRef = ref(db, 'orgs');
    const orgsSnapshot = await get(orgsRef);
    
    if (orgsSnapshot.exists()) {
      const orgs = orgsSnapshot.val();
      const orgIds = Object.keys(orgs);
      console.log('[findGameIdByNameAcrossOrgs] Found', orgIds.length, 'organizations');
      
      for (const [otherOrgId, orgData] of Object.entries(orgs)) {
        if (otherOrgId === currentOrgId) {
          console.log('[findGameIdByNameAcrossOrgs] Skipping current org:', otherOrgId);
          continue; // Skip current organization
        }
        
        console.log('[findGameIdByNameAcrossOrgs] Checking org:', otherOrgId);
        const gamesRef = ref(db, `orgs/${otherOrgId}/games`);
        const gamesSnapshot = await get(gamesRef);
        
        if (gamesSnapshot.exists()) {
          const games = gamesSnapshot.val();
          console.log('[findGameIdByNameAcrossOrgs] Found', Object.keys(games).length, 'games in org:', otherOrgId);
          
          for (const [gameKey, gameData] of Object.entries(games)) {
            // Search only for public games
            if (gameData && gameData.isPublic === true && gameData.name && 
                (gameData.name === name || gameData.name.includes(name))) {
              console.log('[findGameIdByNameAcrossOrgs] Match found in other org!', { gameId: gameData.UUID, orgId: otherOrgId });
              return { gameId: gameData.UUID, orgId: otherOrgId };
            }
          }
        } else {
          console.log('[findGameIdByNameAcrossOrgs] No games in org:', otherOrgId);
        }
      }
    } else {
      console.log('[findGameIdByNameAcrossOrgs] No organizations found');
    }
    
    console.log('[findGameIdByNameAcrossOrgs] No match found anywhere');
    return null;
  } catch (error) {
    console.error('[findGameIdByNameAcrossOrgs] Error:', error);
    return null;
  }
};

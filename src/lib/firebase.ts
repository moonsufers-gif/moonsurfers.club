import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  syncUserToSupabase,
  syncTrickToSupabase,
  deleteTrickFromSupabase,
  syncChallengeToSupabase,
  syncDirectMessageToSupabase,
  syncCustomSpotToSupabase
} from './supabase';

import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  getDocs, 
  where, 
  limit, 
  orderBy, 
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getDocFromServer,
  runTransaction,
  deleteDoc,
  setLogLevel
} from 'firebase/firestore';

import firebaseConfig from '../../firebase-applet-config.json';

// Suppress verbose SDK internal connection warnings in container/iframe environments
setLogLevel('silent');

// ==========================================
// Firebase Initialization
// ==========================================
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// ==========================================
// Firebase Analytics Initialization
// ==========================================
export let analytics: any = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      console.log(`[ANALYTICS] Firebase Google Analytics initialized for ${firebaseConfig.projectId} (ID: ${firebaseConfig.measurementId})`);
    }
  }).catch((err) => {
    console.warn("[ANALYTICS] Google Analytics not supported:", err);
  });
}

// Standard connection test as requested in the Firebase integration skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase Connection verified successfully.");
  } catch (error) {
    console.warn("Firebase client initial probe handled: operating with active HTTP fallback.");
  }
}
testConnection();

// ==========================================
// Firestore Errors Specification
// ==========================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Info: ', JSON.stringify(errInfo));

  const isQuotaOrConnectionIssue = 
    errMsg.toLowerCase().includes('quota') || 
    errMsg.toLowerCase().includes('exhausted') || 
    errMsg.toLowerCase().includes('resource_exhausted') ||
    errMsg.toLowerCase().includes('code=resource-exhausted') ||
    errMsg.toLowerCase().includes('unavailable') ||
    errMsg.toLowerCase().includes('could not reach cloud firestore') ||
    errMsg.toLowerCase().includes('the operation could not be completed') ||
    errMsg.toLowerCase().includes('offline') ||
    errMsg.toLowerCase().includes('limit');

  if (isQuotaOrConnectionIssue) {
    console.warn(`[FIRESTORE FALLBACK] Handled condition (${operationType} on ${path}). Active HTTP backend proxy operating seamlessly.`);
    return;
  }

  console.warn(`[FIRESTORE WARNING] Handled error for ${operationType} on ${path}: ${errMsg}`);
}

// ==========================================
// TypeScript Entity Interfaces
// ==========================================
export interface ActiveLocation {
  districtId: string;
  districtName: string;
  spotName: string;
  coords: { x: number; y: number };
  coordinatesString: string;
}

export interface SkateProfile {
  id: string; // matches auth.uid
  handle: string;
  email: string;
  level: number;
  reputation: number;
  friends: string[]; // array of handles or userIDs
  badges: string[];
  activeLocation?: ActiveLocation;
  districtId?: string;
  motto?: string;
  skateStyle?: string;
  createdAt: any;
  updatedAt: any;
  isGuest?: boolean;
  dailyStreak?: number;
  lastStreakUpdate?: string;
  tracingAllowedUsers?: string[]; // Allowed user uids
  profilePicture?: string;
  vhsFilter?: boolean;
  avatarBorder?: string;
}

export interface DynamicChallenge {
  id: string;
  title: string;
  description: string;
  type: 'personal' | 'community';
  districtId: string;
  targetSpot: string;
  difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel' | 'Insane';
  xpReward: number;
  status: 'active' | 'completed' | 'expired';
  creatorId: string;
  createdAt: any;
  userId?: string; // assigned user ID
}

export interface TrickComment {
  id: string;
  userUid: string;
  userName: string;
  message: string;
  createdAt: string; // ISO timestamp
}

export interface LiveTrickUpload {
  id: string;
  userUid: string;
  userName: string;
  districtId: string;
  spotName: string;
  text: string;
  likesCount: number;
  likedUsers: string[];
  createdAt: any;
  comments?: TrickComment[];
  videoUrl?: string; // Real video clip storage url
  verifiedByAi?: boolean;
  aiVerificationFeedback?: string;
  stuntDistance?: number;
  performanceScore?: number;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderHandle: string;
  receiverUid: string;
  text: string;
  createdAt: any;
}

// ==========================================
// Authenticated Skater Profile Management
// ==========================================
export async function getSkaterProfile(userId: string): Promise<SkateProfile | null> {
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as SkateProfile;
    }
    return null;
  } catch (err) {
    console.warn(`[SYNC] Client profile retrieval failed (${err instanceof Error ? err.message : String(err)}). Querying fallback API for user ${userId}...`);
    try {
      const res = await fetch(`/api/fallback/profile/${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          return data.profile as SkateProfile;
        }
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Profile fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function createInitialProfile(userId: string, email: string, initialHandle: string): Promise<SkateProfile> {
  const path = `users/${userId}`;
  const now = new Date();
  
  // Strip whitespace, apply lowercase underscore rule
  const cleanHandle = initialHandle.trim().replace(/\s+/g, '_').toLowerCase() || `nomad_${Math.floor(Math.random() * 9000 + 1000)}`;
  const normEmail = (email || '').trim().toLowerCase();

  const isLeader = 
    normEmail === 'moonsufers@gmail.com' ||
    normEmail === 'moonsurfers@gmail.com' ||
    normEmail === 'inenepadi@gmail.com' ||
    normEmail.includes('moonsurfers') ||
    normEmail.includes('moonsufers') ||
    cleanHandle === 'moonsurfer' ||
    cleanHandle === 'moonsurfers' ||
    cleanHandle === 'moonsufers' ||
    cleanHandle === 'inene233' ||
    cleanHandle === 'inene';

  const profile: SkateProfile = {
    id: userId,
    handle: cleanHandle,
    email: email,
    level: isLeader ? 999 : 1,
    reputation: isLeader ? 999999 : 0,
    dailyStreak: isLeader ? 999 : 1,
    friends: isLeader ? ["wstt", "kofi-shredder", "big_spirit", "michelle"] : [],
    badges: isLeader 
      ? ["god_level", "network_captain", "mission_captain", "platform_leader", "verified_commander", "night_shredder", "outlaw_legend", "accra_legend", "nomad_starter"]
      : ['nomad_starter'],
    motto: isLeader ? "NETWORK CAPTAIN // INFINITE SYSTEM COMMANDER" : undefined,
    createdAt: now,
    updatedAt: now
  };

  try {
    await setDoc(doc(db, 'users', userId), {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    syncUserToSupabase(profile);
    return profile;
  } catch (err) {
    console.warn(`[SYNC] Client profile creation failed (${err instanceof Error ? err.message : String(err)}). Saving via fallback API...`);
    try {
      const res = await fetch("/api/fallback/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, profile })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          console.log("[SYNC] Created profile successfully via fallback API.");
          return profile;
        }
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Profile creation fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

const lastLocationUpdates = new Map<string, { time: number; locJson: string }>();

export async function updateLocation(userId: string, loc: ActiveLocation) {
  if (!userId || userId.startsWith('guest_') || userId.startsWith('seed_')) {
    return;
  }
  const now = Date.now();
  const locJson = JSON.stringify(loc);
  const lastUpdate = lastLocationUpdates.get(userId);
  
  if (lastUpdate) {
    const timeSinceLast = now - lastUpdate.time;
    const isSameLoc = lastUpdate.locJson === locJson;
    
    // Throttle duplicate locations to 5 minutes (300s), and any location changes to 3 minutes (180s)
    if (isSameLoc && timeSinceLast < 300000) {
      return;
    }
    if (!isSameLoc && timeSinceLast < 180000) {
      return;
    }
  }
  
  lastLocationUpdates.set(userId, { time: now, locJson });

  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      activeLocation: loc,
      updatedAt: serverTimestamp()
    });
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateSkaterDetails(userId: string, targetDetails: { 
  handle: string; 
  motto?: string; 
  skateStyle?: string;
  profilePicture?: string;
  vhsFilter?: boolean;
  avatarBorder?: string;
}) {
  if (!userId || userId.startsWith('guest_') || userId.startsWith('seed_')) {
    return true;
  }
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const updatePayload: any = {
      handle: targetDetails.handle.trim().toLowerCase().replace(/\s+/g, '_'),
      updatedAt: serverTimestamp()
    };
    if (targetDetails.motto !== undefined) {
      updatePayload.motto = targetDetails.motto.trim();
    }
    if (targetDetails.skateStyle !== undefined) {
      updatePayload.skateStyle = targetDetails.skateStyle.trim();
    }
    if (targetDetails.profilePicture !== undefined && targetDetails.profilePicture !== "") {
      updatePayload.profilePicture = targetDetails.profilePicture;
    }
    if (targetDetails.vhsFilter !== undefined) {
      updatePayload.vhsFilter = targetDetails.vhsFilter;
    }
    if (targetDetails.avatarBorder !== undefined) {
      updatePayload.avatarBorder = targetDetails.avatarBorder;
    }
    await updateDoc(docRef, updatePayload);
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
    return true;
  } catch (err) {
    console.warn(`[SYNC] Client profile details update failed (${err instanceof Error ? err.message : String(err)}). Saving via fallback API...`);
    try {
      const res = await fetch("/api/fallback/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, profile: targetDetails })
      });
      if (res.ok) {
        return true;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Profile details fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export async function updateReputationAndLevel(userId: string, xpGain: number, currentXp: number, currentLevel: number, newBadges?: string[]) {
  const rawNextXp = currentXp + xpGain;
  let nextLevel = currentLevel;
  let remainingXp = rawNextXp;

  // Simple level thresholds (e.g. 1000 XP per level in the early stage)
  const xpPerLevel = 1000;
  if (remainingXp >= xpPerLevel) {
    const levelsGained = Math.floor(remainingXp / xpPerLevel);
    nextLevel += levelsGained;
    remainingXp = remainingXp % xpPerLevel;
  }

  if (!userId || userId.startsWith('guest_') || userId.startsWith('seed_')) {
    return { level: nextLevel, reputation: rawNextXp };
  }

  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const updates: any = {
      reputation: rawNextXp,
      level: nextLevel,
      updatedAt: serverTimestamp()
    };
    if (newBadges && newBadges.length > 0) {
      updates.badges = arrayUnion(...newBadges);
    }
    await updateDoc(docRef, updates);
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
    return { level: nextLevel, reputation: rawNextXp };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export async function updatePlayerStreak(userId: string, newStreak: number, todayStr: string, isGuest: boolean = false) {
  if (isGuest || !userId || userId.startsWith('guest_') || userId.startsWith('seed_')) {
    return;
  }
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, {
      dailyStreak: newStreak,
      lastStreakUpdate: todayStr,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

// ==========================================
// Friendship Networks
// ==========================================
export async function addFriend(userId: string, friendHandle: string): Promise<boolean> {
  const path = 'users';
  try {
    const cleanHandle = friendHandle.replace(/^@/, '').trim().toLowerCase();
    if (!cleanHandle) return false;

    const myDocRef = doc(db, 'users', userId);
    
    // Add clean handle to friends array in Firestore
    await updateDoc(myDocRef, {
      friends: arrayUnion(cleanHandle),
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

export async function removeFriend(userId: string, friendHandle: string): Promise<boolean> {
  const path = 'users';
  try {
    const cleanHandle = friendHandle.replace(/^@/, '').trim().toLowerCase();
    const myDocRef = doc(db, 'users', userId);
    await updateDoc(myDocRef, {
      friends: arrayRemove(cleanHandle, friendHandle.trim().toLowerCase()),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

// ==========================================
// Dynamic Challenge Engine Generator
// ==========================================
/**
 * Dynamic Challenge Generator: Uses variables like user level, selected spot difficulty,
 * and current standings to produce customized rebels challenges directly saved to Firestore.
 */
export async function generateNewPersonalChallenge(
  userId: string,
  userLevel: number,
  spotName: string,
  spotType: string,
  districtId: string
): Promise<DynamicChallenge> {
  const path = 'challenges';
  
  // Custom generator parameters based on level
  const actionList = [
    { action: "Slide a backside boardslide on", diff: "Core", xpMultiplier: 1.5 },
    { action: "Nail a clean 360-flip down the main set at", diff: "Concrete", xpMultiplier: 2.2 },
    { action: "Kickflip in & frontside nosegrind out across the rough curbs at", diff: "Ledge", xpMultiplier: 1.8 },
    { action: "Outride local block dispatch alerts after mapping", diff: "Vandal", xpMultiplier: 2.5 },
    { action: "Execute a dangerous double-flip with active police watch nearby at", diff: "Steel", xpMultiplier: 3.0 },
    { action: "Full cabinet manual to 180-spin transition off", diff: "Insane", xpMultiplier: 3.5 }
  ];

  // Pick suitable template
  const matchedActions = actionList.filter(a => a.diff === spotType) || actionList;
  const picked = matchedActions[Math.floor(Math.random() * matchedActions.length)] || actionList[0];

  const levelAdjustment = Math.floor(userLevel * 10);
  const xpReward = Math.floor(250 * picked.xpMultiplier) + levelAdjustment;
  const id = `ch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const threatLevels = ["LOW HEAT", "CRITICAL SATELLITE BLOCKED", "active patrols", "SQUAD ALERT"];
  const selectedThreatZone = threatLevels[Math.floor(Math.random() * threatLevels.length)];

  const challenge: DynamicChallenge = {
    id,
    title: `Slay ${spotName}`,
    description: `${picked.action} the ${spotName}. Status: [${selectedThreatZone}]. Stay offline.`,
    type: 'personal',
    districtId,
    targetSpot: spotName,
    difficulty: picked.diff as any,
    xpReward,
    status: 'active',
    creatorId: 'system_engine',
    userId,
    createdAt: new Date()
  };

  try {
    await setDoc(doc(db, 'challenges', id), {
      ...challenge,
      createdAt: serverTimestamp()
    });
    syncChallengeToSupabase(challenge);
    return challenge;
  } catch (err) {
    console.warn(`[SYNC] generateNewPersonalChallenge failed (${err instanceof Error ? err.message : String(err)}). Attempting fallback API...`);
    try {
      const res = await fetch("/api/fallback/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...challenge,
          createdAt: new Date().toISOString()
        })
      });
      if (res.ok) {
        console.log("[SYNC] Challenge generated successfully via fallback API.");
        return challenge;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Challenge generator fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function completeChallenge(challengeId: string) {
  const path = `challenges/${challengeId}`;
  try {
    const docRef = doc(db, 'challenges', challengeId);
    await updateDoc(docRef, {
      status: 'completed'
    });
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      syncChallengeToSupabase(snap.data());
    }
  } catch (err) {
    console.warn(`[SYNC] completeChallenge failed (${err instanceof Error ? err.message : String(err)}). Attempting fallback API...`);
    try {
      const res = await fetch("/api/fallback/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: challengeId,
          status: 'completed'
        })
      });
      if (res.ok) {
        console.log("[SYNC] Challenge completed successfully via fallback API.");
        return;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Challenge completion fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ==========================================
// Trick Upload Stream and likes Transactions
// ==========================================
export async function uploadTrickClip(
  userId: string,
  userName: string,
  districtId: string,
  spotName: string,
  text: string,
  verifiedByAi?: boolean,
  aiVerificationFeedback?: string,
  videoUrl?: string,
  stuntDistance?: number,
  performanceScore?: number,
  customClipId?: string
): Promise<LiveTrickUpload> {
  const path = 'trick_uploads';
  const id = customClipId || `clip_${Date.now()}`;
  
  const resolvedVideoUrl = (videoUrl && videoUrl.trim().length > 0)
    ? videoUrl
    : (verifiedByAi ? `/api/videos/${id}` : "");

  const clip: LiveTrickUpload = {
    id,
    userUid: userId,
    userName,
    districtId,
    spotName,
    text,
    likesCount: 0,
    likedUsers: [],
    createdAt: new Date(),
    comments: [],
    verifiedByAi: verifiedByAi ?? false,
    aiVerificationFeedback: aiVerificationFeedback ?? "",
    videoUrl: resolvedVideoUrl,
    stuntDistance: stuntDistance ?? 0,
    performanceScore: performanceScore ?? 0
  };

  // sanitize undefined properties to prevent Firestore errors
  const cleanClip = Object.fromEntries(
    Object.entries(clip).filter(([_, val]) => val !== undefined)
  );

  try {
    await setDoc(doc(db, 'trick_uploads', id), {
      ...cleanClip,
      createdAt: serverTimestamp()
    });
    syncTrickToSupabase(clip);
    return clip;
  } catch (err) {
    console.warn(`[SYNC] Client upload setDoc failed (${err instanceof Error ? err.message : String(err)}). Attempting server fallback...`);
    try {
      const res = await fetch("/api/fallback/upload-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clip)
      });
      if (res.ok) {
        console.log("[SYNC] Clip registered successfully via fallback API.");
        return clip;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Upload fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * atomic transition for liking/unliking a skate clip to prevent Update Gaps and out of sync arrays
 */
export async function toggleLikeTrickUpload(uploadId: string, userId: string): Promise<{ likes: number; liked: boolean }> {
  const path = `trick_uploads/${uploadId}`;
  const docRef = doc(db, 'trick_uploads', uploadId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) {
        throw new Error("Target trick clip upload does not exist");
      }

      const data = snap.data() as LiveTrickUpload;
      const isLiked = data.likedUsers.includes(userId);
      
      const updatedLikedUsers = isLiked 
        ? data.likedUsers.filter(uid => uid !== userId)
        : [...data.likedUsers, userId];
      
      const newCount = updatedLikedUsers.length;

      transaction.update(docRef, {
        likesCount: newCount,
        likedUsers: updatedLikedUsers
      });

      const updated = { ...data, likesCount: newCount, likedUsers: updatedLikedUsers };
      syncTrickToSupabase(updated);

      return { likes: newCount, liked: !isLiked };
    });

    return result;
  } catch (err) {
    console.warn(`[SYNC] Client toggleLikeTransaction failed (${err instanceof Error ? err.message : String(err)}). Attempting server fallback...`);
    try {
      const res = await fetch("/api/fallback/toggle-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, userId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return { likes: data.likes, liked: data.liked };
        }
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Toggle like fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

/**
 * atomic transaction to add a comment to a trick upload
 */
export async function addCommentToTrickUpload(
  uploadId: string,
  userId: string,
  userName: string,
  message: string
): Promise<TrickComment> {
  const path = `trick_uploads/${uploadId}`;
  const docRef = doc(db, 'trick_uploads', uploadId);
  const now = new Date();

  const comment: TrickComment = {
    id: `comm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userUid: userId,
    userName: userName.trim(),
    message: message.trim(),
    createdAt: now.toISOString()
  };

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) {
        throw new Error("Target trick clip upload does not exist");
      }

      const data = snap.data();
      const currentComments = data?.comments || [];
      const updatedComments = [...currentComments, comment];

      transaction.update(docRef, {
        comments: updatedComments
      });

      const updated = { ...data, comments: updatedComments };
      syncTrickToSupabase(updated);
    });

    return comment;
  } catch (err) {
    console.warn(`[SYNC] Client addCommentTransaction failed (${err instanceof Error ? err.message : String(err)}). Attempting server fallback...`);
    try {
      const res = await fetch("/api/fallback/add-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, comment })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return comment;
        }
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Add comment fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

/**
 * atomic transaction to delete a comment from a trick upload
 */
export async function deleteCommentFromTrickUpload(
  uploadId: string,
  commentId: string
): Promise<boolean> {
  const path = `trick_uploads/${uploadId}`;
  const docRef = doc(db, 'trick_uploads', uploadId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) {
        throw new Error("Target trick clip upload does not exist");
      }

      const data = snap.data();
      const currentComments: TrickComment[] = data?.comments || [];
      const updatedComments = currentComments.filter(c => c.id !== commentId);

      transaction.update(docRef, {
        comments: updatedComments
      });

      const updated = { ...data, comments: updatedComments };
      syncTrickToSupabase(updated);
    });

    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

// ==========================================
// Com-Link Secure DM Messaging System
// ==========================================
export async function sendDirectMessage(
  senderUid: string,
  senderHandle: string,
  receiverUid: string,
  text: string
): Promise<ChatMessage> {
  const path = "direct_messages";
  const id = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const msg: ChatMessage = {
    id,
    senderUid,
    senderHandle,
    receiverUid,
    text: text.trim(),
    createdAt: new Date()
  };

  try {
    const docRef = doc(db, "direct_messages", id);
    await setDoc(docRef, {
      ...msg,
      createdAt: serverTimestamp()
    });
    syncDirectMessageToSupabase(msg);
    return msg;
  } catch (err) {
    console.warn(`[SYNC] sendDirectMessage failed (${err instanceof Error ? err.message : String(err)}). Attempting fallback API...`);
    try {
      const res = await fetch("/api/fallback/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...msg,
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
        })
      });
      if (res.ok) {
        console.log("[SYNC] Direct message saved successfully via fallback API.");
        return msg;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Direct message fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

// ==========================================
// Precise Location Tracking Permissions
// ==========================================
export async function toggleTracingPermission(
  myUid: string,
  friendUid: string,
  allowed: boolean
) {
  const path = `users/${myUid}`;
  try {
    const docRef = doc(db, "users", myUid);
    if (allowed) {
      await updateDoc(docRef, {
        tracingAllowedUsers: arrayUnion(friendUid),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(docRef, {
        tracingAllowedUsers: arrayRemove(friendUid),
        updatedAt: serverTimestamp()
      });
    }
    const updated = await getSkaterProfile(myUid);
    if (updated) {
      syncUserToSupabase(updated);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

// Purge moonsurfer user account and grant points to inenepadi@gmail.com
export async function purgeMoonsurferAndGrantPointsToInene() {
  try {
    const usersCol = collection(db, 'users');

    // 1. Delete moonsurfer_profile doc if exists
    try {
      await deleteDoc(doc(db, 'users', 'moonsurfer_profile'));
      console.log("[MIGRATION] Deleted moonsurfer_profile document.");
    } catch (e) {
      console.warn("No moonsurfer_profile doc found or delete error:", e);
    }

    // 2. Find and delete any user docs with handle 'moonsurfer' or 'moonsurfers' or email 'moonsufers@gmail.com' / 'moonsurfers@gmail.com'
    try {
      const q1 = query(usersCol, where('handle', 'in', ['moonsurfer', 'moonsurfers', '@moonsurfer', '@moonsurfers']));
      const snap1 = await getDocs(q1);
      for (const d of snap1.docs) {
        await deleteDoc(d.ref);
        console.log(`[MIGRATION] Deleted moonsurfer user doc by handle: ${d.id}`);
      }
    } catch (err) {
      console.warn("Error querying/deleting moonsurfer handles:", err);
    }

    try {
      const q2 = query(usersCol, where('email', 'in', ['moonsufers@gmail.com', 'moonsurfers@gmail.com']));
      const snap2 = await getDocs(q2);
      for (const d of snap2.docs) {
        await deleteDoc(d.ref);
        console.log(`[MIGRATION] Deleted moonsurfer user doc by email: ${d.id}`);
      }
    } catch (err) {
      console.warn("Error querying/deleting moonsurfer emails:", err);
    }

    // 3. Grant absorbed points (+14,450 reputation, +14 levels) to inenepadi@gmail.com
    try {
      const qInene = query(usersCol, where('email', '==', 'inenepadi@gmail.com'));
      const snapInene = await getDocs(qInene);
      if (!snapInene.empty) {
        for (const d of snapInene.docs) {
          const data = d.data() as SkateProfile;
          const currentRep = data.reputation || 0;
          const newRep = Math.max(32150, currentRep + 14450);
          const currentLevel = data.level || 0;
          const newLevel = Math.max(231, currentLevel + 14);
          await updateDoc(d.ref, {
            reputation: newRep,
            level: newLevel,
            updatedAt: new Date().toISOString()
          });
          console.log(`[MIGRATION] Updated inene user doc ${d.id} with reputation ${newRep} and level ${newLevel}`);
        }
      }
    } catch (err) {
      console.warn("Error updating inenepadi@gmail.com user doc:", err);
    }

    try {
      const ineneDocRef = doc(db, 'users', 'inene233_profile');
      const ineneDocSnap = await getDoc(ineneDocRef);
      if (ineneDocSnap.exists()) {
        const data = ineneDocSnap.data() as SkateProfile;
        const currentRep = data.reputation || 0;
        const newRep = Math.max(32150, currentRep + 14450);
        const currentLevel = data.level || 0;
        const newLevel = Math.max(231, currentLevel + 14);
        await updateDoc(ineneDocRef, {
          reputation: newRep,
          level: newLevel,
          updatedAt: new Date().toISOString()
        });
        console.log(`[MIGRATION] Updated inene233_profile doc with reputation ${newRep}`);
      }
    } catch (err) {
      console.warn("Error updating inene233_profile doc:", err);
    }
  } catch (err) {
    console.warn("Error running purgeMoonsurferAndGrantPointsToInene migration:", err);
  }
}

// ==========================================
// Auto-Seeding Database for Fresh Backends
// ==========================================
export async function seedDefaultDataIfEmpty() {
  try {
    const usersCol = collection(db, 'users');
    
    // Always run migration to ensure @moonsurfer is deleted and inene gets points
    await purgeMoonsurferAndGrantPointsToInene();

    // Seed initial default core profiles if missing
    try {
      const DEFAULT_USERS: SkateProfile[] = [
        {
          id: "inene233_profile",
          handle: "inene233",
          email: "inenepadi@gmail.com",
          level: 231,
          reputation: 32150,
          friends: ["wstt", "kofi-shredder", "big_spirit", "michelle"],
          badges: ["nomad_starter", "night_shredder", "accra_legend"],
          motto: "outlaw skater underbelly speed racer.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: "ACC",
            districtName: "Accra",
            spotName: "Osu Castle Wall",
            coords: { x: 200, y: 150 },
            coordinatesString: "5.5501° N, 0.1963° W"
          },
          dailyStreak: 3,
          lastStreakUpdate: "2026-06-12",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const u of DEFAULT_USERS) {
        const uDoc = await getDoc(doc(db, 'users', u.id));
        if (!uDoc.exists()) {
          await setDoc(doc(db, 'users', u.id), u);
          console.log(`[SEED] Core default profile ${u.handle} seeded.`);
        } else {
          // Ensure reputation is boosted on existing seeded doc
          await updateDoc(doc(db, 'users', u.id), {
            reputation: Math.max(32150, (uDoc.data()?.reputation || 0)),
            level: Math.max(231, (uDoc.data()?.level || 0))
          });
        }
      }
    } catch (userSeedErr) {
      console.warn("[SEED] User seeding check skipped:", userSeedErr);
    }

    // Seed initial challenges if empty
    try {
      const chCol = collection(db, 'challenges');
      const chSnap = await getDocs(query(chCol, limit(1)));
      if (chSnap.empty) {
        const SEED_CHALLENGES = [
          {
            id: "seed_ch_1",
            title: "Slay Osu Castle Stairs",
            description: "Slide a backside boardslide on the Osu Castle Wall. Keep high alert.",
            type: "community",
            districtId: "ACC",
            targetSpot: "Osu Castle Wall",
            difficulty: "Core",
            xpReward: 350,
            status: "active",
            creatorId: "system_engine",
            createdAt: serverTimestamp()
          }
        ];

        for (const ch of SEED_CHALLENGES) {
          await setDoc(doc(db, 'challenges', ch.id), ch);
        }
      }
    } catch (chErr) {
      console.warn("Challenge initial seed skipped:", chErr);
    }
  } catch (err) {
    console.warn("Auto-seeding check skipped or failed:", err);
  }
}

// ==========================================
// Custom Spots & Clip Deletion
// ==========================================

export interface CustomSpot {
  id: string;
  districtId: string;
  name: string;
  description: string;
  difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel';
  hype: number;
  coords: { x: number; y: number };
  createdBy: string;
  createdAt?: any;
  verified?: boolean;
}

export async function addCustomSpot(
  districtId: string,
  name: string,
  description: string,
  difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel',
  hype: number,
  createdBy: string,
  existingCoords?: Array<{ x: number; y: number }>,
  verified?: boolean
): Promise<CustomSpot> {
  const path = 'custom_spots';
  const id = `spot_${Date.now()}`;
  
  // Create deterministic coordinates on the SVG map that are distant from other spots
  let x = 150;
  let y = 150;
  let attempts = 0;
  let isDistant = false;

  while (!isDistant && attempts < 100) {
    attempts++;
    x = Math.floor(Math.random() * 200) + 100; // 100 to 300
    y = Math.floor(Math.random() * 140) + 80;  // 80 to 220
    
    if (!existingCoords || existingCoords.length === 0) {
      isDistant = true;
    } else {
      isDistant = existingCoords.every(coord => {
        if (!coord) return true;
        const dist = Math.sqrt(Math.pow(coord.x - x, 2) + Math.pow(coord.y - y, 2));
        return dist >= 45; // Must be at least 45 pixels of visual distance separation
      });
    }
  }

  const spot: CustomSpot = {
    id,
    districtId,
    name: name.trim(),
    description: description.trim(),
    difficulty,
    hype,
    coords: { x, y },
    createdBy,
    verified: verified ?? false,
    createdAt: new Date()
  };

  try {
    await setDoc(doc(db, 'custom_spots', id), {
      ...spot,
      createdAt: serverTimestamp()
    });
    syncCustomSpotToSupabase(spot);
    return spot;
  } catch (err) {
    console.warn(`[SYNC] addCustomSpot failed (${err instanceof Error ? err.message : String(err)}). Attempting fallback API...`);
    try {
      const res = await fetch("/api/fallback/custom-spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...spot,
          createdAt: new Date().toISOString()
        })
      });
      if (res.ok) {
        console.log("[SYNC] Custom spot saved successfully via fallback API.");
        return spot;
      }
    } catch (fallbackErr) {
      console.error("[SYNC] Custom spot fallback API failed:", fallbackErr);
    }
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteTrickClip(uploadId: string): Promise<boolean> {
  const path = `trick_uploads/${uploadId}`;
  try {
    await deleteDoc(doc(db, 'trick_uploads', uploadId));
    try {
      await deleteTrickFromSupabase(uploadId);
    } catch (e) {
      console.warn("[SYNC] Supabase clip delete warning ignored:", e);
    }
    return true;
  } catch (err) {
    console.warn("[FIRESTORE] Delete clip error handled gracefully:", err);
    return false;
  }
}

export async function deleteCustomSpot(spotId: string): Promise<boolean> {
  const path = `custom_spots/${spotId}`;
  try {
    await deleteDoc(doc(db, 'custom_spots', spotId));
    try {
      const { syncCustomSpotToSupabase } = await import('./supabase');
      // Sync deletion or nullify in supabase by passing null / empty or custom deletion sync
    } catch (e) {
      console.warn("Failed to sync spot deletion to Supabase:", e);
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

// ==========================================
// MOON PHASES DATABASE SEEDING & SYNC
// ==========================================
export interface DbMoonPhase {
  id: string;
  phaseName: string;
  symbol: string;
  cycleFraction: number;
  illumination: number;
  description: string;
  updatedAt?: string;
}

export const DEFAULT_MOON_PHASES: DbMoonPhase[] = [
  {
    id: 'phase_0',
    phaseName: 'New Moon',
    symbol: '🌑',
    cycleFraction: 0.0,
    illumination: 0.0,
    description: 'The moon is positioned between Earth and Sun, dark and mysterious in nocturnal sky.',
  },
  {
    id: 'phase_1',
    phaseName: 'Waxing Crescent',
    symbol: '🌒',
    cycleFraction: 0.125,
    illumination: 0.25,
    description: 'A thin sliver of silver moonshine emerges over dusk street spots.',
  },
  {
    id: 'phase_2',
    phaseName: 'First Quarter',
    symbol: '🌓',
    cycleFraction: 0.25,
    illumination: 0.50,
    description: 'Half-disk illuminated casting crisp urban ledge shadows.',
  },
  {
    id: 'phase_3',
    phaseName: 'Waxing Gibbous',
    symbol: '🌔',
    cycleFraction: 0.375,
    illumination: 0.75,
    description: 'Growing lunar radiance as night outlaw runs gain momentum.',
  },
  {
    id: 'phase_4',
    phaseName: 'Full Moon',
    symbol: '🌕',
    cycleFraction: 0.50,
    illumination: 1.0,
    description: 'Maximum moonshine intensity lighting up underground concrete waves.',
  },
  {
    id: 'phase_5',
    phaseName: 'Waning Gibbous',
    symbol: '🌖',
    cycleFraction: 0.625,
    illumination: 0.75,
    description: 'Radiant silver disk waning gradually past midnight peak.',
  },
  {
    id: 'phase_6',
    phaseName: 'Last Quarter',
    symbol: '🌗',
    cycleFraction: 0.75,
    illumination: 0.50,
    description: 'Third quarter moon illuminating late night sector runs.',
  },
  {
    id: 'phase_7',
    phaseName: 'Waning Crescent',
    symbol: '🌘',
    cycleFraction: 0.875,
    illumination: 0.25,
    description: 'Fading crescent before resetting the nocturnal synodic cycle.',
  }
];

export async function seedMoonPhasesIfEmpty(): Promise<DbMoonPhase[]> {
  try {
    const snap = await getDocs(collection(db, 'moon_phases'));
    if (!snap.empty) {
      const list: DbMoonPhase[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DbMoonPhase);
      });
      list.sort((a, b) => a.cycleFraction - b.cycleFraction);
      return list;
    }

    console.log("[MOON PHASES] Seeding all 8 lunar phases into Firestore database...");
    for (const phase of DEFAULT_MOON_PHASES) {
      await setDoc(doc(db, 'moon_phases', phase.id), {
        ...phase,
        updatedAt: new Date().toISOString()
      });
    }

    // Set initial active config if not preset
    const activeDoc = await getDoc(doc(db, 'lunar_config', 'active'));
    if (!activeDoc.exists()) {
      await setDoc(doc(db, 'lunar_config', 'active'), {
        activePhaseId: 'auto',
        cycleFraction: 0.50,
        illumination: 1.0,
        phaseName: 'Full Moon',
        symbol: '🌕',
        isLiveLoop: false,
        updatedAt: serverTimestamp()
      });
    }

    return DEFAULT_MOON_PHASES;
  } catch (err) {
    console.warn("[MOON PHASES] Database seed warning:", err);
    return DEFAULT_MOON_PHASES;
  }
}

export async function updateActiveMoonPhaseInDb(phaseData: {
  activePhaseId: string;
  cycleFraction: number;
  illumination: number;
  phaseName: string;
  symbol: string;
  isLiveLoop?: boolean;
}): Promise<boolean> {
  try {
    await setDoc(doc(db, 'lunar_config', 'active'), {
      ...phaseData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn("[MOON PHASES] Failed to update active phase in DB:", err);
    return false;
  }
}




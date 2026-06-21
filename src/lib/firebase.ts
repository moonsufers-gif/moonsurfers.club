import { initializeApp } from 'firebase/app';
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
  deleteDoc
} from 'firebase/firestore';

import firebaseConfig from '../../firebase-applet-config.json';

// ==========================================
// Firebase Initialization
// ==========================================
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Standard connection test as requested in the Firebase integration skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase Connection verified successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client appears to be offline. Verify credentials.");
    }
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function createInitialProfile(userId: string, email: string, initialHandle: string): Promise<SkateProfile> {
  const path = `users/${userId}`;
  const now = new Date();
  
  // Strip whitespace, apply lowercase underscore rule
  const cleanHandle = initialHandle.trim().replace(/\s+/g, '_').toLowerCase() || `nomad_${Math.floor(Math.random() * 9000 + 1000)}`;

  const profile: SkateProfile = {
    id: userId,
    handle: cleanHandle,
    email: email,
    level: 1,
    reputation: 0,
    friends: [],
    badges: ['nomad_starter'],
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
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function updateLocation(userId: string, loc: ActiveLocation) {
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
    if (targetDetails.profilePicture !== undefined) {
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
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export async function updateReputationAndLevel(userId: string, xpGain: number, currentXp: number, currentLevel: number, newBadges?: string[]) {
  const path = `users/${userId}`;
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
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    if (isGuest) {
      try {
        await setDoc(docRef, {
          dailyStreak: newStreak,
          lastStreakUpdate: todayStr,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.warn("Guest profile Firestore sync skipped (stale/offline)", e);
      }
    } else {
      await setDoc(docRef, {
        dailyStreak: newStreak,
        lastStreakUpdate: todayStr,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ==========================================
// Friendship Networks
// ==========================================
export async function addFriend(userId: string, friendHandle: string): Promise<boolean> {
  const path = 'users';
  try {
    // 1. Verify that friend with this handle exists
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('handle', '==', friendHandle.trim().toLowerCase()));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) {
      return false; // Friend handle not found
    }

    const friendDoc = querySnap.docs[0];
    const friendUid = friendDoc.id;

    if (friendUid === userId) {
      return false; // Can't add self
    }

    // 2. Add to your friends list (store their uid or handle)
    const myDocRef = doc(db, 'users', userId);
    await updateDoc(myDocRef, {
      friends: arrayUnion(friendHandle.trim().toLowerCase()),
      updatedAt: serverTimestamp()
    });

    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }

    // 3. Optional: Back-link friend to you (optional sync)
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

export async function removeFriend(userId: string, friendHandle: string): Promise<boolean> {
  const path = 'users';
  try {
    const myDocRef = doc(db, 'users', userId);
    await updateDoc(myDocRef, {
      friends: arrayRemove(friendHandle.trim().toLowerCase()),
      updatedAt: serverTimestamp()
    });
    const updated = await getSkaterProfile(userId);
    if (updated) {
      syncUserToSupabase(updated);
    }
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
  performanceScore?: number
): Promise<LiveTrickUpload> {
  const path = 'trick_uploads';
  const id = `clip_${Date.now()}`;
  
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
    videoUrl: videoUrl ?? "",
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
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
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

// ==========================================
// Auto-Seeding Database for Fresh Backends
// ==========================================
export async function seedDefaultDataIfEmpty() {
  try {
    const usersCol = collection(db, 'users');
    const userSnapshot = await getDocs(query(usersCol, limit(5)));
    
    // Check if the primary seed skater 'seed_wstt' is missing
    let isSeedMissing = false;
    try {
      const mainSeedDoc = await getDoc(doc(db, 'users', 'seed_wstt'));
      isSeedMissing = !mainSeedDoc.exists();
    } catch (e) {
      isSeedMissing = true;
    }

    // Always seed/ensure the core video players and friends exist in the DB if the database is completely empty or missing seed skaters
    if (userSnapshot.empty || isSeedMissing) {
      console.log("Seeding initial skaters, tricks, and challenges to brand new database...");
      
      const SEED_SKATERS = [
        {
          id: "qoEhm0ZgOVVmAIRpaKozh1pJur72",
          handle: "inene233",
          email: "inenepadi@gmail.com",
          level: 14,
          reputation: 14450,
          friends: ["wstt", "kofi-shredder", "big_spirit", "michelle"],
          badges: ["nomad_starter", "night_shredder", "accra_legend"],
          motto: "outlaw skater underbelly speed racer.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 200, y: 150 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          dailyStreak: 3,
          lastStreakUpdate: "2026-06-12"
        },
        {
          id: "seed_wstt",
          handle: "wstt",
          email: "wstt@moonsurfers.net",
          level: 1,
          reputation: 750,
          friends: ["inene233", "kofi-shredder"],
          badges: ["nomad_starter"],
          motto: "SML WAY",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 180, y: 140 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_kofi_shredder",
          handle: "kofi-shredder",
          email: "kofi_shredder@moonsurfers.net",
          level: 1,
          reputation: 635,
          friends: ["inene233", "wstt"],
          badges: ["nomad_starter"],
          motto: "Street Rebel",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 120, y: 210 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_big_spirit",
          handle: "big_spirit",
          email: "big_spirit@moonsurfers.net",
          level: 1,
          reputation: 350,
          friends: ["inene233"],
          badges: ["nomad_starter"],
          motto: "Telemetry Ghost.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 310, y: 180 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_michelle",
          handle: "michelle",
          email: "michelle@moonsurfers.net",
          level: 1,
          reputation: 500,
          friends: ["inene233"],
          badges: ["nomad_starter"],
          motto: "Neon cruiser.",
          skateStyle: "FLOW",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 190, y: 150 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_night_crawler",
          handle: "night_crawler",
          email: "night_crawler@moonsurfers.net",
          level: 12,
          reputation: 12400,
          friends: ["dune_phantom", "osu_shadow"],
          badges: ["nomad_starter", "night_shredder", "accra_legend"],
          motto: "Darkness is my canvas, tarmac is my brush.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Osu Castle Wall',
            coords: { x: 180, y: 140 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_dune_phantom",
          handle: "dune_phantom",
          email: "dune_phantom@moonsurfers.net",
          level: 11,
          reputation: 11950,
          friends: ["night_crawler", "osu_shadow"],
          badges: ["nomad_starter", "concrete_carver"],
          motto: "Nothing beats a clean manual along the shores.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Independence Square',
            coords: { x: 120, y: 210 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "seed_osu_shadow",
          handle: "osu_shadow",
          email: "osu_shadow@moonsurfers.net",
          level: 10,
          reputation: 10200,
          friends: ["night_crawler", "dune_phantom"],
          badges: ["nomad_starter", "ledge_shredder"],
          motto: "Outrunning police patrols since 2024.",
          skateStyle: "STREET",
          activeLocation: {
            districtId: 'ACC',
            districtName: 'Accra',
            spotName: 'Black Star Gate Ledger',
            coords: { x: 310, y: 180 },
            coordinatesString: '5.5501° N, 0.1963° W'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      for (const skater of SEED_SKATERS) {
        await setDoc(doc(db, 'users', skater.id), skater);
      }

      // Seed trick uploads
      const SEED_TRICK_UPLOADS = [
        {
          id: "seed_clip_1",
          userUid: "seed_wstt",
          userName: "wstt",
          districtId: "ACC",
          spotName: "Osu Castle Wall",
          text: "Nailed a clean backside 180 kickflip down the Osu Castle beach wall gap! The security guard literally applauded.",
          likesCount: 14,
          likedUsers: ["seed_dune_phantom", "seed_osu_shadow"],
          createdAt: serverTimestamp(),
          comments: [
            {
              id: "seed_comm_1",
              userUid: "seed_dune_phantom",
              userName: "dune_phantom",
              message: "Solid steeze man! Landing looked absolutely butter.",
              createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
            }
          ]
        },
        {
          id: "seed_clip_2",
          userUid: "seed_kofi_shredder",
          userName: "kofi-shredder",
          districtId: "ACC",
          spotName: "Osu Castle Wall",
          text: "Double kickflip off the steps! Join the Accra frequency.",
          likesCount: 8,
          likedUsers: ["qoEhm0ZgOVVmAIRpaKozh1pJur72"],
          createdAt: serverTimestamp(),
          comments: []
        }
      ];

      for (const clip of SEED_TRICK_UPLOADS) {
        await setDoc(doc(db, 'trick_uploads', clip.id), clip);
      }

      // Seed challenges
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

      console.log("Database seeded successfully with default skaters, clips, and challenges.");
    }
  } catch (err) {
    console.warn("Auto-seeding skipped or failed (unauthenticated/rules):", err);
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
}

export async function addCustomSpot(
  districtId: string,
  name: string,
  description: string,
  difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel',
  hype: number,
  createdBy: string,
  existingCoords?: Array<{ x: number; y: number }>
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
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteTrickClip(uploadId: string): Promise<boolean> {
  const path = `trick_uploads/${uploadId}`;
  try {
    await deleteDoc(doc(db, 'trick_uploads', uploadId));
    deleteTrickFromSupabase(uploadId);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

export interface MigrationStats {
  usersCount: number;
  uploadsCount: number;
  customSpotsCount: number;
  directMessagesCount: number;
  challengesCount: number;
  errors: string[];
}

export async function runFullDatabaseMigration(
  onProgress: (step: string, stats: Partial<MigrationStats>) => void
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    usersCount: 0,
    uploadsCount: 0,
    customSpotsCount: 0,
    directMessagesCount: 0,
    challengesCount: 0,
    errors: [],
  };

  try {
    // 1. Migrate Users
    onProgress("FETCHING USERS FROM FIRESTORE...", stats);
    const usersSnap = await getDocs(collection(db, "users"));
    onProgress(`MIGRATING ${usersSnap.size} PUBLIC SKATER PROFILES TO SUPABASE...`, stats);
    for (const d of usersSnap.docs) {
      try {
        const u = d.data();
        await syncUserToSupabase({
          id: d.id,
          ...u,
          createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt || new Date(),
          updatedAt: u.updatedAt?.toDate ? u.updatedAt.toDate() : u.updatedAt || new Date(),
        });
        stats.usersCount++;
      } catch (e: any) {
        stats.errors.push(`User ${d.id}: ${e.message || e}`);
      }
    }

    // 2. Migrate Uploads
    onProgress("FETCHING TRICK POSTS FROM FIRESTORE...", stats);
    const uploadsSnap = await getDocs(collection(db, "trick_uploads"));
    onProgress(`MIGRATING ${uploadsSnap.size} VIDEOS/UPLOADS TO SUPABASE...`, stats);
    for (const d of uploadsSnap.docs) {
      try {
        const u = d.data();
        await syncTrickToSupabase({
          id: d.id,
          ...u,
          createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt || new Date(),
        });
        stats.uploadsCount++;
      } catch (e: any) {
        stats.errors.push(`Upload ${d.id}: ${e.message || e}`);
      }
    }

    // 3. Migrate Custom Spots
    onProgress("FETCHING STREET SPOTS FROM FIRESTORE...", stats);
    const spotsSnap = await getDocs(collection(db, "custom_spots"));
    onProgress(`MIGRATING ${spotsSnap.size} RADAR CUSTOM SPOTS TO SUPABASE...`, stats);
    for (const d of spotsSnap.docs) {
      try {
        const u = d.data();
        await syncCustomSpotToSupabase({
          id: d.id,
          ...u,
          createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt || new Date(),
        });
        stats.customSpotsCount++;
      } catch (e: any) {
        stats.errors.push(`Spot ${d.id}: ${e.message || e}`);
      }
    }

    // 4. Migrate Direct Messages
    onProgress("FETCHING PRIVATE MESSAGES FROM FIRESTORE...", stats);
    const msgsSnap = await getDocs(collection(db, "direct_messages"));
    onProgress(`MIGRATING ${msgsSnap.size} COMLINK DISPATCHES TO SUPABASE...`, stats);
    for (const d of msgsSnap.docs) {
      try {
        const u = d.data();
        await syncDirectMessageToSupabase({
          id: d.id,
          ...u,
          createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt || new Date(),
        });
        stats.directMessagesCount++;
      } catch (e: any) {
        stats.errors.push(`Message ${d.id}: ${e.message || e}`);
      }
    }

    // 5. Migrate Challenges
    onProgress("FETCHING SECTOR CHALLENGES FROM FIRESTORE...", stats);
    const challengesSnap = await getDocs(collection(db, "challenges"));
    onProgress(`MIGRATING ${challengesSnap.size} STATS CHALLENGES TO SUPABASE...`, stats);
    for (const d of challengesSnap.docs) {
      try {
        const u = d.data();
        await syncChallengeToSupabase({
          id: d.id,
          ...u,
          createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt || new Date(),
        });
        stats.challengesCount++;
      } catch (e: any) {
        stats.errors.push(`Challenge ${d.id}: ${e.message || e}`);
      }
    }

    onProgress("DATABASE SYNCHRONIZATION TRANSACTION ENTIRELY COMPLETED.", stats);
  } catch (err: any) {
    stats.errors.push(`Global: ${err.message || err}`);
    onProgress(`CRITICAL TRANSACTION FAILURE: ${err.message || err}`, stats);
  }

  return stats;
}
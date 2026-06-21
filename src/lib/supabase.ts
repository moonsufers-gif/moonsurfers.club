import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pgqjyagekzxyghjtldge.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PMrtPd9UocW_vlxzCYt_vQ_qzgAwqXg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Standard connection test
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.warn("Supabase initial connection warning (likely missing 'users' table structure yet):", error.message);
    } else {
      console.log("Supabase connected and tables accessible.");
    }
  } catch (err) {
    console.warn("Supabase connection check skipped/failed gracefully:", err);
  }
}
testSupabaseConnection();

/**
 * Resilient Supabase Sync Engine
 * Dual-writes any data to Supabase to mirror Firestore changes without crashing.
 */

export async function syncUserToSupabase(userProfile: any) {
  try {
    const payload = {
      id: userProfile.id,
      handle: userProfile.handle,
      email: userProfile.email,
      level: userProfile.level || 1,
      reputation: userProfile.reputation || 0,
      friends: userProfile.friends || [],
      badges: userProfile.badges || [],
      active_location: userProfile.activeLocation || null,
      district_id: userProfile.districtId || userProfile.activeLocation?.districtId || null,
      motto: userProfile.motto || null,
      skate_style: userProfile.skateStyle || null,
      daily_streak: userProfile.dailyStreak || 0,
      last_streak_update: userProfile.lastStreakUpdate || null,
      tracing_allowed_users: userProfile.tracingAllowedUsers || [],
      profile_picture: userProfile.profilePicture || null,
      vhs_filter: userProfile.vhsFilter || false,
      avatar_border: userProfile.avatarBorder || null,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.warn("Supabase Sync warning [users]:", error.message);
    } else {
      console.log("Supabase Sync success [users] for ID:", userProfile.id);
    }
  } catch (e) {
    console.warn("Supabase Sync exception [users] suppressed gracefully:", e);
  }
}

export async function syncTrickToSupabase(trickClip: any) {
  try {
    const payload = {
      id: trickClip.id,
      user_uid: trickClip.userUid,
      user_name: trickClip.userName,
      district_id: trickClip.districtId,
      spot_name: trickClip.spotName,
      text: trickClip.text,
      likes_count: trickClip.likesCount || 0,
      liked_users: trickClip.likedUsers || [],
      comments: trickClip.comments || [],
      video_url: trickClip.videoUrl || "",
      verified_by_ai: trickClip.verifiedByAi ?? false,
      ai_verification_feedback: trickClip.aiVerificationFeedback || "",
      stunt_distance: trickClip.stuntDistance || 0,
      performance_score: trickClip.performanceScore || 0,
      created_at: trickClip.createdAt instanceof Date ? trickClip.createdAt.toISOString() : new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('trick_uploads')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.warn("Supabase Sync warning [trick_uploads]:", error.message);
    } else {
      console.log("Supabase Sync success [trick_uploads] for ID:", trickClip.id);
    }
  } catch (e) {
    console.warn("Supabase Sync exception [trick_uploads] suppressed gracefully:", e);
  }
}

export async function deleteTrickFromSupabase(uploadId: string) {
  try {
    const { error } = await supabase
      .from('trick_uploads')
      .delete()
      .eq('id', uploadId);
      
    if (error) {
      console.warn("Supabase delete warning [trick_uploads]:", error.message);
    } else {
      console.log("Supabase Delete success [trick_uploads] for ID:", uploadId);
    }
  } catch (e) {
    console.warn("Supabase Delete exception [trick_uploads] suppressed gracefully:", e);
  }
}

export async function syncChallengeToSupabase(challenge: any) {
  try {
    const payload = {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      type: challenge.type,
      district_id: challenge.districtId,
      target_spot: challenge.targetSpot,
      difficulty: challenge.difficulty,
      xp_reward: challenge.xpReward,
      status: challenge.status,
      creator_id: challenge.creatorId,
      user_id: challenge.userId || null,
      created_at: challenge.createdAt instanceof Date ? challenge.createdAt.toISOString() : new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('challenges')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.warn("Supabase Sync warning [challenges]:", error.message);
    } else {
      console.log("Supabase Sync success [challenges] for ID:", challenge.id);
    }
  } catch (e) {
    console.warn("Supabase Sync exception [challenges] suppressed gracefully:", e);
  }
}

export async function syncDirectMessageToSupabase(msg: any) {
  try {
    const payload = {
      id: msg.id,
      sender_uid: msg.senderUid,
      sender_handle: msg.senderHandle,
      receiver_uid: msg.receiverUid,
      text: msg.text,
      created_at: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('direct_messages')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.warn("Supabase Sync warning [direct_messages]:", error.message);
    } else {
      console.log("Supabase Sync success [direct_messages] for ID:", msg.id);
    }
  } catch (e) {
    console.warn("Supabase Sync exception [direct_messages] suppressed gracefully:", e);
  }
}

export async function syncCustomSpotToSupabase(spot: any) {
  try {
    const payload = {
      id: spot.id,
      district_id: spot.districtId,
      name: spot.name,
      description: spot.description,
      difficulty: spot.difficulty,
      hype: spot.hype,
      coords: spot.coords || null,
      created_by: spot.createdBy,
      created_at: spot.createdAt instanceof Date ? spot.createdAt.toISOString() : new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('custom_spots')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.warn("Supabase Sync warning [custom_spots]:", error.message);
    } else {
      console.log("Supabase Sync success [custom_spots] for ID:", spot.id);
    }
  } catch (e) {
    console.warn("Supabase Sync exception [custom_spots] suppressed gracefully:", e);
  }
}

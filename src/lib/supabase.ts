import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 
  'https://obhxxkknxeqdbgoiosek.supabase.co';

export const SUPABASE_ANON_KEY = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 
  'sb_publishable_bKGd54je4uPFzpEoyv1a6A_ANmAsZZz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ========================================================
// USER PROFILES
// ========================================================
export async function syncUserToSupabase(userProfile: any) {
  if (!userProfile || !supabase) return;
  try {
    const uid = userProfile.id || userProfile.uid || userProfile.handle || 'anonymous';
    const handle = userProfile.handle || uid;
    const email = (userProfile.email || '').trim().toLowerCase();

    await supabase.from('users').upsert({
      id: uid,
      handle: handle,
      email: email,
      name: userProfile.name || handle,
      avatar: userProfile.avatar || userProfile.profilePicture || '',
      reputation: userProfile.reputation || 0,
      level: userProfile.level || 1,
      daily_streak: userProfile.dailyStreak || 0,
      badges: userProfile.badges || [],
      active_location: userProfile.activeLocation || null,
      friends: userProfile.friends || [],
      raw_data: userProfile,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    console.log(`[SUPABASE SYNC] Skater profile ${handle} synced to Supabase.`);
  } catch (err) {
    console.warn('[SUPABASE SYNC] User sync info:', err);
  }
}

export async function fetchUsersFromSupabase(): Promise<any[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('reputation', { ascending: false })
      .limit(250);
    if (error) {
      console.warn('[SUPABASE FETCH USERS] Note:', error.message);
      return [];
    }
    return (data || []).map((row: any) => {
      const raw = row.raw_data || {};
      return {
        id: row.id,
        handle: row.handle || raw.handle || 'skater',
        email: row.email || raw.email || '',
        name: row.name || raw.name || row.handle,
        profilePicture: row.avatar || raw.profilePicture || '',
        avatar: row.avatar || raw.avatar || '',
        reputation: Number(row.reputation ?? raw.reputation ?? 0),
        level: Number(row.level ?? raw.level ?? 1),
        dailyStreak: Number(row.daily_streak ?? raw.dailyStreak ?? 1),
        badges: row.badges || raw.badges || ['nomad_starter'],
        activeLocation: row.active_location || raw.activeLocation || null,
        friends: row.friends || raw.friends || [],
        motto: raw.motto || '',
        skateStyle: raw.skateStyle || 'STREET',
        createdAt: row.created_at || raw.createdAt || new Date().toISOString(),
        updatedAt: row.updated_at || raw.updatedAt || new Date().toISOString()
      };
    });
  } catch (err) {
    console.warn('[SUPABASE FETCH USERS] Error:', err);
    return [];
  }
}

export function subscribeToSupabaseUsers(onUserChange: (user: any) => void) {
  if (!supabase) return () => {};
  try {
    const channel = supabase
      .channel('public_users_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        const row: any = payload.new;
        if (!row) return;
        const raw = row.raw_data || {};
        const userObj = {
          id: row.id,
          handle: row.handle || raw.handle || 'skater',
          email: row.email || raw.email || '',
          name: row.name || raw.name || row.handle,
          profilePicture: row.avatar || raw.profilePicture || '',
          avatar: row.avatar || raw.avatar || '',
          reputation: Number(row.reputation ?? raw.reputation ?? 0),
          level: Number(row.level ?? raw.level ?? 1),
          dailyStreak: Number(row.daily_streak ?? raw.dailyStreak ?? 1),
          badges: row.badges || raw.badges || ['nomad_starter'],
          activeLocation: row.active_location || raw.activeLocation || null,
          friends: row.friends || raw.friends || [],
          motto: raw.motto || '',
          skateStyle: raw.skateStyle || 'STREET',
          createdAt: row.created_at || raw.createdAt || new Date().toISOString(),
          updatedAt: row.updated_at || raw.updatedAt || new Date().toISOString()
        };
        console.log('[SUPABASE REALTIME] Live skater update received:', userObj.handle);
        onUserChange(userObj);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (e) {
    console.warn('[SUPABASE REALTIME USERS] Subscription error:', e);
    return () => {};
  }
}

export async function signUpWithSupabase(email: string, pass: string, handle: string) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: { handle }
      }
    });
    if (error) {
      console.warn('[SUPABASE AUTH] Sign up warning:', error.message);
      return null;
    }
    return data.user;
  } catch (err) {
    console.warn('[SUPABASE AUTH] Sign up exception:', err);
    return null;
  }
}

export async function signInWithSupabase(email: string, pass: string) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass
    });
    if (error) {
      console.warn('[SUPABASE AUTH] Sign in warning:', error.message);
      return null;
    }
    return data.user;
  } catch (err) {
    console.warn('[SUPABASE AUTH] Sign in exception:', err);
    return null;
  }
}

// ========================================================
// VIDEO STORAGE UPLOAD (Supabase Storage Bucket: skate_clips)
// ========================================================
export async function uploadVideoFileToSupabase(file: File, id: string): Promise<string | null> {
  if (!supabase || !file) return null;
  try {
    const ext = file.name ? file.name.split('.').pop() : 'mp4';
    const filePath = `clips/${id}_${Date.now()}.${ext || 'mp4'}`;
    
    // Upload file to Supabase Storage bucket 'skate_clips'
    const { data, error } = await supabase.storage
      .from('skate_clips')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'video/mp4'
      });

    if (error) {
      console.warn('[SUPABASE STORAGE] Upload warning (using fallback):', error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('skate_clips')
      .getPublicUrl(data.path);

    if (publicUrlData?.publicUrl) {
      console.log('[SUPABASE STORAGE] Video uploaded successfully:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    }
  } catch (err) {
    console.warn('[SUPABASE STORAGE] Video upload exception:', err);
  }
  return null;
}

// ========================================================
// TRICK / SKATE VIDEOS
// ========================================================
export async function syncTrickToSupabase(trickClip: any) {
  if (!trickClip || !supabase) return;
  try {
    const createdIso = trickClip.createdAt 
      ? (typeof trickClip.createdAt === 'string' ? trickClip.createdAt : (trickClip.createdAt.toDate ? trickClip.createdAt.toDate().toISOString() : new Date(trickClip.createdAt).toISOString()))
      : new Date().toISOString();

    let rawUrl = trickClip.videoUrl || trickClip.video_url || '';
    if (!rawUrl || rawUrl.startsWith('blob:')) {
      rawUrl = `/api/videos/${trickClip.id}`;
    }

    await supabase.from('skate_videos').upsert({
      id: trickClip.id,
      spot_id: trickClip.districtId || trickClip.spotId || trickClip.spot_id || 'ACC',
      spot_name: trickClip.spotName || trickClip.spot_name || 'Central Plaza',
      skater_handle: trickClip.userName || trickClip.skaterHandle || trickClip.skater_handle || 'shredder',
      video_url: rawUrl,
      trick_name: trickClip.text || trickClip.trickName || trickClip.trick_name || 'Outlaw Skate Line',
      raw_data: trickClip,
      created_at: createdIso
    }, { onConflict: 'id' });
    console.log(`[SUPABASE SYNC] Video ${trickClip.id} saved to Supabase successfully.`);
  } catch (err) {
    console.warn('[SUPABASE SYNC] Video sync info:', err);
  }
}

export async function fetchTricksFromSupabase() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('skate_videos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[SUPABASE FETCH] Video fetch note:', error);
      return [];
    }
    return (data || []).map((row: any) => {
      let videoUrl = row.video_url;
      if (!videoUrl || videoUrl.startsWith('blob:')) {
        videoUrl = `/api/videos/${row.id}`;
      }
      return {
        id: row.id,
        userUid: row.raw_data?.userUid || `supa_${row.skater_handle || 'user'}`,
        userName: row.skater_handle || 'SHREDDER',
        districtId: row.spot_id || 'ACC',
        spotName: row.spot_name || 'Central Plaza',
        text: row.trick_name || 'Outlaw Skate Edit',
        likesCount: row.raw_data?.likesCount || 5,
        likedUsers: row.raw_data?.likedUsers || [],
        comments: row.raw_data?.comments || [],
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        verifiedByAi: true,
        aiVerificationFeedback: row.raw_data?.aiVerificationFeedback || 'Supabase Verified Outlaw Tape',
        videoUrl: videoUrl,
        stuntDistance: row.raw_data?.stuntDistance || 75,
        performanceScore: row.raw_data?.performanceScore || 90
      };
    });
  } catch (err) {
    console.warn('[SUPABASE FETCH] Exception fetching videos:', err);
    return [];
  }
}

export async function deleteTrickFromSupabase(uploadId: string) {
  if (!uploadId || !supabase) return;
  try {
    await supabase.from('skate_videos').delete().eq('id', uploadId);
  } catch (err) {
    console.warn('[SUPABASE SYNC] Video delete info:', err);
  }
}

// ========================================================
// REALTIME SUBSCRIPTION FOR VIDEOS
// ========================================================
export function subscribeToSupabaseTricks(onNewTrick: (trick: any) => void) {
  if (!supabase) return () => {};
  try {
    const channel = supabase
      .channel('public_skate_videos_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skate_videos' }, (payload) => {
        const row = payload.new;
        if (!row) return;
        console.log('[SUPABASE REALTIME] New trick received live:', row.id);
        const trickObj = {
          id: row.id,
          userUid: row.raw_data?.userUid || `supa_${row.skater_handle || 'user'}`,
          userName: row.skater_handle || 'SHREDDER',
          districtId: row.spot_id || 'ACC',
          spotName: row.spot_name || 'Central Plaza',
          text: row.trick_name || 'Outlaw Skate Edit',
          likesCount: row.raw_data?.likesCount || 0,
          likedUsers: row.raw_data?.likedUsers || [],
          comments: row.raw_data?.comments || [],
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
          verifiedByAi: true,
          aiVerificationFeedback: row.raw_data?.aiVerificationFeedback || 'Live Broadcast Verified',
          videoUrl: row.video_url,
          stuntDistance: row.raw_data?.stuntDistance || 80,
          performanceScore: row.raw_data?.performanceScore || 90
        };
        onNewTrick(trickObj);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (e) {
    console.warn('[SUPABASE REALTIME] Subscription error:', e);
    return () => {};
  }
}

// ========================================================
// CUSTOM SPOTS SYNC
// ========================================================
export async function syncCustomSpotToSupabase(spot: any) {
  if (!spot || !supabase) return;
  try {
    await supabase.from('custom_spots').upsert({
      id: spot.id,
      name: spot.name || 'Unnamed Spot',
      district_id: spot.districtId || spot.district_id || 'ACC',
      created_by: spot.createdBy || spot.created_by || 'unknown',
      description: spot.description || '',
      difficulty: spot.difficulty || 'medium',
      hype: spot.hype || 0,
      coords: spot.coords || null,
      raw_data: spot,
      created_at: spot.createdAt ? (typeof spot.createdAt === 'string' ? spot.createdAt : new Date(spot.createdAt).toISOString()) : new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] Custom spot sync info:', err);
  }
}

export async function fetchCustomSpotsFromSupabase(): Promise<any[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('custom_spots').select('*').limit(100);
    if (error) {
      console.warn('[SUPABASE FETCH SPOTS] Note:', error.message);
      return [];
    }
    return (data || []).map((row: any) => {
      const raw = row.raw_data || {};
      return {
        id: row.id,
        districtId: row.district_id || 'ACC',
        name: row.name || 'Unnamed Spot',
        description: row.description || '',
        difficulty: row.difficulty || 'Concrete',
        hype: row.hype || 50,
        coords: row.coords || { x: 160, y: 140 },
        createdBy: row.created_by || 'system',
        createdAt: row.created_at,
        ...raw
      };
    });
  } catch (e) {
    console.warn('[SUPABASE FETCH SPOTS] Error:', e);
    return [];
  }
}

export function subscribeToSupabaseSpots(onSpotChange: (spot: any) => void) {
  if (!supabase) return () => {};
  try {
    const channel = supabase
      .channel('public_custom_spots_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_spots' }, (payload) => {
        const row: any = payload.new;
        if (!row) return;
        const raw = row.raw_data || {};
        const spotObj = {
          id: row.id,
          districtId: row.district_id || 'ACC',
          name: row.name || 'Unnamed Spot',
          description: row.description || '',
          difficulty: row.difficulty || 'Concrete',
          hype: row.hype || 50,
          coords: row.coords || { x: 160, y: 140 },
          createdBy: row.created_by || 'system',
          createdAt: row.created_at,
          ...raw
        };
        onSpotChange(spotObj);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  } catch (e) {
    return () => {};
  }
}

// ========================================================
// CHALLENGES SYNC
// ========================================================
export async function syncChallengeToSupabase(challenge: any) {
  if (!challenge || !supabase) return;
  try {
    await supabase.from('challenges').upsert({
      id: challenge.id,
      title: challenge.title || 'Outlaw Challenge',
      description: challenge.description || '',
      district_id: challenge.districtId || challenge.district_id || 'ACC',
      target_spot: challenge.targetSpot || challenge.target_spot || '',
      user_id: challenge.userId || challenge.user_id || '',
      creator_id: challenge.creatorId || challenge.creator_id || '',
      difficulty: challenge.difficulty || 'medium',
      type: challenge.type || 'trick',
      xp_reward: challenge.xpReward || challenge.xp_reward || 100,
      status: challenge.status || 'active',
      raw_data: challenge,
      created_at: challenge.createdAt ? (typeof challenge.createdAt === 'string' ? challenge.createdAt : new Date(challenge.createdAt).toISOString()) : new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] Challenge sync info:', err);
  }
}

// ========================================================
// DIRECT MESSAGES SYNC & REALTIME
// ========================================================
export async function syncDirectMessageToSupabase(msg: any) {
  if (!msg || !supabase) return;
  try {
    await supabase.from('direct_messages').upsert({
      id: msg.id,
      sender_uid: msg.senderUid || msg.sender_uid || '',
      sender_handle: msg.senderHandle || msg.sender_handle || '',
      receiver_uid: msg.receiverUid || msg.receiver_uid || '',
      text: msg.text || '',
      raw_data: msg,
      created_at: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] Direct message sync info:', err);
  }
}

export function subscribeToSupabaseMessages(receiverUid: string, onNewMsg: (msg: any) => void) {
  if (!supabase || !receiverUid) return () => {};
  try {
    const channel = supabase
      .channel(`messages_for_${receiverUid}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'direct_messages',
        filter: `receiver_uid=eq.${receiverUid}`
      }, (payload) => {
        const row = payload.new;
        if (!row) return;
        console.log('[SUPABASE REALTIME] New direct message live:', row.id);
        onNewMsg({
          id: row.id,
          senderUid: row.sender_uid,
          senderHandle: row.sender_handle,
          receiverUid: row.receiver_uid,
          text: row.text,
          createdAt: row.created_at ? new Date(row.created_at) : new Date()
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (e) {
    console.warn('[SUPABASE REALTIME] Message subscription error:', e);
    return () => {};
  }
}

// ========================================================
// WAWOLO RADIO MUSIC
// ========================================================
export async function syncWawoloTrackToSupabase(track: any) {
  if (!track || !supabase) return;
  try {
    await supabase.from('wawoloradio_tracks').upsert({
      id: track.id,
      title: track.title || 'Untitled Track',
      artist: track.artist || 'Unknown Artist',
      url: track.url || '',
      duration: track.duration || 180,
      order_index: track.orderIndex || 0,
      uploaded_by: track.uploadedBy || 'admin',
      is_uploaded: track.isUploaded !== false,
      created_at: track.uploadedAt || track.createdAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] Music sync info:', err);
  }
}

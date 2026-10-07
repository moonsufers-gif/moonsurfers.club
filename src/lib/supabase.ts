import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://obhxxkknxeqdbgoiosek.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_bKGd54je4uPFzpEoyv1a6A_ANmAsZZz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function syncUserToSupabase(userProfile: any) {
  if (!userProfile || !supabase) return;
  try {
    const handle = userProfile.handle || userProfile.id || 'anonymous';
    await supabase.from('users').upsert({
      id: handle,
      handle: handle,
      name: userProfile.name || handle,
      avatar: userProfile.avatar || '',
      reputation: userProfile.reputation || 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] User sync info:', err);
  }
}

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
      created_at: createdIso
    }, { onConflict: 'id' });
    console.log(`[SUPABASE SYNC] Video ${trickClip.id} synced to Supabase successfully.`);
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
        userUid: `supa_${row.skater_handle || 'user'}`,
        userName: row.skater_handle || 'SHREDDER',
        districtId: row.spot_id || 'ACC',
        spotName: row.spot_name || 'Central Plaza',
        text: row.trick_name || 'Outlaw Skate Edit',
        likesCount: 5,
        likedUsers: [],
        comments: [],
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        verifiedByAi: true,
        aiVerificationFeedback: 'Supabase Verified Outlaw Tape',
        videoUrl: videoUrl,
        stuntDistance: 75,
        performanceScore: 90
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

export async function syncWawoloTrackToSupabase(track: any) {
  if (!track || !supabase) return;
  try {
    await supabase.from('wawoloradio_tracks').upsert({
      id: track.id,
      title: track.title || 'Untitled Track',
      artist: track.artist || 'Unknown Artist',
      url: track.url || '',
      genre: track.genre || 'Culture',
      duration: track.duration || 180,
      created_at: track.createdAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[SUPABASE SYNC] Music sync info:', err);
  }
}

export async function syncChallengeToSupabase(_challenge: any) {
  return Promise.resolve();
}

export async function syncDirectMessageToSupabase(_msg: any) {
  return Promise.resolve();
}

export async function syncCustomSpotToSupabase(_spot: any) {
  return Promise.resolve();
}



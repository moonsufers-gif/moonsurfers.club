import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, getDocs, collection } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = initializeFirestore(app, { experimentalForceLongPolling: true }, cfg.firestoreDatabaseId);

function escapeSql(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    // Check if timestamp
    if (val.seconds !== undefined) {
      return `'${new Date(val.seconds * 1000).toISOString()}'`;
    }
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function runExport() {
  console.log('[EXPORT] Starting complete data export from Firestore...');
  const collections = ['users', 'custom_spots', 'direct_messages', 'challenges', 'wawoloradio_tracks', 'skate_videos'];
  const fullBackup: Record<string, any[]> = {};

  for (const c of collections) {
    try {
      const snap = await getDocs(collection(db, c));
      fullBackup[c] = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      console.log(`[EXPORT] Fetched ${fullBackup[c].length} documents from '${c}'`);
    } catch (err: any) {
      console.warn(`[EXPORT] Failed to fetch collection ${c}:`, err.message);
      fullBackup[c] = [];
    }
  }

  // 1. Save JSON backup
  fs.writeFileSync('supabase_backup.json', JSON.stringify(fullBackup, null, 2), 'utf8');
  console.log('[EXPORT] Saved supabase_backup.json successfully.');

  // 2. Generate Supabase SQL schema and inserts
  let sql = `-- ========================================================
-- MOONSURFERS DATABASE MIGRATION SCRIPT FOR SUPABASE
-- Generated on: ${new Date().toISOString()}
-- ========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE
create table if not exists users (
  id text primary key,
  handle text unique,
  email text,
  name text,
  avatar text,
  reputation integer default 0,
  level integer default 1,
  daily_streak integer default 0,
  badges jsonb default '[]'::jsonb,
  active_location jsonb,
  friends jsonb default '[]'::jsonb,
  raw_data jsonb,
  updated_at timestamptz default now()
);

-- CUSTOM SPOTS TABLE
create table if not exists custom_spots (
  id text primary key,
  name text not null,
  district_id text,
  created_by text,
  description text,
  difficulty text default 'medium',
  hype integer default 0,
  coords jsonb,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- DIRECT MESSAGES TABLE
create table if not exists direct_messages (
  id text primary key,
  sender_uid text,
  sender_handle text,
  receiver_uid text,
  text text,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- CHALLENGES TABLE
create table if not exists challenges (
  id text primary key,
  title text not null,
  description text,
  district_id text,
  target_spot text,
  user_id text,
  creator_id text,
  difficulty text,
  type text,
  xp_reward integer default 100,
  status text default 'active',
  raw_data jsonb,
  created_at timestamptz default now()
);

-- WAWOLO RADIO TRACKS TABLE
create table if not exists wawoloradio_tracks (
  id text primary key,
  title text not null,
  artist text not null,
  url text,
  duration numeric,
  order_index integer,
  uploaded_by text,
  is_uploaded boolean default true,
  created_at timestamptz default now()
);

-- SKATE VIDEOS TABLE
create table if not exists skate_videos (
  id text primary key,
  spot_id text,
  spot_name text,
  skater_handle text,
  video_url text,
  trick_name text,
  raw_data jsonb,
  created_at timestamptz default now()
);

`;

  // Insert Users
  if (fullBackup.users.length > 0) {
    sql += `\n-- Insert Users (${fullBackup.users.length})\n`;
    for (const u of fullBackup.users) {
      const id = u.id || u._docId;
      const handle = u.handle || id;
      const email = u.email || null;
      const name = u.name || handle;
      const avatar = u.avatar || u.profilePicture || null;
      const rep = typeof u.reputation === 'number' ? u.reputation : 0;
      const level = typeof u.level === 'number' ? u.level : 1;
      const dailyStreak = typeof u.dailyStreak === 'number' ? u.dailyStreak : 0;
      const badges = JSON.stringify(u.badges || []);
      const loc = u.activeLocation ? JSON.stringify(u.activeLocation) : null;
      const friends = JSON.stringify(u.friends || []);
      const raw = JSON.stringify(u);

      sql += `INSERT INTO users (id, handle, email, name, avatar, reputation, level, daily_streak, badges, active_location, friends, raw_data) VALUES (${escapeSql(id)}, ${escapeSql(handle)}, ${escapeSql(email)}, ${escapeSql(name)}, ${escapeSql(avatar)}, ${rep}, ${level}, ${dailyStreak}, ${escapeSql(badges)}::jsonb, ${escapeSql(loc)}::jsonb, ${escapeSql(friends)}::jsonb, ${escapeSql(raw)}::jsonb) ON CONFLICT (id) DO UPDATE SET reputation = EXCLUDED.reputation, raw_data = EXCLUDED.raw_data;\n`;
    }
  }

  // Insert Custom Spots
  if (fullBackup.custom_spots.length > 0) {
    sql += `\n-- Insert Custom Spots (${fullBackup.custom_spots.length})\n`;
    for (const s of fullBackup.custom_spots) {
      const id = s.id || s._docId;
      const name = s.name || 'Unnamed Spot';
      const districtId = s.districtId || null;
      const createdBy = s.createdBy || null;
      const desc = s.description || null;
      const diff = s.difficulty || 'medium';
      const hype = typeof s.hype === 'number' ? s.hype : 0;
      const coords = s.coords ? JSON.stringify(s.coords) : null;
      const raw = JSON.stringify(s);

      sql += `INSERT INTO custom_spots (id, name, district_id, created_by, description, difficulty, hype, coords, raw_data) VALUES (${escapeSql(id)}, ${escapeSql(name)}, ${escapeSql(districtId)}, ${escapeSql(createdBy)}, ${escapeSql(desc)}, ${escapeSql(diff)}, ${hype}, ${escapeSql(coords)}::jsonb, ${escapeSql(raw)}::jsonb) ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  // Insert Direct Messages
  if (fullBackup.direct_messages.length > 0) {
    sql += `\n-- Insert Direct Messages (${fullBackup.direct_messages.length})\n`;
    for (const m of fullBackup.direct_messages) {
      const id = m.id || m._docId;
      const senderUid = m.senderUid || null;
      const senderHandle = m.senderHandle || null;
      const receiverUid = m.receiverUid || null;
      const text = m.text || '';
      const raw = JSON.stringify(m);

      sql += `INSERT INTO direct_messages (id, sender_uid, sender_handle, receiver_uid, text, raw_data) VALUES (${escapeSql(id)}, ${escapeSql(senderUid)}, ${escapeSql(senderHandle)}, ${escapeSql(receiverUid)}, ${escapeSql(text)}, ${escapeSql(raw)}::jsonb) ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  // Insert Challenges
  if (fullBackup.challenges.length > 0) {
    sql += `\n-- Insert Challenges (${fullBackup.challenges.length})\n`;
    for (const ch of fullBackup.challenges) {
      const id = ch.id || ch._docId;
      const title = ch.title || 'Challenge';
      const desc = ch.description || null;
      const districtId = ch.districtId || null;
      const targetSpot = ch.targetSpot || null;
      const userId = ch.userId || null;
      const creatorId = ch.creatorId || null;
      const diff = ch.difficulty || 'medium';
      const type = ch.type || 'trick';
      const xp = typeof ch.xpReward === 'number' ? ch.xpReward : 100;
      const status = ch.status || 'active';
      const raw = JSON.stringify(ch);

      sql += `INSERT INTO challenges (id, title, description, district_id, target_spot, user_id, creator_id, difficulty, type, xp_reward, status, raw_data) VALUES (${escapeSql(id)}, ${escapeSql(title)}, ${escapeSql(desc)}, ${escapeSql(districtId)}, ${escapeSql(targetSpot)}, ${escapeSql(userId)}, ${escapeSql(creatorId)}, ${escapeSql(diff)}, ${escapeSql(type)}, ${xp}, ${escapeSql(status)}, ${escapeSql(raw)}::jsonb) ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  // Insert Radio Tracks
  if (fullBackup.wawoloradio_tracks.length > 0) {
    sql += `\n-- Insert Radio Tracks (${fullBackup.wawoloradio_tracks.length})\n`;
    for (const t of fullBackup.wawoloradio_tracks) {
      const id = t.id || t._docId;
      const title = t.title || 'Untitled';
      const artist = t.artist || 'Unknown';
      const url = t.url || null;
      const dur = typeof t.duration === 'number' ? t.duration : 180;
      const orderIdx = typeof t.orderIndex === 'number' ? t.orderIndex : 0;
      const uploadedBy = t.uploadedBy || null;

      sql += `INSERT INTO wawoloradio_tracks (id, title, artist, url, duration, order_index, uploaded_by) VALUES (${escapeSql(id)}, ${escapeSql(title)}, ${escapeSql(artist)}, ${escapeSql(url)}, ${dur}, ${orderIdx}, ${escapeSql(uploadedBy)}) ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  fs.writeFileSync('supabase_seed.sql', sql, 'utf8');
  console.log('[EXPORT] Successfully generated supabase_seed.sql with all tables and data.');
  process.exit(0);
}

runExport().catch(err => {
  console.error('[EXPORT] Fatal error:', err);
  process.exit(1);
});

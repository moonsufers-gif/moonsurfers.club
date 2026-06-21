/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Plus, 
  MapPin, 
  Upload, 
  Flame, 
  Trophy, 
  Zap, 
  Play, 
  User, 
  RotateCcw, 
  Heart,
  X,
  Compass,
  CornerDownRight,
  Sparkles,
  Gamepad2,
  ChevronRight,
  Wifi,
  Calendar,
  LogOut,
  UserPlus,
  Shield,
  Award,
  Globe,
  Radio,
  Share2,
  Activity,
  Check,
  Search,
  Navigation,
  ZoomIn,
  ZoomOut,
  Move,
  Locate,
  Layers,
  ShieldAlert,
  Radar,
  MessageSquare,
  Camera,
  Trash2,
  Filter,
  Database,
  Sliders
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  getSkaterProfile,
  createInitialProfile,
  updateLocation,
  updateSkaterDetails,
  updateReputationAndLevel,
  updatePlayerStreak,
  addFriend,
  removeFriend,
  generateNewPersonalChallenge,
  completeChallenge,
  uploadTrickClip,
  toggleLikeTrickUpload,
  addCommentToTrickUpload,
  LiveTrickUpload,
  TrickComment,
  SkateProfile,
  DynamicChallenge,
  ActiveLocation,
  ChatMessage,
  sendDirectMessage,
  toggleTracingPermission,
  seedDefaultDataIfEmpty,
  handleFirestoreError,
  OperationType,
  addCustomSpot,
  deleteTrickClip,
  CustomSpot,
  runFullDatabaseMigration,
  MigrationStats
} from './lib/firebase';

import { PerformanceDashboard } from './components/PerformanceDashboard';
import { UndergroundChallenges } from './components/UndergroundChallenges';

import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';

import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  or
} from 'firebase/firestore';

import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'motion/react';

export interface SkateNotification {
  id: string;
  type: 'link' | 'mission' | 'level' | 'network' | 'system';
  title: string;
  message: string;
  timestamp: string;
  duration?: number;
  metadata?: {
    handle?: string;
    missionId?: string;
    [key: string]: any;
  };
}

// ==========================================
// COM-LINK BILLING FREEZE TOGGLE
// ==========================================
const COM_LINK_FROZEN = true;

// ==========================================
// IndexedDB Local Video Upload Cache (handles 100+ users beautifully)
// ==========================================
const openVideoDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MoonsurfersLocalVideos', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const storeLocalVideo = async (id: string, file: File): Promise<void> => {
  try {
    const db = await openVideoDatabase();
    const transaction = db.transaction('videos', 'readwrite');
    const store = transaction.objectStore('videos');
    store.put(file, id);
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("IndexedDB store error:", err);
  }
};

const getLocalVideoUrl = async (id: string): Promise<string | null> => {
  try {
    const db = await openVideoDatabase();
    const transaction = db.transaction('videos', 'readonly');
    const store = transaction.objectStore('videos');
    const request = store.get(id);
    return new Promise<string | null>((resolve) => {
      request.onsuccess = () => {
        const file = request.result as File | undefined;
        if (file) {
          resolve(URL.createObjectURL(file));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error("IndexedDB retrieve error:", err);
    return null;
  }
};

const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const uploadVideoToServer = async (id: string, file: File): Promise<string> => {
  try {
    const base64 = await convertFileToBase64(file);
    const mimeType = file.type || "video/mp4";
    const response = await fetch("/api/videos/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        base64,
        mimeType,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.error("Failed to upload video to server:", err);
  }
  return "";
};

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidGoogleMapsKey = Boolean(GOOGLE_MAPS_KEY) && GOOGLE_MAPS_KEY !== 'YOUR_API_KEY';

// ==========================================
// Web Audio Synth Helper
// ==========================================
class SoundSystem {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  setMute(mute: boolean) {
    this.muted = mute;
  }

  isMuted() {
    return this.muted;
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTick() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}
  }

  playSelect() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(330, this.ctx.currentTime);
      osc.frequency.setValueAtTime(660, this.ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (e) {}
  }

  playTrickSuccess() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(261.63, now); // C4
      osc.frequency.setValueAtTime(329.63, now + 0.06); // E4
      osc.frequency.setValueAtTime(392.00, now + 0.12); // G4
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.25); // C6
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  playCrash() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(25, now + 0.35);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  playRadarSweep() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(1500, now + 0.82);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.82);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.84);
    } catch (e) {}
  }

  playTelemetryChirp() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'triangle';
      
      osc1.frequency.setValueAtTime(800, now);
      osc1.frequency.setValueAtTime(1200, now + 0.04);
      osc2.frequency.setValueAtTime(400, now);
      osc2.frequency.setValueAtTime(600, now + 0.04);
      
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } catch (e) {}
  }
}

const sounds = new SoundSystem();

// ==========================================
// District Config Data
// ==========================================
interface District {
  id: string;
  name: string;
  code: string;
  timezone: string;
  coordinates: string;
  mission: string;
  missionSteps: string[];
  missionTotal: number;
  skatersLive: number;
  noiseLevel: string;
  spots: {
    id?: string;
    name: string;
    description: string;
    difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel';
    hype: number;
    coords: { x: number; y: number };
  }[];
  riders: { name: string; score: number; rank: number }[];
}

const DISTRICT_GPS: Record<string, { lat: number; lon: number }> = {
  ACC: { lat: 5.5501, lon: -0.1963 },   // Accra, Ghana
  LOS: { lat: 6.5244, lon: 3.3792 },    // Lagos, Nigeria
  KLA: { lat: 0.3476, lon: 32.5825 },   // Kampala, Uganda
  CPT: { lat: -33.9249, lon: 18.4241 }, // Cape Town, South Africa
  BKL: { lat: 40.7128, lon: -73.9352 },  // Brooklyn, USA
  LAX: { lat: 34.0522, lon: -118.2437 }, // Los Angeles, USA
  TYO: { lat: 35.6762, lon: 139.6503 },  // Tokyo, Japan
  BER: { lat: 52.5200, lon: 13.4050 },   // Berlin, Germany
  LON: { lat: 51.5074, lon: -0.1278 },   // London, UK
  RIO: { lat: -22.9068, lon: -43.1729 }, // Rio de Janeiro, Brazil
  SYD: { lat: -33.8688, lon: 151.2093 }  // Sydney, Australia
};

const DISTRICTS: Record<string, District> = {
  ACC: {
    id: 'ACC',
    name: 'Accra',
    code: 'ACC',
    timezone: 'Africa/Accra',
    coordinates: '5.5501° N, 0.1963° W',
    mission: 'Land 3 Kickflips at the Osu Castle Wall before 4AM.',
    missionSteps: ['Slay 3x Castle Stairs', 'Vibe at Liberation Gate', 'Manual across the ledge'],
    missionTotal: 3,
    skatersLive: 342,
    noiseLevel: 'CRITICAL',
    spots: [
      { name: 'Osu Castle Wall', description: 'Cracked ocean-side barrier with excellent ledge runs and a brutal landing zone.', difficulty: 'Core', hype: 89, coords: { x: 180, y: 140 } },
      { name: 'Independence Square', description: 'Vast concrete monument offering infinite space and massive 3-stair drops.', difficulty: 'Concrete', hype: 95, coords: { x: 120, y: 210 } },
      { name: 'Black Star Gate Ledger', description: 'Polished granite steps with security guards on high alert after midnight.', difficulty: 'Ledge', hype: 72, coords: { x: 310, y: 180 } },
      { name: 'Jamestown Fishing Piers', description: 'Rusty corrugated metal ramps on wooden harbor decks. High stake slip hazards.', difficulty: 'Vandal', hype: 84, coords: { x: 220, y: 90 } },
      { name: 'Accra Mall Car Park', description: 'Shred the multi-level tarmac and concrete curbs. High-speed runs with intense security cruiser patrol risk after 10PM.', difficulty: 'Steel', hype: 92, coords: { x: 250, y: 150 } },
      { name: 'Airport Residential Slopes', description: 'Buttery smooth asphalt hill descent in a wealthy, silent enclave. High patrol danger from private security task forces.', difficulty: 'Ledge', hype: 65, coords: { x: 140, y: 80 } },
      { name: 'Kaneshie Market Rooftops', description: 'Skate dangerous interconnected tin roofs and high-voltage conduit tubes. Extreme height drop hazard and vigilante watch.', difficulty: 'Steel', hype: 88, coords: { x: 80, y: 160 } },
      { name: 'Liberation Road Overpass', description: 'Steep highway concrete barriers leading into a heavy metal handrail over active traffic. Military checkpoints in area.', difficulty: 'Core', hype: 78, coords: { x: 200, y: 220 } },
      { name: 'Makola Market Rails', description: 'A massive nocturnal playground of street vendor kiosks and chain metal boundary barricades. Low baseline patrol, tight gaps.', difficulty: 'Vandal', hype: 45, coords: { x: 160, y: 180 } }
    ],
    riders: [
      { name: 'Night-Crawler', score: 12400, rank: 1 },
      { name: 'Dune_Phantom', score: 11950, rank: 2 },
      { name: 'Osu_Shadow', score: 10200, rank: 3 },
      { name: 'GoldSkater_GH', score: 9120, rank: 4 },
      { name: 'Asantewaa_Skate', score: 8550, rank: 5 }
    ]
  },
  LOS: {
    id: 'LOS',
    name: 'Lagos',
    code: 'LOS',
    timezone: 'Africa/Lagos',
    coordinates: '6.5244° N, 3.3792° E',
    mission: 'Perform 4 Pop Shuvits across Tafawa Balewa Square lanes.',
    missionSteps: ['Tafawa Square manual pad', 'National Theatre massive hubba', 'Bar Beach asphalt powerslide'],
    missionTotal: 4,
    skatersLive: 512,
    noiseLevel: 'ELEVATED',
    spots: [
      { name: 'Tafawa Balewa Square', description: 'Massive ceremonial concrete plaza providing infinite line combinations.', difficulty: 'Concrete', hype: 91, coords: { x: 190, y: 150 } },
      { name: 'National Theatre Ramp', description: 'Steep brick inclines and high-level steps surrounding the historic structure.', difficulty: 'Core', hype: 83, coords: { x: 110, y: 190 } },
      { name: 'Lekki Conservation Walkway', description: 'Polished wooden plank paths with steel railings. Keep it fast and light.', difficulty: 'Steel', hype: 76, coords: { x: 290, y: 110 } },
      { name: 'Bar Beach Asphalt Run', description: 'Rough coastal highway path littered with driftwood launchers.', difficulty: 'Vandal', hype: 88, coords: { x: 230, y: 220 } }
    ],
    riders: [
      { name: 'Gidi_Cruise', score: 13200, rank: 1 },
      { name: 'Eko_Glider', score: 11900, rank: 2 },
      { name: 'Shango_Shred', score: 10450, rank: 3 },
      { name: 'Naija_Ollie', score: 9500, rank: 4 }
    ]
  },
  KLA: {
    id: 'KLA',
    name: 'Kampala',
    code: 'KLA',
    timezone: 'Africa/Kampala',
    coordinates: '0.3476° N, 32.5825° E',
    mission: 'Land 3 pristine Kickflips down Lugogo Mall Stairs.',
    missionSteps: ['Lugogo Mall Stair Ollie', 'Independence Monument manual', 'Wandegeya flat bar sliding'],
    missionTotal: 3,
    skatersLive: 289,
    noiseLevel: 'MEDIUM',
    spots: [
      { name: 'Lugogo Mall Stairs', description: 'Polished granite three-pack stairway. Security guards are prompt but friendly.', difficulty: 'Ledge', hype: 84, coords: { x: 160, y: 130 } },
      { name: 'Independence Monument Basin', description: 'Spacious stone amphitheater layout with small curbs and manual pads.', difficulty: 'Concrete', hype: 89, coords: { x: 240, y: 170 } },
      { name: 'Nakasero Downhill Run', description: 'Steep winding residential asphalt with high speeds and occasional traffic.', difficulty: 'Core', hype: 94, coords: { x: 310, y: 220 } },
      { name: 'Wandegeya Grindrails', description: 'Heavy yellow metal barriers along the commercial walk. Highly public.', difficulty: 'Steel', hype: 71, coords: { x: 100, y: 80 } }
    ],
    riders: [
      { name: 'Matooke_Steeze', score: 10800, rank: 1 },
      { name: 'Kla_Streets', score: 9900, rank: 2 },
      { name: 'Rwenzori_Rider', score: 8700, rank: 3 },
      { name: 'Boda_Slider', score: 7600, rank: 4 }
    ]
  },
  CPT: {
    id: 'CPT',
    name: 'Cape Town',
    code: 'CPT',
    timezone: 'Africa/Johannesburg',
    coordinates: '33.9249° S, 18.4241° E',
    mission: 'Session the Civic Centre ledges and Mill Street rails before sunrise.',
    missionSteps: ['Mill Street bowl air', 'Sea Point manual run', 'Civic Centre double-set grind'],
    missionTotal: 3,
    skatersLive: 405,
    noiseLevel: 'LIVELY',
    spots: [
      { name: 'Mill Street Skate Park', description: 'Under freeway pass concrete bowls and street section. Shelter from South-Easter wind.', difficulty: 'Concrete', hype: 92, coords: { x: 200, y: 150 } },
      { name: 'Sea Point Promenade', description: 'Infinite flat paved pathways alongside ocean breakers. Perfect for midnight manuals.', difficulty: 'Concrete', hype: 86, coords: { x: 110, y: 100 } },
      { name: 'Civic Centre Ledge', description: 'Sleek, waxed black marble structures that glide effortlessly.', difficulty: 'Ledge', hype: 80, coords: { x: 290, y: 210 } },
      { name: 'St George\'s Mall Rail', description: 'Long handrail on cobblestone walkway. High foot traffic during the day.', difficulty: 'Steel', hype: 85, coords: { x: 240, y: 70 } }
    ],
    riders: [
      { name: 'Table_Mountain_Ollie', score: 12200, rank: 1 },
      { name: 'Kaapse_Steeze', score: 11500, rank: 2 },
      { name: 'Cape_Slider', score: 10400, rank: 3 }
    ]
  },
  BKL: {
    id: 'BKL',
    name: 'Brooklyn',
    code: 'BKL',
    timezone: 'America/New_York',
    coordinates: '40.7128° N, 73.9352° W',
    mission: 'Nosegrind the Williamsburg Monument under active police evasion.',
    missionSteps: ['Nosegrind Williamsburg Rail', 'Outrun precinct cruiser', 'Jump 5-stair loading dock'],
    missionTotal: 4,
    skatersLive: 812,
    noiseLevel: 'HIGH HYPE',
    spots: [
      { name: 'Williamsburg Monument', description: 'Historic war stone with high rails and steep double-layer staircases.', difficulty: 'Steel', hype: 92, coords: { x: 140, y: 120 } },
      { name: 'Fat Kid Spot Ledger', description: 'Unforgiving concrete planters and gravel pits behind industrial warehouses.', difficulty: 'Concrete', hype: 78, coords: { x: 260, y: 80 } },
      { name: 'Chelsea Pier 62 Basin', description: 'Sweeping deep bowls and modular transfers overlooking the foggy bay water.', difficulty: 'Concrete', hype: 88, coords: { x: 210, y: 220 } },
      { name: 'Sartre Loading Hub', description: 'Metal-edged warehouse platform perfect for high-speed manuals and gaps.', difficulty: 'Ledge', hype: 65, coords: { x: 340, y: 150 } }
    ],
    riders: [
      { name: 'BK_Ghost', score: 14200, rank: 1 },
      { name: 'Steeze_God', score: 13150, rank: 2 },
      { name: 'Vandal_Brooklyn', score: 12480, rank: 3 },
      { name: 'RailSlidr96', score: 11020, rank: 4 },
      { name: 'Zine_Maker_NY', score: 10450, rank: 5 }
    ]
  },
  LAX: {
    id: 'LAX',
    name: 'Los Angeles',
    code: 'LAX',
    timezone: 'America/Los_Angeles',
    coordinates: '34.0522° N, 118.2437° W',
    mission: 'Nail a massive trick off Hollywood High Stairs and skate Venice beach.',
    missionSteps: ['Venice beach bowl air', 'West LA Courthouse ledge grind', 'Hollywood High 12-stair gap'],
    missionTotal: 3,
    skatersLive: 1950,
    noiseLevel: 'CRITICAL',
    spots: [
      { name: 'Venice Beach Bowls', description: 'The legendary waterfront concrete park with infinite transition lines.', difficulty: 'Concrete', hype: 98, coords: { x: 120, y: 180 } },
      { name: 'West LA Courthouse', description: 'Famous legal plaza manual pad and iconic stage ledge.', difficulty: 'Ledge', hype: 94, coords: { x: 230, y: 110 } },
      { name: 'Hollywood High Stairs', description: 'Devastating 12 and 16-stair handrails. Test of absolute courage and grit.', difficulty: 'Steel', hype: 96, coords: { x: 310, y: 150 } },
      { name: 'STAPLES Center Ledges', description: 'Waxed concrete barriers and benches near the sports arena hub.', difficulty: 'Ledge', hype: 82, coords: { x: 200, y: 220 } }
    ],
    riders: [
      { name: 'Sunset_Shredder', score: 20400, rank: 1 },
      { name: 'LA_Steeze_King', score: 18900, rank: 2 },
      { name: 'Venice_Local', score: 17500, rank: 3 }
    ]
  },
  TYO: {
    id: 'TYO',
    name: 'Tokyo',
    code: 'TYO',
    timezone: 'Asia/Tokyo',
    coordinates: '35.6762° N, 139.6503° E',
    mission: 'Combo 3 precise grinds across Shibuya Lanes without falling.',
    missionSteps: ['Chain 3 Shibuya rail grinds', 'Speed manual neon crosswalk', 'Double-spin Akiba gap'],
    missionTotal: 5,
    skatersLive: 1422,
    noiseLevel: 'SERENE WAVE',
    spots: [
      { name: 'Miyashita Park Ledgway', description: 'Brand new, ultra-smooth pristine marble rails surrounded by skyscrapers.', difficulty: 'Ledge', hype: 97, coords: { x: 230, y: 110 } },
      { name: 'Shibuya Neon Crossing Gateway', description: 'Insane traffic and dynamic billboards. Pure adrenaline ride.', difficulty: 'Core', hype: 99, coords: { x: 130, y: 160 } },
      { name: 'Akiba Neon Alley Bench', description: 'Subway egress vents wrapped in steel frames. Heavy electrical noise.', difficulty: 'Steel', hype: 80, coords: { x: 320, y: 100 } },
      { name: 'Chuo Line Rail Pit', description: 'Concrete storm canal underneath train tracks. Dirt floor and sharp corners.', difficulty: 'Vandal', hype: 74, coords: { x: 190, y: 240 } }
    ],
    riders: [
      { name: 'Neon_Samurai', score: 18100, rank: 1 },
      { name: 'Shibuya_Flow', score: 16800, rank: 2 },
      { name: 'Zero_Drift_JP', score: 15400, rank: 3 },
      { name: 'Giga_Noodle', score: 13080, rank: 4 },
      { name: 'Yuki_Shreds', score: 12900, rank: 5 }
    ]
  },
  BER: {
    id: 'BER',
    name: 'Berlin',
    code: 'BER',
    timezone: 'Europe/Berlin',
    coordinates: '52.5200° N, 13.4050° E',
    mission: 'Wallride the coarse concrete slabs at Mauerpark in rain.',
    missionSteps: ['Wet asphalt Wallride', 'Launch Tempelhof runway rail', 'Slide down Warschauer benches'],
    missionTotal: 3,
    skatersLive: 624,
    noiseLevel: 'LO-FI RUST',
    spots: [
      { name: 'Tempelhof Runway Rail', description: 'Infinite asphalt pathways with disused baggage carts and industrial staircases.', difficulty: 'Steel', hype: 90, coords: { x: 280, y: 130 } },
      { name: 'Warschauer Strasse Rails', description: 'Historic high-drop metal rails at the subway station entryway. Always dirty.', difficulty: 'Core', hype: 86, coords: { x: 150, y: 180 } },
      { name: 'Mauerpark Concrete Wall', description: 'Heavily graffitied historical blocks and steep concrete banks.', difficulty: 'Vandal', hype: 93, coords: { x: 200, y: 80 } },
      { name: 'Kotti Dark Subway Basin', description: 'Damp tunnels, broken bottlenecks, and short concrete pillars inside transit hubs.', difficulty: 'Concrete', hype: 71, coords: { x: 310, y: 220 } }
    ],
    riders: [
      { name: 'Kotti_Ghost', score: 15200, rank: 1 },
      { name: 'Techno_Stance', score: 14850, rank: 2 },
      { name: 'Kruz_Berlin', score: 12920, rank: 3 },
      { name: 'PlattenbautenSkate', score: 11050, rank: 4 },
      { name: 'U_Bahn_Fighter', score: 10400, rank: 5 }
    ]
  },
  LON: {
    id: 'LON',
    name: 'London',
    code: 'LON',
    timezone: 'Europe/London',
    coordinates: '51.5074° N, 0.1278° W',
    mission: 'Combo 3 grinds at Southbank Undercroft during drizzle.',
    missionSteps: ['Southbank pillars gap', 'Shell Ledges manual', 'Tate Modern 4-stair double-flip'],
    missionTotal: 3,
    skatersLive: 1100,
    noiseLevel: 'HIGH',
    spots: [
      { name: 'Southbank Undercroft', description: 'The historic, graffiti-laden birthplace of British skateboarding.', difficulty: 'Concrete', hype: 97, coords: { x: 150, y: 130 } },
      { name: 'Shell Ledges', description: 'Perfect height stone blocks that slide beautifully. Expect heavy security.', difficulty: 'Ledge', hype: 88, coords: { x: 260, y: 100 } },
      { name: 'Tate Modern Stairs', description: 'Massive open plaza stairs with pristine landing. Watch out for tourists.', difficulty: 'Core', hype: 85, coords: { x: 220, y: 210 } },
      { name: 'White Grounds Skatepark', description: 'Cozy indoor under-arch concrete ramps. Escape the constant rain.', difficulty: 'Concrete', hype: 80, coords: { x: 340, y: 170 } }
    ],
    riders: [
      { name: 'Thames_Slider', score: 16400, rank: 1 },
      { name: 'Foggy_Ollie', score: 14900, rank: 2 },
      { name: 'Southbank_Local', score: 13800, rank: 3 }
    ]
  },
  RIO: {
    id: 'RIO',
    name: 'Rio de Janeiro',
    code: 'RIO',
    timezone: 'America/Sao_Paulo',
    coordinates: '22.9068° S, 43.1729° W',
    mission: 'Pop a high kickflip over Arpoador Rock rails next to the ocean waves.',
    missionSteps: ['Arpoador sunset gap', 'Copacabana Wave handrail grind', 'Praça XV manual combo'],
    missionTotal: 3,
    skatersLive: 750,
    noiseLevel: 'LIVELY WAVE',
    spots: [
      { name: 'Praça XV Plaza', description: 'Vast square with pristine granite ledge structures and endless stairs.', difficulty: 'Ledge', hype: 94, coords: { x: 210, y: 160 } },
      { name: 'Arpoador Sunset Gap', description: 'Slick concrete lanes overlooking the beautiful waves of Ipanema.', difficulty: 'Core', hype: 91, coords: { x: 130, y: 100 } },
      { name: 'Copacabana Wave Rails', description: 'Sinuous metal rails tracing the mosaic pavements. Extreme speed run.', difficulty: 'Steel', hype: 86, coords: { x: 280, y: 210 } },
      { name: 'Aterro do Flamengo Bowls', description: 'Deep smooth concrete bowls set within a lush tropical park.', difficulty: 'Concrete', hype: 89, coords: { x: 320, y: 120 } }
    ],
    riders: [
      { name: 'Carioca_Flow', score: 15400, rank: 1 },
      { name: 'Samba_Skater', score: 14200, rank: 2 },
      { name: 'Favela_Flight', score: 12900, rank: 3 }
    ]
  },
  SYD: {
    id: 'SYD',
    name: 'Sydney',
    code: 'SYD',
    timezone: 'Australia/Sydney',
    coordinates: '33.8688° S, 151.2093° E',
    mission: 'Slide Martin Place Ledges and manual down Circular Quay Wharf.',
    missionSteps: ['Waterloo pipe transfer', 'Martin Place ledge slides', 'Circular Quay ocean-breeze gap'],
    missionTotal: 3,
    skatersLive: 890,
    noiseLevel: 'ELEVATED STATUS',
    spots: [
      { name: 'Martin Place Ledges', description: 'Polished granite steps and marble benches in the heart of the business district.', difficulty: 'Ledge', hype: 93, coords: { x: 195, y: 140 } },
      { name: 'Waterloo Skate Park', description: 'Australia\'s premier skate square with a massive mini-ramp and obstacles.', difficulty: 'Concrete', hype: 91, coords: { x: 115, y: 190 } },
      { name: 'Circular Quay Wharf Gap', description: 'Concrete dock gaps near ferry terminals. Watch the drop into harbor!', difficulty: 'Core', hype: 87, coords: { x: 285, y: 100 } },
      { name: 'Monster Skatepark Ramp', description: 'Huge vert ramps and rails in the Olympic precinct.', difficulty: 'Steel', hype: 84, coords: { x: 245, y: 220 } }
    ],
    riders: [
      { name: 'Oz_Rail_King', score: 14900, rank: 1 },
      { name: 'Harbour_Steeze', score: 13600, rank: 2 },
      { name: 'Bondi_Bowler', score: 12800, rank: 3 }
    ]
  }
};

interface DistrictVectorLayout {
  streets: string[];
  coast?: string;
  hubs?: Array<{ x: number; y: number; label: string }>;
}

function getDistrictVectorLayout(districtId: string): DistrictVectorLayout {
  switch (districtId) {
    case 'ACC':
      return {
        streets: [
          "M 20 40 L 380 40",
          "M 50 120 L 350 120",
          "M 80 200 L 320 200",
          "M 100 30 L 100 240",
          "M 200 20 L 200 250",
          "M 300 30 L 300 240",
          "M 50 80 L 150 180",
          "M 350 80 L 250 180"
        ],
        coast: "M 0 255 Q 200 285 400 250 L 400 300 L 0 300 Z",
        hubs: [
          { x: 180, y: 140, label: "OSU CENTRUM" },
          { x: 310, y: 180, label: "BLACK STAR INT" },
          { x: 120, y: 210, label: "IND PLAZA" }
        ]
      };
    case 'LOS':
      return {
        streets: [
          "M 10 130 L 390 130",
          "M 10 145 L 390 145",
          "M 120 40 L 120 250",
          "M 280 40 L 280 250",
          "M 200 10 L 200 280",
          "M 60 70 Q 180 150 340 60"
        ],
        coast: "M 0 100 Q 100 140 200 80 T 400 110",
        hubs: [
          { x: 190, y: 150, label: "TBS SECTOR" },
          { x: 290, y: 110, label: "LEKKI HUB" }
        ]
      };
    case 'CPT':
      return {
        streets: [
          "M 40,30 Q 100,160 170,260",
          "M 250,20 L 250,280",
          "M 50,90 L 350,90",
          "M 50,180 L 350,180",
          "M 140,50 Q 200,130 140,240"
        ],
        coast: "M 320,0 Q 360,110 310,210 T 360,300",
        hubs: [
          { x: 200, y: 150, label: "CITY BOWL" },
          { x: 110, y: 100, label: "SEA POINT" }
        ]
      };
    case 'LDN':
      return {
        streets: [
          "M 40,60 L 40,240",
          "M 140,60 L 140,240",
          "M 240,60 L 240,240",
          "M 340,60 L 340,240",
          "M 20,90 L 380,90",
          "M 20,210 L 380,210"
        ],
        coast: "M 0,140 Q 100,105 200,150 T 400,135",
        hubs: [
          { x: 150, y: 130, label: "SOUTHBANK" },
          { x: 260, y: 100, label: "SHELL HUB" }
        ]
      };
    case 'NYC':
      return {
        streets: [
          "M 20,10 L 140,290",
          "M 50,0 L 50,300",
          "M 100,0 L 100,300",
          "M 150,0 L 150,300",
          "M 200,0 L 200,300",
          "M 250,0 L 250,300",
          "M 300,0 L 300,300",
          "M 0,40 L 400,40",
          "M 0,90 L 400,90",
          "M 0,140 L 400,140",
          "M 0,195 L 400,195",
          "M 0,250 L 400,250"
        ],
        coast: "M 320 0 L 380 300 M 50 0 L 10 300",
        hubs: [
          { x: 140, y: 120, label: "W-BURG CORE" },
          { x: 210, y: 220, label: "CHELSEA BASIN" }
        ]
      };
    default: {
      const getStringSeed = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
      };

      const seed = getStringSeed(districtId);
      const streets: string[] = [];
      const numVerticalGrid = 5 + (seed % 4); 
      const numHorizontalGrid = 4 + ((seed >> 2) % 4); 

      for (let i = 0; i < numVerticalGrid; i++) {
        const x = Math.round(40 + (i * (320 / (numVerticalGrid - 1 || 1))));
        const skew = ((seed >> i) & 1) ? 15 : -15;
        streets.push(`M ${x},20 L ${x + skew},280`);
      }

      for (let i = 0; i < numHorizontalGrid; i++) {
        const y = Math.round(40 + (i * (220 / (numHorizontalGrid - 1 || 1))));
        const skew = ((seed >> (i + 5)) & 1) ? 15 : -15;
        streets.push(`M 20,${y} L 380,${y + skew}`);
      }

      const centerX = Math.round(150 + (seed % 100));
      const centerY = Math.round(120 + ((seed >> 4) % 60));
      const radius = Math.round(50 + (seed % 30));
      streets.push(`M ${centerX - radius},${centerY} A ${radius},${radius} 0 1,1 ${centerX - radius},${centerY + 0.1}`);

      const coastChoice = seed % 3;
      let coast = "";
      if (coastChoice === 0) {
        coast = `M 0,${30 + (seed % 30)} Q ${50 + (seed % 50)},150 0,${270 - (seed % 30)}`;
      } else if (coastChoice === 1) {
        coast = `M ${20 + (seed % 30)},300 Q 200,${210 + (seed % 40)} ${380 - (seed % 30)},300`;
      } else {
        coast = `M 0,${80 + (seed % 45)} C 150,${45 + (seed % 55)} 250,${180 + (seed % 55)} 400,${170 + (seed % 45)}`;
      }

      const hubs = [
        {
          x: centerX,
          y: centerY,
          label: `${districtId} CENTER`
        },
        {
          x: Math.round(60 + ((seed >> 2) % 150)),
          y: Math.round(70 + ((seed >> 5) % 120)),
          label: `${districtId} RADAR`
        }
      ];

      return { streets, coast, hubs };
    }
  }
}

const SKATE_TUTORIALS = [
  {
    name: "Ollie",
    difficulty: "EASY",
    level: 1,
    discipline: "FLATGROUND",
    repReward: 15,
    description: "The absolute baseline of modern street skating. Compress your knees, snap the tail down sharply, and simultaneously slide your front foot up the grip tape to lift and level out the board.",
    footPlacement: "Front foot slightly below front bolts (angled 5°), Back foot on the tail pocket.",
    physicsTip: "The pop must be a snappy downward slap. The board won't lift if your back foot stays on the ground after popping.",
    steps: [
      "Compress low: Center your weight and prepare a spring motion.",
      "Pop! Slap the tail down hard while jumping up.",
      "Slide: Drag the side of your front shoe up towards the nose to guide the board higher.",
      "Level & Land: Push both feet forward, level the deck in mid-air, and land squarely over the bolts."
    ]
  },
  {
    name: "Kickflip",
    difficulty: "MEDIUM",
    level: 2,
    discipline: "FLIP TRICK",
    repReward: 25,
    description: "A gorgeous classic. Perform an Ollie, but instead of sliding your front foot straight up, flick it off the concave edge of the nose so the board rolls underneath your feet.",
    footPlacement: "Front foot angled 45° across the deck, toes tucked. Back foot centered on the tail.",
    physicsTip: "Flick through the board's corner concave, not straight down! Flicking down ruins the landing height and blocks catch.",
    steps: [
      "Setup: Crouch with front toes pointing slightly off-center.",
      "Pop & Drag: Snap the tail and drag your front foot obliquely towards the nose concave.",
      "Flick Out: Kick your front foot out and off the corner. Suck up your knees to let the deck spin.",
      "Catch & Land: Track the rotating grip tape with your back foot, catch it at peak height, and ride clean."
    ]
  },
  {
    name: "Heelflip",
    difficulty: "MEDIUM",
    level: 2,
    discipline: "FLIP TRICK",
    repReward: 25,
    description: "The mirror rotation of a kickflip. Pop an Ollie, but slide your front foot forward and slightly away from you, flicking with your heel to roll the board outward.",
    footPlacement: "Front toes hanging slightly off the front edge of the deck. Back foot square on middle tail.",
    physicsTip: "Slide off the outer concave utilizing the physical leverage of your heel. Push your hips back slightly to stay centered.",
    steps: [
      "Setup: Overhang your front toes about 1 inch to shift pivot focus to the heel.",
      "Pop & Guide: Pop the tail and slide your leg out diagonally.",
      "Heel Kick: Flick the corner of the nose outwards with your heel, driving the board into a reverse rotation.",
      "Catch: Wait for the full rotation, catch with your boots over the bolts, and bend knees to absorb landing."
    ]
  },
  {
    name: "Pop Shuvit",
    difficulty: "EASY",
    level: 1,
    discipline: "SPIN TRICK",
    repReward: 15,
    description: "Rotate the skateboard 180 degrees horizontally beneath you. This does not involve a flip, making it highly dependent on a swift scoop motion of the rear foot.",
    footPlacement: "Front foot flat on the center of the board. Back foot toes curved off the tail edge.",
    physicsTip: "Do not pop straight down; scoop the tail backward behind your heels like you are sweeping dust.",
    steps: [
      "Setup: Flat front foot for balance, back foot prepared to scoop behind you.",
      "The scoop: Jump up and sweep your rear leg backwards, spinning the board 180 degrees.",
      "Hover: Keep your front foot hovered over the spinning deck to guide its spin.",
      "Catch & Stomp: Catch with the front foot first, join with the back leg, and land."
    ]
  },
  {
    name: "Frontside 180",
    difficulty: "EASY",
    level: 1,
    discipline: "SPIN TRICK",
    repReward: 15,
    description: "Perform an Ollie while simultaneously rotating your entire body and board 180 degrees frontside (facing forward during the spin), landing rollaway switch.",
    footPlacement: "Front foot angled slightly like an Ollie. Back foot on tail pocket ready to rotate.",
    physicsTip: "The rotation begins in the shoulders! Wind up your shoulders in the opposite direction before the snap.",
    steps: [
      "Prewind: Swing your shoulders back slightly to store rotational elastic energy.",
      "Pop & Swing: Snap the tail and aggressively swing your lead arm and shoulders forward.",
      "Pivot guide: Keep the board attached to your feet while your hips catch up with the shoulder spin.",
      "Stomp Roll: Land, compress weight to ride away backward (switch)."
    ]
  },
  {
    name: "360 Flip (Tre Flip)",
    difficulty: "EXPERT",
    level: 4,
    discipline: "FLIP TRICK",
    repReward: 50,
    description: "The ultimate street skateboarding benchmark. A breathtaking combination of a 360 Pop Shuvit and a Kickflip. Driven entirely by a massive scoop of the back toes.",
    footPlacement: "Front foot angled behind front bolts. Back foot toes resting deep in the tail hook.",
    physicsTip: "It's 90% in the scoop! Scoop backwards and inwards with your rear ankle while your front foot gives a feather-light flick.",
    steps: [
      "Setup: Place back foot toes securely in the tail hook. Front foot in a kickflip stance.",
      "Scoop & Pop: Spring off the ground while driving your back ankle back in a huge sweeping arc.",
      "Flick off pocket: Deliver a gentle diagonal flick as the board sweeps around.",
      "Catch: Float over the trick, catch the grip tape with your front foot first, and compress."
    ]
  },
  {
    name: "Boardslide",
    difficulty: "HARD",
    level: 3,
    discipline: "RAIL GRIND",
    repReward: 35,
    description: "Approach a rail or ledge, Ollie up, execute a frontside 90-degree turn, and slide the center of your deck across the obstacle before pivoting clean off.",
    footPlacement: "Ollie foot stance. Center weight over the board to prevent slip-outs.",
    physicsTip: "Keep your chest centered directly over the rail! Leaning back will cause the board to slip out in front of you, risking a smash.",
    steps: [
      "Approach: Ride parallel or slightly angled toward the rail at comfortable speed.",
      "Ollie up: Snap higher than the rail height and spot the metal surface.",
      "Lock down: Land the middle deck flat over the rail, knees bent for low gravity slide.",
      "Turn-out: Turn your hips 90 degrees as you slide off the rail tip to roll away clean."
    ]
  }
];

// ==========================================
// Autoplay Video Component using IntersectionObserver
// ==========================================
interface AutoplayVideoProps {
  src: string;
}

const AutoplayVideo: React.FC<AutoplayVideoProps> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoElement.play().catch((err) => {
              // Ignore typical autoplay blocking/user gesture errors
              console.log("Autoplay was blocked or interrupted:", err);
            });
          } else {
            videoElement.pause();
          }
        });
      },
      {
        threshold: 0.15, // Play when at least 15% of video is inside viewport
      }
    );

    observer.observe(videoElement);

    return () => {
      observer.unobserve(videoElement);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      muted
      loop
      referrerPolicy="no-referrer"
      className="w-full max-h-[145px] object-cover"
    />
  );
};

export default function App() {
  // ==========================================
  // Authentication & Profile States
  // ==========================================
  const [currentUser, setCurrentUser] = useState<any>(null);

  const getSkaterCoords = (skaterProfile: SkateProfile) => {
    const actualCoords = skaterProfile.activeLocation?.coords;
    if (!actualCoords) return null;
    
    // Exact location allowed if tracing permission granted, or if it is our own profile
    const hasPermission = skaterProfile.tracingAllowedUsers?.includes(currentUser?.uid || '') || skaterProfile.id === currentUser?.uid;
    if (hasPermission) {
      return actualCoords;
    }
    
    // Scramble / Obfuscate: stable deterministic offset based on uid length/chars
    const charSum = skaterProfile.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const offsetX = ((charSum % 40) - 20); // deterministic offset X of -20 to +20 px
    const offsetY = (((charSum * 7) % 40) - 20); // deterministic offset Y of -20 to +20 px
    
    return {
      x: actualCoords.x + offsetX,
      y: actualCoords.y + offsetY
    };
  };
  const isAdmin = useMemo(() => {
    const email = (currentUser?.email || '').toLowerCase().trim();
    return email === 'inenepadi@gmail.com' || email === 'moonsurfers@gmail.com' || email === 'moonsufers@gmail.com';
  }, [currentUser]);
  const [profile, setProfile] = useState<SkateProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const isSigningUpRef = useRef<boolean>(false);
  
  // Supabase migration states
  const [migrationActive, setMigrationActive] = useState<boolean>(false);
  const [migrationProgressStep, setMigrationProgressStep] = useState<string>('');
  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(null);
  const [showTransporterGuide, setShowTransporterGuide] = useState<boolean>(true);
  
  // Custom codename registration screen input controls
  const [joinHandle, setJoinHandle] = useState<string>('');
  const [joinDistrict, setJoinDistrict] = useState<string>('ACC');
  const [authError, setAuthError] = useState<string | null>(null);

  // Authenticated password and mode states
  const [authTab, setAuthTab] = useState<'guest' | 'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Dynamic custom districts loaded in real-time
  const [customDistricts, setCustomDistricts] = useState<Record<string, District>>({});
  
  // Dynamic custom spots loaded in real-time
  const [customSpots, setCustomSpots] = useState<CustomSpot[]>([]);

  // Custom Spot modal form controls
  const [showAddSpotModal, setShowAddSpotModal] = useState<boolean>(false);
  const [newSpotName, setNewSpotName] = useState<string>('');
  const [newSpotDescription, setNewSpotDescription] = useState<string>('');
  const [newSpotDifficulty, setNewSpotDifficulty] = useState<'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel'>('Core');
  const [newSpotHype, setNewSpotHype] = useState<number>(50);
  const [spotCreationError, setSpotCreationError] = useState<string | null>(null);
  
  // Custom Sector modal form controls
  const [showAddDistrictModal, setShowAddDistrictModal] = useState<boolean>(false);
  const [newDistrictId, setNewDistrictId] = useState<string>('');
  const [newDistrictName, setNewDistrictName] = useState<string>('');
  const [newDistrictCoords, setNewDistrictCoords] = useState<string>('0.0000° N, 0.0000° E');
  const [districtCreationError, setDistrictCreationError] = useState<string | null>(null);

  // Profile editing/updating states
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editHandle, setEditHandle] = useState<string>('');
  const [editMotto, setEditMotto] = useState<string>('');
  const [editSkateStyle, setEditSkateStyle] = useState<string>('');
  const [editProfilePicture, setEditProfilePicture] = useState<string>('');
  const [editVhsFilter, setEditVhsFilter] = useState<boolean>(false);
  const [editAvatarBorder, setEditAvatarBorder] = useState<string>('none');
  const [editProfileError, setEditProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isEditingDirectoryHandle, setIsEditingDirectoryHandle] = useState<boolean>(false);
  const [dirEditHandleVal, setDirEditHandleVal] = useState<string>('');

  // ==========================================
  // Layout & Navigation States
  // ==========================================
  const [currentDistrictId, setCurrentDistrictId] = useState<string>('ACC');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  const combinedDistricts = useMemo(() => {
    const districtsCopy: Record<string, District> = {};
    
    // Copy base static districts & assign deterministic IDs so they can be overridden/edited
    Object.entries(DISTRICTS).forEach(([id, dst]) => {
      districtsCopy[id] = {
        ...dst,
        spots: dst.spots.map(s => ({
          ...s,
          id: (s as any).id || `static_${id}_${s.name.toLowerCase().replace(/\s+/g, '_')}`
        }))
      };
    });

    // Mix in custom districts
    Object.entries(customDistricts).forEach(([id, district]) => {
      const d = district as any;
      districtsCopy[id] = {
        ...d,
        spots: d.spots ? d.spots.map((s: any) => ({
          ...s,
          id: s.id || `custom_${id}_${s.name.toLowerCase().replace(/\s+/g, '_')}`
        })) : []
      };
    });

    // Add custom spots to whichever district they belong to
    customSpots.forEach((spot) => {
      const dId = spot.districtId;
      if (districtsCopy[dId]) {
        const dSpots = districtsCopy[dId].spots;
        const existingIndex = dSpots.findIndex(s => s.id === spot.id || s.name.toLowerCase() === spot.name.toLowerCase());
        if (existingIndex >= 0) {
          // If the spot exists (e.g. static spot or custom district spot), override with custom spot edits!
          dSpots[existingIndex] = {
            ...dSpots[existingIndex],
            ...spot, // Preserve all original fields like createdBy, createdAt, etc.
            id: spot.id,
            name: spot.name,
            description: spot.description,
            difficulty: spot.difficulty || 'Core',
            hype: spot.hype !== undefined ? spot.hype : 50,
            coords: spot.coords || dSpots[existingIndex].coords
          };
        } else {
          dSpots.push({
            ...spot, // Preserve all original fields like createdBy, createdAt, etc.
            id: spot.id,
            name: spot.name,
            description: spot.description,
            difficulty: spot.difficulty || 'Core',
            hype: spot.hype || 50,
            coords: spot.coords || { x: 150, y: 150 }
          });
        }
      }
    });

    return districtsCopy;
  }, [customDistricts, customSpots]);

  const currentDistrict = combinedDistricts[currentDistrictId] || combinedDistricts.ACC || DISTRICTS.ACC;

  const combinedGps = useMemo(() => {
    const base = { ...DISTRICT_GPS };
    Object.values(customDistricts).forEach((cd: any) => {
      let lat = 0;
      let lon = 0;
      if (cd.coordinates) {
        const parts = cd.coordinates.split(',');
        if (parts.length === 2) {
          const latStr = parts[0].trim();
          const lonStr = parts[1].trim();
          const latVal = parseFloat(latStr.replace(/[^0-9.-]/g, ''));
          const lonVal = parseFloat(lonStr.replace(/[^0-9.-]/g, ''));
          
          if (!isNaN(latVal)) {
            const hasS = latStr.toUpperCase().includes('S');
            const hasN = latStr.toUpperCase().includes('N');
            if (hasS) {
              lat = -Math.abs(latVal);
            } else if (hasN) {
              lat = Math.abs(latVal);
            } else {
              lat = latVal; // Preserve original sign (like -33.9249)
            }
          }
          if (!isNaN(lonVal)) {
            const hasW = lonStr.toUpperCase().includes('W');
            const hasE = lonStr.toUpperCase().includes('E');
            if (hasW) {
              lon = -Math.abs(lonVal);
            } else if (hasE) {
              lon = Math.abs(lonVal);
            } else {
              lon = lonVal; // Preserve original sign (like -18.4241)
            }
          }
        }
      }
      base[cd.id] = { lat: lat || 40.7128, lon: lon || -73.9352 };
    });
    return base;
  }, [customDistricts]);

  const [selectedSpot, setSelectedSpot] = useState<any>(DISTRICTS.ACC.spots[0]);
  const [radarScanning, setRadarScanning] = useState<boolean>(false);

  // Keep selected spot in sync with current district spots
  useEffect(() => {
    if (currentDistrict) {
      const hasSpot = currentDistrict.spots.some((s: any) => selectedSpot && s.name === selectedSpot.name);
      if (!hasSpot && currentDistrict.spots && currentDistrict.spots.length > 0) {
        setSelectedSpot(currentDistrict.spots[0]);
        setSelectedSpotForUpload(currentDistrict.spots[0].name);
      }
    }
  }, [currentDistrictId, customDistricts]);
  
  // Dynamic challenges state linked with Firestore
  const [personalChallenges, setPersonalChallenges] = useState<DynamicChallenge[]>([]);
  const [isGeneratingChallenge, setIsGeneratingChallenge] = useState<boolean>(false);

  // Friend adding text field & list
  const [friendInput, setFriendInput] = useState<string>('');
  const [friendStatus, setFriendStatus] = useState<{ text: string; success: boolean } | null>(null);

  // Real-time feeds stream linked with Firestore
  const [feeds, setFeeds] = useState<LiveTrickUpload[]>([]);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  const [tickers, setTickers] = useState<string[]>([
    "SERVERS LIVE: SECURING ENCRYPTED DATA STABILITY",
    "INTERACTIVE GPS OVERLAYS OPERATIONAL",
    "REBEL INTEL DISPATCH: OSU CASTLE SECURITY MINIMAL"
  ]);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // Spot Editing States
  const [isEditingSpot, setIsEditingSpot] = useState<boolean>(false);
  const [isSavingSpot, setIsSavingSpot] = useState<boolean>(false);
  const [editSpotName, setEditSpotName] = useState<string>('');
  const [editSpotDescription, setEditSpotDescription] = useState<string>('');
  const [editSpotDifficulty, setEditSpotDifficulty] = useState<'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel'>('Core');
  const [editSpotHype, setEditSpotHype] = useState<number>(50);

  const activeSpotDetails = useMemo(() => {
    if (!selectedSpot) return null;
    return currentDistrict.spots.find((s: any) => s.id === selectedSpot.id || s.name.toLowerCase() === selectedSpot.name.toLowerCase()) || selectedSpot;
  }, [selectedSpot, currentDistrict]);

  const handleSaveSpotEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSpotDetails || !currentUser) return;

    const spotId = activeSpotDetails.id || `static_${currentDistrictId}_${activeSpotDetails.name.toLowerCase().replace(/\s+/g, '_')}`;

    try {
      setIsSavingSpot(true);
      
      const updatedData: any = {
        id: spotId,
        districtId: currentDistrictId,
        name: editSpotName.trim(),
        description: editSpotDescription.trim(),
        difficulty: editSpotDifficulty,
        hype: parseInt(String(editSpotHype), 10) || 50,
        coords: activeSpotDetails.coords || { x: 150, y: 150 },
        createdBy: activeSpotDetails.createdBy || currentUser.uid
      };

      if (activeSpotDetails.createdAt) {
        updatedData.createdAt = activeSpotDetails.createdAt;
      }

      await setDoc(doc(db, 'custom_spots', spotId), updatedData, { merge: true });
      
      addTickerMessage(`SPOT MODIFIED: [${editSpotName.toUpperCase()}] RE-LOGGED TO SECURE DATABASE`);
      addNotification('system', 'SPOT EDITED', `The coordinates and logs for ${editSpotName} have been revised.`);
      
      setSelectedSpot(updatedData);
      setIsEditingSpot(false);
    } catch (err: any) {
      console.error("Failed to edit spot:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `custom_spots/${spotId}`);
      } catch (fError: any) {
        addNotification('system', 'TRANSMISSION FAILED', `Failed to modify spot: ${fError.message}`);
      }
    } finally {
      setIsSavingSpot(false);
    }
  };
  const [selectedLiveSkater, setSelectedLiveSkater] = useState<SkateProfile | null>(null);
  const [uploadText, setUploadText] = useState<string>('');
  const [selectedSpotForUpload, setSelectedSpotForUpload] = useState<string>(currentDistrict.spots[0].name);
  const [uploadAnimationRunning, setUploadAnimationRunning] = useState<boolean>(false);

  // Clock state
  const [timeString, setTimeString] = useState<string>('00:00:00');

  // Mini-Game state
  const [showGame, setShowGame] = useState<boolean>(false);
  const [activeGameType, setActiveGameType] = useState<'alley' | 'rail'>('alley');
  const [gameScore, setGameScore] = useState<number>(0);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'crashed'>('idle');
  const [highScore, setHighScore] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // ==========================================
  // Social Directory & Real-time GPS/Shred States
  // ==========================================
  const [sidebarTab, setSidebarTab] = useState<'friends' | 'directory'>('friends');
  const [allSkaters, setAllSkaters] = useState<SkateProfile[]>([]);
  const [userTricks, setUserTricks] = useState<LiveTrickUpload[]>([]);
  const [directorySearch, setDirectorySearch] = useState<string>('');

  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [gpsActive, setGpsActive] = useState<boolean>(false);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [notifiedSkaters, setNotifiedSkaters] = useState<Record<string, number>>({});

  const [shredSessionActive, setShredSessionActive] = useState<boolean>(false);
  const [sessionPoints, setSessionPoints] = useState<number>(0);
  const [sessionDuration, setSessionDuration] = useState<number>(0);
  const [stuntText, setStuntText] = useState<string>('');
  const [copiedFeedId, setCopiedFeedId] = useState<string | null>(null);

  // ==========================================
  // Map Zoom & Pan States
  // ==========================================
  const [mapViewMode, setMapViewMode] = useState<'vector' | 'google'>('vector');
  const [activeMobileView, setActiveMobileView] = useState<'profile' | 'map' | 'challenges'>('map');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showPatrolDanger, setShowPatrolDanger] = useState<boolean>(true);
  const [layersDropdownOpen, setLayersDropdownOpen] = useState<boolean>(false);
  const [mapDisplayFilter, setMapDisplayFilter] = useState<'all' | 'spots' | 'users'>('all');
  const [mapDistanceFilter, setMapDistanceFilter] = useState<number>(0);
  const [isMapFilterCollapsed, setIsMapFilterCollapsed] = useState<boolean>(false);
  const [singleTargetIsolation, setSingleTargetIsolation] = useState<boolean>(true);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [signalsOverlayCollapsed, setSignalsOverlayCollapsed] = useState<boolean>(window.innerWidth < 1024);
  const [connectionTerminalCollapsed, setConnectionTerminalCollapsed] = useState<boolean>(window.innerWidth < 1024);
  const touchStartDistanceRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  // Secure messaging & video file analysis states
  const [localVideoUrls, setLocalVideoUrls] = useState<Record<string, string>>({});
  const [allDirectMessages, setAllDirectMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  
  // Custom Bottom Zine Tabs (World Feed, Secure DMs, Trick Academy)
  const [bottomTab, setBottomTab] = useState<'world' | 'comlink' | 'tutorials'>('world');
  const [selectedChatSkater, setSelectedChatSkater] = useState<SkateProfile | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState<string>('');
  const [dmChatInput, setDmChatInput] = useState<string>('');
  
  // Trick tutorials practice states
  const [practiceSelectedTrick, setPracticeSelectedTrick] = useState<string | null>(null);
  const [practiceStepIndex, setPracticeStepIndex] = useState<number>(0);
  const [practiceLogs, setPracticeLogs] = useState<string[]>([]);
  const [practiceRunning, setPracticeRunning] = useState<boolean>(false);

  // Real-time on-screen HUD Notification System
  const [notifications, setNotifications] = useState<SkateNotification[]>([]);

  const addNotification = (
    type: 'link' | 'mission' | 'level' | 'network' | 'system',
    title: string,
    message: string,
    duration: number = 4800,
    metadata?: SkateNotification['metadata']
  ) => {
    const id = `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newNotif: SkateNotification = {
      id,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(),
      duration,
      metadata
    };
    
    setNotifications(prev => [newNotif, ...prev.slice(0, 4)]);
    sounds.playTelemetryChirp();

    // Auto dismiss after duration
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  };

  const handleNotificationClick = (n: SkateNotification) => {
    sounds.playSelect();
    
    // Dismiss clicked notification instantly
    setNotifications(prev => prev.filter(item => item.id !== n.id));

    if (n.type === 'link') {
      const handleFromMeta = n.metadata?.handle;
      const handleFromMsg = n.message.match(/@([a-zA-Z0-9_.-]+)/)?.[1];
      const matchedHandle = (handleFromMeta || handleFromMsg || '').toLowerCase().trim();

      if (matchedHandle) {
        const skater = allSkaters.find(s => s.handle.toLowerCase() === matchedHandle);
        if (skater) {
          setSelectedLiveSkater(skater);
          return;
        }
      }
      setActiveMobileView('profile');
    } else if (n.type === 'mission') {
      setActiveMobileView('challenges');
      setBottomTab('world');
    } else if (n.type === 'network') {
      setActiveMobileView('profile');
      setBottomTab('world');
    } else if (n.type === 'level' || n.type === 'system') {
      setActiveMobileView('profile');
    }
  };

  const activeMessages = useMemo(() => {
    return allDirectMessages.filter(msg => 
      selectedLiveSkater && (
        (msg.senderUid === currentUser?.uid && msg.receiverUid === selectedLiveSkater.id) ||
        (msg.senderUid === selectedLiveSkater.id && msg.receiverUid === currentUser?.uid)
      )
    );
  }, [allDirectMessages, selectedLiveSkater, currentUser]);

  const inboxChatMessages = useMemo(() => {
    return allDirectMessages.filter(msg => 
      selectedChatSkater && (
        (msg.senderUid === currentUser?.uid && msg.receiverUid === selectedChatSkater.id) ||
        (msg.senderUid === selectedChatSkater.id && msg.receiverUid === currentUser?.uid)
      )
    );
  }, [allDirectMessages, selectedChatSkater, currentUser]);

  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFrameBase64, setVideoFrameBase64] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{ verified: boolean; detectedTrick: string; confidence: number; feedback: string; pointsAwarded: number } | null>(null);

  // Spot Mission states
  const [showSpotDetails, setShowSpotDetails] = useState<boolean>(true);
  const [showMissionModal, setShowMissionModal] = useState<boolean>(false);
  const [missionSpot, setMissionSpot] = useState<any>(null);
  const [spotMissionCaption, setSpotMissionCaption] = useState<string>('');
  const [completeSpotProgressPercent, setCompleteSpotProgressPercent] = useState<number>(0);
  const [completeSpotProgressText, setCompleteSpotProgressText] = useState<string>('');

  // ==========================================
  // Daily Streak date helpers and validation
  // ==========================================
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const validateAndVerifyStreak = async (prof: SkateProfile): Promise<SkateProfile> => {
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();
    
    let nextStreak = prof.dailyStreak || 0;
    let nextLastUpdate = prof.lastStreakUpdate || '';
    let hasChanged = false;

    if (!prof.lastStreakUpdate) {
      // First login ever: set streak to 1
      nextStreak = 1;
      nextLastUpdate = today;
      hasChanged = true;
    } else if (prof.lastStreakUpdate === yesterday) {
      // Consecutive daily login: increment streak
      nextStreak = (prof.dailyStreak || 0) + 1;
      nextLastUpdate = today;
      hasChanged = true;
    } else if (prof.lastStreakUpdate !== today) {
      // Broken streak: start fresh at 1 on this new day
      nextStreak = 1;
      nextLastUpdate = today;
      hasChanged = true;
    }

    let nextActiveLocation = prof.activeLocation;
    if (!nextActiveLocation) {
      const fallbackLocId = prof.districtId || 'LOS';
      const distInfo = DISTRICTS[fallbackLocId] || DISTRICTS.LOS;
      nextActiveLocation = {
        districtId: fallbackLocId,
        districtName: distInfo.name,
        spotName: distInfo.spots[0]?.name || 'Plaza',
        coords: {
          x: 140 + (Math.abs(prof.id.charCodeAt(0) || 0) % 100) + (Math.abs(prof.id.charCodeAt(1) || 0) % 30),
          y: 120 + (Math.abs(prof.id.charCodeAt(2) || 0) % 80) + (Math.abs(prof.id.charCodeAt(3) || 0) % 20)
        },
        coordinatesString: distInfo.coordinates || '0.0000° N, 0.0000° E'
      };
      hasChanged = true;
    }

    if (hasChanged) {
      const updatedProf: SkateProfile = { 
        ...prof, 
        dailyStreak: nextStreak,
        lastStreakUpdate: nextLastUpdate,
        activeLocation: nextActiveLocation,
        updatedAt: new Date().toISOString()
      };
      try {
        if (prof.isGuest) {
          localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(updatedProf));
        }
        await updatePlayerStreak(prof.id, nextStreak, nextLastUpdate, !!prof.isGuest);
        if (!prof.activeLocation) {
          await updateLocation(prof.id, nextActiveLocation);
        }
        setTimeout(() => {
          addTickerMessage(`DAILY LOGIN STREAK ADVANCED! ${nextStreak} DAY FIRE STATUS ACTIVE 🔥`);
        }, 1000);
      } catch (e) {
        console.warn("Could not sync daily login streak update:", e);
      }
      return updatedProf;
    }
    return prof;
  };

  // ==========================================
  // Firebase Auth Listener
  // ==========================================
  useEffect(() => {
    // Check for cached guest profile
    const cachedGuest = localStorage.getItem('moonsurfers_guest_profile');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated skater
        setCurrentUser({ uid: firebaseUser.uid, email: firebaseUser.email || '', isGuest: false });
        await fetchOrCreateUserProfile(firebaseUser.uid, firebaseUser.email || '', firebaseUser.displayName || 'Nomad');
      } else if (cachedGuest) {
        // Fallback guest authenticated state
        try {
          const parsed = JSON.parse(cachedGuest);
          setCurrentUser({ uid: parsed.id, email: parsed.email, isGuest: true });
          const userProf = await getSkaterProfile(parsed.id);
          if (userProf) {
            const validated = await validateAndVerifyStreak(userProf);
            setProfile(validated);
            setCurrentDistrictId(validated.activeLocation?.districtId || 'ACC');
          } else {
            // Re-assert in firestore just in case, but fail gracefully if offline/unauthenticated
            try {
              await setDoc(doc(db, 'users', parsed.id), parsed);
            } catch (dbErr) {
              console.warn("Skipped guest user db sync (offline/unauthenticated):", dbErr);
            }
            const validated = await validateAndVerifyStreak(parsed);
            setProfile(validated);
          }
        } catch (e) {
          localStorage.removeItem('moonsurfers_guest_profile');
        }
      } else {
        setCurrentUser(null);
        setProfile(null);
      }
      setIsInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch or create customer profile
  const fetchOrCreateUserProfile = async (uid: string, email: string, fallbackName: string) => {
    try {
      // Trigger database auto-seeding if empty/fresh
      await seedDefaultDataIfEmpty();

      let existing = await getSkaterProfile(uid);
      if (!existing && email) {
        try {
          const usersCol = collection(db, 'users');
          const q = query(usersCol, where('email', '==', email.trim().toLowerCase()));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            const oldProfileData = querySnap.docs[0].data() as SkateProfile;
            existing = {
              ...oldProfileData,
              id: uid,
              updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', uid), existing);
            console.log(`Adopted existing seeded profile for ${email} under new UID ${uid}`);
          }
        } catch (queryErr) {
          console.warn("Could not check/migrate existing email profile:", queryErr);
        }
      }

      if (existing) {
        // Automatically restore/re-seed details if the user is inene/moonsurfers and gets a corrupt/fresh profile
        const isUserInene = email.trim().toLowerCase() === 'inenepadi@gmail.com' || email.trim().toLowerCase() === 'moonsufers@gmail.com' || uid === 'qoEhm0ZgOVVmAIRpaKozh1pJur72';
        if (isUserInene && (existing.handle !== 'inene233' || (existing.level || 0) < 14)) {
          console.log("Automatically restoring old level 14 username, friends, and network for inene233...");
          existing = {
            ...existing,
            handle: 'inene233',
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
            dailyStreak: existing.dailyStreak || 3,
            lastStreakUpdate: existing.lastStreakUpdate || "2026-06-12",
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', uid), existing);
        }

        const validated = await validateAndVerifyStreak(existing);
        setProfile(validated);
        if (validated.activeLocation?.districtId) {
          setCurrentDistrictId(validated.activeLocation.districtId);
        }
      } else {
        if (isSigningUpRef.current) {
          console.log("Rider registration guard: skipping auto profile creation during active signup flow.");
          return;
        }
        const isUserInene = email.trim().toLowerCase() === 'inenepadi@gmail.com' || email.trim().toLowerCase() === 'moonsufers@gmail.com' || uid === 'qoEhm0ZgOVVmAIRpaKozh1pJur72';
        let created;
        if (isUserInene) {
          console.log("Constructing complete inene233 profile for new user account...");
          created = {
            id: uid,
            handle: 'inene233',
            email: 'inenepadi@gmail.com',
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
            dailyStreak: 3,
            lastStreakUpdate: "2026-06-12",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', uid), created);
        } else {
          // Extract handle from email / name
          const initialHandle = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_') || fallbackName.replace(/\s+/g, '_');
          created = await createInitialProfile(uid, email, initialHandle);
        }
        const validated = await validateAndVerifyStreak(created);
        setProfile(validated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sign up with Google authentication
  const handleGoogleSignIn = async () => {
    sounds.playSelect();
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      addTickerMessage("Skaters network link secured via Google Auth");
    } catch (error: any) {
      console.error(error);
      setAuthError(error.message || "Connection blocked. Open in new tab or select offline guest.");
    }
  };

  // Simulated Guest Signup to run beautifully inside direct sandboxed iframes
  const handleGuestSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    if (!joinHandle.trim()) {
      setAuthError("Input a valid outlaw handle");
      setAuthLoading(false);
      return;
    }

    try {
      sounds.playTrickSuccess();
      const cleanHandle = joinHandle.trim().replace(/\s+/g, '_').toLowerCase();
      const guestId = `guest_${Date.now()}`;
      const guestEmail = `${cleanHandle}@outlaw.io`;

      let sectorIdToSet = joinDistrict;

      // Type "Other" and add custom district during Guest Signup
      if (joinDistrict === 'OTHER') {
        if (!newDistrictId || !newDistrictName) {
          throw new Error("Custom Sector details are missing. Define ID & Name.");
        }
        
        const cleanId = newDistrictId.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
        if (cleanId.length < 3) {
          throw new Error("District code must be 3-5 alphabetical uppercase characters");
        }

        const customDistrictObj: District = {
          id: cleanId,
          name: newDistrictName.trim(),
          code: cleanId,
          timezone: 'Africa/Accra',
          coordinates: newDistrictCoords || '0.0000° N, 0.0000° E',
          mission: `Land 3 lines at ${newDistrictName.trim()} spots.`,
          missionSteps: [`Slay ${newDistrictName.trim()} curbs`, `Exceed 15000 score`],
          missionTotal: 2,
          skatersLive: 1,
          noiseLevel: 'SECURE',
          spots: [
            { 
              name: `${newDistrictName.trim()} Central Plaza`, 
              description: `Courtyard with ledges and manual pads. Watch out for security patrols.`, 
              difficulty: 'Concrete', 
              hype: 80, 
              coords: { x: 160, y: 140 } 
            }
          ],
          riders: [
            { name: cleanHandle, score: 0, rank: 1 }
          ]
        };

        await setDoc(doc(db, 'districts', cleanId), customDistrictObj);
        sectorIdToSet = cleanId;
        addTickerMessage(`[INTELLIGENCE RELEASED] NEW SECTOR ENLISTED: [${cleanId}]`);
      }

      const newGuestProfile: SkateProfile = {
        id: guestId,
        handle: cleanHandle,
        email: guestEmail,
        level: 1,
        reputation: 0,
        friends: [],
        badges: ['nomad_starter'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isGuest: true,
        dailyStreak: 0,
        lastStreakUpdate: '',
        activeLocation: sectorIdToSet ? {
          districtId: sectorIdToSet,
          districtName: joinDistrict === 'OTHER' ? newDistrictName.trim() : (combinedDistricts[sectorIdToSet]?.name || sectorIdToSet),
          spotName: joinDistrict === 'OTHER' ? `${newDistrictName.trim()} Central Plaza` : (combinedDistricts[sectorIdToSet]?.spots[0]?.name || 'Plaza'),
          coords: { x: 160, y: 140 },
          coordinatesString: joinDistrict === 'OTHER' ? newDistrictCoords : (combinedDistricts[sectorIdToSet]?.coordinates || '0.0000° N, 0.0000° E')
        } : undefined
      };

      try {
        await setDoc(doc(db, 'users', guestId), newGuestProfile);
      } catch (dbErr) {
        console.warn("Skipped guest user database provision (offline/unauthenticated):", dbErr);
      }
      
      localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(newGuestProfile));
      setCurrentUser({ uid: guestId, email: guestEmail, isGuest: true });
      setProfile(newGuestProfile);
      if (sectorIdToSet) {
        setCurrentDistrictId(sectorIdToSet);
      }
      addTickerMessage(`Guest secure link activated: Welcome Skater ${cleanHandle.toUpperCase()}`);
    } catch (err: any) {
      setAuthError(err.message || "Failed to save profile. Try another handle.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Submit handler for Email/Password Sign Up (Secure Accounts)
  const handleEmailPasswordSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    sounds.playRadarSweep();
    isSigningUpRef.current = true;

    try {
      if (!emailInput || !passwordInput || !joinHandle) {
        throw new Error("Missing required registration fields (Handle, Email, Password)");
      }

      const cleanHandle = joinHandle.trim().replace(/\s+/g, '_').toLowerCase();
      let sectorIdToSet = joinDistrict;

      // Handle custom district "Other" selection
      if (joinDistrict === 'OTHER') {
        if (!newDistrictId || !newDistrictName) {
          throw new Error("Custom Sector details are missing. Define ID & Name.");
        }
        
        const cleanId = newDistrictId.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
        if (cleanId.length < 3) {
          throw new Error("District code must be 3-5 alphabetical uppercase characters");
        }

        const customDistrictObj: District = {
          id: cleanId,
          name: newDistrictName.trim(),
          code: cleanId,
          timezone: 'Africa/Accra',
          coordinates: newDistrictCoords || '0.0000° N, 0.0000° E',
          mission: `Gain legend rank in ${newDistrictName.trim()}'s underground spots.`,
          missionSteps: [`Unlock custom spot lines in ${cleanId}`, `Exceed 25000 speedboard score`],
          missionTotal: 2,
          skatersLive: 1,
          noiseLevel: 'SECURE',
          spots: [
            { 
              name: `${newDistrictName.trim()} Central Plaza`, 
              description: `A pristine underbelly concrete courtyard with massive concrete curbs and rails. Watch for nightly patrols.`, 
              difficulty: 'Concrete', 
              hype: 85, 
              coords: { x: 160, y: 140 } 
            },
            { 
              name: `${newDistrictName.trim()} Cathedral Set`, 
              description: `Massive brick stairs leading down the city's highest sector. Speed runs highly recommended.`, 
              difficulty: 'Core', 
              hype: 90, 
              coords: { x: 280, y: 190 } 
            }
          ],
          riders: [
            { name: cleanHandle, score: 0, rank: 1 }
          ]
        };

        // Create the district in Firestore database
        await setDoc(doc(db, 'districts', cleanId), customDistrictObj);
        sectorIdToSet = cleanId;
        addTickerMessage(`[INTELLIGENCE RELEASED] NEW SECTOR ENLISTED: [${cleanId}]`);
      }

      // Create Firebase Auth user
      const credential = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
      const uid = credential.user.uid;

      // Create users database profile
      const userProfile = await createInitialProfile(uid, emailInput.trim(), cleanHandle);
      let finalProfile = userProfile;
      
      // Update custom district profile if registered
      if (sectorIdToSet) {
        const activeLoc: ActiveLocation = {
          districtId: sectorIdToSet,
          districtName: joinDistrict === 'OTHER' ? newDistrictName.trim() : (combinedDistricts[sectorIdToSet]?.name || sectorIdToSet),
          spotName: joinDistrict === 'OTHER' ? `${newDistrictName.trim()} Central Plaza` : (combinedDistricts[sectorIdToSet]?.spots[0]?.name || 'Plaza'),
          coords: { x: 160, y: 140 },
          coordinatesString: joinDistrict === 'OTHER' ? newDistrictCoords : (combinedDistricts[sectorIdToSet]?.coordinates || '0.0000° N, 0.0000° E')
        };
        await updateLocation(uid, activeLoc);
        setCurrentDistrictId(sectorIdToSet);
        finalProfile = { ...userProfile, activeLocation: activeLoc };
      }

      const validated = await validateAndVerifyStreak(finalProfile);
      setProfile(validated);
      sounds.playTrickSuccess();
    } catch (err: any) {
      console.error("SignUp Error:", err);
      setAuthError(err.message || "Failed to enlist secured skater");
    } finally {
      isSigningUpRef.current = false;
      setAuthLoading(false);
    }
  };

  // Submit handler for Email/Password Sign In
  const handleEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    sounds.playRadarSweep();

    try {
      if (!emailInput || !passwordInput) {
        throw new Error("Enter email and password credentials");
      }
      await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
      sounds.playTrickSuccess();
    } catch (err: any) {
      console.error("SignIn Error, checking fallback signup:", err);
      const errorCode = err.code || "";
      if (errorCode.includes("auth/user-not-found") || errorCode.includes("auth/invalid-credential")) {
        // Fallback: try to automatically register this user if they don't exist
        try {
          addTickerMessage("TELEMETRY NODE UNLINKED. CREATING COLD PROFILE SYNC...");
          await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
          sounds.playTrickSuccess();
        } catch (signUpErr: any) {
          const signUpCode = signUpErr.code || "";
          if (signUpCode.includes("auth/email-already-in-use")) {
            setAuthError("Incorrect password. Please verify your credentials and try again.");
          } else {
            setAuthError(signUpErr.message || "Failed to sync Rider account.");
          }
        }
      } else if (errorCode.includes("auth/wrong-password")) {
        setAuthError("Incorrect password. Please verify your credentials and try again.");
      } else {
        setAuthError(err.message || "Termination: Invalid Outlaw Credentials");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Submit handler for dynamic district creator inside the active session
  const handleCreateDynamicDistrict = async (e: React.FormEvent) => {
    e.preventDefault();
    setDistrictCreationError(null);
    sounds.playSelect();

    try {
      if (!newDistrictId || !newDistrictName) {
        throw new Error("District code and name are required.");
      }

      const cleanId = newDistrictId.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      if (cleanId.length < 3) {
        throw new Error("Sector Code must be 3-5 alphabetical characters (e.g. PAR)");
      }

      if (combinedDistricts[cleanId]) {
        throw new Error(`Sector '${cleanId}' is already synchronized on the database.`);
      }

      const customDistrictObj: District = {
        id: cleanId,
        name: newDistrictName.trim(),
        code: cleanId,
        timezone: 'Africa/Accra',
        coordinates: newDistrictCoords || '0.0000° N, 0.0000° E',
        mission: `Claim victory on the raw underbelly spots of ${newDistrictName.trim()}.`,
        missionSteps: [`Land details at ${cleanId} rails`, `Exceed 15000 speedboard score`],
        missionTotal: 2,
        skatersLive: 1,
        noiseLevel: 'ELEVATED',
        spots: [
          { 
            name: `${newDistrictName.trim()} Underbelly Courtyard`, 
            description: `Polished stairs and custom manual pads in a dark corner courtyard of ${newDistrictName.trim()}. Watch for security.`, 
            difficulty: 'Concrete', 
            hype: 80, 
            coords: { x: 150, y: 150 } 
          },
          { 
            name: `${newDistrictName.trim()} Loading Ramp`, 
            description: `A steep shipping bay loading pad at an abandoned warehouse. Perfect wallride and gap opportunities.`, 
            difficulty: 'Ledge', 
            hype: 85, 
            coords: { x: 280, y: 190 } 
          }
        ],
        riders: [
          { name: profile?.handle || 'nomad', score: 0, rank: 1 }
        ]
      };

      // Add to Firestore
      await setDoc(doc(db, 'districts', cleanId), customDistrictObj);
      
      // Auto deploy to newly created district
      setCurrentDistrictId(cleanId);
      setShowAddDistrictModal(false);

      // Add ticker alert
      addTickerMessage(`[DB INGRESS] NEW DEPLOY SECTOR SYNCED SUCCESSFULLY: ${newDistrictName.trim()} [${cleanId}]`);
      sounds.playTrickSuccess();

      // Clear input fields
      setNewDistrictId('');
      setNewDistrictName('');
      setNewDistrictCoords('0.0000° N, 0.0000° E');
    } catch (err: any) {
      console.error(err);
      setDistrictCreationError(err.message || "Failed to sync custom sector");
    }
  };

  // Submit handler for custom spot manual verification creator
  const handleCreateCustomSpot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSpotCreationError(null);
    sounds.playSelect();

    try {
      const userEmail = currentUser.email || '';
      const normEmail = userEmail.toLowerCase().trim();
      const isAdminEmail = normEmail === 'inenepadi@gmail.com' || normEmail === 'moonsurfers@gmail.com' || normEmail === 'moonsufers@gmail.com';
      
      if (!isAdminEmail) {
        throw new Error("SECURE TRANSMISSION DENIED: Only verified Admins (inenepadi@gmail.com / moonsurfers@gmail.com) can broadcast custom spots to the radar grid.");
      }

      if (!newSpotName.trim()) {
        throw new Error("Spot name is required.");
      }
      if (!newSpotDescription.trim()) {
        throw new Error("Spot description is required.");
      }

      // Collect existing coordinates in the current district to ensure distance
      const existingCoords = (currentDistrict?.spots || []).map(s => s.coords).filter(Boolean);

      // Add to Firestore using our helper
      const spot = await addCustomSpot(
        currentDistrictId,
        newSpotName.trim(),
        newSpotDescription.trim(),
        newSpotDifficulty,
        newSpotHype,
        currentUser.uid,
        existingCoords
      );

      // Add Ticker notification
      addTickerMessage(`[SPOT INGRESS] NEW MANUAL SPOT SYNCED: ${spot.name} IN ${currentDistrict.name}`);
      addNotification('system', 'NEW SPOT VERIFICATION', `${spot.name.toUpperCase()} CREATED IN ${currentDistrict.name.toUpperCase()} WITH ${spot.hype}% PATROL RISK.`);
      sounds.playTrickSuccess();

      // Clear input fields and close modal
      setNewSpotName('');
      setNewSpotDescription('');
      setNewSpotDifficulty('Core');
      setNewSpotHype(50);
      setShowAddSpotModal(false);

      // Select newly created spot so we immediately focus on it
      setSelectedSpot({
        name: spot.name,
        description: spot.description,
        difficulty: spot.difficulty,
        hype: spot.hype,
        coords: spot.coords
      });
      setSelectedSpotForUpload(spot.name);
      setShowSpotDetails(true);
    } catch (err: any) {
      console.error(err);
      setSpotCreationError(err.message || "Failed to submit new spot coordinate verification.");
    }
  };

  const handleSignOut = () => {
    sounds.playRadarSweep();
    signOut(auth);
    localStorage.removeItem('moonsurfers_guest_profile');
    setCurrentUser(null);
    setProfile(null);
    setEmailInput('');
    setPasswordInput('');
    setJoinHandle('');
    setAuthError(null);
    addTickerMessage("Encrypted skater connection destroyed.");
  };

  const startProfileEditing = () => {
    if (!profile) return;
    setEditHandle(profile.handle);
    setEditMotto(profile.motto || '');
    setEditSkateStyle(profile.skateStyle || 'Street');
    setEditProfilePicture(profile.profilePicture || '');
    setEditVhsFilter(!!profile.vhsFilter);
    setEditAvatarBorder(profile.avatarBorder || 'none');
    setEditProfileError(null);
    setIsEditingProfile(true);
  };

  const handleImageFileChange = (file: File) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setEditProfileError('Selected file must be an image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 180;
        const MAX_HEIGHT = 180;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          setEditProfilePicture(compressedBase64);
        }
      };
      if (typeof e.target?.result === 'string') {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDirectAvatarUpload = async (file: File) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      addTickerMessage("ERROR: Selected file must be an image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 180;
        const MAX_HEIGHT = 180;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          
          try {
            if (currentUser && profile) {
              if (currentUser.isGuest) {
                const updated = {
                  ...profile,
                  profilePicture: compressedBase64,
                  updatedAt: new Date().toISOString()
                };
                localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(updated));
                setProfile(updated);
                addTickerMessage("Local profile picture updated.");
              } else {
                await updateSkaterDetails(currentUser.uid, {
                  handle: profile.handle,
                  motto: profile.motto || '',
                  skateStyle: profile.skateStyle || 'Street',
                  profilePicture: compressedBase64,
                  vhsFilter: !!profile.vhsFilter,
                  avatarBorder: profile.avatarBorder || 'none'
                });
                setProfile(prev => prev ? { ...prev, profilePicture: compressedBase64 } : null);
                addTickerMessage("Profile picture updated successfully!");
              }
            }
          } catch (err: any) {
             console.error("Direct avatar upload failed:", err);
             addTickerMessage("Error saving profile picture: " + err.message);
          }
        }
      };
      if (typeof e.target?.result === 'string') {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !profile) return;
    setEditProfileError(null);
    
    const cleanHandle = editHandle.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanHandle || cleanHandle.length < 3) {
      setEditProfileError("Handle must be at least 3 characters");
      return;
    }

    if (cleanHandle.length > 25) {
      setEditProfileError("Handle must be 25 characters or less");
      return;
    }

    setIsSavingProfile(true);
    try {
      if (currentUser.isGuest) {
        const updated = {
          ...profile,
          handle: cleanHandle,
          motto: editMotto.trim(),
          skateStyle: editSkateStyle.trim(),
          profilePicture: editProfilePicture,
          vhsFilter: editVhsFilter,
          avatarBorder: editAvatarBorder,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(updated));
        setProfile(updated);
        setIsEditingProfile(false);
        addTickerMessage("Local guest profile data updated.");
      } else {
        await updateSkaterDetails(currentUser.uid, {
          handle: cleanHandle,
          motto: editMotto.trim(),
          skateStyle: editSkateStyle.trim(),
          profilePicture: editProfilePicture,
          vhsFilter: editVhsFilter,
          avatarBorder: editAvatarBorder
        });
        
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            handle: cleanHandle,
            motto: editMotto.trim(),
            skateStyle: editSkateStyle.trim(),
            profilePicture: editProfilePicture,
            vhsFilter: editVhsFilter,
            avatarBorder: editAvatarBorder
          };
        });
        setIsEditingProfile(false);
        addTickerMessage("Outlaw skater directory update broadcasted.");
      }
    } catch (err: any) {
      setEditProfileError(err.message || "Failed to broadcast changes. Permission issue or network dropout.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ==========================================
  // Real-Time Social Feed Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const uploadsCol = collection(db, 'trick_uploads');
    const qFeeds = query(uploadsCol, orderBy('createdAt', 'desc'), limit(15));
    
    const unsubscribe = onSnapshot(qFeeds, (snapshot) => {
      const loaded: LiveTrickUpload[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        loaded.push({
          id: docSnap.id,
          userUid: item.userUid,
          userName: item.userName,
          districtId: item.districtId,
          spotName: item.spotName,
          text: item.text,
          likesCount: item.likesCount || 0,
          likedUsers: item.likedUsers || [],
          comments: item.comments || [],
          createdAt: item.createdAt,
          verifiedByAi: item.verifiedByAi || false,
          aiVerificationFeedback: item.aiVerificationFeedback || "",
          videoUrl: item.videoUrl || "",
          stuntDistance: item.stuntDistance !== undefined ? item.stuntDistance : Math.round((item.text || '').length * 2.5 + 15),
          performanceScore: item.performanceScore !== undefined ? item.performanceScore : Math.min(100, 60 + ((item.text || '').length % 35))
        });
      });
      setFeeds(loaded);
      
      // Update global sound / ticker alert on incoming stunt
      if (loaded.length > 0 && loaded[0].userUid !== currentUser.uid) {
        addTickerMessage(`SHRED BROADCAST BY Skater: ${loaded[0].userName.toUpperCase()} @ ${loaded[0].spotName}`);
        addNotification('network', 'NEW SHRED BROADCAST', `@${loaded[0].userName.toUpperCase()} LOADED A NEW OUTLAW CLIP AT ${loaded[0].spotName.toUpperCase()}!`);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'trick_uploads');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Real-Time User Trick Activity Sync for Weekly Chart
  // ==========================================
  useEffect(() => {
    if (!currentUser) {
      setUserTricks([]);
      return;
    }

    const uploadsCol = collection(db, 'trick_uploads');
    const qUserTricks = query(uploadsCol, where('userUid', '==', currentUser.uid));
    
    const unsubscribe = onSnapshot(qUserTricks, (snapshot) => {
      const loaded: LiveTrickUpload[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        loaded.push({
          id: docSnap.id,
          userUid: item.userUid,
          userName: item.userName,
          districtId: item.districtId,
          spotName: item.spotName,
          text: item.text,
          likesCount: item.likesCount || 0,
          likedUsers: item.likedUsers || [],
          comments: item.comments || [],
          createdAt: item.createdAt,
          stuntDistance: item.stuntDistance !== undefined ? item.stuntDistance : Math.round((item.text || '').length * 2.5 + 15),
          performanceScore: item.performanceScore !== undefined ? item.performanceScore : Math.min(100, 60 + ((item.text || '').length % 35))
        });
      });
      setUserTricks(loaded);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'trick_uploads');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Real-Time Global Skaters Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCol, (snapshot) => {
      const uList: SkateProfile[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as SkateProfile;
        if (item.id) {
          // If activeLocation is missing, initialize it dynamically (useful for initial social profiles)
          if (!item.activeLocation) {
            const fallbackLocId = item.districtId || 'LOS';
            const distInfo = DISTRICTS[fallbackLocId] || DISTRICTS.LOS;
            item.activeLocation = {
              districtId: fallbackLocId,
              districtName: distInfo.name,
              spotName: distInfo.spots[0]?.name || 'Plaza',
              coords: {
                x: 140 + (Math.abs(item.id.charCodeAt(0) || 0) % 100) + (Math.abs(item.id.charCodeAt(1) || 0) % 30),
                y: 120 + (Math.abs(item.id.charCodeAt(2) || 0) % 80) + (Math.abs(item.id.charCodeAt(3) || 0) % 20)
              },
              coordinatesString: distInfo.coordinates || '0.0000° N, 0.0000° E'
            };
          }
          uList.push(item);
        }
      });
      // Sort by reputation points
      uList.sort((a, b) => b.reputation - a.reputation);
      setAllSkaters(uList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Real-Time GPS Walking Run Simulator (4 Skatespeed cruise)
  // ==========================================
  useEffect(() => {
    if (!gpsActive || !shredSessionActive || !currentUser || !profile) return;

    const interval = setInterval(() => {
      setGpsCoords(prev => {
        if (!prev) return null;
        const speed = 0.00004; // ~4 meters representing cruising speed
        const dx = (Math.random() - 0.5) * speed;
        const dy = (Math.random() - 0.5) * speed;
        const targetLat = prev.latitude + dy;
        const targetLon = prev.longitude + dx;
        
        updateProfileGPS(targetLat, targetLon);
        return { latitude: targetLat, longitude: targetLon };
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [gpsActive, shredSessionActive, currentUser, profile, currentDistrictId]);

  // ==========================================
  // Local Videos cache loader from IndexedDB
  // ==========================================
  useEffect(() => {
    const loadLocalUrls = async () => {
      let changed = false;
      const nextUrls = { ...localVideoUrls };
      for (const trick of userTricks) {
        if (trick.id && !nextUrls[trick.id]) {
          const localUrl = await getLocalVideoUrl(trick.id);
          if (localUrl) {
            nextUrls[trick.id] = localUrl;
            changed = true;
          }
        }
      }
      if (changed) {
        setLocalVideoUrls(nextUrls);
      }
    };
    if (userTricks.length > 0) {
      loadLocalUrls();
    }
  }, [userTricks]);

  // ==========================================
  // Real-Time Secure DM messaging Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) {
      setAllDirectMessages([]);
      return;
    }

    if (COM_LINK_FROZEN) {
      const cached = localStorage.getItem('moonsurfers_cached_direct_messages');
      if (cached) {
        try {
          setAllDirectMessages(JSON.parse(cached));
        } catch (e) {
          console.warn("Could not parse cached direct messages:", e);
        }
      } else {
        setAllDirectMessages([]);
      }
      return;
    }

    const messagesCol = collection(db, "direct_messages");
    const qMessages = query(
      messagesCol,
      or(
        where('senderUid', '==', currentUser.uid),
        where('receiverUid', '==', currentUser.uid)
      )
    );
    const unsubscribe = onSnapshot(qMessages, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        msgs.push({
          id: docSnap.id,
          senderUid: item.senderUid,
          senderHandle: item.senderHandle,
          receiverUid: item.receiverUid,
          text: item.text,
          createdAt: item.createdAt
        });
      });

      // Sort messages chronologically by creation date
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.seconds || Date.now() / 1000;
        const timeB = b.createdAt?.seconds || Date.now() / 1000;
        return timeA - timeB;
      });

      setAllDirectMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'direct_messages');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Real-Time Custom Districts Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const districtsCol = collection(db, 'districts');
    const unsubscribe = onSnapshot(districtsCol, (snapshot) => {
      const loaded: Record<string, District> = {};
      snapshot.forEach((docSnap) => {
        loaded[docSnap.id] = docSnap.data() as District;
      });
      setCustomDistricts(loaded);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'districts');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Real-Time Custom Spots Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const spotsCol = collection(db, 'custom_spots');
    const unsubscribe = onSnapshot(spotsCol, (snapshot) => {
      const loaded: CustomSpot[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as CustomSpot);
      });
      setCustomSpots(loaded);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'custom_spots');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // Active Shred Session Points Accumulator
  // ==========================================
  useEffect(() => {
    if (!shredSessionActive) {
      setSessionPoints(0);
      setSessionDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setSessionDuration(prev => prev + 1);
      // Continuous real-time trick XP creation +3 XP per second!
      setSessionPoints(prev => prev + 3);
    }, 1000);

    return () => clearInterval(interval);
  }, [shredSessionActive]);

  // Geolocation watch cleaner
  useEffect(() => {
    return () => {
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
      }
    };
  }, [gpsWatchId]);

  // Ambient satellite com-link simulation: generates rare cool skater alerts
  useEffect(() => {
    if (!currentUser) return;

    const ambientInterval = setInterval(() => {
      // 30% chance to fire a notification every 35 seconds (average ~100 seconds between, never annoying)
      if (Math.random() > 0.3) return;

      const otherSkaters = [
        'grom_steeze', 'tokyo_drift_bwoy', 'mauerpark_shredder', 'kotti_phantom',
        'nomad_zero', 'james_glider', 'rebel_outlaw', 'accra_speedster', 'void_prowler',
        'stunt_god77', 'shibuya_grom', 'street_oracle', 'signal_outcast', 'ledger_grinder'
      ];
      const randomSkater1 = otherSkaters[Math.floor(Math.random() * otherSkaters.length)];
      let randomSkater2 = otherSkaters[Math.floor(Math.random() * otherSkaters.length)];
      while (randomSkater2 === randomSkater1) {
        randomSkater2 = otherSkaters[Math.floor(Math.random() * otherSkaters.length)];
      }

      const spots = [
        'Accra Mall Car Park', 'Osu Castle Wall', 'Kaneshie Market Rooftops',
        'Jamestown Fishing Piers', 'Shibuya Lanes', 'Mauerpark Concrete Slabs',
        'Tegel Airport Runway Edge', 'Kreuzberg Steel Ledges', 'U-Bahn Station Rails'
      ];
      const randomSpot = spots[Math.floor(Math.random() * spots.length)];

      const missions = [
        'Mall Speed Run Override', 'Osu Castle Wall Assault', 'Kaneshie Tin-Roof Transit',
        'Airport Gated Silence Descent', 'Liberation Highway Infiltration', 'Shibuya Crossing Neon Sweep',
        'Mauerpark Wallride Campaign', 'U-Bahn High Ground Ingress', 'Bunker Drop Ascent'
      ];
      const randomMission = missions[Math.floor(Math.random() * missions.length)];

      const events: Array<{ type: 'link' | 'mission' | 'level' | 'network'; title: string; message: string }> = [
        {
          type: 'link',
          title: 'SATELLITE COM-LINK STABILIZED',
          message: `@${randomSkater1.toUpperCase()} ESTABLISHED SECURE NETWORK LINK WITH @${randomSkater2.toUpperCase()}`
        },
        {
          type: 'mission',
          title: 'UNDERGROUND GOAL SECURED',
          message: `@${randomSkater1.toUpperCase()} SOLVED MISSION "[${randomMission.toUpperCase()}]" AT ${randomSpot.toUpperCase()} (+${Math.floor(Date.now() % 300) + 200} XP)`
        },
        {
          type: 'level',
          title: 'SENSORY LEVEL ADVANCEMENT',
          message: `@${randomSkater1.toUpperCase()} SECURED TELEMETRY MATRIX & SHIFTED TO LEVEL ${Math.floor(Math.random() * 8) + 3}!`
        },
        {
          type: 'network',
          title: 'OUTLAW SIGNAL BROADCAST',
          message: `@${randomSkater1.toUpperCase()} AIR-LINKED A RAW VIDEO FEED FROM ${randomSpot.toUpperCase()} [${Math.floor(Math.random() * 20) + 80}% STYLE]`
        }
      ];

      const chosenEvent = events[Math.floor(Math.random() * events.length)];
      addNotification(chosenEvent.type, chosenEvent.title, chosenEvent.message);
      addTickerMessage(`[INTELLIGENCE INTERCEPT] ${chosenEvent.message}`);
    }, 35000); // Check every 35 seconds

    return () => clearInterval(ambientInterval);
  }, [currentUser]);

  // ==========================================
  // Dynamic Challenges Sync
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const challengesCol = collection(db, 'challenges');
    const qChallenges = query(
      challengesCol, 
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(qChallenges, (snapshot) => {
      const list: DynamicChallenge[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DynamicChallenge);
      });
      setPersonalChallenges(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'challenges');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // GPS Location update trigger
  // ==========================================
  useEffect(() => {
    if (!currentUser || !selectedSpot || !profile) return;
    
    // Save live location to player document
    const activeLoc: ActiveLocation = {
      districtId: currentDistrictId,
      districtName: currentDistrict.name,
      spotName: selectedSpot.name,
      coords: selectedSpot.coords,
      coordinatesString: currentDistrict.coordinates
    };

    updateLocation(currentUser.uid, activeLoc);
  }, [selectedSpot, currentDistrictId]);

  // Sound control
  const toggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    sounds.setMute(nextState);
    sounds.playTick();
  };

  // Switch district handler
  const handleDistrictChange = (id: string) => {
    sounds.playRadarSweep();
    setCurrentDistrictId(id);
    const targetDistrict = combinedDistricts[id] || DISTRICTS.ACC;
    setSelectedSpot(targetDistrict.spots[0]);
    setSelectedSpotForUpload(targetDistrict.spots[0].name);
    addTickerMessage(`COORDINATE SCANNER MOUNTED: [${targetDistrict.id}] SECTOR SECURED`);
  };

  // Clock ticks
  useEffect(() => {
    const updateTime = () => {
      try {
        const d = new Date();
        const options: Intl.DateTimeFormatOptions = {
          timeZone: currentDistrict.timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        };
        const formatter = new Intl.DateTimeFormat([], options);
        setTimeString(formatter.format(d));
      } catch (e) {
        setTimeString(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [currentDistrictId, currentDistrict.timezone]);

  // Add notification inside live tickers dashboard
  const addTickerMessage = (msg: string) => {
    const formattedMsg = `[${new Date().toLocaleTimeString()}] ${msg.toUpperCase()}`;
    setTickers(prev => [formattedMsg, ...prev.slice(0, 5)]);
  };

  // Atomic Stoke upload voting transaction
  const handleLikeUpload = async (uploadId: string) => {
    if (!currentUser) return;
    sounds.playTick();
    try {
      const outcome = await toggleLikeTrickUpload(uploadId, currentUser.uid);
      if (outcome.liked) {
        setProfile(prev => {
          if (!prev) return null;
          return { ...prev, reputation: prev.reputation + 20 };
        });
        addTickerMessage(`STOKE ALLOCATED: XP (+20 XP) BOOST GAINED FOR CASTING SUPPORT`);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  // Unique permalink share handler
  const handleShareUpload = (feedItemId: string) => {
    // Generate a beautiful, unique permalink matching the live preview URL or system origin
    const permalink = `${window.location.origin}${window.location.pathname}?feedId=${feedItemId}`;
    navigator.clipboard.writeText(permalink).then(() => {
      sounds.playTick();
      addTickerMessage(`PERMALINK SYNCHRONIZED TO CLIPBOARD: ${permalink}`);
      setCopiedFeedId(feedItemId);
      setTimeout(() => {
        setCopiedFeedId(null);
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy share permalink:", err);
    });
  };

  // Delete trick clip upload
  const handleDeleteClip = async (uploadId: string) => {
    if (!currentUser) return;
    sounds.playTick();
    if (!window.confirm("ARE YOU SURE YOU WANT TO PERMANENTLY REMOVE YOUR SKATE CLIP BROADCAST?")) {
      return;
    }
    try {
      const outcome = await deleteTrickClip(uploadId);
      if (outcome) {
        addTickerMessage("OUTLAW TAPE CLEARED: SHRED BROADCAST SILENCED");
        addNotification('system', 'CLIP SCRUBBED', 'YOUR DISPATCH HAS BEEN CLEARED OF ALL RECORDS.');
      }
    } catch (e) {
      console.error("Error deleting trick clip:", e);
    }
  };

  // Submit a comment to a trick upload
  const handleAddComment = async (feedId: string) => {
    if (!currentUser) return;
    const text = commentInputs[feedId]?.trim();
    if (!text) return;

    sounds.playSelect();
    setSubmittingComment(prev => ({ ...prev, [feedId]: true }));
    try {
      const handle = profile?.handle || "nomad";
      await addCommentToTrickUpload(feedId, currentUser.uid, handle, text);
      setCommentInputs(prev => ({ ...prev, [feedId]: '' }));
      addTickerMessage(`TRANSMIND BROADCAST: COMMENT POSTED ON OUTLAW STUNT`);
    } catch (err: any) {
      console.error(err);
      addTickerMessage(`OUTLAW SATELLITE BLOCKED: TRANS-BROADCAST COMMENTS SYSTEM FAILURE`);
    } finally {
      setSubmittingComment(prev => ({ ...prev, [feedId]: false }));
    }
  };

  // Radar Scanner function simulates scanning dynamic challenge indicators
  const startRadarSweep = () => {
    if (radarScanning) return;
    sounds.playRadarSweep();
    setRadarScanning(true);
    addTickerMessage(`GRID GPS SWEEP: DETECTING WIRELESS PATROL PINGS IN ${currentDistrict.name.toUpperCase()}...`);
    
    setTimeout(() => {
      setRadarScanning(false);
      const scanXp = Math.floor(Math.random() * 80) + 40;
      if (profile && currentUser) {
        const updatedRep = profile.reputation + scanXp;
        updateReputationAndLevel(currentUser.uid, scanXp, profile.reputation, profile.level);
        setProfile(prev => prev ? { ...prev, reputation: updatedRep } : null);
      }
      addTickerMessage(`SWEEP REVEALED UNSTABLE INTERCEPT SIGNALS! REWARDED (+${scanXp} XP)`);
      sounds.playTrickSuccess();
    }, 1800);
  };

  // Outlaw Challenge engine submit: dynamically generates random spot challenges
  const handleTriggerChallengeGenerator = async () => {
    if (!currentUser || !profile) return;
    sounds.playSelect();
    setIsGeneratingChallenge(true);
    addTickerMessage("OUTLAW ENGINE: DECODING SPECTRAL PATROL FREQUENCIES...");

    try {
      // Pick random spot from current active list
      const randomSpot = currentDistrict.spots[Math.floor(Math.random() * currentDistrict.spots.length)];
      
      const newChallenge = await generateNewPersonalChallenge(
        currentUser.uid,
        profile.level,
        randomSpot.name,
        randomSpot.difficulty,
        currentDistrictId
      );

      setIsGeneratingChallenge(false);
      sounds.playTrickSuccess();
      addTickerMessage(`NEW PERSONAL ESCAPE GOAL ENGAGED: "${newChallenge.title.toUpperCase()}"`);
    } catch (e: any) {
      setIsGeneratingChallenge(false);
      console.error(e);
    }
  };

  // Solve Challenge
  const handleCompleteOutlawChallenge = async (ch: DynamicChallenge) => {
    if (!currentUser || !profile) return;
    sounds.playTrickSuccess();
    addTickerMessage(`UPLOADING VERIFIED ENCRYPTED PING FOR [${ch.title.toUpperCase()}]`);
    addNotification('mission', 'PERSONAL CHALLENGE TRANSMITTED', `SUBMITTED PROOF FOR: [${ch.title.toUpperCase()}] (+${ch.xpReward} XP REWARD)`);

    try {
      await completeChallenge(ch.id);
      
      // Calculate level transition limits
      const updatedTotal = profile.reputation + ch.xpReward;
      const levelBreakpoints = Math.floor(updatedTotal / 1000) + 1;
      let newBadgesArray = [...profile.badges];
      
      if (levelBreakpoints > profile.level) {
        newBadgesArray.push(`nomad_level_${levelBreakpoints}`);
        addTickerMessage(`SENSORY LEVEL SHIFT! SKATER NOMAD RANKED TO ${levelBreakpoints}`);
        addNotification('level', 'SENSORY LEVEL SHIFT', `CONGRATS! G.P.S SECTOR SIGNALS SECURED. YOU RANKED UP TO LEVEL ${levelBreakpoints}!`);
      }

      const outcome = await updateReputationAndLevel(currentUser.uid, ch.xpReward, profile.reputation, profile.level, newBadgesArray);
      
      const todayStr = getTodayDateString();
      const lastUpdate = profile.lastStreakUpdate;
      let newStreak = profile.dailyStreak || 0;

      if (lastUpdate !== todayStr) {
        if (lastUpdate === getYesterdayDateString()) {
          newStreak = (profile.dailyStreak || 0) + 1;
        } else {
          newStreak = 1;
        }
        
        try {
          await updatePlayerStreak(currentUser.uid, newStreak, todayStr, !!currentUser.isGuest);
          if (currentUser.isGuest) {
            const cached = localStorage.getItem('moonsurfers_guest_profile');
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.dailyStreak = newStreak;
              parsed.lastStreakUpdate = todayStr;
              parsed.updatedAt = new Date().toISOString();
              localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(parsed));
            }
          }
          addTickerMessage(`DAILY STREAK ADVANCED! ${newStreak} DAY FIRE STATUS ACTIVE 🔥`);
          addNotification('mission', 'DAILY LOGIN STREAK ADVANCED', `${newStreak} DAY FIRE STATUS ACTIVE! TRACKING UNDERGROUND ENCOUNTERS 🔥`);
        } catch (streakErr) {
          console.warn("Could not sync daily streak:", streakErr);
        }
      } else {
        addTickerMessage(`DAILY GOAL SECURED FOR TODAY! STREAK REMAINS AT ${newStreak} 🔥`);
        addNotification('mission', 'DAILY STATUS ACTIVE', `TODAY'S SECTOR GOALS SECURED. CURRENT STREAK: ${newStreak} DAYS 🔥`);
      }

      setProfile(prev => {
        if (!prev) return null;
        return { 
          ...prev, 
          reputation: updatedTotal, 
          level: outcome.level,
          badges: Array.from(new Set([...prev.badges, ...newBadgesArray])),
          dailyStreak: newStreak,
          lastStreakUpdate: todayStr
        };
      });

    } catch (e) {
      console.error(e);
    }
  };

  const handleAwardWeeklyXp = async (xpAmount: number, challengeTitle: string) => {
    if (!currentUser || !profile) return;
    try {
      addTickerMessage(`SOLVED WEEKLY OBJECTIVE: [${challengeTitle.toUpperCase()}]`);
      addNotification('mission', 'WEEKLY OBJECTIVE SOLIDIFIED', `SOLVED: [${challengeTitle.toUpperCase()}] (+${xpAmount} XP ALLOCATED!)`);
      
      const updatedTotal = profile.reputation + xpAmount;
      const levelBreakpoints = Math.floor(updatedTotal / 1000) + 1;
      let newBadgesArray = [...profile.badges];
      
      if (levelBreakpoints > profile.level) {
        newBadgesArray.push(`nomad_level_${levelBreakpoints}`);
        addTickerMessage(`SENSORY LEVEL SHIFT! SKATER NOMAD RANKED TO ${levelBreakpoints}`);
        addNotification('level', 'SENSORY LEVEL SHIFT', `CONGRATS! G.P.S SECTOR SIGNALS SECURED. YOU RANKED UP TO LEVEL ${levelBreakpoints}!`);
      }

      await updateReputationAndLevel(currentUser.uid, xpAmount, profile.reputation, profile.level, newBadgesArray);
      
      setProfile(prev => prev ? {
        ...prev,
        reputation: updatedTotal,
        level: levelBreakpoints > profile.level ? levelBreakpoints : prev.level,
        badges: Array.from(new Set([...prev.badges, ...newBadgesArray]))
      } : null);
    } catch (err: any) {
      console.error("Failed to award weekly XP:", err);
      addTickerMessage("OUTLAW LINK ERROR: TRANSACTION DROP");
    }
  };

  // ==========================================
  // GPS & Real-Time Shred Actions
  // ==========================================
  const startGpsTracking = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser");
      return;
    }

    sounds.playRadarSweep();
    setIsGpsLoading(true);
    setGpsError(null);

    // Watch position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setIsGpsLoading(false);
        setGpsActive(true);
        const { latitude, longitude } = pos.coords;
        setGpsCoords({ latitude, longitude });
        updateProfileGPS(latitude, longitude);
      },
      (err) => {
        setIsGpsLoading(false);
        setGpsError(`GPS access blocked: ${err.message}. Enabling Local Simulated Sat-relay!`);
        enableSimulatedGps();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    setGpsWatchId(watchId);
    setShredSessionActive(true);
    addTickerMessage("GPS SATELLITE RADAR CONNECTED: SHRED RUN INITIALIZED");
  };

  const stopGpsTracking = async () => {
    sounds.playSelect();
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      setGpsWatchId(null);
    }
    setGpsActive(false);
    setGpsCoords(null);

    // Save earned session points
    if (shredSessionActive && sessionPoints > 0 && currentUser && profile) {
      const finalXp = sessionPoints;
      addTickerMessage(`SHRED COMPLETED: ACCUMULATED +${finalXp} SOCIAL STUNT XP!`);
      
      try {
        const updatedTotal = profile.reputation + finalXp;
        const levelBreakpoints = Math.floor(updatedTotal / 1000) + 1;
        let newBadgesArray = [...profile.badges];
        
        if (levelBreakpoints > profile.level) {
          newBadgesArray.push(`nomad_level_${levelBreakpoints}`);
          addTickerMessage(`SENSORY LEVEL SHIFT! SKATER NOMAD RANKED TO ${levelBreakpoints}`);
        }

        await updateReputationAndLevel(currentUser.uid, finalXp, profile.reputation, profile.level, newBadgesArray);
        
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            reputation: updatedTotal,
            level: levelBreakpoints,
            badges: newBadgesArray
          };
        });
        sounds.playTrickSuccess();
      } catch (err) {
        console.error("Failed to commit final session XP:", err);
      }
    }

    setShredSessionActive(false);
    addTickerMessage("GPS RADAR STANDBY: RUN RE-STOWED");
  };

  const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  // Real-time distance check for nearby skaters
  useEffect(() => {
    if (!gpsActive || !gpsCoords || !currentUser || !profile) return;

    // Filter to other skaters in the same district
    const prospects = allSkaters.filter(
      (sk) => sk.id !== currentUser.uid && sk.activeLocation?.districtId === currentDistrictId
    );

    prospects.forEach((sk) => {
      const coords = sk.activeLocation?.coords;
      if (!coords) return;
      const otherGps = getSpotGpsCoords(coords, currentDistrictId);
      const distance = getDistanceInMeters(
        gpsCoords.latitude,
        gpsCoords.longitude,
        otherGps.lat,
        otherGps.lng
      );

      // If within 500 meters
      if (distance <= 500) {
        setNotifiedSkaters((prev) => {
          const now = Date.now();
          const lastNotified = prev[sk.id] || 0;
          // Notify only once every 60 seconds per skater to prevent ticker flooding
          if (now - lastNotified > 60000) {
            addTickerMessage(
              `⚡ GPS PROXIMITY ALERT: SKATER @${sk.handle.toUpperCase()} DETECTED WITHIN RANGE (${distance}m) IN SECTOR ${currentDistrictId}!`
            );
            sounds.playSelect();
            return { ...prev, [sk.id]: now };
          }
          return prev;
        });
      }
    });
  }, [gpsActive, gpsCoords, allSkaters, currentDistrictId]);

  // Filtered spots for rendering cleanly on the tactical map HUD
  const filteredMapSpots = useMemo(() => {
    // If the display filter is 'users', we show ZERO spots on the map
    if (mapDisplayFilter === 'users') {
      return [];
    }

    const spots = currentDistrict.spots;

    // Filter by distance if GPS is active, self location points to active district coordinates, and distance selected is > 0
    const userCoords = profile?.activeLocation?.coords;
    if (gpsActive && userCoords && mapDistanceFilter > 0) {
      return spots.filter(spot => {
        const distPx = Math.sqrt(Math.pow(spot.coords.x - userCoords.x, 2) + Math.pow(spot.coords.y - userCoords.y, 2));
        const distM = distPx * 2.5;
        return distM <= mapDistanceFilter;
      });
    }

    return spots;
  }, [currentDistrict.spots, mapDisplayFilter, mapDistanceFilter, gpsActive, profile]);

  // Filtered other active skaters based on user selection & range filters
  const filteredMapSkaters = useMemo(() => {
    // If display filter is 'spots', we show ZERO skaters on the map
    if (mapDisplayFilter === 'spots') {
      return [];
    }

    let skaters = allSkaters.filter(
      sk => sk.id !== currentUser?.uid && sk.activeLocation?.districtId === currentDistrictId
    );

    // Apply distance filter if GPS is active, self location is set, and distance filter > 0
    const userCoords = profile?.activeLocation?.coords;
    if (gpsActive && userCoords && mapDistanceFilter > 0) {
      skaters = skaters.filter(sk => {
        const coords = getSkaterCoords(sk);
        if (!coords) return false;
        const distPx = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2));
        const distM = distPx * 2.5;
        return distM <= mapDistanceFilter;
      });
    }

    return skaters;
  }, [allSkaters, currentUser, currentDistrictId, mapDisplayFilter, mapDistanceFilter, gpsActive, profile]);

  // Clustering engine: group skaters closely situated to guarantee clean maps even with massive user volumes
  const mappedSkatersOrClusters = useMemo(() => {
    const clusters: Array<{
      id: string;
      isCluster: boolean;
      coords: { x: number; y: number };
      skaters: SkateProfile[];
    }> = [];

    const clusterRadius = 24; // Group skaters within 24 units on the grid

    filteredMapSkaters.forEach(sk => {
      const coords = getSkaterCoords(sk);
      if (!coords) return;

      // Find an existing cluster close enough
      const foundCluster = clusters.find(c => {
        const dist = Math.sqrt(Math.pow(c.coords.x - coords.x, 2) + Math.pow(c.coords.y - coords.y, 2));
        return dist < clusterRadius;
      });

      if (foundCluster) {
        foundCluster.skaters.push(sk);
        foundCluster.isCluster = true;
      } else {
        clusters.push({
          id: `cluster-${sk.id}`,
          isCluster: false,
          coords: { x: coords.x, y: coords.y },
          skaters: [sk]
        });
      }
    });

    return clusters;
  }, [filteredMapSkaters]);

  const enableSimulatedGps = () => {
    setGpsActive(true);
    const center = combinedGps[currentDistrictId] || combinedGps.ACC;
    setGpsCoords({ latitude: center.lat, longitude: center.lon });
    updateProfileGPS(center.lat, center.lon);
    setShredSessionActive(true);
  };

  const getSelectedSpotDistance = () => {
    if (!gpsCoords || !selectedSpot) return null;
    
    const center = combinedGps[currentDistrictId] || combinedGps.ACC;
    const scale = 3000;
    
    // Reverse project spot coords to GPS lat/lon
    const spotDeltaLon = (selectedSpot.coords.x - 200) / scale;
    const spotDeltaLat = (150 - selectedSpot.coords.y) / scale;
    
    const spotLat = center.lat + spotDeltaLat;
    const spotLon = center.lon + spotDeltaLon;
    
    const distanceVal = getDistanceInMeters(
      gpsCoords.latitude, 
      gpsCoords.longitude, 
      spotLat, 
      spotLon
    );
    return distanceVal;
  };

  const projectGpsToMapCoords = (lat: number, lon: number, districtId: string) => {
    const center = combinedGps[districtId] || combinedGps.ACC;
    const scale = 3000;
    
    const deltaLat = lat - center.lat;
    const deltaLon = lon - center.lon;
    
    const mapX = deltaLon * scale + 200;
    const mapY = 150 - deltaLat * scale;
    
    return { x: mapX, y: mapY };
  };

  const getSpotGpsCoords = (spotCoords: { x: number; y: number }, districtId: string) => {
    const center = combinedGps[districtId] || combinedGps.ACC;
    const scale = 3000;
    
    const spotDeltaLon = (spotCoords.x - 200) / scale;
    const spotDeltaLat = (150 - spotCoords.y) / scale;
    
    return {
      lat: center.lat + spotDeltaLat,
      lng: center.lon + spotDeltaLon
    };
  };



  const handleSendChatMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentUser || !selectedLiveSkater || !profile) return;
    
    sounds.playTick();
    const txt = chatInput;
    setChatInput('');

    if (COM_LINK_FROZEN) {
      const newMsg: ChatMessage = {
        id: `local_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        senderUid: currentUser.uid,
        senderHandle: profile.handle,
        receiverUid: selectedLiveSkater.id,
        text: txt,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any
      };
      const updated = [...allDirectMessages, newMsg];
      setAllDirectMessages(updated);
      localStorage.setItem('moonsurfers_cached_direct_messages', JSON.stringify(updated));

      // Simulacra automated reply
      const targetName = selectedLiveSkater.handle || 'Nomad';
      setTimeout(() => {
        const replies = [
          `📡 SIGNAL RESPONDED: Yo @${profile.handle}, heavy steeze! Speed lines look clean.`,
          `📡 SIGNAL RESPONDED: Roger that outlaw skater. Moving to check the security patrol grids now.`,
          `📡 SIGNAL RESPONDED: Solid. Let's stack clips and sync the zine coordinates.`,
          `📡 SIGNAL RESPONDED: Locked. Watch the step-down ledger at the monument, guards are active!`,
          `📡 SIGNAL RESPONDED: Signal strong. Keep recording those tapes!`
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        const replyMsg: ChatMessage = {
          id: `local_reply_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          senderUid: selectedLiveSkater.id,
          senderHandle: targetName,
          receiverUid: currentUser.uid,
          text: randomReply,
          createdAt: { seconds: Math.floor(Date.now() / 1000) + 1, nanoseconds: 0 } as any
        };
        setAllDirectMessages(prev => {
          const next = [...prev, replyMsg];
          localStorage.setItem('moonsurfers_cached_direct_messages', JSON.stringify(next));
          return next;
        });
        sounds.playRadarSweep();
        addTickerMessage(`[INBOUND SIGNAL] REPLY FROM @${targetName.toUpperCase()}`);
      }, 1200);
      return;
    }

    try {
      await sendDirectMessage(
        currentUser.uid,
        profile.handle,
        selectedLiveSkater.id,
        txt
      );
    } catch (err) {
      console.error("Error sending encrypted communication message:", err);
    }
  };

  const handleSendInboxDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmChatInput.trim() || !currentUser || !selectedChatSkater || !profile) return;
    
    sounds.playTick();
    const txt = dmChatInput.trim();
    setDmChatInput('');

    if (COM_LINK_FROZEN) {
      const newMsg: ChatMessage = {
        id: `local_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        senderUid: currentUser.uid,
        senderHandle: profile.handle,
        receiverUid: selectedChatSkater.id,
        text: txt,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any
      };
      const updated = [...allDirectMessages, newMsg];
      setAllDirectMessages(updated);
      localStorage.setItem('moonsurfers_cached_direct_messages', JSON.stringify(updated));

      // Simulacra automated reply
      const targetName = selectedChatSkater.handle || 'Nomad';
      setTimeout(() => {
        const replies = [
          `📡 SIGNAL RESPONDED: Yo @${profile.handle}, heavy steeze! Speed lines look clean.`,
          `📡 SIGNAL RESPONDED: Roger that outlaw skater. Moving to check the security patrol grids now.`,
          `📡 SIGNAL RESPONDED: Solid. Let's stack clips and sync the zine coordinates.`,
          `📡 SIGNAL RESPONDED: Locked. Watch the step-down ledger at the monument, guards are active!`,
          `📡 SIGNAL RESPONDED: Signal strong. Keep recording those tapes!`
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        const replyMsg: ChatMessage = {
          id: `local_reply_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          senderUid: selectedChatSkater.id,
          senderHandle: targetName,
          receiverUid: currentUser.uid,
          text: randomReply,
          createdAt: { seconds: Math.floor(Date.now() / 1000) + 1, nanoseconds: 0 } as any
        };
        setAllDirectMessages(prev => {
          const next = [...prev, replyMsg];
          localStorage.setItem('moonsurfers_cached_direct_messages', JSON.stringify(next));
          return next;
        });
        sounds.playRadarSweep();
        addTickerMessage(`[INBOUND SIGNAL] REPLY FROM @${targetName.toUpperCase()}`);
      }, 1200);
      return;
    }

    try {
      await sendDirectMessage(
        currentUser.uid,
        profile.handle,
        selectedChatSkater.id,
        txt
      );
    } catch (err) {
      console.error("Error sending inbox communications message:", err);
    }
  };

  const handlePracticeSelectedTrick = (trick: any) => {
    if (practiceRunning) return;
    sounds.playSelect();
    setPracticeSelectedTrick(trick.name);
    setPracticeStepIndex(0);
    setPracticeLogs([
      `[INITIATING TELEMETRY LINK...]`,
      `[TARGET TRICK SELECTED: ${trick.name.toUpperCase()} // REW: ${trick.repReward} XP]`,
      `[CRITICAL SPEED ANGLING LOCATED: STREET ASSETS ON SENSORS...]`
    ]);
  };

  const executePracticeRun = async (trick: any) => {
    if (practiceRunning) return;
    setPracticeRunning(true);
    sounds.playRadarSweep();
    
    setPracticeLogs(prev => [...prev, `[⚡ SIMULATOR ENGINE IGNITION...]`]);
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    await sleep(700);
    setPracticeStepIndex(1);
    setPracticeLogs(prev => [...prev, `[0.4s] pop vector initialized: crouching low, weight centered...`]);
    sounds.playTick();
    
    await sleep(700);
    setPracticeStepIndex(2);
    setPracticeLogs(prev => [...prev, `[0.8s] execution phase: ${trick.steps[2].toLowerCase()}`]);
    sounds.playTick();
    
    await sleep(700);
    setPracticeStepIndex(3);
    setPracticeLogs(prev => [...prev, `[1.2s] gravitational float: altitude calculated, scanning concrete...`]);
    sounds.playTick();
    
    await sleep(800);
    
    // Simulate LANDING success rate
    // Easy: 80%, Medium: 65%, Hard: 45%, Expert: 25%
    let baseRate = 80;
    if (trick.difficulty === 'MEDIUM') baseRate = 65;
    if (trick.difficulty === 'HARD') baseRate = 45;
    if (trick.difficulty === 'EXPERT') baseRate = 25;
    
    // Level provides direct 5% boost per level above 1
    const playerLevel = profile?.level || 1;
    const finalRate = Math.min(95, baseRate + (playerLevel - 1) * 5);
    
    const roll = Math.floor(Math.random() * 100);
    const success = roll < finalRate;
    
    if (success) {
      sounds.playTrickSuccess();
      setPracticeLogs(prev => [
        ...prev,
        `[1.4s] SUCCESS! ${trick.name.toUpperCase()} landed perfectly on target bolts.`,
        `[REVENUE UNLOCKED: +${trick.repReward} XP INSTALLED TO PROFILE]`
      ]);
      
      // Award XP
      const xpAmount = trick.repReward;
      const updatedTotal = (profile?.reputation || 0) + xpAmount;
      if (currentUser && profile) {
        // Find if they need level up
        const nextLevelThreshold = profile.level * 1000;
        let newLevel = profile.level;
        if (updatedTotal >= nextLevelThreshold) {
          newLevel = profile.level + 1;
          setPracticeLogs(prev => [...prev, `[UPGRADE LEVEL VECTOR MATCHED: LEVEL ${newLevel} SECURED]`]);
        }
        
        await updateReputationAndLevel(currentUser.uid, xpAmount, profile.reputation, profile.level);
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            reputation: updatedTotal,
            level: newLevel
          };
        });
      } else {
        // Local state upgrade for Guest Skaters
        setProfile((prev: any) => {
          if (!prev) return null;
          const nextLevelThreshold = prev.level * 1000;
          let newLevel = prev.level;
          if (updatedTotal >= nextLevelThreshold) {
            newLevel = prev.level + 1;
          }
          return {
            ...prev,
            reputation: updatedTotal,
            level: newLevel
          };
        });
      }
    } else {
      sounds.playCrash();
      setPracticeLogs(prev => [
        ...prev,
        `[1.4s] SYSTEM CRITICAL: wheelbiting on concrete transition!`,
        `[WIPED OUT] Skater slipped out. Practice makes permanent. Try again!`
      ]);
    }
    
    setPracticeRunning(false);
  };

  const getCenterLatLng = () => {
    const val = combinedGps[currentDistrictId] || combinedGps.ACC;
    return { lat: val.lat, lng: val.lon };
  };

  const updateProfileGPS = async (lat: number, lon: number) => {
    if (!currentUser || !profile) return;
    const center = combinedGps[currentDistrictId] || combinedGps.ACC;
    
    // Project GPS delta onto our SVG 400x300 map
    const deltaLat = lat - center.lat;
    const deltaLon = lon - center.lon;
    
    const scale = 3000; 
    let mapX = 200 + (deltaLon * scale);
    let mapY = 150 - (deltaLat * scale);
    
    // Clamp to map boundaries
    mapX = Math.max(30, Math.min(370, mapX));
    mapY = Math.max(30, Math.min(270, mapY));
    
    const latStr = lat >= 0 ? `${lat.toFixed(5)}° N` : `${Math.abs(lat).toFixed(5)}° S`;
    const lonStr = lon >= 0 ? `${lon.toFixed(5)}° E` : `${Math.abs(lon).toFixed(5)}° W`;
    
    const activeLoc: ActiveLocation = {
      districtId: currentDistrictId,
      districtName: currentDistrict.name,
      spotName: `GPS SATELLITE LOC`,
      coords: { x: Math.round(mapX), y: Math.round(mapY) },
      coordinatesString: `${latStr}, ${lonStr}`
    };
    
    await updateLocation(currentUser.uid, activeLoc);
    setProfile(prev => prev ? { ...prev, activeLocation: activeLoc } : null);
  };

  // Perform simulated movement clicks on map area
  const handleMapClickSimulateGps = (xVal: number, yVal: number) => {
    if (!gpsActive || !currentUser || !profile) return;
    sounds.playTick();
    
    // Reverse project screen x, y to Lat/Lon
    const center = combinedGps[currentDistrictId] || combinedGps.ACC;
    
    const scale = 3000;
    const deltaLon = (xVal - 200) / scale;
    const deltaLat = (150 - yVal) / scale;
    
    const targetLat = center.lat + deltaLat;
    const targetLon = center.lon + deltaLon;
    
    setGpsCoords({ latitude: targetLat, longitude: targetLon });
    updateProfileGPS(targetLat, targetLon);
    addTickerMessage(`SKATE RUN TRAVELLED TO: ${targetLat.toFixed(5)}, ${targetLon.toFixed(5)}`);
  };

  // Map dragging handlers & utilities
  const handleMapMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      (e.target as HTMLElement).closest('button') || 
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('g.cursor-pointer')
    ) {
      return;
    }
    setIsDraggingMap(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    setDragStartMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingMap) return;
    const maxPanX = 200 * (zoomScale - 1);
    const maxPanY = 150 * (zoomScale - 1);
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setPanOffset({
      x: Math.max(-maxPanX - 40, Math.min(maxPanX + 40, newX)),
      y: Math.max(-maxPanY - 40, Math.min(maxPanY + 40, newY))
    });
  };

  const handleMapMouseUpOrLeave = () => {
    touchStartDistanceRef.current = null;
    if (!isDraggingMap) return;
    setIsDraggingMap(false);
    const maxPanX = 200 * (zoomScale - 1);
    const maxPanY = 150 * (zoomScale - 1);
    setPanOffset(prev => ({
      x: Math.max(-maxPanX, Math.min(maxPanX, prev.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, prev.y))
    }));
  };

  const handleMapTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Initiate pinch zoom state
      setIsDraggingMap(false);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      touchStartDistanceRef.current = distance;
      touchStartZoomRef.current = zoomScale;
    } else if (e.touches.length === 1) {
      if (
        (e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('g.cursor-pointer')
      ) {
        return;
      }
      setIsDraggingMap(true);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y });
      setDragStartMouse({ x: touch.clientX, y: touch.clientY });
    }
  };

  const handleMapTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistanceRef.current !== null) {
      // Multi-touch fluid pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      const ratio = distance / touchStartDistanceRef.current;
      const nextScale = Math.min(Math.max(touchStartZoomRef.current * ratio, 1), 4);
      setZoomScale(nextScale);
    } else if (isDraggingMap && e.touches.length === 1) {
      const maxPanX = 200 * (zoomScale - 1);
      const maxPanY = 150 * (zoomScale - 1);
      const touch = e.touches[0];
      const newX = touch.clientX - dragStart.x;
      const newY = touch.clientY - dragStart.y;
      setPanOffset({
        x: Math.max(-maxPanX - 40, Math.min(maxPanX + 40, newX)),
        y: Math.max(-maxPanY - 40, Math.min(maxPanY + 40, newY))
      });
    }
  };

  const handleMapWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 0.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoomScale(prev => {
      const nextScale = Math.min(Math.max(prev + direction * zoomFactor, 1), 4);
      return nextScale;
    });
  };

  const handleZoomIn = () => {
    sounds.playTick();
    setZoomScale(prev => {
      const next = Math.min(prev + 0.5, 4);
      addTickerMessage(`MAP ZOOM MAGNIFICATION ADJUSTED: ${next.toFixed(1)}X`);
      return next;
    });
  };

  const handleZoomOut = () => {
    sounds.playTick();
    setZoomScale(prev => {
      const next = Math.max(prev - 0.5, 1);
      const maxPanX = 200 * (next - 1);
      const maxPanY = 150 * (next - 1);
      setPanOffset(p => ({
        x: Math.max(-maxPanX, Math.min(maxPanX, p.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, p.y))
      }));
      addTickerMessage(`MAP ZOOM SCALE RE-ALIGNED: ${next.toFixed(1)}X`);
      return next;
    });
  };

  const handleResetZoomPan = () => {
    sounds.playTick();
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    addTickerMessage("SATELLITE SECTOR MAP DISPLAY ALIGNMENT RESET");
  };

  // Launch a localized real-time stunt
  const handleTriggerLiveStunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !profile || !stuntText.trim()) return;
    
    sounds.playTrickSuccess();
    const displayMsg = `LANDED A HEAVY ${stuntText.trim().toUpperCase()}! 🔥`;
    addTickerMessage(`YOU: ${displayMsg}`);
    
    // Add bonus points directly
    setSessionPoints(prev => prev + 50);

    // Save trick landing on social network feed in real-time
    try {
      const distanceMeters = getSelectedSpotDistance() || Math.floor(Math.random() * 60) + 15;
      const calculatedStyle = Math.min(100, Math.max(45, 60 + (stuntText.length * 2) + Math.floor(Math.random() * 15)));

      await uploadTrickClip(
        currentUser.uid,
        profile.handle,
        currentDistrictId,
        selectedSpot.name,
        `[LIVE GPS RUN] ${displayMsg}`,
        false,
        "",
        "",
        distanceMeters,
        calculatedStyle
      );
    } catch (err) {
      console.error("Failed to stream live GPS stunt clip:", err);
    }
    setStuntText('');
  };

  // Helper to click-add friends from directories
  const handleAddDirectFriend = async (friendHandle: string) => {
    if (!currentUser || !profile) return;
    sounds.playTick();
    try {
      const outcome = await addFriend(currentUser.uid, friendHandle);
      if (outcome) {
        setProfile(prev => {
          if (!prev) return null;
          return { ...prev, friends: Array.from(new Set([...prev.friends, friendHandle.toLowerCase()])) };
        });
        addTickerMessage(`Skater Link Established: Linked with handle @${friendHandle}`);
        addNotification('link', 'SKATER LINK ESTABLISHED', `SECURE COM-LINK CONNECTED WITH INDEPENDENT SKATER @${friendHandle.toUpperCase()}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to click-remove friends from directories / profiles
  const handleRemoveDirectFriend = async (friendHandle: string) => {
    if (!currentUser || !profile) return;
    sounds.playTick();
    try {
      const outcome = await removeFriend(currentUser.uid, friendHandle);
      if (outcome) {
        setProfile(prev => {
          if (!prev) return null;
          return { ...prev, friends: prev.friends.filter(f => f.toLowerCase() !== friendHandle.toLowerCase()) };
        });
        addTickerMessage(`Skater Link Destroyed: Unlinked @${friendHandle}`);
        addNotification('link', 'SKATER LINK SEVERED', `SECURE COM-LINK CUT WITH SKATER @${friendHandle.toUpperCase()}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Add outlier friend handle by name
  const handleAddOutlawFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendInput.trim() || !currentUser || !profile) return;

    sounds.playTick();
    setFriendStatus(null);
    const rawInput = friendInput.trim().toLowerCase();

    if (rawInput === profile.handle.toLowerCase()) {
      setFriendStatus({ text: "Self friending blocked", success: false });
      return;
    }

    try {
      const outcome = await addFriend(currentUser.uid, rawInput);
      if (outcome) {
        setProfile(prev => {
          if (!prev) return null;
          return { ...prev, friends: Array.from(new Set([...prev.friends, rawInput])) };
        });
        setFriendStatus({ text: `@${rawInput} added successfully!`, success: true });
        addTickerMessage(`Skater Link Established: Linked with handle @${rawInput}`);
        addNotification('link', 'SKATER LINK ESTABLISHED', `SECURE COM-LINK CONNECTED WITH INDEPENDENT SKATER @${rawInput.toUpperCase()}`);
        setFriendInput('');
      } else {
        setFriendStatus({ text: "Handle not found in Skater Net", success: false });
      }
    } catch (e) {
      setFriendStatus({ text: "Error friending", success: false });
    }
  };

  // Social Trick Upload handleSubmit
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadText.trim() || !currentUser || !profile) return;

    sounds.playTick();
    setUploadAnimationRunning(true);
    addTickerMessage(`ZINE DISPATCH PROTOCOL: CONFLICTING CODES SECURED...`);

    try {
      const getSkateboardVideoForSpot = (spotName: string) => {
        const norm = (spotName || '').toLowerCase();
        if (norm.includes('wall') || norm.includes('castle')) {
          return "https://assets.mixkit.co/videos/preview/mixkit-skater-performing-a-kickflip-trick-40156-large.mp4";
        } else if (norm.includes('square') || norm.includes('gate') || norm.includes('independence')) {
          return "https://assets.mixkit.co/videos/preview/mixkit-skater-flying-on-a-curved-ramp-34283-large.mp4";
        } else if (norm.includes('pier') || norm.includes('fishing') || norm.includes('jamestown')) {
          return "https://assets.mixkit.co/videos/preview/mixkit-skateboarder-doing-tricks-in-a-park-34289-large.mp4";
        } else if (norm.includes('market') || norm.includes('makola') || norm.includes('mall') || norm.includes('park')) {
          return "https://assets.mixkit.co/videos/preview/mixkit-skateboard-doing-a-trick-in-slow-motion-34286-large.mp4";
        }
        return "https://assets.mixkit.co/videos/preview/mixkit-young-man-riding-skateboard-skate-park-41584-large.mp4";
      };

      let finalVideoUrl = "";
      const getStockAndFallback = () => getSkateboardVideoForSpot(selectedSpotForUpload);

      const distanceMeters = Math.floor(Math.random() * 120) + 40;
      const calculatedStyle = Math.min(100, Math.max(50, 65 + (uploadText.length % 15) + Math.floor(Math.random() * 20) + (selectedVideoFile ? 10 : 0)));

      const customClip = await uploadTrickClip(
        currentUser.uid,
        profile.handle,
        currentDistrictId,
        selectedSpotForUpload,
        uploadText,
        !!selectedVideoFile,
        selectedVideoFile ? "Zine telemetry signature verified. Gravity flip and landing rotation matches physical constraints." : "",
        "", // Wait to populate after server-side upload
        distanceMeters,
        calculatedStyle
      );

      if (selectedVideoFile && customClip && customClip.id) {
        await storeLocalVideo(customClip.id, selectedVideoFile);
        const objUrl = URL.createObjectURL(selectedVideoFile);
        setLocalVideoUrls(prev => ({ ...prev, [customClip.id]: objUrl }));

        try {
          // Send video base64 payload to server directory
          const uploadedUrl = await uploadVideoToServer(customClip.id, selectedVideoFile);
          if (uploadedUrl) {
            finalVideoUrl = uploadedUrl;
            await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: uploadedUrl }, { merge: true });
            customClip.videoUrl = uploadedUrl;
          } else {
            const stockUrl = getStockAndFallback();
            await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: stockUrl }, { merge: true });
            customClip.videoUrl = stockUrl;
          }
        } catch (srvErr) {
          console.error("Express upload error, falling back:", srvErr);
          const stockUrl = getStockAndFallback();
          await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: stockUrl }, { merge: true });
          customClip.videoUrl = stockUrl;
        }
      }


      // Give 250 XP reward for broadcasting to social zine
      const xpReward = 250;
      const updatedTotal = profile.reputation + xpReward;
      const progressLevel = Math.floor(updatedTotal / 1000) + 1;
      let newBadgesArray = [...profile.badges];

      if (progressLevel > profile.level) {
        newBadgesArray.push(`nomad_level_${progressLevel}`);
        addTickerMessage(`LEVEL COMMITTED! LEVEL ${progressLevel} SECURED`);
      }

      const outcome = await updateReputationAndLevel(currentUser.uid, xpReward, profile.reputation, profile.level, newBadgesArray);
      
      setProfile(prev => {
        if (!prev) return null;
        return { 
          ...prev, 
          reputation: updatedTotal, 
          level: outcome.level,
          badges: Array.from(new Set([...prev.badges, ...newBadgesArray]))
        };
      });

      setUploadText('');
      setSelectedVideoFile(null);
      setVideoPreviewUrl(null);
      setUploadAnimationRunning(false);
      setShowUploadModal(false);
      sounds.playTrickSuccess();
    } catch (err) {
      setUploadAnimationRunning(false);
      console.error(err);
    }
  };

  // Spot Mission verification processor
  const handleUploadMissionTape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missionSpot || !currentUser || !profile) return;
    
    sounds.playSelect();
    setAiAnalyzing(true);
    setCompleteSpotProgressPercent(0);
    setCompleteSpotProgressText("ESTABLISHING ENCRYPTED SECURE SECR_LINK CONNECTION...");

    const intervals = [
      { delay: 800, percent: 20, msg: "READING MP4 FILE METADATA & COMPILING SECTOR CODES..." },
      { delay: 1800, percent: 50, msg: `GEOLOCATING COUPLING: SPOT [${missionSpot.name.toUpperCase()}] SECURED...` },
      { delay: 3000, percent: 80, msg: "AI GRAVITY COM-LINK: VALIDATING LANDING ROTATION FREQUENCY..." },
      { delay: 4200, percent: 100, msg: "SYNCHRONIZING VERIFIED MISSION SCORE DECK REPUTATION..." }
    ];

    intervals.forEach(({ delay, percent, msg }) => {
      setTimeout(() => {
        setCompleteSpotProgressPercent(percent);
        setCompleteSpotProgressText(msg);
      }, delay);
    });

    // Save of telemetry logic at 100% (after 4500ms)
    setTimeout(async () => {
      try {
        const xpReward = 450;
        const spotSlug = missionSpot.name.toLowerCase().replace(/\s+/g, '_');
        const missionBadge = `mission_completed_${spotSlug}`;
        const updatedTotal = profile.reputation + xpReward;
        const progressLevel = Math.floor(updatedTotal / 1000) + 1;
        let newBadgesArray = [...profile.badges, missionBadge];

        if (progressLevel > profile.level) {
          newBadgesArray.push(`nomad_level_${progressLevel}`);
          addTickerMessage(`SENSORY NETWORK SHIFT: LEVEL ${progressLevel} NOMAD RANK SECURED!`);
        }

        const outcome = await updateReputationAndLevel(currentUser.uid, xpReward, profile.reputation, profile.level, newBadgesArray);
        
        const getSkateboardVideoForSpot = (spotName: string) => {
          const norm = (spotName || '').toLowerCase();
          if (norm.includes('wall') || norm.includes('castle')) {
            return "https://assets.mixkit.co/videos/preview/mixkit-skater-performing-a-kickflip-trick-40156-large.mp4";
          } else if (norm.includes('square') || norm.includes('gate') || norm.includes('independence')) {
            return "https://assets.mixkit.co/videos/preview/mixkit-skater-flying-on-a-curved-ramp-34283-large.mp4";
          } else if (norm.includes('pier') || norm.includes('fishing') || norm.includes('jamestown')) {
            return "https://assets.mixkit.co/videos/preview/mixkit-skateboarder-doing-tricks-in-a-park-34289-large.mp4";
          } else if (norm.includes('market') || norm.includes('makola') || norm.includes('mall') || norm.includes('park')) {
            return "https://assets.mixkit.co/videos/preview/mixkit-skateboard-doing-a-trick-in-slow-motion-34286-large.mp4";
          }
          return "https://assets.mixkit.co/videos/preview/mixkit-young-man-riding-skateboard-skate-park-41584-large.mp4";
        };

        let finalVideoUrl = "";
        const getStockAndFallback = () => getSkateboardVideoForSpot(missionSpot.name);

        const distanceMeters = getSelectedSpotDistance() || Math.floor(Math.random() * 80) + 90;
        const calculatedStyle = Math.floor(Math.random() * 15) + 85; // 85-100 style for official spot missions

        const customClip = await uploadTrickClip(
          currentUser.uid,
          profile.handle,
          currentDistrictId,
          missionSpot.name,
          spotMissionCaption || `[VERIFIED SPOT MISSION COMPLETED] Captured perfect mp4 line at ${missionSpot.name}!`,
          true,
          `AI Telemetry: Verified spot placement for ${missionSpot.name}. High-gravity spin rotation of 720 degrees detected and securely landed on concrete.`,
          "", // Wait to populate after server-side upload
          distanceMeters,
          calculatedStyle
        );

        if (selectedVideoFile && customClip && customClip.id) {
          await storeLocalVideo(customClip.id, selectedVideoFile);
          const objUrl = URL.createObjectURL(selectedVideoFile);
          setLocalVideoUrls(prev => ({ ...prev, [customClip.id]: objUrl }));

          try {
            const uploadedUrl = await uploadVideoToServer(customClip.id, selectedVideoFile);
            if (uploadedUrl) {
              finalVideoUrl = uploadedUrl;
              await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: uploadedUrl }, { merge: true });
              customClip.videoUrl = uploadedUrl;
            } else {
              const stockUrl = getStockAndFallback();
              await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: stockUrl }, { merge: true });
              customClip.videoUrl = stockUrl;
            }
          } catch (srvErr) {
            console.error("Express mission upload error, falling back:", srvErr);
            const stockUrl = getStockAndFallback();
            await setDoc(doc(db, 'trick_uploads', customClip.id), { videoUrl: stockUrl }, { merge: true });
            customClip.videoUrl = stockUrl;
          }
        }

        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            reputation: updatedTotal,
            level: outcome.level,
            badges: Array.from(new Set([...prev.badges, ...newBadgesArray]))
          };
        });

        sounds.playTrickSuccess();
        addTickerMessage(`SPOT CONTROL GRANTED: SECURED [${missionSpot.name.toUpperCase()}] TAPE RECORD!`);
        
        // Clean up states
        setSpotMissionCaption('');
        setSelectedVideoFile(null);
        setVideoPreviewUrl(null);
        setAiAnalyzing(false);
        setShowMissionModal(false);
        setShowSpotDetails(true);
      } catch (err) {
        setAiAnalyzing(false);
        console.error("Failed to complete spot mission:", err);
        addTickerMessage("SATELLITE COMPILATION OVERRIDE: FIREBASE NETWORK DESYNC");
      }
    }, 4500);
  };

  // ==========================================
  // Alleyway Rush Mini-Game Engine Loop
  // ==========================================
  const triggerGameStart = () => {
    sounds.playSelect();
    setShowGame(true);
    setGameState('playing');
    setGameScore(0);
  };

  const closeGame = () => {
    sounds.playTick();
    setShowGame(false);
    setGameState('idle');
  };

  useEffect(() => {
    if (!showGame || gameState !== 'playing' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let eleganceFrameId: number;
    let obstacleTimer = 0;
    
    // Joint particles array
    let particles: Array<{ x: number; y: number; vx: number; vy: number; color: string; life: number }> = [];

    // --- GAME 1: ALLEYWAY RUSH ---
    let skaterY = 160;
    let skaterVy = 0;
    const gravity = 0.6;
    const floorY = 160;
    let isJumping = false;
    let rotationAngle = 0;
    let flipText = '';
    let flipTextTimer = 0;
    let obstacles: Array<{ x: number; width: number; height: number; type: 'cone' | 'grate' | 'barrier'; passed?: boolean }> = [];
    let speed = 4;
    
    // --- GAME 2: RAIL SLIDE BALANCER ---
    let balanceX = 0; // -50 to +50
    let balanceSpeed = 0;
    let activeGrindName = '50-50 GRIND';
    let grindTrickTimer = 0;
    let railScoreTimer = 0;

    let score = 0;

    // Shadow trails for stunts
    let trail: Array<{ x: number; y: number; angle: number }> = [];

    const handleKeyPress = (e: KeyboardEvent) => {
      if (activeGameType === 'alley') {
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          triggerJump();
        }
        if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          triggerFlipTrick();
        }
      } else {
        // Rail Balance
        if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.code === 'KeyA' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          balanceSpeed -= 0.85;
          triggerSparks(60, 160);
        }
        if (e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.code === 'KeyD' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          balanceSpeed += 0.85;
          triggerSparks(60, 160);
        }
        if (e.code === 'Space' || e.key === ' ' || e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          triggerRailStunt();
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);

    const triggerJump = () => {
      if (!isJumping) {
        skaterVy = -10.0;
        isJumping = true;
        sounds.playTick();
        triggerSparks(60, floorY + 10);
      }
    };

    const triggerFlipTrick = () => {
      if (isJumping && rotationAngle === 0) {
        rotationAngle = 360;
        flipText = ['HEELFLIP', 'KICKFLIP', '360 TRANS', 'NOLLIE SPIN', 'STEEZE FLIP'][Math.floor(Math.random() * 5)];
        flipTextTimer = 40;
        score += 150;
        setGameScore(score);
        sounds.playTrickSuccess();
      }
    };

    const triggerRailStunt = () => {
      balanceSpeed += (Math.random() - 0.5) * 1.6; // kick balance off slightly
      activeGrindName = ['BOARDSLIDE', 'SMITH GRIND', 'CROOKED GRIND', '5-O SHIFT', 'NOSEBLUNT'][Math.floor(Math.random() * 5)];
      grindTrickTimer = 40;
      score += 200;
      setGameScore(score);
      sounds.playTrickSuccess();
      triggerSparks(60, 160, true);
    };

    const triggerSparks = (x: number, y: number, intense = false) => {
      const count = intense ? 15 : 6;
      for (let i = 0; i < count; i++) {
        particles.push({
          x,
          y,
          vx: -speed - (Math.random() * 2),
          vy: (Math.random() - 0.5) * 3,
          color: intense ? '#ef4444' : '#d4d4d8',
          life: 20 + Math.random() * 15
        });
      }
    };

    const canvasClickTrigger = (e: MouseEvent) => {
      if (activeGameType === 'alley') {
        if (!isJumping) {
          triggerJump();
        } else {
          triggerFlipTrick();
        }
      } else {
        // Tap screen in half sides or general click to center balance
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < rect.width / 2) {
          balanceSpeed -= 1.1;
        } else {
          balanceSpeed += 1.1;
        }
        triggerRailStunt();
      }
    };
    canvas.addEventListener('click', canvasClickTrigger);

    const update = () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw vector background grid lines (retro aesthetic vibe)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let j = 0; j < canvas.height; j += 20) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(canvas.width, j);
        ctx.stroke();
      }

      // Update Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      if (activeGameType === 'alley') {
        // --- ALLEY RUSH UPDATE & RENDER ---
        
        // Parallax line scrolling retro skyline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, floorY + 24);
        ctx.lineTo(canvas.width, floorY + 24);
        ctx.stroke();

        skaterVy += gravity;
        skaterY += skaterVy;

        if (skaterY >= floorY) {
          skaterY = floorY;
          skaterVy = 0;
          isJumping = false;
          rotationAngle = 0;
          if (Math.random() < 0.25) {
            triggerSparks(60, floorY + 5);
          }
        }

        if (rotationAngle > 0) {
          rotationAngle -= 10;
        }

        // Draw shadow trail when pulling flip tricks
        if (isJumping && rotationAngle > 0) {
          trail.push({ x: 60, y: skaterY, angle: rotationAngle });
          if (trail.length > 5) trail.shift();
        } else {
          trail = [];
        }

        trail.forEach((t, index) => {
          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.rotate((t.angle * Math.PI) / 180);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.08 * (index + 1)})`;
          ctx.fillStyle = `rgba(0, 0, 0, ${0.1 * (index + 1)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.rect(-15, -4, 30, 6);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        // Draw skater
        ctx.save();
        ctx.translate(60, skaterY);
        if (rotationAngle > 0) {
          ctx.rotate((rotationAngle * Math.PI) / 180);
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#000000';
        
        // Deck
        ctx.beginPath();
        ctx.rect(-15, -4, 30, 6);
        ctx.fill();
        ctx.stroke();

        // Skater body
        ctx.beginPath();
        ctx.rect(-8, -24, 16, 20);
        ctx.fill();
        ctx.stroke();

        // Skater head
        ctx.beginPath();
        ctx.arc(0, -30, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();

        // Wheels
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-10, 4, 3, 0, Math.PI * 2);
        ctx.arc(10, 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Obstacles
        obstacleTimer++;
        if (obstacleTimer > Math.max(50, 95 - Math.floor(score / 300) * 5)) {
          obstacleTimer = 0;
          const types: ('cone' | 'grate' | 'barrier')[] = ['cone', 'grate', 'barrier'];
          const chosenType = types[Math.floor(Math.random() * 3)];
          
          let height = 15;
          let width = 12;
          if (chosenType === 'barrier') {
            height = 25;
            width = 18;
          } else if (chosenType === 'grate') {
            height = 6;
            width = 24;
          }

          obstacles.push({
            x: canvas.width + 20,
            width,
            height,
            type: chosenType
          });
        }

        for (let index = obstacles.length - 1; index >= 0; index--) {
          const obs = obstacles[index];
          obs.x -= speed;

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath();

          if (obs.type === 'cone') {
            ctx.moveTo(obs.x, floorY + 20);
            ctx.lineTo(obs.x + obs.width / 2, floorY + 20 - obs.height);
            ctx.lineTo(obs.x + obs.width, floorY + 20);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (obs.type === 'barrier') {
            ctx.rect(obs.x, floorY + 20 - obs.height, obs.width, obs.height);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.moveTo(obs.x + 4, floorY + 20 - obs.height + 4);
            ctx.lineTo(obs.x + obs.width - 4, floorY + 20 - 4);
            ctx.stroke();
          } else {
            ctx.rect(obs.x, floorY + 20 - obs.height, obs.width, obs.height);
            ctx.fill();
            ctx.stroke();
          }

          // Collisions
          const skaterLeft = 45;
          const skaterRight = 75;
          const skaterTop = skaterY - 34;
          const skaterBottom = skaterY + 6;

          const obsLeft = obs.x;
          const obsRight = obs.x + obs.width;
          const obsTop = floorY + 20 - obs.height;
          const obsBottom = floorY + 20;

          if (
            skaterRight > obsLeft && 
            skaterLeft < obsRight && 
            skaterBottom > obsTop && 
            skaterTop < obsBottom
          ) {
            sounds.playCrash();
            setGameState('crashed');
            setHighScore(prev => Math.max(prev, score));
            
            setTimeout(() => {
              if (score > 0 && currentUser && profile) {
                const crashScoreXp = Math.min(250, Math.floor(score * 0.5));
                const updatedTotal = profile.reputation + crashScoreXp;
                
                updateReputationAndLevel(currentUser.uid, crashScoreXp, profile.reputation, profile.level);
                setProfile(prev => prev ? { ...prev, reputation: updatedTotal } : null);
                addTickerMessage(`ARCADE RECORD SECURED (+${crashScoreXp} XP ALLOCATED) FOR GAMEPLAY STUNTS`);
              }
            }, 400);
            return;
          }

          if (obs.x + obs.width < 45 && !obs.passed) {
            obs.passed = true;
            score += 100;
            setGameScore(score);
            sounds.playTick();
          }

          if (obs.x < -40) {
            obstacles.splice(index, 1);
          }
        }

        speed = 4.5 + Math.floor(score / 500) * 0.6;

        if (flipTextTimer > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'italic 900 16px "Syne", sans-serif';
          ctx.fillText(`+150 ${flipText}!`, 55, floorY - 50);
          flipTextTimer--;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillText(`SCORE: ${score}`, 16, 26);
        ctx.fillText(`HI-SCORE: ${highScore}`, 16, 42);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px "Space Grotesk", sans-serif';
        ctx.fillText('CLICK / SPACE TO JUMP  |  CLICK AGAIN TO FLIP', 16, canvas.height - 12);

      } else {
        // --- RAIL BALANCER UPDATE & RENDER ---

        // Draw endless steel rail in the center of the viewport
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 164);
        ctx.lineTo(canvas.width, 164);
        ctx.stroke();

        ctx.strokeStyle = '#050505';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 165);
        ctx.lineTo(canvas.width, 165);
        ctx.stroke();

        // Increment gravity tilt forces over time to pull skater
        balanceSpeed += (Math.random() - 0.5) * 0.28 + (balanceX > 0 ? 0.05 : -0.05);
        balanceX += balanceSpeed;

        // Earn continuous points for staying balanced
        railScoreTimer++;
        if (railScoreTimer > 30) {
          railScoreTimer = 0;
          score += 20;
          setGameScore(score);
        }

        // Trigger continuous grinding sparks from the skateboard deck touching the metal rail
        if (Math.random() < 0.6) {
          triggerSparks(60 + (Math.random() - 0.5) * 10, 164, false);
        }

        // Draw Skateboard and Skatedude on the rail with a heavy lean/rotation representing balance offset
        ctx.save();
        ctx.translate(60, 158);
        ctx.rotate((balanceX * 0.5 * Math.PI) / 180);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#18181b';
        
        // Deck
        ctx.beginPath();
        ctx.rect(-15, -4, 30, 6);
        ctx.fill();
        ctx.stroke();

        // Leaning Body
        ctx.beginPath();
        ctx.rect(-6, -26, 12, 22);
        ctx.fill();
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(0, -32, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();

        // Hanging arms
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-6, -18);
        ctx.lineTo(-14, -14 + Math.sin(Date.now() / 150) * 4);
        ctx.moveTo(6, -18);
        ctx.lineTo(14, -14 - Math.sin(Date.now() / 150) * 4);
        ctx.stroke();

        ctx.restore();

        // Draw balance HUD meter at the top
        const meterY = 55;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(80, meterY);
        ctx.lineTo(canvas.width - 80, meterY);
        ctx.stroke();

        // Draw dangerous outer sections on the balance meter
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(80, meterY);
        ctx.lineTo(120, meterY);
        ctx.moveTo(canvas.width - 120, meterY);
        ctx.lineTo(canvas.width - 80, meterY);
        ctx.stroke();

        // Centered cursor indicator on the balance meter
        const midPoint = canvas.width / 2;
        const cursorX = midPoint + (balanceX / 50) * (midPoint - 100);
        
        ctx.fillStyle = Math.abs(balanceX) > 35 ? '#f43f5e' : '#10b981';
        ctx.beginPath();
        ctx.arc(cursorX, meterY, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Check crash conditions
        if (Math.abs(balanceX) >= 48) {
          sounds.playCrash();
          setGameState('crashed');
          setHighScore(prev => Math.max(prev, score));
          
          setTimeout(() => {
            if (score > 0 && currentUser && profile) {
              const crashScoreXp = Math.min(250, Math.floor(score * 0.5));
              const updatedTotal = profile.reputation + crashScoreXp;
              
              updateReputationAndLevel(currentUser.uid, crashScoreXp, profile.reputation, profile.level);
              setProfile(prev => prev ? { ...prev, reputation: updatedTotal } : null);
              addTickerMessage(`ARCADE RECORD SECURED (+${crashScoreXp} XP ALLOCATED) FOR GRIND BALANCING`);
            }
          }, 400);
          return;
        }

        // Render trick stoke titles
        if (grindTrickTimer > 0) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'italic 900 15px "Syne", sans-serif';
          ctx.fillText(`+200 XP ${activeGrindName}!`, 55, 115);
          grindTrickTimer--;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillText(`SCORE: ${score}`, 16, 26);
        ctx.fillText(`HI-SCORE: ${highScore}`, 16, 42);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px "Space Grotesk", sans-serif';
        ctx.fillText('A / D keys or Screen Left/Right to Balance | SPACE / F to Grind Shift', 16, canvas.height - 12);
      }

      if (gameState === 'playing') {
        eleganceFrameId = requestAnimationFrame(update);
      }
    };

    update();

    return () => {
      cancelAnimationFrame(eleganceFrameId);
      window.removeEventListener('keydown', handleKeyPress);
      canvas.removeEventListener('click', canvasClickTrigger);
    };
  }, [showGame, gameState, activeGameType]);

  // ==========================================
  // Render Loading / Authenticating state
  // ==========================================
  if (isInitializing) {
    return (
      <div className="min-h-screen w-full bg-[#050505] flex flex-col justify-center items-center font-mono space-y-4">
        <div className="w-12 h-12 border border-white/20 border-t-white animate-spin rounded-full"></div>
        <div className="text-white text-xs tracking-[0.3em] font-black uppercase">MOONSURFERS NETWORK SECURITY INITIALIZED...</div>
      </div>
    );
  }

  // Auth Landing Gate
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-center items-center p-4 md:p-6 relative font-outfit select-none border-4 md:border-[12px] border-white/5 overflow-y-auto font-mono">
        {/* VHS Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden mix-blend-color-dodge opacity-[0.12]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.30)_50%)] bg-[size:100%_4px]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,0,0,0.08),rgba(0,255,0,0.03),rgba(0,0,255,0.08))] bg-[size:3px_100%]" />
        </div>
        
        <div className="max-w-md w-full border border-white/20 bg-black p-6 md:p-8 space-y-6 shadow-2xl relative">
          <div className="text-center space-y-2">
            <span className="text-[9px] font-mono tracking-[0.4em] font-bold text-red-650 animate-pulse">CONNECT TYPE: MOONSURFERS PORT PORTAL 3.0</span>
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase outline-text font-syne hover:text-white transition-all">
              MOONSURFERS
            </h1>
            <p className="text-xs text-white/50 lowercase tracking-wide font-grotesk leading-relaxed">
              the global night-skate zine. track underbelly spot telemetry, unlock personalized outlaw missions, and stream raw footage.
            </p>
          </div>

          {/* Tab switches */}
          <div className="grid grid-cols-3 border border-white/10 font-mono text-center mb-4">
            <button
              type="button"
              onClick={() => { sounds.playSelect(); setAuthTab('login'); setAuthError(null); }}
              className={`py-2 text-[10px] tracking-widest font-black uppercase border-r border-white/10 transition-all cursor-pointer ${
                authTab === 'login' ? 'bg-white text-black font-extrabold' : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => { sounds.playSelect(); setAuthTab('signup'); setAuthError(null); }}
              className={`py-2 text-[10px] tracking-widest font-black uppercase border-r border-white/10 transition-all cursor-pointer ${
                authTab === 'signup' ? 'bg-white text-black font-extrabold' : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => { sounds.playSelect(); setAuthTab('guest'); setAuthError(null); }}
              className={`py-2 text-[10px] tracking-widest font-black uppercase transition-all cursor-pointer ${
                authTab === 'guest' ? 'bg-white text-black font-extrabold' : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              Guest
            </button>
          </div>

          {authTab === 'login' && (
            <form onSubmit={handleEmailPasswordSignIn} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">EMAIL ADDRESS</label>
                <input 
                  type="email"
                  required
                  placeholder="name@network.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white text-center rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">ACCESS KEY (PASSWORD)</label>
                <input 
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white text-center rounded-none"
                />
              </div>

              {authError && (
                <div className="border border-red-600/30 bg-red-950/10 text-red-500 font-mono text-[10px] p-2.5 text-center uppercase tracking-wide">
                  [SECURITY ERROR] {authError}
                </div>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full bg-white text-black font-black uppercase py-3.5 italic text-xs hover:bg-zinc-200 transition-colors font-syne relative tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {authLoading ? 'Verifying Credentials...' : 'Sign In to Protected Node'}
              </button>
            </form>
          )}

          {authTab === 'signup' && (
            <form onSubmit={handleEmailPasswordSignUp} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">1. OUTLAW HANDLE (CODENAME)</label>
                <input 
                  type="text"
                  required
                  placeholder="kotti_phantom"
                  value={joinHandle}
                  onChange={(e) => setJoinHandle(e.target.value.replace(/\s+/g, '_').toLowerCase().slice(0, 15))}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white uppercase text-center rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">2. EMAIL ADDRESS</label>
                <input 
                  type="email"
                  required
                  placeholder="surfer@net.io"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white text-center rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">3. KEY PHRASE (PASSWORD)</label>
                <input 
                  type="password"
                  required
                  placeholder="min 6 characters"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white text-center rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">4. CHOOSE DEPLOY SECTOR</label>
                <select
                  value={joinDistrict}
                  onChange={(e) => { sounds.playSelect(); setJoinDistrict(e.target.value); }}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-black font-grotesk p-3 outline-none focus:border-white text-white uppercase rounded-none cursor-pointer"
                >
                  {(Object.values(combinedDistricts) as any[]).map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name} [{d.id}]
                    </option>
                  ))}
                  <option value="OTHER">Other... [Enlist Custom Sector]</option>
                </select>
              </div>

              {joinDistrict === 'OTHER' && (
                <div className="border border-white/10 p-3 bg-zinc-950/40 space-y-3 font-mono text-[11px] animate-fade-in">
                  <div className="text-[9px] text-yellow-500 uppercase font-black tracking-wider mb-1">
                    [PROMPT] DEFINE RADAR SECTOR COORDINATES
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">Sector Code (3 Characters e.g. PAR)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. PAR"
                      value={newDistrictId}
                      onChange={(e) => setNewDistrictId(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                      className="bg-black border border-white/10 w-full uppercase py-1 px-2 block tracking-wider"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">District City / Location Name (e.g. Paris)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Paris"
                      value={newDistrictName}
                      onChange={(e) => setNewDistrictName(e.target.value)}
                      className="bg-black border border-white/10 w-full py-1 px-2 block"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">Coordinates String (lat, lon)</label>
                    <input 
                      type="text"
                      placeholder="48.8566° N, 2.3522° E"
                      value={newDistrictCoords}
                      onChange={(e) => setNewDistrictCoords(e.target.value)}
                      className="bg-black border border-white/10 w-full py-1 px-2 block"
                    />
                  </div>
                </div>
              )}

              {authError && (
                <div className="border border-red-600/30 bg-red-950/10 text-red-500 font-mono text-[10px] p-2.5 text-center uppercase tracking-wide">
                  [SECURITY ERROR] {authError}
                </div>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full bg-white text-black font-black uppercase py-4 italic text-sm hover:bg-zinc-200 transition-colors font-syne relative tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {authLoading ? 'Syncing Network...' : 'Enlist Protected Profile'}
              </button>
            </form>
          )}

          {authTab === 'guest' && (
            <form onSubmit={handleGuestSignUp} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">1. ENTER OUTLAW HANDLE (CODENAME)</label>
                <input 
                  type="text"
                  required
                  placeholder="kotti_phantom"
                  value={joinHandle}
                  onChange={(e) => setJoinHandle(e.target.value.replace(/\s+/g, '_').toLowerCase().slice(0, 15))}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-mono tracking-widest p-3 outline-none focus:border-white text-white uppercase text-center rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">2. CHOOSE DEPLOY SECTOR</label>
                <select
                  value={joinDistrict}
                  onChange={(e) => { sounds.playSelect(); setJoinDistrict(e.target.value); }}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-black font-grotesk p-3 outline-none focus:border-white text-white uppercase rounded-none cursor-pointer"
                >
                  {(Object.values(combinedDistricts) as any[]).map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name} [{d.id}]
                    </option>
                  ))}
                  <option value="OTHER">Other... [Enlist Custom Sector]</option>
                </select>
              </div>

              {joinDistrict === 'OTHER' && (
                <div className="border border-white/10 p-3 bg-zinc-950/40 space-y-3 font-mono text-[11px] animate-fade-in">
                  <div className="text-[9px] text-yellow-500 uppercase font-black tracking-wider mb-1">
                    [PROMPT] DEFINE RADAR SECTOR COORDINATES
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">Sector Code (3 Characters e.g. PAR)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. PAR"
                      value={newDistrictId}
                      onChange={(e) => setNewDistrictId(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                      className="bg-black border border-white/10 w-full uppercase py-1 px-2 block tracking-wider"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">District City / Location Name (e.g. Paris)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Paris"
                      value={newDistrictName}
                      onChange={(e) => setNewDistrictName(e.target.value)}
                      className="bg-black border border-white/10 w-full py-1 px-2 block"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">Coordinates String (lat, lon)</label>
                    <input 
                      type="text"
                      placeholder="48.8566° N, 2.3522° E"
                      value={newDistrictCoords}
                      onChange={(e) => setNewDistrictCoords(e.target.value)}
                      className="bg-black border border-white/10 w-full py-1 px-2 block"
                    />
                  </div>
                </div>
              )}

              {authError && (
                <div className="border border-red-600/30 bg-red-950/10 text-red-500 font-mono text-[10px] p-2.5 text-center uppercase tracking-wide">
                  [SECURITY ERROR] {authError}
                </div>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full bg-white text-black font-black uppercase py-4 italic text-xs hover:bg-zinc-200 transition-colors font-syne relative tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {authLoading ? 'Linking Outlaw...' : 'Enter as Outlaw Guest (Ephemeral)'}
              </button>
            </form>
          )}

          {/* Social login option */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <button 
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full border border-white/20 bg-white/5 hover:bg-white/10 text-white font-mono uppercase py-3 text-[9.5px] tracking-widest transition-all flex items-center justify-center gap-2 rounded-none cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-white/60" /> Secure via Google Federated Identity
            </button>
          </div>

          <div className="border-t border-white/10 pt-3 text-center block">
            <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-[0.2em] block">
              Secured under master ruleset 3.0 // zine telemetry off
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Signed in layout
  const spotList = currentDistrict.spots;
  const leaderboardRiders = currentDistrict.riders;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-outfit select-none border-2 md:border-4 border-white/5 relative uppercase-text shadow-xd max-w-full overflow-x-hidden">
      
      {/* REAL-TIME CYBERNETIC HUD NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full font-mono px-4 sm:px-0">
        <AnimatePresence>
          {notifications.map((n) => {
            // Pick corresponding icon and theme colors
            let icon = <Wifi className="w-4 h-4 text-emerald-400" />;
            let borderColor = 'border-emerald-500/30';
            let bgGlow = 'bg-emerald-950/20';
            let titleColor = 'text-emerald-400';

            if (n.type === 'link') {
              icon = <UserPlus className="w-4 h-4 text-cyan-400" />;
              borderColor = 'border-cyan-500/30';
              bgGlow = 'bg-cyan-950/20';
              titleColor = 'text-cyan-400';
            } else if (n.type === 'mission') {
              icon = <Award className="w-4 h-4 text-amber-400" />;
              borderColor = 'border-amber-500/30';
              bgGlow = 'bg-amber-950/20';
              titleColor = 'text-amber-400';
            } else if (n.type === 'level') {
              icon = <Zap className="w-4 h-4 text-purple-400 animate-pulse" />;
              borderColor = 'border-purple-500/40';
              bgGlow = 'bg-purple-950/25';
              titleColor = 'text-purple-400';
            } else if (n.type === 'network') {
              icon = <Radio className="w-4 h-4 text-rose-400 animate-pulse" />;
              borderColor = 'border-rose-500/30';
              bgGlow = 'bg-rose-950/20';
              titleColor = 'text-rose-400';
            } else if (n.type === 'system') {
              icon = <Activity className="w-4 h-4 text-zinc-450" />;
              borderColor = 'border-zinc-500/20';
              bgGlow = 'bg-zinc-950/20';
              titleColor = 'text-zinc-400';
            }

            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 80, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9, transition: { duration: 0.25 } }}
                transition={{ type: 'spring', stiffness: 320, damping: 25 }}
                onClick={() => handleNotificationClick(n)}
                className={`pointer-events-auto w-full border ${borderColor} ${bgGlow} backdrop-blur-md p-3.5 flex items-start gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.65)] relative overflow-hidden select-none cursor-pointer hover:scale-[1.015] hover:border-white/30 hover:brightness-110 active:scale-95 active:duration-75 duration-150 transition-all`}
              >
                {/* Horizontal scanner bar decorative animation */}
                <div className="absolute top-0 left-0 w-2 h-full bg-linear-to-b from-transparent via-white/20 to-transparent animate-pulse" />
                
                <div className="p-1.5 rounded-xs bg-black/40 border border-white/5 shrink-0">
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2.5 font-mono">
                    <span className={`text-[9.5px] font-black tracking-wider uppercase ${titleColor}`}>
                      {n.title}
                    </span>
                    <span className="text-[7.5px] text-zinc-500 font-medium shrink-0 font-mono">
                      {n.timestamp}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-relaxed font-mono lowercase mt-1 block">
                    {n.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotifications(prev => prev.filter(item => item.id !== n.id));
                  }}
                  className="text-zinc-500 hover:text-white transition-colors p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* HEADER BAR */}
      <header id="app-header" className="flex flex-col sm:flex-row items-center justify-between px-5 py-2.5 border-b border-white/10 gap-3 bg-black">
        <div id="brand-container" className="flex flex-col text-center sm:text-left">
          <span className="text-[8px] tracking-[0.25em] font-bold text-white/45 uppercase italic flex items-center justify-center sm:justify-start gap-1 font-grotesk whitespace-nowrap">
            <Flame className="w-3 h-3 text-red-500 animate-pulse" /> Outlaw Channel Streaming // Sector [{currentDistrictId}]
          </span>
          <h1 className="text-2xl md:text-3.5xl font-black tracking-tight leading-tight italic uppercase font-syne select-none cursor-default text-white hover:text-white/80 transition-all font-sans">
            MOONSURFERS
          </h1>
        </div>

        <div id="controls-panel" className="flex items-center justify-center sm:justify-end gap-2.5 sm:gap-4 flex-wrap select-none w-full sm:w-auto">
          {/* Sound toggle button */}
          <button 
            id="audio-mute-btn"
            onClick={toggleMute}
            className="w-10 h-10 border border-white/20 flex items-center justify-center rounded-sm hover:border-white transition-colors bg-white/5"
            title="Toggle Audio Feedback"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-white/50" /> : <Volume2 className="w-4 h-4 text-white animate-pulse" />}
          </button>

          {/* District Select Picker Dropdown */}
          <div id="district-picker" className="flex items-center bg-white/5 border border-white/20 px-3 py-1.5 rounded-sm">
            <span className="text-[10px] text-white/40 font-mono mr-2 uppercase">DEPLOY DISTRICT</span>
            <select
              value={currentDistrictId}
              onChange={(e) => {
                if (e.target.value === 'ADD_NEW_OTHER') {
                  sounds.playSelect();
                  setShowAddDistrictModal(true);
                } else {
                  handleDistrictChange(e.target.value);
                }
              }}
              className="bg-black text-white text-xs font-bold font-grotesk border-none outline-none focus:ring-0 cursor-pointer uppercase pr-2"
            >
              {(Object.values(combinedDistricts) as any[]).map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name} [{d.id}]
                </option>
              ))}
              <option value="ADD_NEW_OTHER">Other... [Deploy Custom Sector]</option>
            </select>
          </div>

          <div id="timezone-clock" className="text-right border-l border-white/10 pl-3.5 sm:pl-4">
            <div className="text-[8.5px] sm:text-[10px] uppercase tracking-widest text-white/40 font-mono">Local Sector Time</div>
            <div className="text-xs sm:text-xl font-mono leading-none font-bold text-white tracking-wider mt-0.5">{timeString}</div>
          </div>

          <div id="district-coordinates" className="text-right border-l border-white/10 pl-3.5 sm:pl-4">
            <div className="text-[8.5px] sm:text-[10px] uppercase tracking-widest text-white/40 font-mono">Coordinates G.P.S</div>
            <div className="text-[9px] sm:text-xs font-mono leading-none font-semibold mt-1 text-white">{currentDistrict.coordinates}</div>
          </div>

          <button 
            onClick={handleSignOut}
            className="w-10 h-10 border border-red-600/40 hover:border-red-600 flex items-center justify-center rounded-sm hover:bg-red-950/20 transition-colors"
            title="Terminate Connection"
          >
            <LogOut className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </header>

      {/* MOBILE-TABLET IMMERSIVE NAVIGATION DECK */}
      <div id="navigation-deck" className="lg:hidden bg-[#0a0a0a] border-b border-white/10 p-2 font-mono flex items-center justify-around gap-1.5 z-20">
        <button
          type="button"
          onClick={() => { sounds.playSelect(); setActiveMobileView('profile'); }}
          className={`flex-1 py-1.5 px-3 text-[9px] sm:text-[10px] tracking-widest font-black uppercase text-center border transition-all cursor-pointer rounded-xs ${
            activeMobileView === 'profile' 
              ? 'bg-red-600 text-white border-red-500 font-extrabold shadow-[0_0_10px_rgba(220,38,38,0.4)]' 
              : 'bg-black/60 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-900'
          }`}
        >
          Nomad
        </button>
        <button
          type="button"
          onClick={() => { sounds.playSelect(); setActiveMobileView('map'); }}
          className={`flex-1 py-1.5 px-3 text-[9px] sm:text-[10px] tracking-widest font-black uppercase text-center border transition-all cursor-pointer rounded-xs ${
            activeMobileView === 'map' 
              ? 'bg-red-600 text-white border-red-500 font-extrabold shadow-[0_0_10px_rgba(220,38,38,0.4)]' 
              : 'bg-black/60 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-900'
          }`}
        >
          Map HUD
        </button>
        <button
          type="button"
          onClick={() => { sounds.playSelect(); setActiveMobileView('challenges'); }}
          className={`flex-1 py-1.5 px-3 text-[9px] sm:text-[10px] tracking-widest font-black uppercase text-center border transition-all cursor-pointer rounded-xs flex items-center justify-center gap-1.5 ${
            activeMobileView === 'challenges' 
              ? 'bg-red-600 text-white border-red-500 font-extrabold shadow-[0_0_10px_rgba(220,38,38,0.4)]' 
              : 'bg-black/60 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-900'
          }`}
        >
          Intel
          {personalChallenges.filter(c => c.status !== 'completed').length > 0 && (
            <span className="bg-white text-black px-1.5 py-0.5 rounded-full text-[7.5px] font-black animate-pulse font-mono">
              {personalChallenges.filter(c => c.status !== 'completed').length}
            </span>
          )}
        </button>
      </div>

      {/* MAIN DIVISION GRID */}
      <main id="main-grid" className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-px bg-white/10 overflow-y-auto lg:overflow-hidden lg:h-[calc(100vh-66px)]">
        
        {/* LEFT COLUMN: PLAYER REGISTRATION, REPUTATION, ADDBUTTONS, VERIFICATION FRIENDS (3 columns) */}
        <section id="sidebar-profile" className={`col-span-1 lg:col-span-3 bg-[#050505] p-6 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 overflow-y-auto space-y-6 ${
          activeMobileView === 'profile' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="space-y-6">
            
            {/* Active Nomad Level Card */}
            <div id="level-badge" className="border-2 border-white p-1 inline-block transform -rotate-1 relative bg-black">
              <div className="bg-white text-black text-xs font-black px-3 py-1 uppercase tracking-widest font-syne flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-spin" /> Level {profile?.level || 1} Nomad
              </div>
            </div>

            {/* Code identifier display */}
            <div id="rider-profile-box" className="pt-2 space-y-3">
              <div className="flex items-center justify-between border-b border-white/15 pb-2">
                <label className="text-[10px] uppercase tracking-widest text-[#ffffff]/40 block font-mono">SKATER DIRECTORY HANDLE</label>
                <button 
                  onClick={startProfileEditing}
                  className="text-[10px] text-zinc-400 hover:text-white underline font-mono flex items-center gap-1 cursor-pointer font-bold"
                  title="Modify Skater Data"
                >
                  {isEditingProfile ? "[EDITING]" : "[EDIT PROFILE]"}
                </button>
              </div>
              
              {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="bg-white/5 p-3 border border-white/10 space-y-3 font-mono text-xs rounded-none">
                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">CODENAME HANDLE</label>
                    <input 
                      type="text" 
                      value={editHandle} 
                      onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="w-full bg-zinc-950 text-white border border-white/20 p-1.5 outline-none focus:border-white font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">MOTTO / SLOGAN</label>
                    <input 
                      type="text" 
                      value={editMotto} 
                      onChange={(e) => setEditMotto(e.target.value)}
                      placeholder="e.g. Concrete Surfer"
                      className="w-full bg-zinc-950 text-white border border-white/20 p-1.5 outline-none focus:border-white font-mono rounded-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-white/50 block mb-1">SKATE STYLE</label>
                    <select 
                      value={editSkateStyle} 
                      onChange={(e) => setEditSkateStyle(e.target.value)}
                      className="w-full bg-zinc-950 text-white border border-white/20 p-1.5 outline-none focus:border-white font-mono rounded-none"
                    >
                      <option value="Street">Street style</option>
                      <option value="Vert">Vert style</option>
                      <option value="Park">Park style</option>
                      <option value="Freestyle">Freestyle style</option>
                    </select>
                  </div>

                  {/* Profile Photo Customization UI */}
                  <div className="space-y-3 border-t border-b border-white/10 py-3 my-2 bg-neutral-900/40 p-2">
                    <label className="text-[9px] text-yellow-500 block font-mono uppercase tracking-widest font-black">IMAGE & RETRO CUSTOMIZATION</label>
                    
                    {/* Live Preview Box */}
                    <div className="flex gap-3 items-center">
                      <div className={`relative w-20 h-20 overflow-hidden bg-neutral-950 border shrink-0 transition-all ${
                        editAvatarBorder === 'cyan' ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' :
                        editAvatarBorder === 'pink' ? 'border-pink-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                        editAvatarBorder === 'yellow' ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' :
                        editAvatarBorder === 'amber' ? 'border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'border-white/20'
                      }`}>
                        {editProfilePicture ? (
                          <img 
                            src={editProfilePicture} 
                            alt="Custom Preview" 
                            referrerPolicy="no-referrer"
                            className={`w-full h-full object-cover select-none ${editVhsFilter ? 'contrast-130 brightness-110 saturate-140 hue-rotate-15 blur-[0.2px]' : ''}`}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[8px] text-white/30 bg-black/60 font-mono text-center px-1">
                            <span>NO PHOTO</span>
                          </div>
                        )}
                        {editVhsFilter && (
                          <>
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.35)_50%)] bg-[size:100%_4px] mix-blend-overlay" />
                            <div className="absolute inset-0 pointer-events-none border-l-[1.5px] border-red-500/20 mix-blend-screen" />
                            <div className="absolute top-1 left-1.5 text-[6.5px] text-green-400 font-mono tracking-widest scale-90">▶ PLAY</div>
                            <div className="absolute bottom-1 right-1.5 text-[6.5px] text-white/80 font-mono scale-90">VCR_LNK</div>
                          </>
                        )}
                      </div>
                      
                      {/* Drag & Drop Zone */}
                      <div className="flex-1 space-y-1.5">
                        <div 
                          className="border-2 border-dashed border-white/20 hover:border-white/50 p-2 text-center text-[9px] leading-tight text-white/60 cursor-pointer font-mono hover:text-white bg-black/50 transition-all select-none hover:bg-black/80"
                          onClick={() => document.getElementById('avatar-input-picker')?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files?.length) {
                              sounds.playTick();
                              handleImageFileChange(e.dataTransfer.files[0]);
                            }
                          }}
                        >
                          DROP IMAGE FILE HERE OR CLICK TO UPLOAD
                          <input 
                            id="avatar-input-picker"
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files?.length) {
                                sounds.playTick();
                                handleImageFileChange(e.target.files[0]);
                              }
                            }}
                          />
                        </div>
                        {editProfilePicture && (
                          <button 
                            type="button" 
                            onClick={() => { sounds.playSelect(); setEditProfilePicture(''); }}
                            className="text-[9px] text-red-500 hover:text-red-400 underline font-mono font-bold"
                          >
                            [REMOVE IMAGE]
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Presets Row */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-white/40 uppercase block">OR GENERATE COOL SKATE REBEL ICON:</span>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { label: "SKULL", icon: "💀" },
                          { label: "BOARD", icon: "🛹" },
                          { label: "SPRAY", icon: "🎨" },
                          { label: "TAPE", icon: "📼" },
                          { label: "SHRED", icon: "⚡" }
                        ].map((pr, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => {
                              const canvas = document.createElement('canvas');
                              canvas.width = 120;
                              canvas.height = 120;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                ctx.fillStyle = '#0a0a0a';
                                ctx.fillRect(0, 0, 120, 120);
                                
                                // grid line accents
                                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                                ctx.lineWidth = 1;
                                for (let i = 10; i < 120; i += 15) {
                                  ctx.beginPath();
                                  ctx.moveTo(i, 0); ctx.lineTo(i, 120);
                                  ctx.stroke();
                                  ctx.beginPath();
                                  ctx.moveTo(0, i); ctx.lineTo(120, i);
                                  ctx.stroke();
                                }

                                ctx.fillStyle = '#3f3f46';
                                ctx.font = '8px monospace';
                                ctx.textAlign = 'center';
                                ctx.fillText('RI_098', 60, 20);
                                // Draw Emoji
                                ctx.font = '50px sans-serif';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(pr.icon, 60, 68);
                                setEditProfilePicture(canvas.toDataURL());
                                sounds.playTick();
                              }
                            }}
                            className="text-[8px] text-center py-1 bg-white/5 hover:bg-white/15 text-white/90 border border-white/10 hover:border-white/30 transition-all font-mono"
                          >
                            {pr.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Retro toggles */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => { sounds.playSelect(); setEditVhsFilter(!editVhsFilter); }}
                        className={`py-1 px-1.5 border text-[9px] uppercase font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          editVhsFilter 
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.35)]' 
                            : 'border-white/15 text-white/50 hover:border-white/30'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${editVhsFilter ? 'bg-rose-400 animate-pulse' : 'bg-white/20'}`}></span>
                        VHS Filter
                      </button>

                      <select
                        value={editAvatarBorder}
                        onChange={(e) => { sounds.playSelect(); setEditAvatarBorder(e.target.value); }}
                        className="bg-zinc-950 text-white border border-white/20 py-1 px-2 text-[9px] outline-none font-mono rounded-none uppercase cursor-pointer"
                      >
                        <option value="none">BORDER: NONE</option>
                        <option value="cyan">GLOW: CYAN</option>
                        <option value="pink">GLOW: PINK</option>
                        <option value="yellow">GLOW: TOXIC</option>
                        <option value="amber">GLOW: GOLD</option>
                      </select>
                    </div>
                  </div>

                  {editProfileError && (
                    <div className="text-[10px] text-red-500 font-mono italic">{editProfileError}</div>
                  )}
                  <div className="flex gap-2">
                    <button 
                      type="submit" 
                      disabled={isSavingProfile}
                      className="bg-white text-black px-3 py-1 font-black rounded-none hover:bg-zinc-200 transition-colors uppercase cursor-pointer text-[10px]"
                    >
                      {isSavingProfile ? "BROADCASTING..." : "SAVE BROADCAST"}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setIsEditingProfile(false)}
                      className="text-white bg-white/10 px-3 py-1 rounded-none hover:bg-white/20 transition-colors uppercase cursor-pointer text-[10px]"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex gap-3 items-center">
                    {/* Display picture with glow borders and VCR scans and interactive upload clicker */}
                    <div 
                      onClick={() => {
                        sounds.playSelect();
                        document.getElementById('direct-avatar-input')?.click();
                      }}
                      title="Click to instantly upload a new profile picture"
                      className={`relative w-16 h-16 sm:w-20 sm:h-20 overflow-hidden bg-neutral-950 border shrink-0 transition-all group cursor-pointer hover:opacity-95 ${
                        profile?.avatarBorder === 'cyan' ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' :
                        profile?.avatarBorder === 'pink' ? 'border-pink-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                        profile?.avatarBorder === 'yellow' ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' :
                        profile?.avatarBorder === 'amber' ? 'border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'border-white/20'
                      }`}
                    >
                      {/* Hidden direct file input */}
                      <input 
                        id="direct-avatar-input"
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files?.length) {
                            sounds.playTick();
                            handleDirectAvatarUpload(e.target.files[0]);
                          }
                        }}
                      />

                      {profile?.profilePicture ? (
                        <img 
                          src={profile.profilePicture} 
                          alt="Rider avatar" 
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover select-none transition-filter duration-300 ${profile.vhsFilter ? 'contrast-130 brightness-110 saturate-140 hue-rotate-15 blur-[0.2px]' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[7.5px] text-white/30 bg-black/40 font-mono border border-dashed border-white/5 text-center px-1 font-bold">
                          <span>OFF_GRID</span>
                          <span>AVATAR</span>
                        </div>
                      )}
                      
                      {/* Interactive hover overlay */}
                      <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-center font-mono p-1 select-none pointer-events-none">
                        <Camera className="w-4 h-4 text-white mb-0.5 animate-bounce" />
                        <span className="text-[7px] text-white font-black leading-none">UPL_PHOTO</span>
                      </div>

                      {profile?.vhsFilter && (
                        <>
                          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.35)_50%)] bg-[size:100%_4px] mix-blend-overlay" />
                          <div className="absolute inset-0 pointer-events-none border-l-[1.5px] border-red-500/20 mix-blend-screen" />
                          <div className="absolute top-1 left-1.5 text-[6.5px] text-green-400 font-mono tracking-widest scale-90">▶ PLAY</div>
                          <div className="absolute bottom-1 right-1.5 text-[6.5px] text-white/80 font-mono scale-90">VCR_LNK</div>
                        </>
                      )}
                    </div>

                    <div className="space-y-1 overflow-hidden flex-1 min-w-0">
                      <div className="flex items-center gap-0.5 min-w-0 flex-1">
                        <span className="text-[#ffffff]/50 font-mono text-sm sm:text-base shrink-0">@</span>
                        <h2 className={`font-black italic uppercase font-syne text-white leading-tight break-all ${
                          (profile?.handle || 'nomad').length > 20 ? 'text-xs sm:text-sm tracking-normal' :
                          (profile?.handle || 'nomad').length > 15 ? 'text-sm sm:text-base tracking-wide' :
                          (profile?.handle || 'nomad').length > 10 ? 'text-base sm:text-lg tracking-wide' :
                          'text-lg sm:text-xl md:text-2xl tracking-widest'
                        }`}>
                          {profile?.handle || 'nomad'}
                        </h2>
                      </div>
                      
                      {/* Flame Daily Streak Count */}
                      <div className="flex items-center gap-1.5">
                        <div 
                          id="daily-streak-badge" 
                          className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 text-orange-500 font-mono text-[8px] font-black rounded-xs tracking-wider"
                          title="Keep solving Daily Escape Goals to continue your fire streak!"
                        >
                          <Flame className="w-2.5 h-2.5 text-orange-500 fill-orange-500 animate-pulse" />
                          <span>{profile?.dailyStreak || 0}D_STREAK</span>
                        </div>
                        <span className="text-[8px] bg-white/10 text-white/70 px-1 py-0.5 rounded font-mono truncate max-w-[120px]">
                          {currentUser?.email}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {profile?.motto && (
                    <div className="border-l-2 border-[#fff]/30 pl-2.5 py-1 text-[11px] text-zinc-400 font-mono italic block tracking-wide leading-snug">
                      "{profile.motto}"
                    </div>
                  )}

                  {profile?.skateStyle && (
                    <div className="text-[9px] font-mono text-white/50 uppercase block pt-0.5 transition-all">
                      discipline: <span className="font-extrabold text-[#fff]">{profile.skateStyle}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Profile Metrics Scoreboard */}
            <div id="rider-stats-grid" className="grid grid-cols-2 gap-4 border-t border-b border-white/10 py-4 font-mono">
              <div>
                <label className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Outlaw XP</label>
                <div className="text-2.5xl font-bold tracking-tight text-white flex items-baseline gap-1 font-mono">
                  {(profile?.reputation || 0).toLocaleString()} <span className="text-[9px] text-white/40 font-mono">XP</span>
                </div>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-widest text-white/40 block mb-1 font-mono">GPS Spot Loc</label>
                <div className="text-xs font-bold text-white uppercase truncate">
                  {selectedSpot.name}
                </div>
              </div>
            </div>

            {/* Performance Dashboard Component showing weekly landed tricks */}
            <PerformanceDashboard 
              userTricks={userTricks} 
              onPlayTick={() => sounds.playTick()} 
            />

            {/* SOCIAL FRIENDS & GLOBAL SKATER DIRECTORY COMPONENT */}
            <div id="skater-social-hub" className="space-y-4">
              {/* Tab Selector */}
              <div className="flex border border-white/20 p-[2px] bg-black">
                <button 
                  type="button"
                  onClick={() => { sounds.playTick(); setSidebarTab('friends'); }}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider text-center font-mono transition-all ${sidebarTab === 'friends' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/5 bg-transparent'}`}
                >
                  Friends ({profile?.friends?.length || 0})
                </button>
                <button 
                  type="button"
                  onClick={() => { sounds.playTick(); setSidebarTab('directory'); }}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider text-center font-mono transition-all ${sidebarTab === 'directory' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/5 bg-transparent'}`}
                >
                  Network ({allSkaters.length})
                </button>
              </div>

              {sidebarTab === 'friends' ? (
                <div id="friends-tab" className="space-y-3">
                  <label className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">LINK STABLE CONNECTIONS</label>
                  
                  {/* Friend Search & Add form */}
                  <form onSubmit={handleAddOutlawFriend} className="flex gap-1">
                    <input 
                      type="text"
                      required
                      placeholder="ENTER SKATER CODENAME"
                      value={friendInput}
                      onChange={(e) => setFriendInput(e.target.value.replace(/\s+/g, '_').toLowerCase())}
                      className="bg-black border border-white/20 text-xs text-white px-2 py-1.5 outline-none focus:border-white font-mono flex-1 uppercase rounded-none"
                    />
                    <button 
                      type="submit"
                      className="bg-white hover:bg-zinc-200 text-black font-black text-xs px-2.5 rounded-none flex items-center justify-center cursor-pointer"
                      title="Link Skater"
                    >
                      <UserPlus className="w-3.5 h-3.5 stroke-[2.5px]" />
                    </button>
                  </form>

                  {friendStatus && (
                    <div className={`text-[10px] font-mono tracking-wider p-1.5 ${friendStatus.success ? 'text-green-500 bg-green-950/20 border border-green-500/20' : 'text-red-500 bg-red-950/20 border border-red-500/20'}`}>
                      {friendStatus.text}
                    </div>
                  )}

                  {/* Friends List Container */}
                  <div className="space-y-1 max-h-[160px] overflow-y-auto border-t border-white/5 pt-2">
                    {(profile?.friends && profile.friends.length > 0) ? (
                      profile.friends.map((friendAnd, idx) => {
                        const matchingSkater = allSkaters.find(s => s.handle.toLowerCase() === friendAnd.toLowerCase());
                        const skaterStyle = matchingSkater?.skateStyle || "Street";
                        const reps = matchingSkater?.reputation || 0;
                        return (
                          <div key={idx} className="flex flex-col bg-white/5 border border-white/5 px-2.5 py-1.5 font-mono text-xs rounded-sm hover:border-white/10 hover:bg-white/10 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="text-white/90 font-black flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                @{friendAnd}
                              </span>
                              <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-widest">CONNECTED</span>
                            </div>
                            <div className="flex justify-between items-center text-[8px] text-white/50 pt-1 border-t border-white/5 mt-1">
                              <span>STYLE: {skaterStyle.toUpperCase()}</span>
                              <span>{reps} XP</span>
                            </div>
                            {matchingSkater && currentUser && (
                              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
                                <span className="text-[8px] text-white/40 uppercase tracking-tighter">COORDS CONTEXT:</span>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    sounds.playTick();
                                    const nextAllowed = !profile?.tracingAllowedUsers?.includes(matchingSkater.id);
                                    await toggleTracingPermission(currentUser.uid, matchingSkater.id, nextAllowed);
                                    addTickerMessage(`GPS ACCESS FOR @${matchingSkater.handle.toUpperCase()} ${nextAllowed ? "GRANTED" : "REVOKED"}`);
                                  }}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border rounded-xs transition-colors cursor-pointer select-none ${
                                    profile?.tracingAllowedUsers?.includes(matchingSkater.id)
                                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/80'
                                      : 'bg-zinc-950 text-zinc-500 border-white/10 hover:border-white/20 hover:text-white/80'
                                  }`}
                                  title={profile?.tracingAllowedUsers?.includes(matchingSkater.id) ? "Revoke direct exact GPS lock" : "Grant exact precise GPS lock"}
                                >
                                  <Radar className={`w-2.5 h-2.5 text-current ${profile?.tracingAllowedUsers?.includes(matchingSkater.id) ? 'animate-pulse' : ''}`} />
                                  {profile?.tracingAllowedUsers?.includes(matchingSkater.id) ? 'GPS ALLOWED' : 'GPS SCRAMBLED'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[10px] font-mono text-white/30 italic text-center p-3 border border-white/5">
                        No active skater connections yet. Add friends using their codename!
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div id="skaters-directory-tab" className="space-y-3">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[9px] uppercase tracking-wider text-white/40 block font-mono">SURFERS NETWORK LIST</label>
                  </div>

                  {/* Directory Search Field */}
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 w-3.5 h-3.5 text-white/30 font-mono" />
                    <input 
                      type="text"
                      placeholder="SEARCH SKATERS BY CODENAME..."
                      value={directorySearch}
                      onChange={(e) => setDirectorySearch(e.target.value.toLowerCase())}
                      className="bg-black border border-white/20 text-[10px] text-white pl-8 pr-2.5 py-1.5 outline-none focus:border-white font-mono w-full uppercase rounded-none"
                    />
                  </div>

                  {/* Public Skate Directory View */}
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto border-t border-white/5 pt-2 pr-1">
                    {allSkaters
                      .filter(sk => sk.handle.toLowerCase().includes(directorySearch))
                      .map((sk, idx) => {
                        const isSelf = sk.id === currentUser?.uid;
                        const isAlreadyFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                        
                        if (isSelf) {
                          if (isEditingDirectoryHandle) {
                            return (
                              <form 
                                key={sk.id}
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  sounds.playSelect();
                                  const cleanVal = dirEditHandleVal.trim().toLowerCase().replace(/\s+/g, '_');
                                  if (!cleanVal || cleanVal.length < 3) {
                                    addTickerMessage("Handle must be at least 3 characters.");
                                    return;
                                  }
                                  if (cleanVal.length > 25) {
                                    addTickerMessage("Handle must be 25 characters or less.");
                                    return;
                                  }
                                  try {
                                    if (currentUser.isGuest) {
                                      const updated = { ...profile!, handle: cleanVal, updatedAt: new Date().toISOString() };
                                      localStorage.setItem('moonsurfers_guest_profile', JSON.stringify(updated));
                                      setProfile(updated);
                                      setIsEditingDirectoryHandle(false);
                                      addTickerMessage("Guest handle updated inline.");
                                    } else {
                                      await updateSkaterDetails(currentUser.uid, {
                                        handle: cleanVal,
                                        motto: profile?.motto || '',
                                        skateStyle: profile?.skateStyle || 'Street',
                                        profilePicture: profile?.profilePicture || '',
                                        vhsFilter: !!profile?.vhsFilter,
                                        avatarBorder: profile?.avatarBorder || 'none'
                                      });
                                      setProfile(prev => prev ? { ...prev, handle: cleanVal } : null);
                                      setIsEditingDirectoryHandle(false);
                                      addTickerMessage(`Handle broadcasted as @${cleanVal}`);
                                    }
                                  } catch (err: any) {
                                    addTickerMessage(`Failed: ${err.message}`);
                                  }
                                }}
                                className="flex items-center justify-between bg-[#1a0a0a] border border-red-500 p-1.5 w-full font-mono text-xs gap-1.5 animate-pulse"
                              >
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="text-red-500 font-bold font-mono">@</span>
                                  <input 
                                    type="text"
                                    value={dirEditHandleVal}
                                    onChange={(e) => setDirEditHandleVal(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''))}
                                    className="bg-black text-white border border-red-500/40 p-1 font-mono text-xs w-full focus:border-red-500 outline-none uppercase rounded-none"
                                    autoFocus
                                    maxLength={25}
                                  />
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button 
                                    type="submit" 
                                    className="bg-red-600 text-white font-black px-2 py-1 uppercase tracking-wider text-[8px] hover:bg-red-700 transition-colors cursor-pointer rounded-xs"
                                  >
                                    SAVE
                                  </button>
                                  <button 
                                    type="button" 
                                    onClick={() => { sounds.playTick(); setIsEditingDirectoryHandle(false); }}
                                    className="bg-zinc-800 text-zinc-300 font-black px-1.5 py-1 uppercase text-[8px] hover:bg-zinc-700 transition-colors cursor-pointer rounded-xs"
                                  >
                                    X
                                  </button>
                                </div>
                              </form>
                            );
                          }

                          return (
                            <div key={sk.id} className="flex items-center justify-between bg-[#100303] border border-red-500/25 p-2 rounded-none hover:border-red-500/40 transition-all">
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-red-400 uppercase tracking-tight flex items-center gap-1.5">
                                  @{sk.handle}
                                  <span className="text-[7px] bg-red-600 text-white px-1 leading-none font-sans font-black italic">YOU</span>
                                </span>
                                <span className="text-[8px] text-zinc-400 font-mono uppercase">
                                  LVL {sk.level || 1} • {sk.skateStyle || 'STREET'} • {sk.reputation || 0} XP
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playSelect();
                                  setDirEditHandleVal(sk.handle);
                                  setIsEditingDirectoryHandle(true);
                                }}
                                className="bg-red-900/20 text-red-200 border border-red-500/30 hover:bg-red-600 hover:text-white font-black text-[9px] uppercase tracking-wider px-2 py-0.5 transition-all rounded-xs cursor-pointer"
                              >
                                Edit
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="flex items-center justify-between bg-zinc-950 border border-white/5 p-2 rounded-none hover:border-white/10 transition-all">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-white uppercase tracking-tight">@{sk.handle}</span>
                              <span className="text-[8px] text-zinc-500 font-mono uppercase">
                                LVL {sk.level || 1} • {sk.skateStyle || 'STREET'} • {sk.reputation || 0} XP
                              </span>
                            </div>

                            {isAlreadyFriend ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveDirectFriend(sk.handle)}
                                className="bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-900/60 font-black text-[9px] uppercase tracking-wider px-2 py-1 transition-all rounded-sm cursor-pointer flex items-center gap-1 hover:scale-105"
                              >
                                <X className="w-3 h-3 text-red-500" /> UNLINK
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddDirectFriend(sk.handle)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-wider px-2 py-1 transition-all rounded-sm cursor-pointer hover:scale-105 animate-pulse"
                              >
                                LINK
                              </button>
                            )}
                          </div>
                        );
                      })
                    }
                    {allSkaters.length <= 1 && (
                      <div className="text-[10px] font-mono text-zinc-500 italic text-center py-4">
                        Waiting for surfers to populate dataset...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* BADGES & COMMENDATIONS DISPLAY */}
            <div id="skater-badges-box" className="space-y-2 select-none border-t border-white/10 pt-4">
              <label className="text-[10px] uppercase tracking-wider text-white/40 block font-mono">UNLOCKED NOMAD BADGES</label>
              <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1">
                {profile?.badges.map((badgeStr, badgeIdx) => (
                  <div 
                    key={badgeIdx}
                    className="bg-white text-black px-2 py-1 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 font-mono hover:rotate-2 transition-transform"
                    title={`Verified unlockable emblem badge: ${badgeStr}`}
                  >
                    <Award className="w-3 h-3 text-black animate-pulse" />
                    {badgeStr.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Action Trigger for Trick Clip Uploader */}
          <div id="action-upload-trigger" className="border-t border-white/20 pt-6 mt-6 md:mt-0">
            <button 
              onClick={() => { sounds.playSelect(); setShowUploadModal(true); }}
              className="w-full bg-white text-black font-black uppercase py-4 italic hover:bg-zinc-200 transition-colors skew-x-[-12deg] relative group shadow-[0_4px_12px_rgba(255,255,255,0.05)] active:translate-y-0.5"
            >
              <span className="flex items-center justify-center gap-2 skew-x-[12deg] font-syne tracking-wide text-sm">
                <Upload className="w-4 h-4 text-black stroke-[3px]" /> Stream Stunt Clip + XP
              </span>
            </button>
          </div>
        </section>

        {/* CENTER COLUMN: INTERACTIVE MAP & TELEMETRY STREAM SENSOR OR GAMES (6 columns) */}
        <section id="main-content-display" className={`col-span-1 lg:col-span-6 bg-[#0a0a0a] relative flex flex-col justify-between border-b lg:border-b-0 overflow-y-auto ${
          activeMobileView === 'map' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,0.15)_2px,transparent_2px)] bg-[size:100%_4px] z-10 select-none"></div>

          {/* Active Title bar */}
          <div className="w-full bg-white/5 border-b border-white/10 px-6 py-3 flex flex-wrap items-center justify-between gap-2 z-10 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
              <span className="text-[10px] tracking-[0.2em] font-black font-mono">
                TELEMETRY // {showGame ? "OFFLINE ARCADE INTERFACE ACTIVE" : (mapViewMode === 'google' ? 'GOOGLE MAP SATELLITE RELAY' : 'SATELLITE POSITION GPS LOCK')}
              </span>
            </div>
            
            {showGame && (
              <button 
                onClick={closeGame}
                className="text-[9px] bg-white text-black font-bold px-2 py-0.5 hover:bg-zinc-200 transition-colors uppercase font-mono flex items-center gap-1"
              >
                <X className="w-3 h-3 stroke-[3px]" /> Close Game
              </button>
            )}

            {!showGame && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playSelect();
                    const userEmail = currentUser?.email || '';
                    const normEmail = userEmail.toLowerCase().trim();
                    const isAdmin = normEmail === 'inenepadi@gmail.com' || normEmail === 'moonsurfers@gmail.com' || normEmail === 'moonsufers@gmail.com';
                    if (!isAdmin) {
                      addTickerMessage("SECURE REFUSAL: Only Verified Admins can register public spots.");
                      addNotification('system', 'ACCESS DENIED', "Only verified administrators can deploy spots to the active radar grid (inenepadi@gmail.com / moonsurfers@gmail.com).");
                    } else {
                      setShowAddSpotModal(true);
                    }
                  }}
                  className="text-[9.5px] font-black px-2.5 py-1 font-mono uppercase bg-red-950/20 hover:bg-neutral-800 text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 flex items-center gap-1 cursor-pointer rounded-xs"
                >
                  <MapPin className="w-2.5 h-2.5 text-red-500 shrink-0" />
                  + ADD SPOT
                </button>

                <div className="flex items-center gap-1 border border-white/10 bg-black/40 p-0.5 rounded-sm">
                <button
                  type="button"
                  onClick={() => { sounds.playSelect(); setMapViewMode('vector'); }}
                  className={`text-[9.5px] font-black px-2.5 py-1 tracking-wider font-mono transition-all uppercase cursor-pointer rounded-xs ${
                    mapViewMode === 'vector'
                      ? 'bg-red-600 text-white font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Radar HUD
                </button>
                <button
                  type="button"
                  onClick={() => { sounds.playSelect(); setMapViewMode('google'); }}
                  className={`text-[9.5px] font-black px-2.5 py-1 tracking-wider font-mono transition-all uppercase cursor-pointer rounded-xs ${
                    mapViewMode === 'google'
                      ? 'bg-red-600 text-white font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Google Map
                </button>

                {mapViewMode === 'vector' && (
                  <div className="relative border-l border-white/10 pl-1.5 ml-1 flex items-center">
                    <button
                      type="button"
                      onClick={() => { sounds.playSelect(); setLayersDropdownOpen(prev => !prev); }}
                      className="text-[9px] font-black px-2 py-0.5 tracking-wider font-mono uppercase bg-zinc-900 hover:bg-neutral-800 border border-white/15 text-white/90 flex items-center gap-1 cursor-pointer rounded-xs"
                    >
                      <Layers className="w-2.5 h-2.5 text-red-500" />
                      LAYERS : {showHeatmap ? 'DENSITY' : ''}{showHeatmap && showPatrolDanger ? ' + ' : ''}{showPatrolDanger ? 'PATROL' : ''}{!showHeatmap && !showPatrolDanger ? 'NONE' : ''}
                      <span className="text-[7px]">▼</span>
                    </button>
                    {layersDropdownOpen && (
                      <div className="absolute right-0 top-7 w-48 bg-zinc-950 border border-white/20 p-2.5 rounded-xs shadow-2xl flex flex-col gap-2 z-50 select-none text-left">
                        <div className="text-[7.5px] font-black text-white/35 tracking-wider font-mono border-b border-white/10 pb-1 flex items-center gap-1 uppercase">
                          <Layers className="w-2.5 h-2.5 text-red-500" /> SELECT HUD LAYERS
                        </div>
                        {/* Heatmap Layer Option */}
                        <label className="flex items-center gap-2 cursor-pointer group py-0.5 justify-start text-left">
                          <input
                            type="checkbox"
                            checked={showHeatmap}
                            onChange={(e) => {
                              sounds.playTick();
                              setShowHeatmap(e.target.checked);
                              addTickerMessage(`HUD LAYER: HEATMAP ${e.target.checked ? "ON" : "OFF"}`);
                            }}
                            className="sr-only"
                          />
                          <div className={`w-3.5 h-3.5 border rounded-xs flex items-center justify-center transition-all ${
                            showHeatmap 
                              ? 'bg-red-600 border-red-500 text-white' 
                              : 'bg-zinc-900 border-white/20 group-hover:border-white text-transparent'
                          }`}>
                            <Check className="w-2.5 h-2.5 stroke-[3px]" />
                          </div>
                          <span className="text-[8px] font-mono text-white/90 uppercase tracking-wider">SKATER DENSITY</span>
                        </label>
                        {/* Patrol Danger Layer Option */}
                        <label className="flex items-center gap-2 cursor-pointer group py-0.5 justify-start text-left">
                          <input
                            type="checkbox"
                            checked={showPatrolDanger}
                            onChange={(e) => {
                              sounds.playTick();
                              setShowPatrolDanger(e.target.checked);
                              addTickerMessage(`HUD LAYER: PATROL DANGER ${e.target.checked ? "ON" : "OFF"}`);
                            }}
                            className="sr-only"
                          />
                          <div className={`w-3 h-3 border flex items-center justify-center transition-all ${
                            showPatrolDanger 
                              ? 'bg-red-600 border-red-500 text-white' 
                              : 'bg-zinc-900 border-white/20 group-hover:border-white text-transparent'
                          }`}>
                            <Check className="w-2.5 h-2.5 stroke-[3px]" />
                          </div>
                          <span className="text-[8px] font-mono text-white/90 uppercase tracking-wider">PATROL DANGER</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}
          </div>

          <div className="flex-1 w-full relative flex flex-col justify-center items-center p-1 sm:p-4 bg-[#050505]">
            
            {!showGame ? (
              /* GPS REAL SATELLITE MAP */
              <div 
                id="gps-map-viewport" 
                className={`w-full max-w-4xl h-[460px] xs:h-[480px] sm:h-[540px] md:h-[620px] lg:h-[685px] xl:h-[740px] relative flex flex-col justify-center select-none overflow-hidden bg-[#070708] border border-white/15 rounded-md shadow-[0_24px_64px_rgba(0,0,0,0.85)] ${
                  mapViewMode === 'vector' && isDraggingMap ? 'cursor-grabbing' : (mapViewMode === 'vector' && zoomScale > 1 ? 'cursor-grab' : '')
                }`}
                onMouseDown={mapViewMode === 'vector' ? handleMapMouseDown : undefined}
                onMouseMove={mapViewMode === 'vector' ? handleMapMouseMove : undefined}
                onMouseUp={mapViewMode === 'vector' ? handleMapMouseUpOrLeave : undefined}
                onMouseLeave={mapViewMode === 'vector' ? handleMapMouseUpOrLeave : undefined}
                onTouchStart={mapViewMode === 'vector' ? handleMapTouchStart : undefined}
                onTouchMove={mapViewMode === 'vector' ? handleMapTouchMove : undefined}
                onTouchEnd={mapViewMode === 'vector' ? handleMapMouseUpOrLeave : undefined}
                onWheel={mapViewMode === 'vector' ? handleMapWheel : undefined}
              >
                {/* Unified Tactical panel is loaded as z-20 at absolute top-left further down */}

                {mapViewMode === 'vector' && (
                  <>
                    <div className="absolute inset-x-0 top-0 bottom-14 opacity-80">
                      <svg 
                        width="100%" 
                        height="100%" 
                        viewBox="0 0 400 300" 
                        preserveAspectRatio="xMidYMid meet" 
                        fill="none"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const xPercent = (e.clientX - rect.left) / rect.width;
                          const yPercent = (e.clientY - rect.top) / rect.height;
                          
                          // Calculate calibrated map coordinate using our precise formula
                          const mapX = 200 + ((xPercent * 400) - 200 - panOffset.x) / zoomScale;
                          const mapY = 150 + ((yPercent * 300) - 150 - panOffset.y) / zoomScale;
                          
                          const center = combinedGps[currentDistrictId] || combinedGps.ACC;
                          const deltaLon = (mapX - 200) / 3000;
                          const deltaLat = (150 - mapY) / 3000;
                          setHoverCoords({
                            x: Math.round(mapX),
                            y: Math.round(mapY),
                            lat: center.lat + deltaLat,
                            lng: center.lon + deltaLon
                          });
                        }}
                        onMouseLeave={() => {
                          setHoverCoords(null);
                        }}
                        onClick={(e) => {
                          if (!gpsActive) return;
                          // Determine if it was a drag or a click
                          const distance = Math.sqrt(
                            Math.pow(e.clientX - dragStartMouse.x, 2) + 
                            Math.pow(e.clientY - dragStartMouse.y, 2)
                          );
                          if (distance > 6) return; // Ignore drag clicks!

                          const rect = e.currentTarget.getBoundingClientRect();
                          const xPercent = (e.clientX - rect.left) / rect.width;
                          const yPercent = (e.clientY - rect.top) / rect.height;
                          
                          // Calculate calibrated map coordinate using our precise formula
                          const mapX = 200 + ((xPercent * 400) - 200 - panOffset.x) / zoomScale;
                          const mapY = 150 + ((yPercent * 300) - 150 - panOffset.y) / zoomScale;
                          
                          handleMapClickSimulateGps(mapX, mapY);
                        }}
                        className={gpsActive ? "cursor-crosshair w-full h-full" : "w-full h-full"}
                      >
                        <defs>
                          <radialGradient id="heat-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
                            <stop offset="40%" stopColor="#f97316" stopOpacity="0.45" />
                            <stop offset="75%" stopColor="#eab308" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                          </radialGradient>
                          <radialGradient id="danger-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
                            <stop offset="55%" stopColor="#450a0a" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#450a0a" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        <g 
                          style={{ 
                            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                            transformOrigin: 'center',
                            transition: isDraggingMap ? 'none' : 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}
                        >
                          {/* Tactical Concentric Range Rings */}
                          {[50, 100, 150, 200].map((ringRadius) => {
                            const ringColor = gpsActive ? "rgba(239, 68, 68, 0.12)" : "rgba(255, 255, 255, 0.08)";
                            return (
                              <circle 
                                key={`ring-${ringRadius}`}
                                cx="200" 
                                cy="150" 
                                r={ringRadius} 
                                stroke={ringColor} 
                                strokeWidth="0.75" 
                                fill="none"
                                strokeDasharray={ringRadius === 200 ? "4 8" : "2 4"} 
                              />
                            );
                          })}

                          {/* Radar Angular Hub Lines (Radar Ticks) */}
                          {[45, 135, 225, 315].map((angle) => {
                            const rad = (angle * Math.PI) / 180;
                            const x2 = 200 + 200 * Math.cos(rad);
                            const y2 = 150 + 200 * Math.sin(rad);
                            return (
                              <line 
                                key={`tick-${angle}`}
                                x1="200" 
                                y1="150" 
                                x2={x2} 
                                y2={y2} 
                                stroke={gpsActive ? "rgba(239, 68, 68, 0.08)" : "rgba(255, 255, 255, 0.04)"} 
                                strokeWidth="0.75"
                                strokeDasharray="5 5"
                              />
                            );
                          })}

                          {/* Dynamic District Vector Graphics Background Grid/Coastal Lines */}
                          {(() => {
                            const layout = getDistrictVectorLayout(currentDistrictId);
                            return (
                              <g id="district-topo-vector-grid" className="opacity-70 pointer-events-none">
                                {layout.coast && (
                                  <path 
                                    d={layout.coast} 
                                    stroke={gpsActive ? "rgba(239, 68, 68, 0.22)" : "rgba(255, 255, 255, 0.14)"}
                                    strokeWidth="1.25"
                                    fill="none"
                                  />
                                )}
                                {layout.streets.map((streetPath, sidx) => (
                                  <path 
                                    key={`st-${sidx}`}
                                    d={streetPath}
                                    stroke={gpsActive ? "rgba(239, 68, 68, 0.1)" : "rgba(255, 255, 255, 0.05)"}
                                    strokeWidth="0.8"
                                    strokeDasharray="1 3"
                                  />
                                ))}
                                {layout.hubs?.map((hub, hidx) => (
                                  <g key={`hub-${hidx}`} className="opacity-25 select-none font-mono">
                                    <text 
                                      x={hub.x} 
                                      y={hub.y - 12} 
                                      textAnchor="middle" 
                                      className="text-[5.5px] fill-white tracking-widest font-black font-mono uppercase"
                                    >
                                      [{hub.label}]
                                    </text>
                                    <line x1={hub.x - 3} y1={hub.y} x2={hub.x + 3} y2={hub.y} stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
                                    <line x1={hub.x} y1={hub.y - 3} x2={hub.x} y2={hub.y + 3} stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
                                  </g>
                                ))}
                              </g>
                            );
                          })()}

                          <line x1="0" y1="150" x2="400" y2="150" stroke={gpsActive ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.08)"} strokeWidth="1" />
                          <line x1="200" y1="0" x2="200" y2="300" stroke={gpsActive ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.08)"} strokeWidth="1" />

                          {/* HEATMAP LAYER FOR ACTIVE SKATER DENSITY */}
                          {showHeatmap && (
                            <g id="heatmap-layer-group" className="pointer-events-none mix-blend-screen">
                              {/* Active other skaters heatmap spots */}
                              {allSkaters
                                .filter(sk => sk.id !== currentUser?.uid && sk.activeLocation?.districtId === currentDistrictId)
                                .map((sk, idx) => {
                                  const coords = sk.activeLocation?.coords;
                                  if (!coords) return null;
                                  return (
                                    <g key={`heat-sk-${idx}`}>
                                      <circle cx={coords.x} cy={coords.y} r="32" fill="url(#heat-glow)" opacity="0.8" />
                                      <circle cx={coords.x} cy={coords.y} r="12" fill="url(#heat-glow)" opacity="0.9" />
                                    </g>
                                  );
                                })
                              }
                              {/* Self location heatmap spot */}
                              {gpsActive && profile?.activeLocation?.coords && (
                                <g>
                                  <circle cx={profile.activeLocation.coords.x} cy={profile.activeLocation.coords.y} r="32" fill="url(#heat-glow)" opacity="0.8" />
                                  <circle cx={profile.activeLocation.coords.x} cy={profile.activeLocation.coords.y} r="12" fill="url(#heat-glow)" opacity="0.9" />
                                </g>
                              )}
                              {/* High active spots density spots */}
                              {spotList
                                .filter(spot => spot.hype > 80)
                                .map((spot, idx) => (
                                  <circle key={`heat-sp-${idx}`} cx={spot.coords.x} cy={spot.coords.y} r="25" fill="url(#heat-glow)" opacity="0.6" />
                                ))}
                            </g>
                          )}

                          {/* PATROL DANGER ZONES LAYER */}
                          {showPatrolDanger && (
                            <g id="danger-patrol-layer" className="pointer-events-none">
                              {spotList
                                .filter(spot => 
                                  spot.name.toLowerCase().includes('castle') || 
                                  spot.name.toLowerCase().includes('airport') || 
                                  spot.name.toLowerCase().includes('mall') || 
                                  spot.name.toLowerCase().includes('residential') || 
                                  spot.name.toLowerCase().includes('overpass') || 
                                  spot.hype > 80
                                )
                                .slice(0, 2)
                                .map((spot, idx) => (
                                  <g key={`danger-zone-${idx}`} className="opacity-90">
                                    {/* Rotating radar swept warning indicator ring */}
                                    <circle
                                      cx={spot.coords.x}
                                      cy={spot.coords.y}
                                      r="38"
                                      stroke="#f43f5e"
                                      strokeWidth="1"
                                      strokeDasharray="4 4"
                                      fill="url(#danger-glow)"
                                    />
                                    <circle
                                      cx={spot.coords.x}
                                      cy={spot.coords.y}
                                      r="44"
                                      stroke="rgba(244, 63, 94, 0.35)"
                                      strokeWidth="0.5"
                                      fill="none"
                                      className="animate-pulse"
                                    />
                                    {/* Warning crosshair mark at danger central coordinate */}
                                    <circle
                                      cx={spot.coords.x}
                                      cy={spot.coords.y}
                                      r="2"
                                      fill="#f43f5e"
                                    />
                                    {/* Warning badge anchor indicator */}
                                    <g transform={`translate(${spot.coords.x}, ${spot.coords.y + 44})`}>
                                      <rect
                                        x="-35"
                                        y="-5"
                                        width="70"
                                        height="9"
                                        fill="rgba(15, 15, 20, 0.95)"
                                        stroke="#f43f5e"
                                        strokeWidth="0.75"
                                        rx="1"
                                      />
                                      <text
                                        x="0"
                                        y="1.5"
                                        textAnchor="middle"
                                        className="text-[4.5px] font-mono font-black fill-rose-500 tracking-[0.15em] uppercase"
                                      >
                                        ⚠️ RECON SWEEP ACTIVE
                                      </text>
                                    </g>
                                  </g>
                                ))
                              }
                            </g>
                          )}

                          {/* Connection links */}
                          {filteredMapSpots.map((spot, idx) => {
                            const next = filteredMapSpots[(idx + 1) % filteredMapSpots.length];
                            return (
                              <line 
                                key={idx}
                                x1={spot.coords.x} 
                                y1={spot.coords.y} 
                                x2={next.coords.x} 
                                y2={next.coords.y} 
                                stroke={gpsActive ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.2)"} 
                                strokeWidth="1.5" 
                                strokeDasharray="5 5"
                              />
                            );
                          })}

                          {/* Nodes clickable */}
                          {filteredMapSpots.map((spot, idx) => {
                            const isTarget = spot.name === selectedSpot.name;
                            const isSpotIsolated = selectedLiveSkater && singleTargetIsolation && selectedLiveSkater.activeLocation?.spotName !== spot.name;
                            return (
                              <g 
                                key={idx} 
                                className="cursor-pointer transition-opacity duration-200" 
                                style={{ opacity: isSpotIsolated ? 0.12 : 1 }}
                                onClick={() => { sounds.playTick(); setSelectedSpot(spot); setShowSpotDetails(true); }}
                              >
                                <circle 
                                  cx={spot.coords.x} 
                                  cy={spot.coords.y} 
                                  r={isTarget ? 9 : 5} 
                                  fill={isTarget ? '#ffffff' : (gpsActive ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.2)')} 
                                />
                                {isTarget && (
                                  <circle 
                                    cx={spot.coords.x} 
                                    cy={spot.coords.y} 
                                    r="18" 
                                    stroke={gpsActive ? "#ef4444" : "#ffffff"} 
                                    strokeWidth="1" 
                                    className="animate-ping" 
                                    opacity="0.3"
                                  />
                                )}
                              </g>
                            );
                          })}

                          {/* RENDERING REAL-TIME OTHER SKATERS MAP Telemetry */}
                          {mappedSkatersOrClusters.map((cluster) => {
                            const isItemIsolated = selectedLiveSkater && singleTargetIsolation && !cluster.skaters.some(s => s.id === selectedLiveSkater.id);
                            if (cluster.isCluster) {
                              const count = cluster.skaters.length;
                              const isClusterSelected = selectedClusterId === cluster.id;
                              
                              return (
                                <g 
                                  key={cluster.id} 
                                  className="cursor-pointer group transition-opacity duration-200"
                                  style={{ opacity: isItemIsolated ? 0.08 : 1 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    sounds.playSelect();
                                    setSelectedClusterId(isClusterSelected ? null : cluster.id);
                                  }}
                                >
                                  {/* Concentric green radar rings for concentration density */}
                                  <circle 
                                    cx={cluster.coords.x} 
                                    cy={cluster.coords.y} 
                                    r="18" 
                                    stroke="#10b981" 
                                    strokeWidth="1" 
                                    strokeDasharray="3 4" 
                                    fill="none"
                                    opacity="0.45"
                                    className="animate-[spin_6s_linear_infinite]"
                                  />
                                  <circle 
                                    cx={cluster.coords.x} 
                                    cy={cluster.coords.y} 
                                    r="12" 
                                    fill="rgba(16, 185, 129, 0.12)" 
                                    stroke="#10b981" 
                                    strokeWidth="1.5"
                                    className="animate-pulse"
                                  />
                                  <circle 
                                    cx={cluster.coords.x} 
                                    cy={cluster.coords.y} 
                                    r="6" 
                                    fill="#10b981" 
                                  />

                                  {/* Cluster counter text */}
                                  <g transform={`translate(${cluster.coords.x}, ${cluster.coords.y - 12})`}>
                                    <rect 
                                      x="-22" 
                                      y="-5" 
                                      width="44" 
                                      height="10" 
                                      fill="rgba(5, 5, 5, 0.95)" 
                                      stroke="#10b981" 
                                      strokeWidth="0.75" 
                                      rx="1"
                                    />
                                    <text 
                                      x="0" 
                                      y="1.5"
                                      textAnchor="middle" 
                                      className="text-[5.5px] font-mono font-black fill-emerald-400 tracking-wider"
                                    >
                                      {count} SKATERS
                                    </text>
                                  </g>

                                  {/* Floating Dropdown List of Skaters within this Cluster */}
                                  {isClusterSelected && (
                                    <g transform={`translate(${cluster.coords.x}, ${cluster.coords.y + 12})`} className="pointer-events-auto z-40">
                                      {/* Background box */}
                                      <rect 
                                        x="-45" 
                                        y="0" 
                                        width="90" 
                                        height={cluster.skaters.length * 10 + 6} 
                                        fill="rgba(5, 5, 7, 0.98)" 
                                        stroke="#10b981" 
                                        strokeWidth="1" 
                                        rx="2"
                                      />
                                      {cluster.skaters.map((sk, sidx) => (
                                        <g 
                                          key={sk.id} 
                                          transform={`translate(0, ${sidx * 10 + 5})`}
                                          className="cursor-pointer hover:opacity-80"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            sounds.playSelect();
                                            setSelectedLiveSkater(sk);
                                            setSelectedClusterId(null);
                                          }}
                                        >
                                          <rect 
                                            x="-42" 
                                            y="-4" 
                                            width="84" 
                                            height="8" 
                                            fill="rgba(255,255,255,0.04)" 
                                            className="hover:fill-[#10b981]/20 transition-colors"
                                            rx="1"
                                          />
                                          <text 
                                            x="0" 
                                            y="1.5" 
                                            textAnchor="middle" 
                                            className="text-[4.5px] font-mono font-black fill-white uppercase tracking-widest"
                                          >
                                            @{sk.handle.substring(0, 12)}
                                          </text>
                                        </g>
                                      ))}
                                    </g>
                                  )}
                                </g>
                              );
                            } else {
                              // Render single skater normally (just using first skater from skaters list)
                              const sk = cluster.skaters[0];
                              const coords = cluster.coords;
                              const userCoords = profile?.activeLocation?.coords;
                              const distancePx = userCoords 
                                ? Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2))
                                : 0;
                              const distanceMeters = Math.round(distancePx * 2.5);

                              const isLinkedFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                              const isSelected = selectedLiveSkater?.id === sk.id;

                              return (
                                <g 
                                  key={`other-skater-${sk.id}`}
                                  className="cursor-pointer group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    sounds.playSelect();
                                    setSelectedLiveSkater(sk);
                                  }}
                                >
                                  {/* Vector Tie-Line to User */}
                                  {gpsActive && userCoords && (
                                    <g>
                                      <line
                                        x1={userCoords.x}
                                        y1={userCoords.y}
                                        x2={coords.x}
                                        y2={coords.y}
                                        stroke={isSelected ? "#f43f5e" : (isLinkedFriend ? "rgba(16, 185, 129, 0.35)" : "rgba(59, 130, 246, 0.25)")}
                                        strokeWidth={isSelected ? "1.5" : "1"}
                                        strokeDasharray={isSelected ? "2 2" : "4 4"}
                                        className="transition-all font-mono"
                                      />
                                      {/* Distance Indicator text centered on line */}
                                      <text
                                        x={(coords.x + userCoords.x) / 2}
                                        y={(coords.y + userCoords.y) / 2 - 3}
                                        textAnchor="middle"
                                        className={`text-[6.5px] font-mono font-bold select-none bg-black/90 px-1 transition-opacity ${isSelected ? 'fill-rose-400 opacity-100' : 'fill-zinc-400 opacity-0 group-hover:opacity-100'}`}
                                      >
                                        {distanceMeters}M
                                      </text>
                                    </g>
                                  )}

                                  {/* TARGETING RETICLE OVERLAY FOR SELECTED SKATER */}
                                  {isSelected && (
                                    <g className="pointer-events-none animate-pulse">
                                      {/* Outer corner marks and spinning ring */}
                                      <circle 
                                        cx={coords.x} 
                                        cy={coords.y} 
                                        r="20" 
                                        stroke="#f43f5e" 
                                        strokeWidth="1" 
                                        strokeDasharray="4 6" 
                                        fill="none"
                                        className="animate-[spin_4s_linear_infinite]"
                                      />
                                      <circle 
                                        cx={coords.x} 
                                        cy={coords.y} 
                                        r="26" 
                                        stroke="#f43f5e" 
                                        strokeWidth="0.5" 
                                        strokeDasharray="8 12" 
                                        fill="none"
                                        className="animate-pulse"
                                        opacity="0.8"
                                      />
                                      <line x1={coords.x - 22} y1={coords.y} x2={coords.x - 14} y2={coords.y} stroke="#f43f5e" strokeWidth="1" />
                                      <line x1={coords.x + 14} y1={coords.y} x2={coords.x + 22} y2={coords.y} stroke="#f43f5e" strokeWidth="1" />
                                      <line x1={coords.x} y1={coords.y - 22} x2={coords.x} y2={coords.y - 22 + 8} stroke="#f43f5e" strokeWidth="1" />
                                      <line x1={coords.x} y1={coords.y + 14} x2={coords.x} y2={coords.y + 22} stroke="#f43f5e" strokeWidth="1" />
                                      
                                      <text 
                                        x={coords.x} 
                                        y={coords.y + 24} 
                                        textAnchor="middle" 
                                        className="text-[6.5px] font-mono fill-rose-500 font-extrabold tracking-widest uppercase"
                                      >
                                        [LOCK ACQUIRED]
                                      </text>
                                    </g>
                                  )}

                                  {/* Pulsating Radar Beacon (Glow) */}
                                  <circle 
                                    cx={coords.x} 
                                    cy={coords.y} 
                                    r={isLinkedFriend ? "14" : "10"} 
                                    stroke={isLinkedFriend ? "#10b981" : (isSelected ? "#f43f5e" : "#3b82f6")}
                                    strokeWidth="1.5"
                                    fill="none"
                                    opacity="0.3"
                                    className="animate-ping"
                                  />
                                  
                                  {/* Solid center dot */}
                                  <circle 
                                    cx={coords.x} 
                                    cy={coords.y} 
                                    r="5.5" 
                                    fill={isLinkedFriend ? "#10b981" : (isSelected ? "#e11d48" : "#3b82f6")} 
                                    className="animate-pulse transition-colors duration-150"
                                  />

                                  {/* Outer circle rings */}
                                  <circle 
                                    cx={coords.x} 
                                    cy={coords.y} 
                                    r="10" 
                                    stroke={isLinkedFriend ? "#34d399" : (isSelected ? "#fda4af" : "#60a5fa")}
                                    strokeWidth="1"
                                    fill="none"
                                    opacity="0.5"
                                    className="group-hover:stroke-red-400 transition-colors duration-150"
                                  />

                                  {/* Thicker invisible tapping circle for easy mobile tap/click */}
                                  <circle 
                                    cx={coords.x} 
                                    cy={coords.y} 
                                    r="22" 
                                    fill="transparent" 
                                  />
                                </g>
                              );
                            }
                          })}

                          {/* RENDERING ACTIVE SELF GPS PULSER */}
                          {gpsActive && profile?.activeLocation?.coords && (
                            <g>
                              <circle 
                                cx={profile.activeLocation.coords.x} 
                                cy={profile.activeLocation.coords.y} 
                                r="8" 
                                fill="#ef4444" 
                                className="animate-pulse"
                              />
                              <circle 
                                cx={profile.activeLocation.coords.x} 
                                cy={profile.activeLocation.coords.y} 
                                r="18" 
                                stroke="#ef4444"
                                strokeWidth="1.5"
                                fill="none"
                                opacity="0.6"
                                className="animate-ping"
                              />
                            </g>
                          )}

                          {/* DYNAMIC COLLISION-AVOIDED TEXT LABELS OVERLAY (UI/UX RESOLVED) */}
                          {(() => {
                            const mapLabels: Array<{
                              id: string;
                              type: 'self' | 'skater';
                              x: number;
                              y: number;
                              lx: number;
                              ly: number;
                              text: string;
                              isLinkedFriend: boolean;
                              isSelected: boolean;
                              skRef?: any;
                            }> = [];

                            // 1. Add Self Label
                            if (gpsActive && profile?.activeLocation?.coords) {
                              mapLabels.push({
                                id: "self-label",
                                type: 'self',
                                x: profile.activeLocation.coords.x,
                                y: profile.activeLocation.coords.y,
                                lx: profile.activeLocation.coords.x,
                                ly: profile.activeLocation.coords.y - 12,
                                text: `@${profile.handle} (YOU)`,
                                isLinkedFriend: false,
                                isSelected: false,
                              });
                            }

                            // 2. Add other active skaters
                            filteredMapSkaters
                              .forEach((sk) => {
                                const coords = getSkaterCoords(sk);
                                if (coords) {
                                  const isFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                                  const isSel = selectedLiveSkater?.id === sk.id;
                                  mapLabels.push({
                                    id: sk.id,
                                    type: 'skater',
                                    x: coords.x,
                                    y: coords.y,
                                    lx: coords.x,
                                    ly: coords.y - 12,
                                    text: `@${sk.handle}${isFriend ? ' [LINK]' : ''}`,
                                    isLinkedFriend: !!isFriend,
                                    isSelected: isSel,
                                    skRef: sk,
                                  });
                                }
                              });

                            // NEW: Cluster identical or extremely close coordinates to distribute them in a high-tech fan-out arc
                            const clusters: Array<{ x: number; y: number; items: typeof mapLabels }> = [];
                            mapLabels.forEach(lbl => {
                              const found = clusters.find(c => {
                                const dist = Math.sqrt(Math.pow(c.x - lbl.x, 2) + Math.pow(c.y - lbl.y, 2));
                                return dist < 12;
                              });
                              if (found) {
                                found.items.push(lbl);
                              } else {
                                clusters.push({ x: lbl.x, y: lbl.y, items: [lbl] });
                              }
                            });

                            clusters.forEach(c => {
                              const N = c.items.length;
                              if (N === 1) {
                                c.items[0].lx = c.x;
                                c.items[0].ly = c.y - 14;
                              } else {
                                // Distribute clustered skaters in an arc around the target dot to avoid overlap!
                                const startAngle = -150;
                                const endAngle = -30;
                                const angleSpan = endAngle - startAngle;
                                const step = angleSpan / (N - 1);
                                
                                c.items.forEach((item, idx) => {
                                  const angleDeg = startAngle + idx * step;
                                  const angleRad = (angleDeg * Math.PI) / 180;
                                  const radius = N > 3 
                                    ? (idx % 2 === 0 ? 30 : 52) 
                                    : (idx % 2 === 0 ? 25 : 44);
                                    
                                  item.lx = Math.round(c.x + radius * Math.cos(angleRad));
                                  item.ly = Math.round(c.y + radius * Math.sin(angleRad));
                                });
                              }
                            });

                            // Secondary vertical relaxation resolver pass in case arcs overlap with other areas
                            for (let pass = 0; pass < 6; pass++) {
                              for (let i = 0; i < mapLabels.length; i++) {
                                for (let j = i + 1; j < mapLabels.length; j++) {
                                  const a = mapLabels[i];
                                  const b = mapLabels[j];
                                  const dx = Math.abs(a.lx - b.lx);
                                  const dy = Math.abs(a.ly - b.ly);

                                  const minXDist = (a.text.length + b.text.length) * 2.3 + 12;
                                  const minYDist = 13;

                                  if (dx < minXDist && dy < minYDist) {
                                    const overlapY = minYDist - dy;
                                    const pushY = overlapY / 2;
                                    
                                    if (a.isSelected) {
                                      b.ly += b.ly > a.ly ? overlapY : -overlapY;
                                    } else if (b.isSelected) {
                                      a.ly += a.ly > b.ly ? overlapY : -overlapY;
                                    } else if (a.type === 'self') {
                                      b.ly += b.ly > a.ly ? overlapY : -overlapY;
                                    } else if (b.type === 'self') {
                                      a.ly += a.ly > b.ly ? overlapY : -overlapY;
                                    } else {
                                      if (a.ly < b.ly) {
                                        a.ly -= pushY;
                                        b.ly += pushY;
                                      } else {
                                        a.ly += pushY;
                                        b.ly -= pushY;
                                      }
                                    }
                                    a.ly = Math.max(12, Math.min(288, a.ly));
                                    b.ly = Math.max(12, Math.min(288, b.ly));
                                  }
                                }
                              }
                            }

                            return (
                              <g id="dynamic-map-label-group">
                                {mapLabels.map((lbl) => {
                                  const offsetDist = Math.sqrt(Math.pow(lbl.lx - lbl.x, 2) + Math.pow(lbl.ly - (lbl.y - 12), 2));
                                  const isOffset = offsetDist > 1.5;
                                  
                                  const widthApprox = lbl.text.length * 4.4 + 14; 
                                  const boxHeight = 13;
                                  const boxX = lbl.lx - widthApprox / 2;
                                  const boxY = lbl.ly - boxHeight / 2;

                                  return (
                                    <g 
                                      key={`lbl-${lbl.id}`} 
                                      className="transition-all duration-150"
                                      style={{ opacity: selectedLiveSkater && singleTargetIsolation && !lbl.isSelected && lbl.type !== 'self' ? 0.08 : 1 }}
                                    >
                                      {/* High-tech pointer connector guide line if label was offset */}
                                      {isOffset && (
                                        <g className="pointer-events-none opacity-85">
                                          <line
                                            x1={lbl.x}
                                            y1={lbl.y}
                                            x2={lbl.lx}
                                            y2={lbl.ly}
                                            stroke={lbl.isSelected ? "#f43f5e" : (lbl.isLinkedFriend ? "rgba(16,185,129,0.7)" : "rgba(59,130,246,0.45)")}
                                            strokeWidth="0.75"
                                            strokeDasharray="2 3"
                                          />
                                          <circle
                                            cx={lbl.lx}
                                            cy={lbl.ly}
                                            r="1.5"
                                            fill={lbl.isSelected ? "#f43f5e" : (lbl.isLinkedFriend ? "#10b981" : "#3b82f6")}
                                          />
                                        </g>
                                      )}

                                      {/* Click/Tap region matching the text container */}
                                      <g 
                                        className="cursor-pointer"
                                        onClick={(e) => {
                                          if (lbl.type === 'skater' && lbl.skRef) {
                                            e.stopPropagation();
                                            sounds.playSelect();
                                            setSelectedLiveSkater(lbl.skRef);
                                          }
                                        }}
                                      >
                                        {/* Elegant glassmorphic background box */}
                                        <rect
                                          x={boxX}
                                          y={boxY}
                                          width={widthApprox}
                                          height={boxHeight}
                                          fill="rgba(5, 5, 5, 0.95)"
                                          stroke={lbl.isSelected ? "#f43f5e" : (lbl.isLinkedFriend ? "#10b981" : (lbl.type === 'self' ? "#ef4444" : "rgba(255,255,255,0.18)"))}
                                          strokeWidth="0.75"
                                          rx="2"
                                          className="transition-colors duration-150 hover:stroke-white shadow-2xl backdrop-blur-md"
                                        />

                                        {/* High-tech Left Accent Bar */}
                                        <rect
                                          x={boxX}
                                          y={boxY}
                                          width="2.5"
                                          height={boxHeight}
                                          fill={lbl.isSelected ? "#f43f5e" : (lbl.isLinkedFriend ? "#10b981" : (lbl.type === 'self' ? "#ef4444" : "rgba(59,130,246,0.5)"))}
                                          rx="1"
                                        />

                                        {/* Label text - indented past left accent bar */}
                                        <text
                                          x={boxX + 7}
                                          y={lbl.ly + 3.2}
                                          textAnchor="start"
                                          className={`text-[6.5px] font-mono font-bold tracking-tight select-none transition-colors duration-150 ${
                                            lbl.isSelected
                                              ? 'fill-rose-400 font-extrabold'
                                              : lbl.type === 'self'
                                                ? 'fill-red-400 font-extrabold'
                                                : lbl.isLinkedFriend
                                                  ? 'fill-emerald-400'
                                                  : 'fill-zinc-300 hover:fill-white'
                                          }`}
                                        >
                                          {lbl.text}
                                        </text>
                                      </g>
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          })()}
                        </g>

                        {/* STATIC OVERLAY HUD RANGE LABELS */}
                        <g className="pointer-events-none opacity-40 select-none">
                          <text x="210" y="105" className="text-[6.5px] font-mono fill-white font-black tracking-widest uppercase">50M RANGE</text>
                          <text x="210" y="55" className="text-[6.5px] font-mono fill-white font-black tracking-widest uppercase">100M RANGE</text>
                          <text x="215" y="15" className="text-[6.5px] font-mono fill-white font-black tracking-widest uppercase">150M RANGE</text>
                          
                          {/* Inner crosshair HUD sights */}
                          <circle cx="200" cy="150" r="3" fill="none" stroke={gpsActive ? "#ef4444" : "#ffffff"} strokeWidth="1" opacity="0.4" />
                        </g>

                        {/* ROTATING RADAR SWEEPER LINE */}
                        <g 
                          style={{ 
                            transformOrigin: '200px 150px',
                            animation: 'radarSweep 5s linear infinite'
                          }} 
                          className="pointer-events-none"
                        >
                          {/* Radial sweeping line */}
                          <line 
                            x1="200" 
                            y1="150" 
                            x2="200" 
                            y2="-20" 
                            stroke={gpsActive ? "rgba(239, 68, 68, 0.45)" : "rgba(59, 130, 246, 0.35)"} 
                            strokeWidth="1.5" 
                            strokeDasharray="2 1"
                          />
                          {/* Faint wedge trace trailing behind */}
                          <polygon 
                            points="200,150 200,-20 170,-10" 
                            fill={gpsActive ? "rgba(239, 68, 68, 0.08)" : "rgba(59, 130, 246, 0.06)"} 
                          />
                        </g>
                      </svg>
                    </div>







                    {/* INTEGRATED SKATER LINK-UP SATELLITE COM-LINK TERMINAL */}
                    {false && selectedLiveSkater && (
                      <div 
                        id="radar-connection-terminal" 
                        className={`absolute right-2 sm:right-4 top-48 max-w-[210px] w-[calc(100%-16px)] sm:w-full bg-black/95 border border-red-500/30 p-2 sm:p-2.5 z-20 rounded-xs select-none shadow-[0_8px_32px_rgba(185,28,28,0.2)] backdrop-blur-xs animate-in fade-in slide-in-from-right duration-200 transition-all duration-300 ${
                          connectionTerminalCollapsed ? 'h-9 overflow-hidden' : 'space-y-2'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-red-500/20 pb-1">
                          <button
                            type="button"
                            onClick={() => { sounds.playTick(); setConnectionTerminalCollapsed(p => !p); }}
                            className="text-[8px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 font-mono hover:text-white cursor-pointer select-none text-left"
                            title={connectionTerminalCollapsed ? "Expand Connection" : "Collapse Connection"}
                          >
                            <Wifi className={`w-3 h-3 text-red-500 ${connectionTerminalCollapsed ? '' : 'animate-pulse'}`} /> 
                            LINK {connectionTerminalCollapsed ? '[+]' : '[-]'}
                          </button>
                          <div className="flex items-center gap-1.5">
                            {!connectionTerminalCollapsed && (
                              <button 
                                type="button"
                                onClick={() => { sounds.playSelect(); setSelectedLiveSkater(null); }}
                                className="text-[7.5px] font-mono text-zinc-400 hover:text-white px-1 uppercase hover:bg-neutral-800 transition-colors rounded-xs cursor-pointer"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        </div>

                        {!connectionTerminalCollapsed && (
                          <div className="space-y-1.5 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-white uppercase font-mono">@{selectedLiveSkater.handle}</span>
                            <span className="text-[7.5px] bg-red-950 text-red-400 font-bold px-1 py-0.2 rounded-xs animate-pulse font-mono">
                              LV {selectedLiveSkater.level || 1}
                            </span>
                          </div>

                          {selectedLiveSkater.motto && (
                            <div className="text-[8.5px] text-zinc-400 italic bg-white/5 p-1 border-l border-red-500/30 font-sans leading-tight">
                              "{selectedLiveSkater.motto}"
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1 text-[8px] uppercase tracking-tighter text-zinc-400 font-mono">
                            <div className="bg-white/5 p-1 border border-white/5">
                              Style: <span className="text-white block font-black">{selectedLiveSkater.skateStyle || "STREET"}</span>
                            </div>
                            <div className="bg-white/5 p-1 border border-white/5">
                              Reputation: <span className="text-white block font-black">{selectedLiveSkater.reputation || 0} XP</span>
                            </div>
                          </div>

                          {selectedLiveSkater.activeLocation && (() => {
                            const exactCoords = selectedLiveSkater.activeLocation.coords;
                            const coords = getSkaterCoords(selectedLiveSkater);
                            const hasTrace = selectedLiveSkater.tracingAllowedUsers?.includes(currentUser?.uid || '') || selectedLiveSkater.id === currentUser?.uid;
                            const userCoords = profile?.activeLocation?.coords;
                            const dist = (coords && userCoords)
                              ? Math.round(Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5)
                              : null;
                            return (
                              <div className="text-[8px] bg-zinc-950 p-1 border border-white/5 space-y-1">
                                <div className="text-[7px] text-zinc-500 tracking-wider">TELEMETRY DISTANCE:</div>
                                <div className="font-bold text-white flex justify-between gap-1 items-center font-mono">
                                  <span className="truncate">{selectedLiveSkater.activeLocation.spotName}</span>
                                  {dist !== null && (
                                    <span className={hasTrace ? "text-emerald-400" : "text-amber-500"}>
                                      {dist}m
                                    </span>
                                  )}
                                </div>
                                <div className="text-[7px] leading-tight font-mono select-none flex items-center justify-between border-t border-white/5 pt-1 mt-1">
                                  <span className="text-zinc-500">SIGNAL LOCK:</span>
                                  <span className={hasTrace ? "text-emerald-400 font-black" : "text-amber-500 font-black animate-pulse"}>
                                    {hasTrace ? "PRECISE [DIRECT]" : "SCRAMBLED [APPROX]"}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div>
                            {selectedLiveSkater.id !== currentUser?.uid && (
                              <div className="space-y-1.5 mt-2 pt-2 border-t border-red-500/10">
                                <div className="text-[7.5px] font-black text-emerald-400 tracking-wider flex items-center gap-1 font-mono uppercase">
                                  <MessageSquare className="w-2.5 h-2.5" /> SECURE COM-LINK CHAT
                                </div>
                                <div className="h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar text-[8.5px] font-mono leading-tight bg-zinc-950 p-1.5 border border-white/5 rounded-xs">
                                  {activeMessages.map((msg) => (
                                    <div key={msg.id} className="text-[8.5px] leading-snug break-all">
                                      <span className={msg.senderUid === currentUser?.uid ? "text-emerald-400 font-bold" : "text-[#dd1111] font-bold"}>
                                        {msg.senderUid === currentUser?.uid ? "YOU" : `@${msg.senderHandle}`}
                                      </span>: <span className="text-zinc-200">{msg.text}</span>
                                    </div>
                                  ))}
                                  {activeMessages.length === 0 && (
                                    <div className="text-zinc-650 text-[7px] italic text-center py-2 uppercase leading-none">
                                      Com-link open. Send a wave signal...
                                    </div>
                                  )}
                                </div>
                                <form onSubmit={handleSendChatMsg} className="flex gap-1">
                                  <input
                                    type="text"
                                    required
                                    placeholder="WAVE SIGNAL..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    className="bg-black border border-white/20 text-[8px] text-white px-1 py-0.5 outline-none focus:border-red-500 font-mono flex-1 uppercase rounded-xs"
                                  />
                                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-1.5 py-0.5 rounded-xs text-[8px] font-black uppercase cursor-pointer">
                                    SEND
                                  </button>
                                </form>
                              </div>
                            )}

                            {selectedLiveSkater.id !== currentUser?.uid && (
                              profile?.friends?.some(fName => fName.toLowerCase() === selectedLiveSkater.handle.toLowerCase()) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemoveDirectFriend(selectedLiveSkater.handle);
                                  }}
                                  className="w-full mt-2 bg-red-950/20 border border-red-500/30 hover:bg-red-900/40 text-red-400 font-mono text-[8px] py-1 rounded-xs select-none duration-100 flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  DISCONNECT WIRELESS LINK (UNLINK FRIEND)
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleAddDirectFriend(selectedLiveSkater.handle);
                                  }}
                                  className="w-full mt-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 font-mono text-[8px] py-1 rounded-xs select-none duration-100 flex items-center justify-center gap-1.5 hover:text-white cursor-pointer"
                                >
                                  CONNECT WIRELESS LINK (ADD FRIEND)
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </>
                )}

                {mapViewMode === 'google' && hasValidGoogleMapsKey && (
                  <div className="absolute inset-0 bg-[#0c0c0c] z-10 w-full h-full flex flex-col">
                    <div className="flex-1 w-full relative h-full min-h-[300px]">
                      <APIProvider apiKey={GOOGLE_MAPS_KEY} version="weekly">
                        <Map
                          center={getCenterLatLng()}
                          zoom={14}
                          mapId="DEMO_MAP_ID"
                          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                          style={{ width: '100%', height: '100%' }}
                          gestureHandling="greedy"
                          onClick={(e) => {
                            if (!gpsActive) return;
                            if (e.detail?.latLng) {
                              const lat = e.detail.latLng.lat;
                              const lng = e.detail.latLng.lng;
                              setGpsCoords({ latitude: lat, longitude: lng });
                              updateProfileGPS(lat, lng);
                              
                              const projected = projectGpsToMapCoords(lat, lng, currentDistrictId);
                              
                              addTickerMessage(`GPS LOCK SYNCED: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`);
                            }
                          }}
                        >
                          {/* Meetup points (District spots) */}
                          {spotList.map((spot, idx) => {
                            const isTarget = spot.name === selectedSpot.name;
                            const spotGps = getSpotGpsCoords(spot.coords, currentDistrictId);
                            return (
                              <AdvancedMarker
                                key={`gmarker-spot-${idx}`}
                                position={spotGps}
                                onClick={() => {
                                  sounds.playTick();
                                  setSelectedSpot(spot);
                                  setShowSpotDetails(true);
                                }}
                              >
                                <div className={`p-1 flex flex-col items-center ${isTarget ? 'scale-110 z-50 animate-pulse' : 'opacity-85 scale-100'}`}>
                                  <div className={`flex items-center gap-1.5 px-2 py-1 border text-[10px] font-black font-mono tracking-tighter rounded-xs shadow-md ${
                                    isTarget 
                                      ? 'bg-yellow-500 text-black border-yellow-500' 
                                      : 'bg-black/95 text-white border-white/20'
                                  }`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping animate-duration-1000" />
                                    <span>{spot.name} {isTarget ? '[ACTIVE]' : ''}</span>
                                  </div>
                                  <div className={`w-3 h-3 rotate-45 border-r border-b mt-[-6px] ${
                                    isTarget ? 'bg-yellow-500 border-yellow-500' : 'bg-black border-white/20'
                                  }`} />
                                </div>
                              </AdvancedMarker>
                            );
                          })}

                          {/* Real-time other skaters */}
                          {allSkaters
                            .filter(sk => sk.id !== currentUser?.uid && sk.activeLocation?.districtId === currentDistrictId)
                            .map((sk, idx) => {
                              const coords = getSkaterCoords(sk);
                              if (!coords) return null;
                              const skaterGps = getSpotGpsCoords(coords, currentDistrictId);
                              return (
                                <AdvancedMarker 
                                  key={`gmarker-skater-${idx}`} 
                                  position={skaterGps}
                                  onClick={() => {
                                    sounds.playSelect();
                                    setSelectedLiveSkater(sk);
                                  }}
                                >
                                  <div className="flex flex-col items-center z-40 cursor-pointer hover:scale-105 transition-transform">
                                    <div className="bg-blue-600/95 text-white border border-blue-400 px-1.5 py-0.5 text-[8.5px] font-black font-mono tracking-tighter shadow-md rounded-xs">
                                      @{sk.handle}
                                    </div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white animate-pulse mt-1" />
                                  </div>
                                </AdvancedMarker>
                              );
                            })
                          }

                          {/* Current user marker */}
                          {gpsActive && profile?.activeLocation?.coords && (() => {
                            const selfGps = getSpotGpsCoords(profile.activeLocation.coords, currentDistrictId);
                            return (
                              <AdvancedMarker position={selfGps}>
                                <div className="flex flex-col items-center z-50">
                                  <div className="bg-rose-600/95 text-white border border-rose-400 px-1.5 py-0.5 text-[8.5px] font-black font-mono tracking-tighter shadow-md animate-bounce rounded-xs">
                                    @{profile.handle} (YOU)
                                  </div>
                                  <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white animate-ping absolute" />
                                  <div className="w-3.5 h-3.5 rounded-full bg-red-600 border border-white mt-1 z-10" />
                                </div>
                              </AdvancedMarker>
                            );
                          })()}
                        </Map>
                      </APIProvider>
                    </div>
                  </div>
                )}

                {mapViewMode === 'google' && !hasValidGoogleMapsKey && (
                  <div className="absolute inset-0 bg-[#0c0c0c] z-10 w-full h-full flex flex-col justify-center items-center p-6 border border-white/5 bg-radial from-red-950/10 to-black select-none">
                    <div className="border border-red-500/30 bg-black/80 p-5 max-w-sm text-center space-y-3.5 font-mono rounded-xs shadow-2xl">
                      <div className="flex justify-center">
                        <Globe className="w-10 h-10 text-red-500 animate-pulse" />
                      </div>
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Google Maps Connection Standby</h3>
                      <p className="text-[9.5px] text-zinc-400 leading-relaxed text-left">
                        To unlock active satellite terrain maps showing real-time GPS coordinates of other skaters or meetup points:
                      </p>
                      <div className="text-left text-[9px] text-zinc-500 space-y-1.5 bg-zinc-950/90 p-3 border border-white/5">
                        <p><strong>1. Get key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">Get API Key</a></p>
                        <p><strong>2. Configure secret in AI Studio:</strong></p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right)</li>
                          <li>Open <strong>Secrets</strong> menu option</li>
                          <li>Add name: <code>GOOGLE_MAPS_PLATFORM_KEY</code></li>
                          <li>Paste key value and press <strong>Enter</strong></li>
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => { sounds.playSelect(); setMapViewMode('vector'); }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-2.5 text-[9px] uppercase tracking-wider transition-colors rounded-xs cursor-pointer"
                      >
                        Fallback to Radar HUD Grid Mode
                      </button>
                    </div>
                  </div>
                )}

                {/* Locked Matrix Target Box */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none md:flex hidden">
                  <div className="bg-black/95 border border-white/20 px-3 py-1.5 rounded-xs shadow-[0_8px_32px_rgba(0,0,0,0.8)] font-mono text-[8px] uppercase text-zinc-400 select-none tracking-wider text-center flex items-center gap-4">
                    <div className="text-[8px] font-black tracking-widest text-red-500 animate-pulse flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> SIGHT TARGET LOCK
                    </div>
                    <div className="h-4 w-[1px] bg-white/10" />
                    {hoverCoords ? (
                      <div className="flex gap-3 text-white">
                        <div>LAT: <span className="font-bold text-red-500">{hoverCoords.lat.toFixed(5)}° N</span></div>
                        <div>LNG: <span className="font-bold text-red-500">{hoverCoords.lng.toFixed(5)}° E</span></div>
                        <div>GRID_XY: <span className="font-bold text-zinc-300">{hoverCoords.x}m, {hoverCoords.y}m</span></div>
                      </div>
                    ) : (
                      <div className="text-zinc-500 italic">Awaiting coordinate lock...</div>
                    )}
                  </div>
                </div>

                {/* Detected Signals Scanner List Panel - HIDDEN as replaced by bento-grid tactical radar dashboard below */}
                <div 
                  id="radar-nearby-signals-overlay" 
                  className="hidden"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-mono">
                    <button
                      type="button"
                      onClick={() => { sounds.playTick(); setSignalsOverlayCollapsed(p => !p); }}
                      className="text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5 hover:text-white cursor-pointer select-none text-left"
                      title={signalsOverlayCollapsed ? "Expand Tactical Grid Panel" : "Collapse Tactical Grid Panel"}
                    >
                      <Radio className={`w-3.5 h-3.5 text-red-500 ${signalsOverlayCollapsed ? '' : 'animate-pulse'}`} /> 
                      TACTICAL PANEL {signalsOverlayCollapsed ? '[+]' : '[-]'}
                    </button>
                    {!signalsOverlayCollapsed && (
                      <span className="text-[7.5px] font-mono text-zinc-400 bg-white/10 px-1.5 py-0.5 uppercase tracking-wider rounded-xs">
                        {currentDistrictId} SEC
                      </span>
                    )}
                  </div>

                  {!signalsOverlayCollapsed && (
                    <div className="space-y-2.5 text-left font-mono animate-in fade-in slide-in-from-top-1 duration-150">
                      
                      {/* Active GPS indicators */}
                      <div className="flex items-center justify-between p-1 bg-white/5 border border-white/5 rounded-xs text-[8px] font-mono">
                        <span className="text-zinc-400">GPS STATUS:</span>
                        {gpsActive ? (
                          <span className="text-red-500 font-bold flex items-center gap-1 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" /> ON
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { sounds.playSelect(); startGpsTracking(); }}
                            disabled={isGpsLoading}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-1.5 py-0.5 rounded-xs text-[7px] uppercase tracking-tighter cursor-pointer"
                          >
                            {isGpsLoading ? "SCAN..." : "ACTIVATE"}
                          </button>
                        )}
                      </div>

                      {/* TACTICAL GRID SPECTRUM FILTERS (Merged neatly here) */}
                      <div className="space-y-1 border-t border-white/5 pt-1.5">
                        <div className="flex items-center gap-1">
                          <Filter className="w-2.5 h-2.5 text-zinc-400" />
                          <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider select-none">GRID PRESET FILTER:</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 border border-white/10 bg-black/50 p-0.5 rounded-sm">
                          {(['all', 'spots', 'users'] as const).map((filterVal) => (
                            <button
                              key={filterVal}
                              type="button"
                              onClick={() => { sounds.playTick(); setMapDisplayFilter(filterVal); }}
                              className={`text-[7px] font-black py-0.5 tracking-wider transition-all uppercase rounded-xs ${
                                mapDisplayFilter === filterVal
                                  ? 'bg-red-600 text-white'
                                  : 'text-zinc-500 hover:text-zinc-200'
                              }`}
                            >
                              {filterVal}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* MAX DISTANCE SLIDER (Merged neatly here) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[7px] select-none">
                          <span className="text-zinc-500 font-bold uppercase tracking-wider">MAX RANGE DEVIATION:</span>
                          <span className={`font-black uppercase ${mapDistanceFilter > 0 ? "text-emerald-400 animate-pulse" : "text-zinc-400"}`}>
                            {mapDistanceFilter > 0 ? `${mapDistanceFilter}m` : "MAX RANGE"}
                          </span>
                        </div>

                        {!gpsActive ? (
                          <div className="text-[7px] text-amber-500/95 font-bold leading-normal border border-amber-500/10 bg-amber-500/5 px-1 pb-0.5 uppercase rounded-xs select-none">
                            GPS inactive. <button type="button" onClick={() => { sounds.playSelect(); enableSimulatedGps(); }} className="underline text-white hover:text-amber-400 cursor-pointer">DEPLOY GPS</button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <input
                              type="range"
                              min="0"
                              max="600"
                              step="50"
                              value={mapDistanceFilter}
                              onChange={(e) => {
                                sounds.playTick();
                                setMapDistanceFilter(parseInt(e.target.value, 10));
                              }}
                              className="w-full accent-red-600 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                            />
                            <div className="flex justify-between items-center text-[5.5px] font-bold text-zinc-600 select-none">
                              <span>ALL</span>
                              <span>150M</span>
                              <span>300M</span>
                              <span>450M</span>
                              <span>600M</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* TARGET LINK ISOLATION MODE (Singling users out!) */}
                      <div className="flex items-center justify-between p-1 bg-white/5 border border-white/5 rounded-xs text-[8px] font-mono">
                        <span className="text-zinc-400">TARGET HUD ISOLATE:</span>
                        <button
                          type="button"
                          onClick={() => { sounds.playTick(); setSingleTargetIsolation(p => !p); }}
                          className={`px-1.5 py-0.5 rounded-xs text-[6.5px] font-black tracking-wider transition-all cursor-pointer ${
                            singleTargetIsolation 
                              ? 'bg-rose-600 text-white animate-pulse' 
                              : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                          }`}
                        >
                          {singleTargetIsolation ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* Nearby signals matching search and distance limit */}
                      <div className="space-y-1 border-t border-white/15 pt-2">
                        <div className="flex items-center justify-between text-[7px] select-none font-bold text-zinc-500">
                          <span>RADAR ACTIVE SIGNALS:</span>
                          <span className="text-red-500">
                            {
                              allSkaters.filter(sk => {
                                if (sk.id === currentUser?.uid) return false;
                                if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                                if (mapDistanceFilter > 0) {
                                  const coords = sk.activeLocation?.coords;
                                  const userCoords = profile?.activeLocation?.coords;
                                  if (coords && userCoords) {
                                    const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                                    return distance <= mapDistanceFilter;
                                  }
                                }
                                return true;
                              }).length
                            } ON-GRID
                          </span>
                        </div>

                        <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5 custom-scrollbar pt-1">
                          {allSkaters
                            .filter(sk => {
                              if (sk.id === currentUser?.uid) return false;
                              if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                              if (mapDistanceFilter > 0) {
                                const coords = sk.activeLocation?.coords;
                                const userCoords = profile?.activeLocation?.coords;
                                if (coords && userCoords) {
                                  const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                                  return distance <= mapDistanceFilter;
                                }
                              }
                              return true;
                            })
                            .map((sk) => {
                              const coords = sk.activeLocation?.coords;
                              const isFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                              const userCoords = profile?.activeLocation?.coords;
                              const distanceMVal = (coords && userCoords) 
                                ? Math.round(Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5) 
                                : null;
                              const isCurrentlyTargeted = selectedLiveSkater?.id === sk.id;

                              return (
                                <div 
                                  key={sk.id}
                                  className={`flex items-center justify-between gap-1 text-[9px] p-1.5 border hover:border-white/15 transition-all rounded-xs ${
                                    isCurrentlyTargeted 
                                      ? 'bg-rose-950/40 border-rose-500/40' 
                                      : 'bg-white/5 border-white/5'
                                  }`}
                                >
                                  <div className="flex flex-col min-w-0 pr-1 text-left">
                                    <span className="font-bold text-white uppercase truncate font-mono">@{sk.handle}</span>
                                    <span className="text-[7.5px] text-zinc-500 uppercase font-mono tracking-tighter">
                                      {distanceMVal !== null ? `${distanceMVal}m away` : 'Active'} • LV {sk.level || 1}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sounds.playTick();
                                        if (coords) {
                                          setPanOffset({
                                            x: 200 - coords.x,
                                            y: 150 - coords.y
                                          });
                                          setZoomScale(1.8);
                                          addTickerMessage(`LOCKED LOCATE ON @${sk.handle}`);
                                        }
                                      }}
                                      className="bg-white/10 hover:bg-white/20 text-white p-1 hover:text-red-400 transition-colors cursor-pointer rounded-xs"
                                      title="Locate Surfer"
                                    >
                                      <Locate className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sounds.playSelect();
                                        setSelectedLiveSkater(sk);
                                      }}
                                      className="bg-red-600 hover:bg-red-700 text-white font-black px-1.5 py-0.5 text-[8px] uppercase tracking-tighter rounded-xs transition-colors cursor-pointer"
                                    >
                                      {isCurrentlyTargeted ? "LOCK" : (isFriend ? "View" : "Link")}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          {allSkaters.filter(sk => {
                            if (sk.id === currentUser?.uid) return false;
                            if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                            if (mapDistanceFilter > 0) {
                              const coords = sk.activeLocation?.coords;
                              const userCoords = profile?.activeLocation?.coords;
                              if (coords && userCoords) {
                                const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                                return distance <= mapDistanceFilter;
                              }
                            }
                            return true;
                          }).length === 0 && (
                            <div className="text-[8px] text-zinc-600 italic text-center py-2.5">
                              NO ACTIVE SIGNALS MATCH FILTER
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* Satellite Dynamic Link Terminal */}
                {selectedLiveSkater && (
                  <div 
                    id="radar-connection-terminal" 
                    className={`absolute right-3 top-3 max-w-[215px] w-[calc(100%-24px)] xs:w-[215px] bg-black/95 border border-red-500/40 p-2.5 z-20 rounded-xs select-none shadow-[0_8px_32px_rgba(185,28,28,0.35)] backdrop-blur-xs animate-in fade-in slide-in-from-right duration-200 transition-all duration-300 ${
                      connectionTerminalCollapsed ? 'h-[36px] overflow-hidden' : 'space-y-2'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-1.5">
                      <button
                        type="button"
                        onClick={() => { sounds.playTick(); setConnectionTerminalCollapsed(p => !p); }}
                        className="text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5 font-mono hover:text-white cursor-pointer select-none text-left"
                        title={connectionTerminalCollapsed ? "Expand Connection" : "Collapse Connection"}
                      >
                        <Wifi className={`w-3.5 h-3.5 text-red-500 ${connectionTerminalCollapsed ? '' : 'animate-pulse'}`} /> 
                        LINK {connectionTerminalCollapsed ? '[+]' : '[-]'}
                      </button>
                      <button 
                        type="button"
                        onClick={() => { sounds.playSelect(); setSelectedLiveSkater(null); }}
                        className="text-[8px] font-mono text-zinc-400 hover:text-white px-1.5 uppercase hover:bg-neutral-800 transition-colors rounded-xs cursor-pointer"
                      >
                        Close
                      </button>
                    </div>

                    {!connectionTerminalCollapsed && (
                      <div className="space-y-1.5 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-white uppercase font-mono">@{selectedLiveSkater.handle}</span>
                          <span className="text-[7.5px] bg-red-950 text-red-400 font-bold px-1.5 py-0.5 rounded-xs animate-pulse font-mono">
                            LV {selectedLiveSkater.level || 1}
                          </span>
                        </div>

                        {selectedLiveSkater.motto && (
                          <div className="text-[8.5px] text-zinc-400 italic bg-white/5 p-1.5 border-l-2 border-red-500/40 font-sans leading-tight">
                            "{selectedLiveSkater.motto}"
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-1 text-[8px] uppercase tracking-tighter text-zinc-400 font-mono">
                          <div className="bg-white/5 p-1 border border-white/5">
                            Style: <span className="text-white block font-semibold">{selectedLiveSkater.skateStyle || "STREET"}</span>
                          </div>
                          <div className="bg-white/5 p-1 border border-white/5">
                            Rep: <span className="text-white block font-semibold">{selectedLiveSkater.reputation || 0} XP</span>
                          </div>
                        </div>

                        {selectedLiveSkater.activeLocation && (() => {
                          const exactCoords = selectedLiveSkater.activeLocation.coords;
                          const coords = getSkaterCoords(selectedLiveSkater);
                          const hasTrace = selectedLiveSkater.tracingAllowedUsers?.includes(currentUser?.uid || '') || selectedLiveSkater.id === currentUser?.uid;
                          const userCoords = profile?.activeLocation?.coords;
                          const dist = (coords && userCoords)
                            ? Math.round(Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5)
                            : null;
                          return (
                            <div className="text-[8px] bg-zinc-950 p-1.5 border border-white/5 space-y-1">
                              <div className="text-[7px] text-zinc-500 tracking-wider">TELEMETRY RANGE:</div>
                              <div className="font-bold text-white flex justify-between gap-1 items-center font-mono font-bold font-mono">
                                <span className="truncate">{selectedLiveSkater.activeLocation.spotName}</span>
                                {dist !== null && (
                                  <span className={hasTrace ? "text-emerald-400 font-black animate-pulse" : "text-amber-500 animate-pulse"}>
                                    {dist}m
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        <div>
                          {selectedLiveSkater.id !== currentUser?.uid && (
                            <div className="space-y-1.5 mt-2 pt-2 border-t border-red-500/10">
                              <div className="text-[8px] font-black text-emerald-400 tracking-wider flex items-center gap-1 font-mono uppercase">
                                <MessageSquare className="w-2.5 h-2.5" /> SECURE COM-LINK CHAT
                              </div>
                              <div className="h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar text-[8.5px] font-mono leading-tight bg-zinc-950 p-1.5 border border-white/5 rounded-xs">
                                {activeMessages.map((msg) => (
                                  <div key={msg.id} className="text-[8px] leading-snug break-all">
                                    <span className={msg.senderUid === currentUser?.uid ? "text-emerald-400 font-bold" : "text-[#dd1111] font-bold"}>
                                      {msg.senderUid === currentUser?.uid ? "YOU" : `@${msg.senderHandle}`}
                                    </span>: <span className="text-zinc-200">{msg.text}</span>
                                  </div>
                                ))}
                                {activeMessages.length === 0 && (
                                  <div className="text-zinc-650 text-[7px] italic text-center py-2 uppercase leading-none">
                                    COM-LINK COUPLING STABLE
                                  </div>
                                )}
                              </div>
                              <form onSubmit={handleSendChatMsg} className="flex gap-1">
                                <input
                                  type="text"
                                  required
                                  placeholder="SIGNAL..."
                                  value={chatInput}
                                  onChange={(e) => setChatInput(e.target.value)}
                                  className="bg-black border border-white/20 text-[8px] text-white px-1.5 py-0.5 outline-none focus:border-red-500 font-mono flex-1 uppercase rounded-xs"
                                />
                                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded-xs text-[8px] font-black uppercase cursor-pointer">
                                  SEND
                                </button>
                              </form>
                            </div>
                          )}

                          {selectedLiveSkater.id !== currentUser?.uid && (
                            profile?.friends?.some(fName => fName.toLowerCase() === selectedLiveSkater.handle.toLowerCase()) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleRemoveDirectFriend(selectedLiveSkater.handle);
                                }}
                                className="w-full mt-2 bg-red-950/20 border border-red-500/30 hover:bg-red-900/40 text-red-400 font-mono text-[8px] py-1 rounded-xs select-none duration-100 flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                DISCONNECT WIRELESS LINK (UNLINK FRIEND)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  handleAddDirectFriend(selectedLiveSkater.handle);
                                }}
                                className="w-full mt-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 font-mono text-[8px] py-1 rounded-xs select-none duration-100 flex items-center justify-center gap-1.5 hover:text-white cursor-pointer"
                              >
                                START WIRELESS COUPLING (ADD FRIEND)
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Centralized Map Control HUD Console Deck */}
                <div 
                  id="centralized-map-control-console" 
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-lg bg-black/95 border border-white/25 rounded-xs shadow-[0_12px_40px_rgba(0,0,0,0.9)] p-2 sm:p-2.5 select-none flex flex-col gap-1.5 z-20 backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
                    {/* View Mode */}
                    <div className="flex items-center bg-white/5 border border-white/10 p-0.5 rounded-xs">
                      <button
                        type="button"
                        onClick={() => { sounds.playSelect(); setMapViewMode('vector'); }}
                        className={`px-2 py-1 text-[8.5px] tracking-widest font-black uppercase transition-colors rounded-xs cursor-pointer ${
                          mapViewMode === 'vector' ? 'bg-red-600 text-white font-black' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Radar HUD
                      </button>
                      <button
                        type="button"
                        disabled={!hasValidGoogleMapsKey}
                        onClick={() => { sounds.playSelect(); setMapViewMode('google'); }}
                        className={`px-2 py-1 text-[8.5px] tracking-widest font-black uppercase transition-colors rounded-xs cursor-pointer relative flex items-center gap-1 ${
                          mapViewMode === 'google' ? 'bg-red-600 text-white font-black' : 'text-zinc-500 hover:text-zinc-200 disabled:opacity-50'
                        }`}
                        title={!hasValidGoogleMapsKey ? "Google Maps secret missing" : "Switch to Satellite imagery"}
                      >
                        Satel-Link
                      </button>
                    </div>

                    {/* District Sector */}
                    <div className="text-[9px] font-sans font-black uppercase text-white bg-white/5 border border-white/10 px-2 py-1 rounded-xs tracking-wider">
                      SECTOR: {currentDistrict.name}
                    </div>

                    {/* Layers selectors */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { sounds.playTick(); setLayersDropdownOpen(p => !p); }}
                        className="bg-white/5 border border-white/10 text-white text-[8px] font-black uppercase px-2 py-1 hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer rounded-xs"
                      >
                        <Layers className="w-3.5 h-3.5 text-zinc-400" />
                        Layers
                      </button>
                      {layersDropdownOpen && (
                        <div className="absolute bottom-full right-0 mb-1.5 w-32 bg-black border border-white/20 p-2 space-y-1.5 shadow-2x z-30 rounded-xs animate-in fade-in duration-100">
                          <label className="flex items-center gap-2 text-[8px] text-zinc-300 hover:text-white cursor-pointer font-mono select-none uppercase">
                            <input
                              type="checkbox"
                              checked={showHeatmap}
                              onChange={(e) => { sounds.playTick(); setShowHeatmap(e.target.checked); }}
                              className="accent-red-600 w-3 h-3 border-zinc-700 bg-neutral-900 focus:outline-none cursor-pointer"
                            />
                            Heatmap
                          </label>
                          <label className="flex items-center gap-2 text-[8px] text-zinc-300 hover:text-white cursor-pointer font-mono select-none uppercase">
                            <input
                              type="checkbox"
                              checked={showPatrolDanger}
                              onChange={(e) => { sounds.playTick(); setShowPatrolDanger(e.target.checked); }}
                              className="accent-red-600 w-3 h-3 border-zinc-700 bg-neutral-900 focus:outline-none cursor-pointer"
                            />
                            Danger Zones
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[8.5px] font-mono uppercase bg-zinc-950 p-1.5 border border-white/5 rounded-xs">
                    <div className="text-zinc-500 font-bold truncate tracking-wider max-w-[50%] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      COUPLED: OK
                    </div>
                    
                    {/* Zoom system */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-zinc-400 font-black tracking-normal">MAG {zoomScale.toFixed(1)}X</span>
                      <div className="grid grid-cols-3 gap-0.5 bg-white/5 p-0.5 border border-white/10 rounded-xs">
                        <button
                          type="button"
                          onClick={() => { sounds.playTick(); setZoomScale(z => Math.max(0.5, z - 0.25)); }}
                          className="bg-neutral-900 hover:bg-neutral-800 text-white p-1 rounded-xs transition-colors cursor-pointer flex items-center justify-center"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { sounds.playTick(); setZoomScale(z => Math.min(6.0, z + 0.25)); }}
                          className="bg-neutral-900 hover:bg-neutral-800 text-white p-1 rounded-xs transition-colors cursor-pointer flex items-center justify-center"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { sounds.playSelect(); setZoomScale(1.0); setPanOffset({ x: 0, y: 0 }); }}
                          className="bg-neutral-900 hover:bg-neutral-800 text-red-500 p-1 rounded-xs transition-colors cursor-pointer flex items-center justify-center font-black"
                          title="Recenter HUD Grid"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {radarScanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1.5px] z-10">
                    <div className="text-center font-mono space-y-2">
                      <div className="text-xl font-black italic text-white animate-pulse tracking-wide">GRID GPS SCANNING IN PROGRESS...</div>
                      <div className="w-48 h-1 bg-white/20 mx-auto rounded overflow-hidden">
                        <div className="h-full bg-white w-full animate-ping"></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tactical Active GPS HUD Panel vs Selected Spot details */}
                {gpsActive ? (
                  <div className="absolute bottom-[115px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-lg bg-black/95 border-2 border-red-500 p-4 rounded-sm backdrop-blur-md space-y-3 z-20">
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                        <h4 className="text-[10px] font-black uppercase text-white font-syne tracking-widest">
                          LIVE RUN: TELEMETRY CONNECTED
                        </h4>
                      </div>
                      <span className="text-[8px] font-mono bg-red-600 text-white px-1.5 py-0.5 font-bold uppercase tracking-wider">
                        ACTIVE SURFING
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center font-mono">
                      <div className="bg-white/5 border border-white/10 p-2">
                        <span className="text-[8px] text-white/40 block leading-none">TIME SEC</span>
                        <span className="text-sm font-bold text-white leading-none mt-1 inline-block">
                          {Math.floor(sessionDuration / 60)}M {sessionDuration % 60}S
                        </span>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-2">
                        <span className="text-[8px] text-white/40 block leading-none">STUNT SCORE</span>
                        <span className="text-sm font-bold text-emerald-400 leading-none mt-1 inline-block">+{sessionPoints} XP</span>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-2">
                        <span className="text-[8px] text-white/40 block leading-none">MAP TRAVEL</span>
                        <span className="text-[8.5px] font-bold text-zinc-300 leading-none mt-1 inline-block truncate max-w-full">
                          {gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : "CLICK MAP..."}
                        </span>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-2">
                        <span className="text-[8px] text-white/40 block leading-none">GAP TO SPOT</span>
                        <span className="text-xs font-bold text-rose-500 leading-none mt-1 inline-block">
                          {getSelectedSpotDistance() !== null ? `${getSelectedSpotDistance()}M` : '---'}
                        </span>
                      </div>
                    </div>

                    {/* Stunt Confirmer Form */}
                    <form onSubmit={handleTriggerLiveStunt} className="flex gap-2 font-mono">
                      <input 
                        type="text"
                        required
                        placeholder="ENTER LIVE ACTION LANDED (e.g. Heelflip)"
                        value={stuntText}
                        onChange={(e) => setStuntText(e.target.value)}
                        className="bg-zinc-950 border border-red-500/30 text-xs text-white p-2 outline-none focus:border-red-500 flex-1 uppercase rounded-none font-mono"
                      />
                      <button 
                        type="submit"
                        className="bg-red-600 hover:bg-red-700 text-white font-black text-xs px-4 rounded-none uppercase tracking-wide cursor-pointer"
                      >
                        Land Stunt
                      </button>
                    </form>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={stopGpsTracking}
                        className="w-full bg-white hover:bg-zinc-200 text-black font-black uppercase tracking-wider py-2 text-xs rounded-none transition-all cursor-pointer"
                      >
                        SAVE OUTLAW XP TO DATABASE
                      </button>
                    </div>

                    {gpsError && (
                      <p className="text-[8px] text-yellow-500 font-mono italic text-center leading-none">
                        {gpsError}
                      </p>
                    )}
                  </div>
                ) : (
                  activeSpotDetails && showSpotDetails && (
                    <div className="absolute bottom-[115px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-lg bg-[#050505]/95 border-2 border-white/30 p-4 rounded-xs backdrop-blur-md z-20 shadow-2xl">
                      {isEditingSpot ? (
                        <form onSubmit={handleSaveSpotEdits} className="space-y-3 font-mono text-[10px]">
                          <div className="flex items-center justify-between border-b border-white/20 pb-1.5">
                            <span className="text-yellow-400 font-bold uppercase tracking-widest text-[9px]">● ADMIN SPOT OVERWRITE ACTIVE</span>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={isSavingSpot}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 font-black px-2 py-0.5 rounded-xs cursor-pointer uppercase transition-all"
                              >
                                {isSavingSpot ? 'SAVING...' : '[SAVE]'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { sounds.playSelect(); setIsEditingSpot(false); }}
                                className="bg-red-600 hover:bg-red-700 text-white border border-red-500 font-black px-2 py-0.5 rounded-xs cursor-pointer uppercase transition-all"
                              >
                                [CANCEL]
                              </button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <label className="block text-white/50 text-[8px] uppercase tracking-wider mb-1">Spot Name</label>
                              <input 
                                type="text"
                                value={editSpotName}
                                onChange={(e) => setEditSpotName(e.target.value)}
                                className="w-full bg-[#0d0d0d] border border-white/25 px-2 py-1 text-white uppercase text-xs focus:outline-none focus:border-white rounded-xs"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-white/50 text-[8px] uppercase tracking-wider mb-1">Spot Description</label>
                              <textarea 
                                value={editSpotDescription}
                                onChange={(e) => setEditSpotDescription(e.target.value)}
                                className="w-full bg-[#0d0d0d] border border-white/25 px-2 py-1 text-white text-[10px] focus:outline-none focus:border-white rounded-xs h-16 resize-none leading-relaxed"
                                required
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-white/50 text-[8px] uppercase tracking-wider mb-1">Obstacle Type</label>
                                <select 
                                  value={editSpotDifficulty}
                                  onChange={(e: any) => setEditSpotDifficulty(e.target.value)}
                                  className="w-full bg-[#0d0d0d] border border-white/25 px-2 py-1 text-white text-[10px] focus:outline-none focus:border-white rounded-xs uppercase cursor-pointer"
                                >
                                  <option value="Core">Core</option>
                                  <option value="Concrete">Concrete</option>
                                  <option value="Ledge">Ledge</option>
                                  <option value="Vandal">Vandal</option>
                                  <option value="Steel">Steel</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-white/50 text-[8px] uppercase tracking-wider mb-1">Patrol Risk (0-100%)</label>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={editSpotHype}
                                    onChange={(e) => setEditSpotHype(Number(e.target.value))}
                                    className="w-full accent-white bg-[#0d0d0d] cursor-pointer"
                                  />
                                  <span className="text-white/80 w-8 text-right font-black">{editSpotHype}%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </form>
                      ) : (
                        <>
                          <button 
                            type="button"
                            onClick={() => { sounds.playSelect(); setShowSpotDetails(false); }}
                            className="absolute top-2.5 right-2.5 text-white/50 hover:text-white font-mono text-[9px] border border-white/10 hover:bg-white/5 px-2 py-0.5 rounded-xs transition-colors cursor-pointer"
                            title="Dismiss Panel"
                          >
                            [X] DISMISS
                          </button>
                          
                          {isAdmin && (
                            <button 
                              type="button"
                              onClick={() => {
                                sounds.playTick();
                                setEditSpotName(activeSpotDetails.name);
                                setEditSpotDescription(activeSpotDetails.description);
                                setEditSpotDifficulty(activeSpotDetails.difficulty || 'Core');
                                setEditSpotHype(activeSpotDetails.hype || 50);
                                setIsEditingSpot(true);
                              }}
                              className="absolute top-2.5 right-[95px] text-yellow-400 hover:text-yellow-300 font-mono text-[9px] border border-yellow-500/30 hover:bg-yellow-500/5 px-2 py-0.5 rounded-xs transition-colors cursor-pointer"
                              title="Edit Details"
                            >
                              [EDIT]
                            </button>
                          )}

                          <div className="flex items-start justify-between gap-4 pt-1">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-red-500 animate-bounce" />
                                <h4 className="text-sm font-black uppercase text-white font-grotesk tracking-wide max-w-[190px] xs:max-w-xs truncate">{activeSpotDetails.name}</h4>
                              </div>
                              <p className="text-[10px] text-white/60 leading-relaxed font-sans lowercase max-w-[90%] select-text">
                                {activeSpotDetails.description}
                              </p>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <span className="text-[9px] font-mono bg-white text-black px-1.5 py-0.5 font-bold uppercase rounded-xs">
                                {activeSpotDetails.difficulty}
                              </span>
                              <div className="mt-1.5 text-[10px] font-bold font-mono text-white">
                                PATROL RISK: <span className="text-white bg-red-600 px-1 py-0.5 text-[9px] rounded-xs">{activeSpotDetails.hype}%</span>
                              </div>
                            </div>
                          </div>

                          {/* Video Mission Telemetry row */}
                          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                profile?.badges?.includes('mission_completed_' + activeSpotDetails.name.toLowerCase().replace(/\s+/g, '_'))
                                  ? 'bg-emerald-500 animate-pulse'
                                  : 'bg-red-500 animate-ping'
                              }`} />
                              <span className="text-[9.5px] font-mono uppercase tracking-wider text-white">
                                {profile?.badges?.includes('mission_completed_' + activeSpotDetails.name.toLowerCase().replace(/\s+/g, '_'))
                                  ? '✓ MISSION ACCOMPLISHED'
                                  : '● MISSION TAPE PENDING (.MP4)'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playSelect();
                                setMissionSpot(activeSpotDetails);
                                setShowMissionModal(true);
                              }}
                              className={`px-3 py-1.5 font-mono font-black text-[9px] uppercase tracking-wider rounded-xs transition-all cursor-pointer border ${
                                profile?.badges?.includes('mission_completed_' + activeSpotDetails.name.toLowerCase().replace(/\s+/g, '_'))
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                                  : 'bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse hover:scale-105'
                              }`}
                            >
                              {profile?.badges?.includes('mission_completed_' + activeSpotDetails.name.toLowerCase().replace(/\s+/g, '_'))
                                ? 'VIEW VERIFIED RECORD'
                                : 'TRANSMIT MISSION TAPE'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                )}

              </div>
            ) : (
              /* RETRO SKATE ARCADE CABINET */
              <div id="retro-game-cabinet" className="w-full flex flex-col items-center justify-center p-2 relative z-2 bg-[#050505] border border-white/20 rounded-md">
                {gameState === 'idle' && (
                  <div className="text-center py-8 space-y-4 w-full max-w-md">
                    <div className="w-14 h-14 bg-white mx-auto text-black rounded-lg flex items-center justify-center transform rotate-6 border border-black/10">
                      <Gamepad2 className="w-7 h-7 stroke-[2.5px]" />
                    </div>
                    
                    {/* Game Selection Tabs */}
                    <div className="flex gap-2 justify-center p-1 bg-white/5 border border-white/10 rounded-sm">
                      <button
                        type="button"
                        onClick={() => { sounds.playSelect(); setActiveGameType('alley'); }}
                        className={`flex-1 font-mono text-[9px] uppercase py-2 tracking-widest font-bold transition-all cursor-pointer ${
                          activeGameType === 'alley' 
                            ? 'bg-white text-black font-extrabold shadow-sm' 
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        [01] ALLEYWAY RUSH
                      </button>
                      <button
                        type="button"
                        onClick={() => { sounds.playSelect(); setActiveGameType('rail'); }}
                        className={`flex-1 font-mono text-[9px] uppercase py-2 tracking-widest font-bold transition-all cursor-pointer ${
                          activeGameType === 'rail' 
                            ? 'bg-white text-black font-extrabold shadow-sm' 
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        [02] RAIL BALANCER
                      </button>
                    </div>

                    <div>
                      {activeGameType === 'alley' ? (
                        <>
                          <h4 className="text-2xl font-black italic uppercase font-syne">Alleyway Rush v2</h4>
                          <p className="text-[10.5px] text-white/50 lowercase max-w-sm mt-1 mx-auto leading-relaxed font-grotesk">
                            Dodge police cones, barrier gates, and land flip tricks inside a local alley course. Earn +XP rewards instantly added to your database record on crash. Features dynamic speed progression.
                          </p>
                        </>
                      ) : (
                        <>
                          <h4 className="text-2xl font-black italic uppercase font-syne text-[#10b981]">Grind Rail Balancer</h4>
                          <p className="text-[10.5px] text-white/50 lowercase max-w-sm mt-1 mx-auto leading-relaxed font-grotesk">
                            Grind a perpetual steel rail! Maintain extreme tilt balance using Arrow keys (A/D) or clicking Left/Right. Pull high-stoke slide transitions (F/Space) to secure high score reputation XP!
                          </p>
                        </>
                      )}
                    </div>

                    <button 
                      onClick={triggerGameStart}
                      className="bg-white text-black font-black uppercase px-6 py-2.5 text-xs hover:bg-zinc-200 transition-colors cursor-pointer tracking-wider font-syne"
                    >
                      Initialize Arcade Game
                    </button>
                  </div>
                )}

                {gameState === 'playing' && (
                  <div className="w-full flex flex-col items-center">
                    <canvas 
                      ref={canvasRef}
                      width={440}
                      height={210}
                      className="border border-white/10 bg-black cursor-pointer max-w-full"
                    />
                    <div className="flex justify-between w-full mt-2 px-1 text-[9px] font-mono text-zinc-500">
                      <span>STUNT ACTION ACTIVE</span>
                      <span>CLICK ON CANVAS AREA TO JUMP</span>
                    </div>
                  </div>
                )}

                {gameState === 'crashed' && (
                  <div className="text-center py-10 space-y-3">
                    <div className="text-red-500 font-black italic text-3xl font-syne tracking-tighter">SKATER WIPED OUT!</div>
                    <p className="text-xs text-white/60 lowercase font-mono">
                      Stunted score reached: <span className="text-white font-bold">{gameScore} pts</span> // database locked.
                    </p>
                    <div className="flex gap-2 justify-center pt-2">
                      <button 
                        onClick={triggerGameStart}
                        className="bg-white text-black font-black uppercase px-4 py-2 text-xs hover:bg-zinc-200 transition-colors"
                      >
                        Try Again
                      </button>
                      <button 
                        onClick={closeGame}
                        className="border border-white/20 bg-white/5 hover:bg-white/10 text-white font-black uppercase px-4 py-2 text-xs transition-colors"
                      >
                        Exit cabinet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* ========================================================= */}
          {/* BENTO-GRID TACTICAL RADAR DASHBOARD & SYNC CONSOLE        */}
          {/* ========================================================= */}
          {!showGame && (
            <div 
              id="radar-bento-tactical-dashboard" 
              className="w-full bg-[#050505] border-t border-white/10 p-4 font-mono select-none text-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {/* PANEL 1: SUPABASE DUAL-WRITE TRANS-PORTR */}
              <div className="bg-black/40 border border-white/10 p-3 flex flex-col justify-between space-y-3 rounded-xs min-h-[220px]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 animate-pulse" /> SUPABASE TRANS-PORTER
                    </span>
                    <span className="text-[8px] bg-emerald-950 text-emerald-400 font-bold px-1.5 py-0.5 rounded-xs">
                      DB TRANS-CORRIDOR OK
                    </span>
                  </div>
                  
                  <p className="text-[9px] text-zinc-400 leading-relaxed font-sans lowercase">
                    synchronize active user profiles, videotapes, custom spots, direct messages, and challenges with supabase's postgres backend database smoothly.
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { sounds.playTick(); setShowTransporterGuide(p => !p); }}
                      className="text-[8px] border border-white/15 hover:bg-white/5 text-zinc-300 font-bold px-2 py-1 rounded-xs uppercase cursor-pointer"
                    >
                      {showTransporterGuide ? "Hide Kid's Guide" : "Explain Like I'm 10"}
                    </button>
                  </div>

                  {showTransporterGuide && (
                    <div className="bg-[#ee1111]/5 border border-red-500/20 p-2.5 space-y-1.5 font-sans leading-relaxed rounded-xs relative">
                      <div className="text-[9px] font-mono text-rose-450 font-black uppercase tracking-wider">
                        🧒 how does this database move work?
                      </div>
                      <ol className="list-decimal list-inside text-[8.5px] text-zinc-400 space-y-1 lowercase">
                        <li>
                          <strong>the magic bridge:</strong> we built a secure warp-tunnel that connects our old firebase cloud to the new shiny supabase vault!
                        </li>
                        <li>
                          <strong>1-click copying:</strong> pressing <span className="text-white font-semibold">"trigger full migration"</span> automatically copies over all the profiles, skaters, and videos instantly.
                        </li>
                        <li>
                          <strong>dual-channel shield:</strong> any updates you complete now will automatically copy to both vaults. nothing can ever be lost.
                        </li>
                      </ol>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  {migrationActive ? (
                    <div className="space-y-1 bg-red-950/20 border border-red-500/35 p-2 rounded-xs">
                      <div className="text-[8px] text-red-400 font-bold flex justify-between animate-pulse">
                        <span>TRANSMITTING DATA VECTORS...</span>
                        <span>{migrationProgressStep}</span>
                      </div>
                      <div className="w-full bg-zinc-900 h-1.5 rounded overflow-hidden">
                        <div className="h-full bg-red-600 animate-pulse w-3/4"></div>
                      </div>
                    </div>
                  ) : migrationStats ? (
                    <div className="bg-emerald-950/20 border border-emerald-500/25 p-2 space-y-1 rounded-xs font-mono text-[8px]">
                      <div className="text-emerald-400 font-black flex items-center justify-between">
                        <span>✓ SYNCHRONIZATION SUCCESS</span>
                        <span>[DONE]</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-zinc-400 uppercase mt-1">
                        <div>Skaters: <span className="text-white">{migrationStats.usersCount}</span></div>
                        <div>Tapes: <span className="text-white">{migrationStats.uploadsCount}</span></div>
                        <div>Spots: <span className="text-white">{migrationStats.customSpotsCount}</span></div>
                        <div>Messages: <span className="text-white">{migrationStats.directMessagesCount}</span></div>
                        <div>Challenges: <span className="text-white">{migrationStats.challengesCount}</span></div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          sounds.playSelect();
                          setMigrationActive(true);
                          setMigrationProgressStep('PROBING LINKS...');
                          try {
                            const stats = await runFullDatabaseMigration((step) => {
                              setMigrationProgressStep(step);
                            });
                            setMigrationStats(stats);
                            addTickerMessage(`[TRANS-PORT] SYNC COMPLETE // ${stats.usersCount} SKATERS // ${stats.uploadsCount} TAPES`);
                            sounds.playTrickSuccess();
                          } catch (err: any) {
                            console.error(err);
                            addTickerMessage(`[TRANS-PORT ERROR] ${err.message || 'FAILED'}`);
                            sounds.playSelect();
                          } finally {
                            setMigrationActive(false);
                          }
                        }}
                        className="w-full mt-1.5 bg-neutral-900 hover:bg-neutral-800 text-zinc-350 py-1 border border-white/10 uppercase tracking-wider font-bold text-[8px] rounded-xs cursor-pointer text-center"
                      >
                        RE-RUN TRANSFER CHECK
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        sounds.playSelect();
                        setMigrationActive(true);
                        setMigrationProgressStep('OPENING WARP Tunnel...');
                        try {
                          const stats = await runFullDatabaseMigration((step) => {
                            setMigrationProgressStep(step);
                          });
                          setMigrationStats(stats);
                          addTickerMessage(`[TRANS-PORT] SYNC COMPLETE // ${stats.usersCount} SKATERS // ${stats.uploadsCount} TAPES`);
                          sounds.playTrickSuccess();
                        } catch (err: any) {
                          console.error(err);
                          addTickerMessage(`[TRANS-PORT ERROR] ${err.message || 'FAILED'}`);
                          sounds.playSelect();
                        } finally {
                          setMigrationActive(false);
                        }
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase py-2 tracking-widest text-[9px] rounded-xs transition-colors hover:shadow-[0_0_12px_rgba(239,68,68,0.4)] cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Zap className="w-3 h-3 text-yellow-300 animate-pulse" />
                      TRIGGER FULL DATABASE MIGRATION
                    </button>
                  )}
                </div>
              </div>

              {/* PANEL 2: TACTICAL WAVE GRID FILTERS & CALIBRATE */}
              <div className="bg-black/40 border border-white/10 p-3 flex flex-col justify-between space-y-3 rounded-xs min-h-[220px]">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5" /> GRID CALIBRATION HUD
                    </span>
                    <span className="text-[8px] text-zinc-400">
                      SYS // {currentDistrictId.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-[9px] text-zinc-400 leading-relaxed font-sans lowercase">
                    regulate incoming signals, adjust deviation sensors, and apply isolations for detailed surveillance.
                  </p>

                  {/* DISPLAY FILTER PRESETS */}
                  <div className="space-y-1 text-left">
                    <label className="text-[8px] text-zinc-400 font-bold uppercase block tracking-wider">SPECTROMETRY DISPLAY</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: 'all', label: 'ALL FREQ' },
                        { id: 'spots', label: 'ONLY SPOTS' },
                        { id: 'skaters', label: 'SIGNALS' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { sounds.playTick(); setMapDisplayFilter(item.id as any); }}
                          className={`text-[8px] py-1 uppercase tracking-tighter transition-colors border rounded-xs font-black cursor-pointer ${
                            mapDisplayFilter === item.id 
                              ? 'bg-rose-950/40 border-rose-500 text-rose-450 font-bold' 
                              : 'bg-white/5 border-white/5 text-zinc-500 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* RANGE FILTER */}
                  <div className="space-y-1 text-left">
                    <div className="flex justify-between text-[8px] text-zinc-400 font-bold uppercase tracking-wider">
                      <span>DEVIATION SENSOR RANGE LIMIT</span>
                      <span className="text-rose-500">
                        {mapDistanceFilter === 0 ? "INFINITE RANGE LOCK" : `${mapDistanceFilter}M MAXIMUM`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range"
                        min="0"
                        max="1000"
                        step="50"
                        value={mapDistanceFilter}
                        onChange={(e) => { sounds.playTick(); setMapDistanceFilter(Number(e.target.value)); }}
                        className="w-full accent-rose-600 bg-zinc-900 cursor-pointer h-1"
                      />
                    </div>
                  </div>

                  {/* TARGET ISOLATION FIELD */}
                  <div className="flex items-center justify-between pt-1 text-left">
                    <div className="space-y-0.5">
                      <span className="text-[8.5px] font-bold uppercase tracking-wider text-white block">SINGLE TARGET ISOLATION</span>
                      <p className="text-[7.5px] text-zinc-500 lowercase font-sans leading-tight">obscure secondary frequencies inside sectors</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playSelect();
                        setSingleTargetIsolation(prev => !prev);
                        addTickerMessage(singleTargetIsolation ? "ISOLATION FIELD SYSTEM COMPLETED" : "ISOLATION FIELD ONLINE // LOCKED TARGET FOCUSED");
                      }}
                      className={`text-[8px] font-black uppercase px-2.5 py-1 tracking-widest border transition-colors cursor-pointer rounded-xs ${
                        singleTargetIsolation 
                          ? 'bg-rose-950/40 border-rose-500 text-rose-500 font-bold animate-pulse' 
                          : 'bg-transparent border-white/20 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {singleTargetIsolation ? "ACTIVE" : "STANDBY"}
                    </button>
                  </div>
                </div>

                <div className="text-[8px] text-zinc-500 bg-zinc-950 p-1 border border-white/5 text-center rounded-xs uppercase leading-none">
                  Failsafe relay state: operational
                </div>
              </div>

              {/* PANEL 3: REAL-TIME INCOMING SURFER SIGNALS */}
              <div className="bg-[#0b0404] border border-red-500/20 p-3 flex flex-col justify-between space-y-3 rounded-xs min-h-[220px] md:col-span-2 lg:col-span-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-red-500/25 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> ON-GRID CORES
                    </span>
                    <span className="text-[8.5px] text-rose-500 font-bold tracking-widest bg-rose-950/45 px-1.5 py-0.5 rounded-xs">
                      {
                        allSkaters.filter(sk => {
                          if (sk.id === currentUser?.uid) return false;
                          if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                          if (mapDistanceFilter > 0) {
                            const coords = sk.activeLocation?.coords;
                            const userCoords = profile?.activeLocation?.coords;
                            if (coords && userCoords) {
                              const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                              return distance <= mapDistanceFilter;
                            }
                          }
                          return true;
                        }).length
                      } ON SITE
                    </span>
                  </div>

                  <p className="text-[9px] text-zinc-400 leading-relaxed font-sans lowercase">
                    active, verified skaters matching current filters inside sector {currentDistrictId}. select locate or link codes.
                  </p>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 select-none custom-scrollbar pt-1">
                    {allSkaters
                      .filter(sk => {
                        if (sk.id === currentUser?.uid) return false;
                        if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                        if (mapDistanceFilter > 0) {
                          const coords = sk.activeLocation?.coords;
                          const userCoords = profile?.activeLocation?.coords;
                          if (coords && userCoords) {
                            const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                            return distance <= mapDistanceFilter;
                          }
                        }
                        return true;
                      })
                      .map((sk) => {
                        const coords = sk.activeLocation?.coords;
                        const isFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                        const userCoords = profile?.activeLocation?.coords;
                        const distanceMVal = (coords && userCoords) 
                          ? Math.round(Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5) 
                          : null;
                        const isCurrentlyTargeted = selectedLiveSkater?.id === sk.id;

                        return (
                          <div 
                            key={sk.id}
                            className={`flex items-center justify-between gap-2 text-[9px] p-2 border hover:border-red-500/30 transition-all rounded-xs ${
                              isCurrentlyTargeted 
                                ? 'bg-red-950/20 border-red-500/40 shadow-[0_0_8px_rgba(220,38,38,0.25)]' 
                                : 'bg-black/30 border-white/5'
                            }`}
                          >
                            <div className="flex flex-col min-w-0 text-left">
                              <span className="font-extrabold text-white truncate font-mono">@{sk.handle}</span>
                              <span className="text-[7.5px] text-zinc-500 uppercase tracking-tighter">
                                {distanceMVal !== null ? `${distanceMVal}m away` : 'Active'} • LV {sk.level || 1}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playTick();
                                  if (coords) {
                                    setPanOffset({
                                      x: 200 - coords.x,
                                      y: 150 - coords.y
                                    });
                                    setZoomScale(1.8);
                                    addTickerMessage(`LOCATING @${sk.handle.toUpperCase()}`);
                                    setSelectedLiveSkater(sk);
                                  }
                                }}
                                className="bg-[#1a1111] hover:bg-neutral-800 text-zinc-350 border border-white/10 p-1 hover:text-red-400 font-bold text-[8px] transition-all cursor-pointer rounded-xs"
                                title="Locate Surfer"
                              >
                                <Locate className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playSelect();
                                  setSelectedLiveSkater(sk);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white font-black px-2 py-1 text-[8.5px] uppercase tracking-tighter rounded-xs transition-colors cursor-pointer"
                              >
                                {isCurrentlyTargeted ? "LOCKED" : (isFriend ? "View" : "Link")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {allSkaters.filter(sk => {
                      if (sk.id === currentUser?.uid) return false;
                      if (sk.activeLocation?.districtId !== currentDistrictId) return false;
                      if (mapDistanceFilter > 0) {
                        const coords = sk.activeLocation?.coords;
                        const userCoords = profile?.activeLocation?.coords;
                        if (coords && userCoords) {
                          const distance = Math.sqrt(Math.pow(coords.x - userCoords.x, 2) + Math.pow(coords.y - userCoords.y, 2)) * 2.5;
                          return distance <= mapDistanceFilter;
                        }
                      }
                      return true;
                    }).length === 0 && (
                      <div className="text-[8.5px] text-zinc-500 italic text-center py-4 border border-dashed border-white/5 bg-black/10 rounded-xs uppercase leading-none">
                        NO ACTIVE SIGNALS MATCH FILTER
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[7.5px] text-zinc-500 font-bold uppercase tracking-wider text-center leading-none">
                  Sector frequency scanners streaming
                </div>
              </div>
            </div>
          )}
          
          {/* RADAR SWEEP INTERACTIVE PING CONTROLLER */}
          <div id="sensor-trigger-row" className="bg-black/80 px-6 py-4 border-t border-white/10 flex items-center justify-between z-1 select-none">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono text-white/40 block">RADAR PING P-CHANNEL</span>
              <p className="text-[10px] font-grotesk text-white">Scan wireless network frequencies for active spot bonuses</p>
            </div>

            <div className="flex flex-col items-center">
              <button 
                onClick={startRadarSweep}
                disabled={radarScanning}
                className="w-14 h-14 border-2 border-white rounded-full flex items-center justify-center bg-black hover:bg-white hover:text-black cursor-pointer transition-all focus:outline-none disabled:opacity-50 transform hover:scale-105 active:scale-95"
              >
                <div className="text-xs font-black uppercase tracking-tighter text-center leading-none font-syne">
                  {radarScanning ? "SWP..." : "GO"}
                </div>
              </button>
              <div className="text-[8px] uppercase font-bold tracking-widest text-[#ffffff]/40 mt-1">Scan Grid</div>
            </div>
          </div>

          {/* TAB PORT SYSTEM: WORLD BROADCAST // SECURE COM-LINK // TRICK ACADEMY */}
          <div className="border-t border-white/15 bg-[#080808] h-[460px] overflow-hidden flex flex-col">
            <div className="flex bg-zinc-950 border-b border-white/10 select-none">
              <button
                type="button"
                onClick={() => { sounds.playSelect(); setBottomTab('world'); }}
                className={`flex-1 py-1.5 text-[8.5px] font-mono uppercase tracking-widest font-bold border-r border-[#ffffff]/10 transition-colors flex items-center justify-center gap-1.5 ${
                  bottomTab === 'world' 
                    ? 'bg-red-950/20 text-red-500 font-black border-b-2 border-b-red-500' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <Radio className="w-3 h-3 text-red-500 shrink-0 animate-pulse" />
                World Broadcast
              </button>
              <button
                type="button"
                onClick={() => { sounds.playSelect(); setBottomTab('comlink'); }}
                className={`flex-1 py-1.5 text-[8.5px] font-mono uppercase tracking-widest font-bold border-r border-[#ffffff]/10 transition-colors flex items-center justify-center gap-1.5 relative ${
                  bottomTab === 'comlink' 
                    ? 'bg-red-950/20 text-red-500 font-black border-b-2 border-b-red-500' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3 h-3 text-red-500 shrink-0" />
                Com-link Inbox
                {allDirectMessages.length > 0 && (
                  <span className="absolute top-1 right-2 bg-red-600 text-[6.5px] text-white font-mono px-1 rounded-full animate-pulse scale-90">
                    {allDirectMessages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => { sounds.playSelect(); setBottomTab('tutorials'); }}
                className={`flex-1 py-1.5 text-[8.5px] font-mono uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  bottomTab === 'tutorials' 
                    ? 'bg-red-950/20 text-red-500 font-black border-b-2 border-b-red-500' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <Award className="w-3 h-3 text-red-500 shrink-0" />
                Trick Academy
              </button>
            </div>

            {bottomTab === 'world' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {feeds.length > 0 ? (
                feeds.map((feedItem) => {
                  const alreadyLiked = feedItem.likedUsers.includes(currentUser.uid);
                  const isSharedTarget = new URLSearchParams(window.location.search).get('feedId') === feedItem.id;
                  return (
                    <div 
                      key={feedItem.id} 
                      className={`border p-3 flex flex-col justify-between transition-all gap-2 zine-card-flicker ${
                        isSharedTarget 
                          ? 'border-yellow-500 bg-yellow-500/10 shadow-[0_0_12px_rgba(234,179,8,0.2)]' 
                          : 'border-white/10 bg-black/40'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono">
                            <span className="text-white font-bold uppercase italic">@{feedItem.userName}</span>
                            <span className="text-white/40 text-[9px]">unlocked at</span>
                            <span className="text-emerald-500 text-[9px] uppercase font-bold">[{feedItem.spotName}]</span>
                            {isSharedTarget && (
                              <span className="bg-yellow-500 text-black font-mono font-black text-[8px] px-1 py-0.5 rounded ml-1 animate-pulse">
                                SHARED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/70 font-sans tracking-wide lowercase mt-1 lowercase-text select-text">
                            "{feedItem.text}"
                          </p>

                          {feedItem.videoUrl && (
                            <div className="flex items-center gap-1.5 bg-emerald-950/20 border border-emerald-500/30 px-2 py-1 mt-2 rounded-xs text-[8px] font-mono text-emerald-400 font-extrabold tracking-wide uppercase max-w-max select-none">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              <span>VERIFIED SKATE TAPE • BROADCAST DIRECT (.MP4)</span>
                            </div>
                          )}

                          {feedItem.videoUrl && (
                            <div className="mt-2.5 border border-white/10 rounded-xs overflow-hidden bg-black max-w-full">
                              <AutoplayVideo 
                                src={localVideoUrls[feedItem.id] || feedItem.videoUrl} 
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 px-1 shrink-0">
                          <span className="text-[8px] bg-white/5 px-1.5 py-0.5 text-zinc-500 font-mono font-bold uppercase rounded-xs">
                            {feedItem.districtId}
                          </span>
                          {currentUser && feedItem.userUid === currentUser.uid && (
                            <button
                              type="button"
                              onClick={() => handleDeleteClip(feedItem.id)}
                              className="text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 bg-red-950/25 hover:bg-red-950/45 text-[8.5px] font-mono font-black uppercase px-2 py-0.5 rounded-xs transition-all tracking-wider cursor-pointer flex items-center gap-0.5 hover:scale-105 active:scale-95"
                              title="Delete this Outlaw Clip"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> DELETE
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                        <span className="text-[8.5px] text-zinc-600 font-mono">
                          {isSharedTarget ? '🔗 TARGET LINK IDENTIFIED' : 'ENCRYPTED Broadcaster'}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => handleShareUpload(feedItem.id)}
                            className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 transition-colors border cursor-pointer ${
                              copiedFeedId === feedItem.id 
                                ? 'bg-emerald-600 text-white border-emerald-500 font-bold' 
                                : 'bg-white/5 hover:bg-white/10 text-white/85 border-white/10'
                            }`}
                            title="Copy Permalink to Clipboard"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>{copiedFeedId === feedItem.id ? 'COPIED' : 'SHARE'}</span>
                          </button>

                          <button 
                            type="button"
                            onClick={() => handleLikeUpload(feedItem.id)}
                            className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 transition-colors border cursor-pointer ${
                              alreadyLiked 
                                ? 'bg-red-600 text-white border-red-500 font-bold' 
                                : 'bg-white/5 hover:bg-white/10 text-white/85 border-white/10'
                            }`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${alreadyLiked ? 'fill-current text-white' : 'text-zinc-400'}`} />
                            <span>{feedItem.likesCount} STOKE</span>
                          </button>
                        </div>
                      </div>

                      {/* --- COMMENTS ARRAY SECTION --- */}
                      <div className="mt-2 border-t border-white/5 pt-2 space-y-2 select-text">
                        {feedItem.comments && feedItem.comments.length > 0 && (
                          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                            <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">TRANSERMISSIONS COMMENTS //</div>
                            {feedItem.comments.map((comment) => (
                              <div key={comment.id} className="text-[10px] bg-black/60 border border-white/5 p-1.5 rounded-xs leading-normal">
                                <div className="flex items-center justify-between text-zinc-500 text-[8.5px] font-mono">
                                  <span className="text-red-400 font-black uppercase italic">@{comment.userName}</span>
                                  <span>
                                    {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-zinc-300 font-sans mt-0.5 lowercase-text text-left break-words">
                                  {comment.message}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Leave comment form */}
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAddComment(feedItem.id);
                          }}
                          className="flex items-center gap-1 mt-1"
                        >
                          <input 
                            type="text"
                            placeholder="transmit a reaction comment..."
                            value={commentInputs[feedItem.id] || ''}
                            onChange={(e) => setCommentInputs(prev => ({ ...prev, [feedItem.id]: e.target.value }))}
                            disabled={submittingComment[feedItem.id]}
                            className="flex-1 bg-black/90 border border-white/10 px-2 py-1.5 text-[9.5px] font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-red-500 rounded-none transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={submittingComment[feedItem.id] || !commentInputs[feedItem.id]?.trim()}
                            className="bg-red-600 hover:bg-red-700 text-white font-mono font-black text-[9px] uppercase px-2.5 py-1.5 cursor-pointer disabled:opacity-40 transition-colors rounded-none"
                          >
                            {submittingComment[feedItem.id] ? "..." : "SEND"}
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] font-mono text-zinc-600 italic text-center py-6">
                  Searching streaming channels... Dispatch your tape to start feed!
                </div>
              )}
            </div>
          )}

          {bottomTab === 'comlink' && (
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              {/* Frozen status notification banner */}
              {COM_LINK_FROZEN && (
                <div className="bg-red-950/40 border border-red-500/30 text-red-500 px-3 py-2 text-[9px] font-mono leading-relaxed mb-3 rounded-xs select-none uppercase tracking-wide flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-0.5 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <div className="flex-1">
                    <span className="font-extrabold text-red-400 block">[ALERT] NETWORK COM-LINK FROZEN (OFFLINE SANDBOX MODE ACTIVE)</span>
                    <span className="text-zinc-450 font-medium lowercase block mt-0.5 max-w-xl leading-normal">
                      remote database synching is temporarily frozen to avoid bandwidth and api quota overage. signals are cached locally up to 100 users. upgrade cloud stack to restore worldwide permanent links.
                    </span>
                  </div>
                </div>
              )}
              {selectedChatSkater ? (
                // Private chat thread view
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Header bar with Back button */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <span className="text-[10px] font-mono font-black text-white uppercase tracking-tight">
                        CHANNEL SECURED // @{selectedChatSkater.handle}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { sounds.playSelect(); setSelectedChatSkater(null); }}
                      className="text-[8.5px] font-mono bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded cursor-pointer transition-colors uppercase font-bold"
                    >
                      ← INBOX DIRECTORY
                    </button>
                  </div>

                  {/* Messages Body */}
                  <div className="flex-1 overflow-y-auto space-y-2 mb-2.5 bg-black/40 p-2.5 border border-white/5 rounded-xs custom-scrollbar text-left">
                    {inboxChatMessages.map((msg) => (
                      <div key={msg.id} className="text-[9.5px] font-mono leading-relaxed max-w-[90%] break-all">
                        <span className={msg.senderUid === currentUser?.uid ? "text-emerald-400 font-bold" : "text-red-500 font-bold"}>
                          {msg.senderUid === currentUser?.uid ? "YOU" : `@${msg.senderHandle}`}
                        </span>
                        <span className="text-[#888] text-[7.5px] ml-1.5 uppercase font-normal tracking-wide">
                          {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <p className="text-zinc-200 mt-0.5 pl-2 border-l border-white/5 leading-snug">{msg.text}</p>
                      </div>
                    ))}
                    {inboxChatMessages.length === 0 && (
                      <div className="text-zinc-500 text-[8px] italic text-center py-8 uppercase font-mono tracking-wider leading-normal">
                        Com-link channel deployed. Transmit physical coordinates or encrypted text signals...
                      </div>
                    )}
                  </div>

                  {/* Input send bar */}
                  <form onSubmit={handleSendInboxDM} className="flex gap-1.5 bg-zinc-950 p-1 border border-white/10">
                    <input
                      type="text"
                      required
                      value={dmChatInput}
                      onChange={(e) => setDmChatInput(e.target.value)}
                      placeholder="ENTER SIGNAL ENCRYPTED TEXT..."
                      className="flex-1 bg-black text-xs font-mono text-zinc-100 placeholder-zinc-700 px-3 py-2 border border-white/15 focus:outline-none focus:border-red-500 uppercase rounded-sm font-bold"
                    />
                    <button
                      type="submit"
                      className="bg-red-600 hover:bg-red-700 text-white font-mono font-black text-[10px] uppercase px-4 cursor-pointer transition-colors rounded-xs"
                    >
                      SEND
                    </button>
                  </form>
                </div>
              ) : (
                // Directory listing view
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Search and guide */}
                  <div className="flex gap-2 mb-3 shrink-0">
                    <div className="flex-1 relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={chatSearchQuery}
                        onChange={(e) => setChatSearchQuery(e.target.value)}
                        placeholder="SEARCH SURFERS FOR COM-LINK..."
                        className="w-full bg-black border border-white/10 font-mono text-[9.5px] text-white pl-8 pr-3 py-2 outline-none focus:border-red-500 rounded-xs"
                      />
                    </div>
                  </div>

                  {/* Left: Scroll directories */}
                  <div className="flex-1 overflow-y-auto space-y-3.5 custom-scrollbar text-left">
                    {/* Section: Recent active chat threads */}
                    {(() => {
                      const recentPartners = Array.from(new Set(
                        allDirectMessages.map(m => m.senderUid === currentUser?.uid ? m.receiverUid : m.senderUid)
                      )).map(id => allSkaters.find(s => s.id === id)).filter(Boolean) as SkateProfile[];

                      return recentPartners.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[7.5px] font-mono text-emerald-400 font-bold tracking-widest uppercase block mb-1">
                            📡 ACTIVE SIGNAL OVERLAYS ({recentPartners.length})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {recentPartners.map((skater) => {
                              const lastMsg = [...allDirectMessages]
                                .reverse()
                                .find(m => m.senderUid === skater.id || m.receiverUid === skater.id);
                              return (
                                <button
                                  key={skater.id}
                                  type="button"
                                  onClick={() => { sounds.playSelect(); setSelectedChatSkater(skater); }}
                                  className="border border-white/10 bg-white/5 hover:bg-neutral-900 duration-150 p-2 text-left transition-all rounded-xs cursor-pointer block w-full group relative overflow-hidden"
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-mono font-black text-white tracking-tight group-hover:text-red-400">
                                      @{skater.handle}
                                    </span>
                                    <span className="text-[7.5px] bg-red-950 text-red-500 px-1 font-bold font-mono">
                                      LV {skater.level || 1}
                                    </span>
                                  </div>
                                  {lastMsg && (
                                    <p className="text-[8px] font-mono text-zinc-500 truncate whitespace-nowrap lowercase-text select-none mt-1">
                                      {lastMsg.text}
                                    </p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Section: All Satellites list */}
                    <div className="space-y-1.5 pt-2 bg-black/30 p-2 border border-white/5 rounded-xs">
                      <span className="text-[7.5px] font-mono text-zinc-500 font-bold tracking-widest uppercase block mb-1">
                        🛰️ GLOBAL ENCRYPTION TELEMETRY ROUTINGS
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(() => {
                          const filteredSkaters = allSkaters.filter(sk => {
                            if (sk.id === currentUser?.uid) return false;
                            if (!chatSearchQuery) return true;
                            return sk.handle.toLowerCase().includes(chatSearchQuery.toLowerCase());
                          });

                          if (filteredSkaters.length === 0) {
                            return (
                              <div className="text-zinc-650 text-[8px] italic py-2 col-span-2 text-center uppercase">
                                NO SURFER FOUND WITH SIGNAL TARGET SPEC
                              </div>
                            );
                          }

                          return filteredSkaters.map(skater => (
                            <button
                              key={skater.id}
                              type="button"
                              onClick={() => { sounds.playSelect(); setSelectedChatSkater(skater); }}
                              className="border border-white/5 bg-black/60 hover:bg-neutral-900 border-l border-l-red-500/40 p-2 text-left rounded-xs transition-colors cursor-pointer block"
                            >
                              <div className="text-[9.5px] font-mono font-bold text-zinc-300">
                                @{skater.handle}
                              </div>
                              <div className="text-[7px] text-zinc-500 font-mono uppercase mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {skater.skateStyle || "STREET"} • LV {skater.level || 1}
                              </div>
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {bottomTab === 'tutorials' && (
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              {practiceSelectedTrick ? (
                // Individual tutorial details and Practice Simulation sandbox
                (() => {
                  const activeTrick = SKATE_TUTORIALS.find(t => t.name === practiceSelectedTrick);
                  if (!activeTrick) return null;
                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[7.5px] bg-red-950 text-red-500 font-black px-1.5 py-0.2 uppercase font-mono">
                            {activeTrick.difficulty}
                          </span>
                          <span className="text-[11px] font-mono font-black text-white">
                            {activeTrick.name.toUpperCase()} ACADEMY
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { sounds.playSelect(); setPracticeSelectedTrick(null); setPracticeLogs([]); }}
                          className="text-[8px] font-mono bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded cursor-pointer transition-colors uppercase font-bold"
                        >
                          ← ACADEMY LIST
                        </button>
                      </div>

                      {/* Split layout: steps detail on top, practice simulator on bottom */}
                      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                        {/* Desc and mechanics */}
                        <div className="bg-black/40 border border-white/5 p-2 rounded-xs space-y-1 text-left">
                          <p className="text-[10px] font-sans text-zinc-300 leading-snug">
                            {activeTrick.description}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[8px] font-mono pt-1.5 border-t border-white/5">
                            <div>
                              <span className="text-zinc-500 block">FOOT PLACEMENT:</span>
                              <span className="text-white font-bold leading-tight block uppercase">{activeTrick.footPlacement}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">PHYSICAL TIP:</span>
                              <span className="text-amber-400 font-bold leading-tight block uppercase">{activeTrick.physicsTip}</span>
                            </div>
                          </div>
                        </div>

                        {/* Dynamic steps sequence */}
                        <div className="space-y-1 bg-zinc-950 p-2.5 border border-white/5 text-left">
                          <span className="text-[7px] font-mono text-zinc-500 tracking-wider">TELEMETRY SEQUENCE MAP:</span>
                          <div className="space-y-1 mt-1 text-[9px] font-mono">
                            {activeTrick.steps.map((st, sidx) => (
                              <div key={sidx} className={`p-1 flex items-start gap-1 p-1 rounded-xs transition-colors ${
                                practiceStepIndex === sidx && practiceRunning
                                  ? 'bg-red-500/10 text-white border-l border-l-red-500'
                                  : 'text-zinc-400'
                              }`}>
                                <span className="font-extrabold shrink-0 text-red-500">[{sidx + 1}]</span>
                                <span className="leading-snug">{st}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Interactive simulation logger console */}
                        <div className="border border-dashed border-red-500/20 bg-black/90 p-3 rounded-sm space-y-2 text-left">
                          <div className="flex items-center justify-between">
                            <div className="text-[7.5px] font-mono text-red-500 font-black tracking-widest uppercase flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shrink-0"></span>
                              OFFLINE TRICK PRACTICE ENGINE
                            </div>
                            <span className="text-[7.5px] text-zinc-400 font-mono tracking-tight font-black">LV {profile?.level || 1} • REW: {activeTrick.repReward} XP</span>
                          </div>

                          <div className="bg-[#050505] p-2 rounded-xs h-20 overflow-y-auto leading-tight text-[8px] font-mono text-emerald-450 space-y-0.5 custom-scrollbar">
                            {practiceLogs.map((log, lidx) => (
                              <div key={lidx}>{log}</div>
                            ))}
                            {practiceLogs.length === 0 && (
                              <div className="text-zinc-650 italic text-center py-4 uppercase">
                                Simulator idling. Press button to trigger stunt test sequence.
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => executePracticeRun(activeTrick)}
                            disabled={practiceRunning}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-mono font-black italic tracking-widest text-[9.5px] py-1.5 relative flex items-center justify-center gap-1 cursor-pointer select-none border-b-2 border-b-red-950 active:translate-y-0.5 rounded-xs"
                          >
                            <Sparkles className="w-4 h-4 text-white" />
                            {practiceRunning ? "DEPLOYING TELEMETRY SIMULATION..." : "⚡ START PRACTICE RUN"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                // List of tutorials view
                <div className="flex-1 flex flex-col overflow-hidden text-left">
                  <span className="text-[7.5px] font-mono text-zinc-500 font-bold tracking-widest uppercase block mb-2 shrink-0">
                    📖 SELECT ACADEMY FILE MODULE TO ANALYZE
                  </span>
                  <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar pr-1">
                    {SKATE_TUTORIALS.map((trick) => (
                      <button
                        key={trick.name}
                        type="button"
                        onClick={() => handlePracticeSelectedTrick(trick)}
                        className="border border-white/10 bg-black/40 hover:bg-zinc-900 border-l border-l-red-500/25 text-left p-3 rounded-xs transition-all cursor-pointer flex flex-col justify-between hover:border-red-500/50"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-xs font-mono font-black text-white tracking-widest uppercase">
                              {trick.name}
                            </span>
                            <span className="text-[6.5px] bg-[#222] text-zinc-400 font-mono px-1 border border-white/10 rounded-sm">
                              {trick.discipline}
                            </span>
                          </div>
                          <p className="text-[9.5px] font-sans text-zinc-400 leading-snug lowercase-text mt-1.5 line-clamp-2">
                            {trick.description}
                          </p>
                        </div>
                        <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-2">
                          <span className="text-[8px] font-mono text-zinc-500">
                            DIFF: <span className="text-white font-bold">{trick.difficulty}</span>
                          </span>
                          <span className="text-[8px] font-mono text-emerald-400 font-extrabold flex items-center gap-0.5">
                            +{trick.repReward} XP
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </section>

        {/* RIGHT COLUMN: OUTLAW CHALLENGE GENERATION ENGINE & LOCAL SCORE BOARDS (3 columns) */}
        <section id="sidebar-leaderboard" className={`col-span-1 lg:col-span-3 bg-[#050505] flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto ${
          activeMobileView === 'challenges' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          <div id="leaderboard-inner" className="flex flex-col flex-1 overflow-visible">
            
            {/* OUTLAW CHALLENGE SYSTEM matrix */}
            <UndergroundChallenges
              personalChallenges={personalChallenges}
              onTriggerPersonalChallenge={handleTriggerChallengeGenerator}
              onCompletePersonalChallenge={handleCompleteOutlawChallenge}
              isGeneratingChallenge={isGeneratingChallenge}
              sounds={sounds}
              currentUser={currentUser}
              profile={profile}
              onAwardXp={handleAwardWeeklyXp}
            />

            {/* Scoreboards */}
            <div id="leaderboard-inner-body" className="flex flex-col flex-1 min-h-[220px]">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between select-none bg-black">
                <div className="flex flex-col">
                  <h3 className="text-base font-black italic uppercase font-syne tracking-tight text-white">Active Void Board</h3>
                  <span className="text-[8px] text-[#ffffff]/40 tracking-wider font-mono">Global performance rankings</span>
                </div>
                <span className="text-[8px] bg-white text-black px-1.5 py-0.5 font-black font-grotesk tracking-widest">GLOBAL SHREDDERS</span>
              </div>

              {/* Ranks list */}
              <div className="flex-1 overflow-y-auto max-h-[360px] p-6 space-y-3 font-mono">
                {allSkaters.map((sk, index) => {
                  const isSelf = sk.id === currentUser?.uid;
                  const rank = index + 1;
                  const isLinkedFriend = profile?.friends?.some(fName => fName.toLowerCase() === sk.handle.toLowerCase());
                  return (
                    <div 
                      key={sk.id}
                      onClick={() => {
                        sounds.playSelect();
                        setSelectedLiveSkater(sk);
                      }}
                      className={`flex items-center justify-between border-b border-white/5 pb-2 hover:border-white/20 transition-all cursor-pointer ${isSelf ? 'bg-red-950/20 py-1.5 px-2 border-l-2 border-l-red-500 rounded-xs' : ''}`}
                      title="Tap live connection to link surfer"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${isSelf ? 'text-red-500' : 'text-white/40'} italic leading-none`}>
                          {String(rank).padStart(2, '0')}
                        </span>
                        <span className={`text-xs uppercase tracking-wide flex items-center gap-1 flex-wrap ${isSelf ? 'text-white font-black' : 'text-white/85 font-semibold'}`}>
                          @{sk.handle} 
                          {isSelf && <span className="text-[7px] bg-red-600 text-white px-1 leading-none font-sans font-black italic">YOU</span>}
                          {isLinkedFriend && <span className="text-[7px] border border-emerald-500 text-emerald-400 px-1 leading-none font-sans uppercase font-bold tracking-tight">LINKED</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[8.5px] text-zinc-500 font-bold">LVL {sk.level || 1}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 shrink-0 ${isSelf ? 'text-red-400 bg-red-950/20' : 'text-neutral-400 bg-white/5'}`}>
                          {(sk.reputation || 0).toLocaleString()} XP
                        </span>
                      </div>
                    </div>
                  );
                })}
                {allSkaters.length === 0 && (
                  <div className="text-[10px] text-white/30 italic text-center py-6">
                    Syncing Void Performance scores from database...
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Bottom inline Game activator card layout */}
          <div id="game-trigger-card" className="p-6 bg-white/5 border-t border-white/10 select-none">
            <div className="text-[10px] uppercase font-black tracking-[0.18em] mb-3 text-white/50 font-grotesk">Global Mini-Game Bonus</div>
            
            <div 
              onClick={triggerGameStart}
              className="flex gap-3 items-center bg-black p-3.5 border border-white/15 hover:border-white select-none cursor-pointer hover:bg-zinc-950 transition-all active:translate-y-0.5"
            >
              <div className="w-10 h-10 border border-white/30 flex items-center justify-center flex-shrink-0 bg-white/5">
                <Gamepad2 className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase leading-none tracking-wide text-white font-grotesk flex items-center gap-1">
                  Alleyway Rush <ChevronRight className="w-3 h-3 text-white/60 inline animate-bounce" />
                </div>
                <div className="text-[9px] text-white/40 font-mono mt-1 lowercase-text">Play inline arcade & commit data +XP to cloud</div>
              </div>
            </div>
          </div>

        </section>
      </main>

      {/* FOOTER SYSTEM TICKER marquee */}
      <footer id="ticker-marquee-holder" className="h-[44px] bg-white text-black flex items-center px-6 overflow-hidden select-none border-t border-black relative shrink-0 font-mono">
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10" />
        
        <div className="un-ticker overflow-hidden flex items-center w-full">
          <div className="flex items-center gap-16 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] animate-[ticker_45s_linear_infinite]">
            {tickers.map((tickStr, tickIdx) => (
              <div key={tickIdx} className="flex items-center gap-3 shrink-0">
                <span className="w-2 h-2 bg-black rounded-full shrink-0 animate-ping"></span> 
                <span>{tickStr}</span>
              </div>
            ))}
            {tickers.map((tickStr, tickIdx) => (
              <div key={`dup-${tickIdx}`} className="flex items-center gap-3 shrink-0">
                <span className="w-2 h-2 bg-black rounded-full shrink-0 animate-ping"></span> 
                <span>{tickStr}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* COMPONENT: OUTLAW TRICK CLIP UPLOAD DIALOG OVERLAY */}
      {showUploadModal && (
        <div id="upload-dialog-overlay" className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div 
            id="upload-dialog-box" 
            className="bg-[#050505] border-2 border-white max-w-md w-full p-6 text-white space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { sounds.playSelect(); setShowUploadModal(false); }}
              className="absolute top-4 right-4 text-white hover:bg-white/10 p-1 rounded-xs"
            >
              <X className="w-5 h-5 stroke-[2.5px]" />
            </button>

            <div className="space-y-1 select-none">
              <span className="text-[10px] uppercase tracking-widest text-[#ffffff]/50 font-mono">ENCRYPTED MEDIA STREAM</span>
              <h3 className="text-2xl font-black italic uppercase font-syne text-white">Broadcast Outlaw Tape</h3>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              
              {/* Select Spot */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">Spot Verification</label>
                <select 
                  value={selectedSpotForUpload} 
                  onChange={(e) => {
                    if (e.target.value === '__add_custom__') {
                      sounds.playSelect();
                      const userEmail = currentUser?.email || '';
                      const normEmail = userEmail.toLowerCase().trim();
                      const isAdmin = normEmail === 'inenepadi@gmail.com' || normEmail === 'moonsurfers@gmail.com' || normEmail === 'moonsufers@gmail.com';
                      if (!isAdmin) {
                        addTickerMessage("SECURE REFUSAL: Only Verified Admins can register public spots.");
                        addNotification('system', 'ACCESS DENIED', "Only verified administrators can deploy spots to the active radar grid (inenepadi@gmail.com / moonsurfers@gmail.com).");
                      } else {
                        setShowAddSpotModal(true);
                      }
                    } else {
                      setSelectedSpotForUpload(e.target.value);
                    }
                  }}
                  className="bg-zinc-950 border border-white/20 w-full text-xs font-bold font-grotesk p-2.5 outline-none focus:border-white text-white uppercase rounded-none cursor-pointer"
                >
                  {spotList.map((spot, spIndex) => (
                    <option key={spIndex} value={spot.name}>{spot.name}</option>
                  ))}
                  <option value="__add_custom__" className="text-red-500 font-extrabold">+ [+ ADD NEW PUBLIC SPOT]</option>
                </select>
              </div>

              {/* Upload Caption Text area */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">Session Log Text</label>
                <textarea
                  required
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  placeholder="Describe your steeze: e.g. landed massive kickflip down the stair rail with police tailing..."
                  className="bg-zinc-950 border border-white/20 w-full text-xs p-3 h-24 outline-none focus:border-white text-white resize-none font-sans"
                />
              </div>

              {/* Video uploader zone */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block font-mono">Attach Skate Clip (.MP4 video format)</label>
                
                {selectedVideoFile ? (
                  <div className="border border-white/25 p-2 bg-zinc-950 rounded-xs space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-emerald-400 truncate max-w-[70%] text-[8px]">
                        🎥 {selectedVideoFile.name} ({(selectedVideoFile.size / (1024 * 1024)).toFixed(1)}MB)
                      </span>
                      <button 
                        type="button" 
                        onClick={() => {
                          setSelectedVideoFile(null);
                          setVideoPreviewUrl(null);
                        }}
                        className="text-red-500 hover:text-red-400 uppercase font-black text-[9px] cursor-pointer"
                      >
                        [Remove]
                      </button>
                    </div>

                    {videoPreviewUrl && (
                      <div className="border border-white/10 rounded-xs overflow-hidden bg-black max-h-[120px] flex items-center justify-center">
                        <video 
                          src={videoPreviewUrl} 
                          controls 
                          playsInline
                          className="max-h-[120px] w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      const fileInput = document.getElementById("general-broadcast-file-input");
                      if (fileInput) fileInput.click();
                    }}
                    className="border-2 border-dashed border-white/20 p-5 text-center hover:border-white/35 bg-[#0a0a0b] cursor-pointer rounded-xs flex flex-col items-center justify-center gap-1 my-1.5 select-none"
                  >
                    <input 
                      type="file"
                      id="general-broadcast-file-input"
                      className="hidden"
                      accept="video/mp4,video/quicktime,video/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setSelectedVideoFile(file);
                          setVideoPreviewUrl(URL.createObjectURL(file));
                        }
                      }}
                    />
                    <Camera className="w-4 h-4 text-zinc-500 animate-pulse" />
                    <div className="space-y-0.5">
                      <div className="text-[9px] font-bold text-white uppercase font-mono animate-pulse">ATTACH VIDEO TAPE (.MP4)</div>
                      <div className="text-[7.5px] text-zinc-500 font-mono">Touch to stream local file or trigger device camera</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit action button */}
              <button
                type="submit"
                disabled={uploadAnimationRunning || !uploadText.trim()}
                className="w-full bg-white text-black font-black uppercase py-3.5 hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 font-syne disabled:opacity-50 text-xs"
              >
                {uploadAnimationRunning ? (
                  <span className="flex items-center gap-1.5 animate-pulse">BROADCASTING DATA TO CLOUD...</span>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-black stroke-[3px]" /> Broadcast Tape & Gain +250 XP
                  </>
                )}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* COMPONENT: TACTICAL SPECTRAL MISSION DISPATCH OVERLAY (.MP4 UPLOADER) */}
      {showMissionModal && missionSpot && (
        <div id="mission-dispatch-overlay" className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto font-mono">
          <div 
            id="mission-dispatch-box" 
            className="bg-[#050505] border-2 border-red-500 max-w-sm w-full p-5 text-white space-y-4 shadow-[0_0_50px_rgba(239,68,68,0.35)] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { sounds.playSelect(); setShowMissionModal(false); }}
              className="absolute top-3.5 right-3.5 text-white hover:bg-neutral-900 border border-white/10 px-2 py-0.5 text-[9px] rounded-xs font-bold cursor-pointer"
              disabled={aiAnalyzing}
            >
              [X] ABORT
            </button>

            <div className="space-y-1 select-none">
              <span className="text-[8px] uppercase tracking-[0.2em] text-red-500 font-extrabold block">● COUPLING SATELLITE DISPATCH</span>
              <h3 className="text-lg font-black italic uppercase font-syne text-white truncate max-w-[280px]">{missionSpot.name}</h3>
              <p className="text-[10px] text-zinc-400 font-sans leading-relaxed lowercase">
                Target: {missionSpot.description}
              </p>
            </div>

            {/* AI telemetry analysis state */}
            {aiAnalyzing ? (
              <div className="space-y-4 py-6 text-center select-none">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                  <Sparkles className="w-5 h-5 text-red-500 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase text-white tracking-widest">TRANSMITTING TELEMETRY DATA</h4>
                  <div className="text-[9px] text-red-400 uppercase font-black px-2 leading-relaxed h-12 flex items-center justify-center font-mono">
                    {completeSpotProgressText}
                  </div>
                  <div className="w-full bg-neutral-900 h-1.5 max-w-[240px] mx-auto border border-white/10 relative overflow-hidden">
                    <div 
                      className="bg-red-500 h-full transition-all duration-350 shadow-[0_0_8px_rgba(239,68,68,0.85)]"
                      style={{ width: `${completeSpotProgressPercent}%` }}
                    />
                  </div>
                  <div className="text-center text-[10px] font-black text-red-500 font-mono mt-1 animate-pulse">
                    {completeSpotProgressPercent}% COMPLETE
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUploadMissionTape} className="space-y-4">
                {/* Specific spot objectives info badge */}
                <div className="bg-red-950/20 border border-red-500/20 p-3 rounded-xs text-[9.5px] space-y-1 select-none leading-relaxed">
                  <div className="font-bold text-red-400 uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> REBEL INTEGRATION INTERFACE:
                  </div>
                  <div className="text-white/70">
                    Deploy a continuous <code>.MP4</code> movie stream clip from your local drive. AI telemetry checks grid location, rotation, and stable floor impact.
                  </div>
                  <div className="text-emerald-400 font-bold pt-1.5 border-t border-white/5 flex justify-between uppercase">
                    <span>REWARD: +450 XP</span>
                    <span>BONUS: +15 NO_RESPECT</span>
                  </div>
                </div>

                {/* Video uploader zone */}
                <div className="space-y-1">
                  <label className="text-[8.5px] uppercase tracking-wider text-zinc-400 block font-bold">Select Skate Clip (.MP4 video format)</label>
                  
                  {selectedVideoFile ? (
                    <div className="border border-white/25 p-2 bg-zinc-950 rounded-xs space-y-2">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-emerald-400 font-mono truncate max-w-[70%] text-[8px]">
                          🎥 {selectedVideoFile.name} ({(selectedVideoFile.size / (1024 * 1024)).toFixed(1)}MB)
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedVideoFile(null);
                            setVideoPreviewUrl(null);
                          }}
                          className="text-red-500 hover:text-red-400 uppercase font-black text-[9px] cursor-pointer"
                        >
                          [Remove]
                        </button>
                      </div>

                      {videoPreviewUrl && (
                        <div className="border border-white/10 rounded-xs overflow-hidden bg-black max-h-[120px] flex items-center justify-center">
                          <video 
                            src={videoPreviewUrl} 
                            controls 
                            playsInline
                            className="max-h-[120px] w-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div 
                      onClick={() => {
                        const fileInput = document.getElementById("spot-mission-file-input");
                        if (fileInput) fileInput.click();
                      }}
                      className="border-2 border-dashed border-white/20 p-5 text-center hover:border-white/40 bg-[#0a0a0b] cursor-pointer rounded-xs flex flex-col items-center justify-center gap-1.5 select-none"
                    >
                      <input 
                        type="file"
                        id="spot-mission-file-input"
                        className="hidden"
                        accept="video/mp4,video/quicktime,video/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            setSelectedVideoFile(file);
                            setVideoPreviewUrl(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <Camera className="w-5 h-5 text-zinc-500 animate-pulse" />
                      <div className="space-y-0.5">
                        <div className="text-[9px] font-bold text-white uppercase">DRAG & DROP TAPE (.MP4)</div>
                        <div className="text-[7.5px] text-zinc-500">Touch to browse local system directory (Max 24MB)</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Caption input */}
                <div className="space-y-1">
                  <label className="text-[8.5px] uppercase tracking-wider text-zinc-400 block font-bold">Transmit Clip Note (Steeze caption)</label>
                  <input
                    type="text"
                    required
                    value={spotMissionCaption}
                    onChange={(e) => setSpotMissionCaption(e.target.value)}
                    placeholder="e.g. Landed heavy double kickflip over the gap!"
                    className="bg-black border border-white/20 w-full text-xs p-2 outline-none focus:border-red-500 text-white uppercase rounded-none font-mono placeholder:text-zinc-600"
                  />
                </div>

                {/* Status Badge */}
                {profile?.badges?.includes('mission_completed_' + missionSpot.name.toLowerCase().replace(/\s+/g, '_')) ? (
                  <div className="bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 p-2 text-center text-[9px] font-bold uppercase select-none rounded-xs">
                    ✓ YOU GRANTED VERIFIED NET ACCESS RECORD OVER THIS AREA
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={!selectedVideoFile || !spotMissionCaption.trim()}
                    className="w-full bg-white text-black font-black uppercase py-2.5 hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 font-syne disabled:opacity-40 text-xs rounded-none cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-black stroke-[3.5px]" /> Launch Encrypted MP4 Tape Run
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Sector Deployment Modal */}
      {showAddDistrictModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-mono">
          <div className="border border-white/20 bg-zinc-950 p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <button
              onClick={() => { sounds.playSelect(); setShowAddDistrictModal(false); }}
              className="absolute top-3 right-3 text-white/50 hover:text-white text-xs cursor-pointer font-bold"
            >
              [X] CLOSE
            </button>
            
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-yellow-500 font-bold block">[DB CONNECT: ENGAGED]</span>
              <h3 className="text-sm font-black uppercase text-white tracking-wider font-syne">Deploy Custom Radar Sector</h3>
              <p className="text-[10px] text-white/55 leading-relaxed">
                Add an outline sector with accurate telemetry for international night skaters to map. Coordinates integrate natively with the worldwide network scan.
              </p>
            </div>

            <form onSubmit={handleCreateDynamicDistrict} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/40 block">District ID / Code (3 chars e.g. NIG, PAR)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. NIG"
                  value={newDistrictId}
                  onChange={(e) => setNewDistrictId(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                  className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white uppercase tracking-widest rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/40 block">District Name (e.g. Lagos, Nigeria)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Lagos"
                  value={newDistrictName}
                  onChange={(e) => setNewDistrictName(e.target.value)}
                  className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/40 block">Sector Coordinates String</label>
                <input 
                  type="text"
                  placeholder="e.g. 6.5244° N, 3.3792° E"
                  value={newDistrictCoords}
                  onChange={(e) => setNewDistrictCoords(e.target.value)}
                  className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white rounded-none font-sans"
                />
              </div>

              {districtCreationError && (
                <div className="text-[9px] text-red-500 uppercase border border-red-500/20 bg-red-950/20 p-2 text-center font-bold">
                  [ERROR] {districtCreationError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-white text-black font-extrabold uppercase py-2.5 text-xs tracking-wider font-syne hover:bg-zinc-200 transition-colors uppercase cursor-pointer"
              >
                Incorporate Sector to Database
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Custom Spot Verification Deployment Modal */}
      {showAddSpotModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm font-mono">
          <div className="border border-white/20 bg-zinc-950 p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <button
              onClick={() => { sounds.playSelect(); setShowAddSpotModal(false); }}
              className="absolute top-3 right-3 text-white/50 hover:text-white text-xs cursor-pointer font-bold"
            >
              [X] CLOSE
            </button>
            
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block">[SPOT TELEMETRY DEPLOYMENT]</span>
              <h3 className="text-sm font-black uppercase text-white tracking-wider font-syne">Register Custom Street Spot</h3>
              <p className="text-[10px] text-white/55 leading-relaxed">
                Manually register a custom street spot, gap, hidden rail, or ledges setup on the active radar grid of {currentDistrict.name}.
              </p>
            </div>

            <form onSubmit={handleCreateCustomSpot} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/40 block font-mono">Spot Name (e.g. Broken Bank Ledge)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Broken Bank Ledge"
                  value={newSpotName}
                  onChange={(e) => setNewSpotName(e.target.value)}
                  className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-white/40 block font-mono">Description / Features</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Describe stairs set, rail heights, guard frequencies..."
                  value={newSpotDescription}
                  onChange={(e) => setNewSpotDescription(e.target.value)}
                  className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white rounded-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-widest text-white/40 block font-mono">Difficulty Class</label>
                  <select 
                    value={newSpotDifficulty}
                    onChange={(e) => setNewSpotDifficulty(e.target.value as any)}
                    className="bg-black border border-white/10 w-full text-xs text-white p-2.5 outline-none focus:border-white rounded-none font-mono cursor-pointer"
                  >
                    <option value="Core">Core</option>
                    <option value="Concrete">Concrete</option>
                    <option value="Ledge">Ledge</option>
                    <option value="Vandal">Vandal</option>
                    <option value="Steel">Steel</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-widest text-white/40 block font-mono">Patrol Danger ({newSpotHype}%)</label>
                  <input 
                    type="range"
                    min="10"
                    max="100"
                    value={newSpotHype}
                    onChange={(e) => setNewSpotHype(parseInt(e.target.value))}
                    className="w-full bg-black h-8 cursor-pointer accent-red-600 block"
                  />
                </div>
              </div>

              {spotCreationError && (
                <div className="text-[9px] text-red-500 uppercase border border-red-500/20 bg-red-950/20 p-2 text-center font-bold">
                  [ERROR] {spotCreationError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-white text-black font-extrabold uppercase py-2.5 text-xs tracking-wider font-syne hover:bg-zinc-200 transition-colors uppercase cursor-pointer"
              >
                Sync Spot to GPS Database
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Live Skater Profile Modal Overlay */}
      {selectedLiveSkater && (
        <div 
          id="live-profile-modal-overlay" 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-mono text-white"
          onClick={() => { sounds.playSelect(); setSelectedLiveSkater(null); }}
        >
          <div 
            id="live-profile-modal-box" 
            className="border border-white/20 bg-zinc-950 p-6 max-w-sm w-full space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { sounds.playSelect(); setSelectedLiveSkater(null); }}
              className="absolute top-4 right-4 text-white/50 hover:text-white text-xs cursor-pointer font-bold bg-white/5 hover:bg-white/10 px-2 py-1 border border-white/10 transition-colors"
            >
              [X] DISMISS
            </button>
            
            <div className="flex gap-4 items-center pt-2">
              {/* Other Skater's Customized Profile Image with optional glowing borders and VHS filters */}
              <div className={`relative w-16 h-16 sm:w-20 sm:h-20 overflow-hidden bg-neutral-950 border shrink-0 transition-all ${
                selectedLiveSkater.avatarBorder === 'cyan' ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' :
                selectedLiveSkater.avatarBorder === 'pink' ? 'border-pink-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                selectedLiveSkater.avatarBorder === 'yellow' ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' :
                selectedLiveSkater.avatarBorder === 'amber' ? 'border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'border-white/20'
              }`}>
                {selectedLiveSkater.profilePicture ? (
                  <img 
                    src={selectedLiveSkater.profilePicture} 
                    alt={`@${selectedLiveSkater.handle}`} 
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover select-none ${selectedLiveSkater.vhsFilter ? 'contrast-130 brightness-110 saturate-140 hue-rotate-15 blur-[0.2px]' : ''}`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[7.5px] text-white/30 bg-black/50 font-mono border border-dashed border-white/5 text-center px-1 font-bold">
                    <span>OFF_GRID</span>
                    <span>AVATAR</span>
                  </div>
                )}
                
                {selectedLiveSkater.vhsFilter && (
                  <>
                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.35)_50%)] bg-[size:100%_4px] mix-blend-overlay" />
                    <div className="absolute inset-0 pointer-events-none border-l-[1.5px] border-red-500/20 mix-blend-screen" />
                    <div className="absolute top-1 left-1.5 text-[6.5px] text-green-400 font-mono tracking-widest scale-90">▶ PLAY</div>
                    <div className="absolute bottom-1 right-1.5 text-[6.5px] text-white/80 font-mono scale-90">VCR_LNK</div>
                  </>
                )}
              </div>

              <div className="space-y-1.5 select-none flex-1 overflow-hidden">
                <span className="text-[9px] uppercase tracking-widest text-white/40 block">[SKATER NET ID SECURED]</span>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black uppercase text-white tracking-wider font-syne italic truncate">@{selectedLiveSkater.handle}</h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="GPS Core Link Active" />
                </div>
                {selectedLiveSkater.motto && (
                  <p className="text-[11px] text-neutral-400 italic border-l border-white/20 pl-2 mt-1 py-0.5 font-sans leading-relaxed truncate max-w-[180px]">
                    "{selectedLiveSkater.motto}"
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-b border-white/10 py-4 select-none">
              <div className="space-y-0.5">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest">PERFORMANCE LEVEL</span>
                <div className="text-xs font-bold text-white">LEVEL {selectedLiveSkater.level || 1}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest">SCOREBOARD REP</span>
                <div className="text-xs font-bold text-white">{(selectedLiveSkater.reputation || 0).toLocaleString()} XP</div>
              </div>
              <div className="space-y-0.5 col-span-2">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest">SKATE DISCIPLINE</span>
                <div className="text-[11px] font-semibold text-white/80 uppercase">{selectedLiveSkater.skateStyle || "STREET REBEL"}</div>
              </div>
            </div>

            {selectedLiveSkater.activeLocation && (
              <div className="space-y-1.5 select-none bg-white/5 p-3 border border-white/5">
                <span className="text-[8px] text-yellow-500 uppercase tracking-widest font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-ping shrink-0" />
                  GPS TELEMETRY ENCRYPTED
                </span>
                <div className="text-neutral-300 text-xs font-semibold">
                  {selectedLiveSkater.activeLocation.spotName}
                </div>
                <div className="text-[9px] text-white/40 uppercase tracking-tight">
                  Area: {selectedLiveSkater.activeLocation.districtName} ({selectedLiveSkater.activeLocation.districtId})
                </div>
              </div>
            )}

            {selectedLiveSkater.badges && selectedLiveSkater.badges.length > 0 && (
              <div className="space-y-1 select-none">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest">VOID BADGES AWARDED</span>
                <div className="flex flex-wrap gap-1">
                  {selectedLiveSkater.badges.map((badge, bIdx) => (
                    <span 
                      key={bIdx}
                      className="text-[7.5px] font-bold text-white bg-white/10 px-1.5 py-0.5 border border-white/10 hover:border-white/30 transition-all uppercase"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              {selectedLiveSkater.id !== currentUser?.uid && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playSelect();
                    setSelectedChatSkater(selectedLiveSkater);
                    setBottomTab('comlink');
                    setSelectedLiveSkater(null);
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-mono font-black italic tracking-widest text-[11px] py-2.5 relative flex items-center justify-center gap-1.5 cursor-pointer border-b-2 border-b-red-950 active:translate-y-0.5 rounded-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-white animate-pulse" />
                  GENERATE COM-LINK CHAT
                </button>
              )}

              {selectedLiveSkater.id !== currentUser?.uid && (
                profile?.friends?.some(fName => fName.toLowerCase() === selectedLiveSkater.handle.toLowerCase()) ? (
                  <button
                    onClick={() => {
                      handleRemoveDirectFriend(selectedLiveSkater.handle);
                    }}
                    className="w-full bg-red-950/30 hover:bg-red-900/40 border border-red-500/40 text-red-400 py-2.5 text-xs font-extrabold uppercase tracking-widest flex items-center justify-center gap-1.5 font-mono cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-red-500" /> UNLINK NETWORK FRIEND
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      handleAddDirectFriend(selectedLiveSkater.handle);
                    }}
                    className="w-full bg-zinc-900 border border-white/10 text-zinc-300 hover:bg-neutral-800 transition-colors py-2 text-xs font-extrabold uppercase tracking-wider font-mono cursor-pointer"
                  >
                    LINK NETWORK FRIEND
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

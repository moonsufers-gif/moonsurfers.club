import React, { useState, useMemo, useEffect } from 'react';
import { 
  Zap, 
  Shuffle, 
  Search, 
  Award, 
  ShieldAlert, 
  CheckCircle, 
  Compass, 
  Sliders, 
  Clock, 
  Flame,
  Check,
  ChevronRight,
  PlusCircle,
  Trash2,
  Edit3,
  AlertTriangle,
  Radio,
  Calendar
} from 'lucide-react';
import { DynamicChallenge } from '../lib/firebase';

export interface OutlawIntelItem {
  id: string;
  title: string;
  sector: string;
  severity: 'CRITICAL' | 'ALERT' | 'INFO' | 'CLEAR' | 'ESCAPE_GOAL';
  timestamp: string;
  author: string;
  isEscapeGoal?: boolean;
  description?: string;
  xpReward?: number;
  rewardType?: 'XP' | 'Title Badge' | 'Gear Item' | 'Reputation Boost';
  customReward?: string;
  difficulty?: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel' | 'Insane';
  completedByUsers?: string[];
}

export interface OutlawEventItem {
  id: string;
  title: string;
  location: string;
  eventDate: string; // ISO string
  xpReward: number;
  details: string;
  createdBy: string;
}

interface CuratedChallenge {
  id: string;
  title: string;
  spotName: string;
  districtName: string;
  description: string;
  difficulty: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel' | 'Insane';
  patrolRisk: number; // 0-100
  xpReward: number;
  tactics: string;
  estimatedTime: string;
}

interface UndergroundChallengesProps {
  personalChallenges: DynamicChallenge[];
  onTriggerPersonalChallenge: () => Promise<void>;
  onCompletePersonalChallenge: (ch: DynamicChallenge) => Promise<void>;
  isGeneratingChallenge: boolean;
  sounds: {
    playSelect: () => void;
    playTrickSuccess: () => void;
    playTick: () => void;
  };
  currentUser: { uid: string; isGuest?: boolean } | null;
  profile: { reputation: number; level: number; id: string } | null;
  onAwardXp: (xpAmount: number, challengeTitle: string) => Promise<void>;
  isAdmin?: boolean;
  intelList?: OutlawIntelItem[];
  onAddIntel?: (intel: {
    id?: string;
    title: string;
    sector: string;
    severity: 'CRITICAL' | 'ALERT' | 'INFO' | 'CLEAR' | 'ESCAPE_GOAL';
    isEscapeGoal?: boolean;
    description?: string;
    xpReward?: number;
    rewardType?: 'XP' | 'Title Badge' | 'Gear Item' | 'Reputation Boost';
    customReward?: string;
    difficulty?: 'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel' | 'Insane';
  }) => Promise<void>;
  onDeleteIntel?: (intelId: string) => Promise<void>;
  onClaimIntelEscapeGoal?: (intel: OutlawIntelItem) => Promise<void>;
  eventsList?: OutlawEventItem[];
  onSaveEvent?: (event: OutlawEventItem) => Promise<void>;
  onDeleteEvent?: (eventId: string) => Promise<void>;
}

// Minimal Live Clock Countdown Component
const MinimalEventCountdown: React.FC<{ targetDate: string }> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false
  });

  useEffect(() => {
    const calculate = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (isNaN(target) || diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft.isExpired) {
    return (
      <span className="text-[8.5px] bg-zinc-900 text-zinc-500 border border-zinc-800 px-2 py-0.5 font-bold uppercase font-mono tracking-wider shrink-0">
        [ EVENT PASSED / EXPIRED ]
      </span>
    );
  }

  const dStr = String(timeLeft.days).padStart(2, '0');
  const hStr = String(timeLeft.hours).padStart(2, '0');
  const mStr = String(timeLeft.minutes).padStart(2, '0');
  const sStr = String(timeLeft.seconds).padStart(2, '0');

  return (
    <div className="flex items-center gap-1.5 text-[9px] font-mono text-red-400 font-black bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-xs animate-pulse shrink-0">
      <Clock className="w-2.5 h-2.5 shrink-0 text-red-500" />
      <span>COUNTDOWN: {dStr}d {hStr}h {mStr}m {sStr}s</span>
    </div>
  );
};

// Master pool of general/weekly underground objectives
const MASTER_CURATED_WEEKLY_CHALLENGES: CuratedChallenge[] = [
  {
    id: 'weekly_accra_mall',
    title: 'Mall Speed Run Override',
    spotName: 'Accra Mall Car Park',
    districtName: 'Accra [ACC]',
    description: 'Shred the Accra Mall Car Park multi-level concrete columns. Slide down fast downhill spiral ramps & dodge yellow security cruisers.',
    difficulty: 'Steel',
    patrolRisk: 92,
    xpReward: 480,
    tactics: 'Carry extreme speed out of the spiral ramp to clear the security barrier.',
    estimatedTime: '2.5 MIN'
  },
  {
    id: 'weekly_osu_wall',
    title: 'Osu Castle Wall Assault',
    spotName: 'Osu Castle Wall',
    districtName: 'Accra [ACC]',
    description: 'Land 3 heavy Kickflips at the ocean-side wall under radar-shielded night conditions.',
    difficulty: 'Core',
    patrolRisk: 89,
    xpReward: 390,
    tactics: 'Watch the saltwater spray of the waves; it ruins traction instantly.',
    estimatedTime: '4.0 MIN'
  },
  {
    id: 'weekly_kaneshie',
    title: 'Kaneshie Tin-Roof Transit',
    spotName: 'Kaneshie Market Rooftops',
    districtName: 'Accra [ACC]',
    description: 'Grind the high-voltage overhead conduit tubes and transfer across narrow vendor tin roofs.',
    difficulty: 'Insane',
    patrolRisk: 88,
    xpReward: 550,
    tactics: 'Stay light on the feet to prevent falling through rusted corrugated roof tiles.',
    estimatedTime: '5.2 MIN'
  },
  {
    id: 'weekly_airport',
    title: 'Airport Gated Silence Descent',
    spotName: 'Airport Residential Slopes',
    districtName: 'Accra [ACC]',
    description: 'Carve and downhill speedbomb the wealthy sub-quadrant. Avoid detection from mobile guard sweeps.',
    difficulty: 'Ledge',
    patrolRisk: 65,
    xpReward: 340,
    tactics: 'Skate on the absolute shadow side of streetlights to bypass static cameras.',
    estimatedTime: '3.0 MIN'
  },
  {
    id: 'weekly_liberation',
    title: 'Liberation Highway Infiltration',
    spotName: 'Liberation Road Overpass',
    districtName: 'Accra [ACC]',
    description: 'Tail slide the coarse highway boundary concrete block before the early morning municipal check.',
    difficulty: 'Core',
    patrolRisk: 78,
    xpReward: 420,
    tactics: 'Approach from the blind side of the terminal overpass checkpoint.',
    estimatedTime: '1.5 MIN'
  },
  {
    id: 'weekly_james',
    title: 'Jamestown Board Slippage',
    spotName: 'Jamestown Fishing Piers',
    districtName: 'Accra [ACC]',
    description: 'Execute a continuous series of nose-slides on wet harbor decks. Avoid deep water spills.',
    difficulty: 'Vandal',
    patrolRisk: 84,
    xpReward: 400,
    tactics: 'Apply extra board wax to overcome the sticky salt residue layered on the wood.',
    estimatedTime: '2.0 MIN'
  },
  {
    id: 'weekly_indypark',
    title: 'Independence Day Leap',
    spotName: 'Independence Square',
    districtName: 'Accra [ACC]',
    description: 'Launch a massive kickflip down the main 5-stair monument under critical patrol sweep conditions.',
    difficulty: 'Concrete',
    patrolRisk: 95,
    xpReward: 520,
    tactics: 'Maintain a maximum approach velocity to clear the wide concrete landing area.',
    estimatedTime: '3.5 MIN'
  },
  {
    id: 'weekly_shibuya',
    title: 'Shibuya Crossing Neon Sweep',
    spotName: 'Shibuya Lanes',
    districtName: 'Tokyo [TYO]',
    description: 'Hold a tight manual line along glowing pedestrian markings during a 45-second traffic delay window.',
    difficulty: 'Insane',
    patrolRisk: 96,
    xpReward: 600,
    tactics: 'Time the walk-signal light sequence perfectly. Keep eyes up for oncoming carts.',
    estimatedTime: '1.2 MIN'
  },
  {
    id: 'weekly_mauer',
    title: 'Mauerpark Wallride Campaign',
    spotName: 'Mauerpark Concrete Slabs',
    districtName: 'Berlin [BER]',
    description: 'Perform raw vertical wallrides on historical paint-coated raw concrete blocks.',
    difficulty: 'Concrete',
    patrolRisk: 70,
    xpReward: 310,
    tactics: 'Position weight toward front wheels when transitioning off the vertical wall.',
    estimatedTime: '3.2 MIN'
  },
  {
    id: 'weekly_brooklyn',
    title: 'Williamsburg Rail Siege',
    spotName: 'Williamsburg Monument',
    districtName: 'Brooklyn [BKL]',
    description: 'Grind the iconic steel rails of Williamsburg Plaza while active patrol drones monitor the sector.',
    difficulty: 'Ledge',
    patrolRisk: 74,
    xpReward: 380,
    tactics: 'Wait for the drone sweep to rotate 180 degrees away before charging the handrail.',
    estimatedTime: '2.8 MIN'
  },
  {
    id: 'weekly_rio',
    title: 'Arpoador Waves Transfer',
    spotName: 'Arpoador Rocks',
    districtName: 'Rio de Janeiro [RIO]',
    description: 'Perform a clean nosegrab transfer over jagged seaside granite slabs with heavy spray.',
    difficulty: 'Core',
    patrolRisk: 50,
    xpReward: 300,
    tactics: 'Wax the tail edge of the deck to prevent corrosion from extreme dampness.',
    estimatedTime: '4.5 MIN'
  },
  {
    id: 'weekly_london',
    title: 'Southbank Column Legacy',
    spotName: 'Southbank Undercroft',
    districtName: 'London [LON]',
    description: 'Combo three consecutive flip-tricks off the concrete support pillars in historical graffiti zones.',
    difficulty: 'Core',
    patrolRisk: 72,
    xpReward: 350,
    tactics: 'The pavement has decades of heavy wear. Keep knees flexible to buffer vibrations.',
    estimatedTime: '3.8 MIN'
  }
];

export function UndergroundChallenges({
  personalChallenges,
  onTriggerPersonalChallenge,
  onCompletePersonalChallenge,
  isGeneratingChallenge,
  sounds,
  currentUser,
  profile,
  onAwardXp,
  isAdmin = false,
  intelList = [],
  onAddIntel,
  onDeleteIntel,
  onClaimIntelEscapeGoal,
  eventsList = [],
  onSaveEvent,
  onDeleteEvent
}: UndergroundChallengesProps) {
  const [activeTab, setActiveTab] = useState<'personal' | 'weekly' | 'intel' | 'events'>('personal');
  const [activeCuratedList, setActiveCuratedList] = useState<CuratedChallenge[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'patrol' | 'reward'>('reward');
  const [completedWeeklyIds, setCompletedWeeklyIds] = useState<string[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [selectedCurated, setSelectedCurated] = useState<CuratedChallenge | null>(null);

  // Intel input form states for Admin
  const [showAddIntelForm, setShowAddIntelForm] = useState(false);
  const [editingIntelId, setEditingIntelId] = useState<string | null>(null);
  const [dispatchType, setDispatchType] = useState<'ESCAPE_GOAL' | 'INTEL'>('ESCAPE_GOAL');
  const [intelHeadline, setIntelHeadline] = useState('');
  const [intelSector, setIntelSector] = useState('Accra [ACC]');
  const [intelSeverity, setIntelSeverity] = useState<'CRITICAL' | 'ALERT' | 'INFO' | 'CLEAR'>('ALERT');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalXpReward, setGoalXpReward] = useState(500);
  const [goalRewardType, setGoalRewardType] = useState<'XP' | 'Title Badge' | 'Gear Item' | 'Reputation Boost'>('XP');
  const [goalCustomReward, setGoalCustomReward] = useState('');
  const [goalDifficulty, setGoalDifficulty] = useState<'Core' | 'Concrete' | 'Ledge' | 'Vandal' | 'Steel' | 'Insane'>('Steel');
  const [isSubmittingIntel, setIsSubmittingIntel] = useState(false);

  // Event creation form states for Admin
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDateStr, setEventDateStr] = useState('');
  const [eventXp, setEventXp] = useState(500);
  const [eventDetails, setEventDetails] = useState('');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Initialize weekly challenges by shuffling a set of 4 challenges on mounts
  useEffect(() => {
    shuffleCuratedPool();
    if (currentUser) {
      const key = `moonsurfers_weeklies_v1_${currentUser.uid}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setCompletedWeeklyIds(JSON.parse(saved));
        } catch (_) {}
      }
    }
  }, [currentUser?.uid]);

  const shuffleCuratedPool = () => {
    sounds.playSelect();
    setShuffling(true);
    setTimeout(() => {
      const shuffled = [...MASTER_CURATED_WEEKLY_CHALLENGES].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 4);
      setActiveCuratedList(selected);
      setSelectedCurated(selected[0] || null);
      setShuffling(false);
    }, 600);
  };

  const handleCompleteWeekly = async (ch: CuratedChallenge) => {
    if (!currentUser || !profile) return;
    sounds.playTrickSuccess();
    const newCompleted = [...completedWeeklyIds, ch.id];
    setCompletedWeeklyIds(newCompleted);
    const key = `moonsurfers_weeklies_v1_${currentUser.uid}`;
    localStorage.setItem(key, JSON.stringify(newCompleted));
    await onAwardXp(ch.xpReward, ch.title);
  };

  const startEditIntel = (item: OutlawIntelItem) => {
    sounds.playSelect();
    setEditingIntelId(item.id);
    const isGoal = item.isEscapeGoal || item.severity === 'ESCAPE_GOAL';
    setDispatchType(isGoal ? 'ESCAPE_GOAL' : 'INTEL');
    setIntelHeadline(item.title);
    setIntelSector(item.sector);
    setIntelSeverity(item.severity !== 'ESCAPE_GOAL' ? item.severity : 'ALERT');
    setGoalDescription(item.description || '');
    setGoalXpReward(item.xpReward || 500);
    setGoalRewardType(item.rewardType || 'XP');
    setGoalCustomReward(item.customReward || '');
    setGoalDifficulty(item.difficulty || 'Steel');
    setShowAddIntelForm(true);
  };

  const resetIntelForm = () => {
    setEditingIntelId(null);
    setIntelHeadline('');
    setGoalDescription('');
    setGoalCustomReward('');
    setShowAddIntelForm(false);
  };

  const handlePostIntelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intelHeadline.trim()) return;
    setIsSubmittingIntel(true);
    try {
      if (onAddIntel) {
        if (dispatchType === 'ESCAPE_GOAL') {
          await onAddIntel({
            id: editingIntelId || undefined,
            title: intelHeadline.trim(),
            sector: intelSector.trim() || 'Sector-7',
            severity: 'ESCAPE_GOAL',
            isEscapeGoal: true,
            description: goalDescription.trim() || 'Execute undercover maneuvers and bypass sector security alarms.',
            xpReward: Number(goalXpReward) || 500,
            rewardType: goalRewardType,
            customReward: goalCustomReward.trim(),
            difficulty: goalDifficulty
          });
        } else {
          await onAddIntel({
            id: editingIntelId || undefined,
            title: intelHeadline.trim(),
            sector: intelSector.trim() || 'Global',
            severity: intelSeverity
          });
        }
      }
      resetIntelForm();
    } finally {
      setIsSubmittingIntel(false);
    }
  };

  const handleEventFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventLocation.trim() || !eventDateStr) return;
    setIsSubmittingEvent(true);
    try {
      if (onSaveEvent) {
        const isoDate = new Date(eventDateStr).toISOString();
        await onSaveEvent({
          id: editingEventId || `event_${Date.now()}`,
          title: eventTitle.trim(),
          location: eventLocation.trim(),
          eventDate: isoDate,
          xpReward: Number(eventXp) || 300,
          details: eventDetails.trim(),
          createdBy: (profile as any)?.handle || 'ADMIN'
        });
      }
      setEditingEventId(null);
      setEventTitle('');
      setEventLocation('');
      setEventDateStr('');
      setEventDetails('');
      setShowEventForm(false);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const openEditEvent = (ev: OutlawEventItem) => {
    setEditingEventId(ev.id);
    setEventTitle(ev.title);
    setEventLocation(ev.location);
    // Format date string for datetime-local input
    try {
      const d = new Date(ev.eventDate);
      const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEventDateStr(localIso);
    } catch (_) {
      setEventDateStr('');
    }
    setEventXp(ev.xpReward);
    setEventDetails(ev.details);
    setShowEventForm(true);
  };

  const filteredCurated = useMemo(() => {
    let result = activeCuratedList.filter(ch => {
      const matchedSearch = 
        ch.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ch.spotName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ch.districtName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ch.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchedFilter = 
        filterDifficulty === 'ALL' || 
        ch.difficulty.toUpperCase() === filterDifficulty.toUpperCase();

      return matchedSearch && matchedFilter;
    });

    if (sortOption === 'patrol') {
      result.sort((a, b) => b.patrolRisk - a.patrolRisk);
    } else {
      result.sort((a, b) => b.xpReward - a.xpReward);
    }

    return result;
  }, [activeCuratedList, searchQuery, filterDifficulty, sortOption]);

  return (
    <div className="border border-white/10 bg-zinc-950/40 divide-y divide-white/10 select-none font-mono">
      {/* HEADER SECTION */}
      <div className="p-4 bg-black/60 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex flex-col space-y-0.5">
          <span className="text-[9px] text-red-600 font-bold tracking-widest uppercase animate-pulse">OUTLAW MOTORWAY & EVENT CORE</span>
          <h3 className="text-base font-black italic uppercase font-syne tracking-tight text-white">OUTLAW INTEL BOX</h3>
        </div>

        {/* TABS CONTROLLER */}
        <div className="flex bg-zinc-950 border border-white/15 p-1 rounded-sm gap-1 overflow-x-auto">
          <button
            onClick={() => { sounds.playTick(); setActiveTab('personal'); }}
            className={`text-[8.5px] font-black uppercase px-2 py-1 tracking-wider transition-all rounded-xs cursor-pointer shrink-0 ${activeTab === 'personal' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Personal
          </button>
          <button
            onClick={() => { sounds.playTick(); setActiveTab('weekly'); }}
            className={`text-[8.5px] font-black uppercase px-2 py-1 tracking-wider transition-all rounded-xs cursor-pointer shrink-0 ${activeTab === 'weekly' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Weeklies
          </button>
          <button
            onClick={() => { sounds.playTick(); setActiveTab('intel'); }}
            className={`text-[8.5px] font-black uppercase px-2 py-1 tracking-wider transition-all rounded-xs cursor-pointer shrink-0 ${activeTab === 'intel' ? 'bg-red-600 text-white font-extrabold' : 'text-zinc-500 hover:text-white'}`}
          >
            Intel Box
          </button>
          <button
            onClick={() => { sounds.playTick(); setActiveTab('events'); }}
            className={`text-[8.5px] font-black uppercase px-2 py-1 tracking-wider transition-all rounded-xs cursor-pointer shrink-0 ${activeTab === 'events' ? 'bg-red-600 text-white font-extrabold' : 'text-zinc-500 hover:text-white'}`}
          >
            Events
          </button>
        </div>
      </div>

      {/* TAB CONTENT: PERSONAL */}
      {activeTab === 'personal' && (
        <div className="p-5 space-y-4">
          <div className="border border-white/15 p-4 bg-white/5 hover:bg-white/10 transition-colors space-y-3">
            <div className="flex items-start justify-between gap-1">
              <p className="text-[10.5px] text-white/70 lowercase leading-relaxed font-sans">
                engage the system coordinate core engine to extract local undercover objectives based on your current sector, spot locations, and active surveillance radar.
              </p>
            </div>

            <button 
              onClick={onTriggerPersonalChallenge}
              disabled={isGeneratingChallenge}
              className="w-full bg-white text-black font-black uppercase text-xs py-2.5 flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors rounded-none cursor-pointer"
            >
              {isGeneratingChallenge ? (
                <span className="animate-pulse">DECODING TELEMETRY SPECS...</span>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-black stroke-[3px]" /> Generate Escape Goal
                </>
              )}
            </button>
          </div>

          {/* Connected Firestore List */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 pt-1 border-t border-white/5">
            {personalChallenges.length > 0 ? (
              personalChallenges.map((ch) => {
                const chCompleted = ch.status === 'completed';
                return (
                  <div 
                    key={ch.id} 
                    className={`border p-3.5 space-y-2.5 flex flex-col justify-between transition-colors ${chCompleted ? 'border-zinc-800 bg-zinc-950/20' : 'border-white/15 bg-white/5 hover:border-white/20'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest block">SECTOR: {ch.districtId}</span>
                        <h4 className={`text-xs font-black uppercase font-grotesk tracking-wide ${chCompleted ? 'line-through text-white/40' : 'text-white'}`}>
                          {ch.title}
                        </h4>
                      </div>
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 font-bold uppercase rounded-xs shrink-0 ${chCompleted ? 'bg-zinc-800 text-zinc-500' : 'bg-red-600 text-white'}`}>
                        {chCompleted ? 'COMPLETED' : `${ch.difficulty}`}
                      </span>
                    </div>

                    <p className={`text-[10px] font-sans lowercase leading-snug select-text ${chCompleted ? 'text-white/30 line-through' : 'text-white/60'}`}>
                      "{ch.description}"
                    </p>

                    {!chCompleted && (
                      <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                        <span className="text-[10px] font-bold font-mono text-white/80 shrink-0 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-yellow-500" /> +{ch.xpReward} XP
                        </span>
                        <button 
                          onClick={() => onCompletePersonalChallenge(ch)}
                          className="bg-white text-black hover:bg-zinc-200 font-extrabold text-[9px] uppercase px-2.5 py-1 tracking-wider font-mono rounded-none cursor-pointer"
                        >
                          CLAIM REWARD
                        </button>
                      </div>
                    )}
                    {chCompleted && (
                      <div className="text-[9px] font-mono text-zinc-600 italic text-right mt-1 flex items-center justify-end gap-1 select-none">
                        <Check className="w-3 h-3 text-emerald-500" /> logged in secure database vault
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-[9px] font-mono text-zinc-600 italic text-center py-6 border border-dashed border-white/10 bg-black/20">
                No active personal escape goals. Engrave telemetry list by tapping generate above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: WEEKLY CURATION SHRED */}
      {activeTab === 'weekly' && (
        <div className="p-4 space-y-4">
          {/* SEARCH, SORT, SHUFFLE PANEL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="SEARCH INTEL POOL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black border border-white/10 w-full text-[10px] text-white pl-7 pr-2.5 py-1.5 outline-none focus:border-white tracking-widest rounded-none placeholder-zinc-600"
                />
              </div>

              <button
                onClick={shuffleCuratedPool}
                disabled={shuffling}
                className="bg-red-600 text-white font-black text-[10px] px-3 py-1.5 uppercase hover:bg-red-500 hover:scale-102 transition-all flex items-center gap-1 shrink-0 rounded-none cursor-pointer"
                title="Shuffle curated weekly challenges"
              >
                <Shuffle className={`w-3.5 h-3.5 ${shuffling ? 'animate-spin' : ''}`} />
                <span>Shuffle</span>
              </button>
            </div>

            {/* FILTERS & SORT */}
            <div className="flex items-center justify-between text-[9px] text-white/50 border-t border-b border-white/5 py-1.5">
              <div className="flex items-center gap-1">
                <Sliders className="w-3 h-3" />
                <span>DIFF:</span>
                {['ALL', 'STEEL', 'CORE', 'LEDGE', 'CONCRETE'].map((diff) => (
                  <button
                    key={diff}
                    onClick={() => { sounds.playTick(); setFilterDifficulty(diff); }}
                    className={`font-black uppercase px-1 rounded-xs hover:text-white ${filterDifficulty === diff ? 'text-white bg-white/10 underline underline-offset-2' : ''}`}
                  >
                    {diff}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span>SORT:</span>
                <button
                  onClick={() => { sounds.playTick(); setSortOption('reward'); }}
                  className={`font-black uppercase rounded-xs hover:text-white ${sortOption === 'reward' ? 'text-white underline underline-offset-2' : ''}`}
                >
                  REWARD
                </button>
                <span>/</span>
                <button
                  onClick={() => { sounds.playTick(); setSortOption('patrol'); }}
                  className={`font-black uppercase rounded-xs hover:text-white ${sortOption === 'patrol' ? 'text-white underline underline-offset-2' : ''}`}
                >
                  RISK
                </button>
              </div>
            </div>
          </div>

          {/* SELECTED VIEW / MAIN CHALLENGE PREVIEW */}
          {selectedCurated && (
            <div className="border border-red-500/30 bg-red-950/15 p-4 space-y-3 relative overflow-hidden">
              {/* Scanline backdrop effect */}
              <div className="absolute inset-0 bg-linear-gradient(to bottom, rgba(255, 0, 43, 0.08) 1px, transparent 1px) bg-[size:100%_8px] pointer-events-none opacity-40"></div>
              
              <div className="flex justify-between items-start gap-1">
                <div className="space-y-0.5">
                  <span className="text-[8px] bg-red-600 text-white font-bold uppercase px-1.5 py-0.5 tracking-wider inline-block">
                    {selectedCurated.difficulty} DIFF
                  </span>
                  <h4 className="text-xs font-black uppercase text-white tracking-wide font-syne flex items-center gap-1.5 mt-1">
                    <Flame className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                    {selectedCurated.title}
                  </h4>
                  <div className="text-[9px] text-white/50 uppercase tracking-widest">{selectedCurated.districtName} • {selectedCurated.spotName}</div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[12px] font-black text-rose-500">{selectedCurated.xpReward} XP</div>
                  <div className="text-[8px] text-zinc-500 mt-1 flex items-center gap-1 justify-end font-bold uppercase">
                    <ShieldAlert className="w-3 h-3 text-red-600" />
                    <span>{selectedCurated.patrolRisk}% RISK</span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-zinc-300 font-sans leading-relaxed select-text p-2 bg-black/40 border border-white/5 lowercase">
                "{selectedCurated.description}"
              </p>

              <div className="text-[9.5px] border-t border-white/5 pt-2 space-y-1">
                <span className="text-[8px] text-red-500 uppercase tracking-widest font-black block">UNDERGROUND TACTICS:</span>
                <p className="text-zinc-400 lowercase">{selectedCurated.tactics}</p>
              </div>

              <div className="flex items-center justify-between pt-1 text-[9px] font-semibold text-white/40">
                <span className="flex items-center gap-1 uppercase"><Clock className="w-3.5 h-3.5" /> EST TRANSIT TIME: {selectedCurated.estimatedTime}</span>
                
                {completedWeeklyIds.includes(selectedCurated.id) ? (
                  <span className="text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1 bg-emerald-950/20 border border-emerald-500/20 px-2 py-1">
                    <CheckCircle className="w-3.5 h-3.5" /> MISSION SECURED
                  </span>
                ) : (
                  <button
                    onClick={() => handleCompleteWeekly(selectedCurated)}
                    className="bg-white text-black font-black text-[10px] px-3.5 py-1.5 hover:bg-neutral-200 transition-all uppercase cursor-pointer"
                  >
                    SHRED & COMPLETE
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BROWSE LIST SELECTOR */}
          <div className="space-y-2">
            <span className="text-[8px] text-white/30 uppercase tracking-wider block font-bold">BROWSE UNDERGROUND INCIDENT LIST:</span>
            
            <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-1">
              {filteredCurated.length > 0 ? (
                filteredCurated.map((ch) => {
                  const isSelected = selectedCurated?.id === ch.id;
                  const isCompleted = completedWeeklyIds.includes(ch.id);
                  
                  return (
                    <div
                      key={ch.id}
                      onClick={() => { sounds.playTick(); setSelectedCurated(ch); }}
                      className={`p-2.5 flex items-center justify-between border cursor-pointer select-none transition-all ${
                        isSelected 
                          ? 'bg-white/10 border-white text-white shadow-md' 
                          : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {isCompleted ? (
                          <div className="w-4 h-4 rounded-full border border-emerald-500 flex items-center justify-center bg-emerald-950/20 shrink-0">
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                          </div>
                        ) : (
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`}></div>
                        )}
                        <div className="truncate text-left">
                          <span className={`text-[10px] font-black uppercase text-left tracking-wide ${isCompleted ? 'line-through text-white/30' : ''}`}>
                            {ch.title}
                          </span>
                          <span className="text-[8px] text-white/40 uppercase tracking-tight block truncate ml-0.5">{ch.spotName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[8.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-xs ${
                          isCompleted ? 'bg-zinc-800 text-zinc-500' : 'bg-red-600/20 text-red-500 border border-red-500/10'
                        }`}>
                          {ch.difficulty}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'translate-x-0.5 text-white' : 'text-white/20'}`} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-[9px] font-mono text-zinc-600 italic text-center py-4 border border-zinc-900 bg-black/10 select-none">
                  No weekly coordinates matched search query or active filter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: OUTLAW INTEL BOX */}
      {activeTab === 'intel' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <h4 className="text-xs font-black uppercase text-white font-syne tracking-wide flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                Outlaw Intel Box
              </h4>
              <p className="text-[9px] text-zinc-400 font-sans mt-0.5">Real-time network security warnings & sector intelligence dispatches.</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playSelect();
                    setEditingIntelId(null);
                    setDispatchType('ESCAPE_GOAL');
                    setShowAddIntelForm(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-black uppercase px-2.5 py-1 flex items-center gap-1 transition-all shrink-0 cursor-pointer shadow-sm"
                >
                  <Zap className="w-3 h-3 fill-black" />
                  + New Escape Goal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playSelect();
                    setEditingIntelId(null);
                    setDispatchType('INTEL');
                    setShowAddIntelForm(true);
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                >
                  <PlusCircle className="w-3 h-3" />
                  + Alert
                </button>
              </div>
            )}
          </div>

          {/* Admin Add Intel / Escape Goal Form */}
          {isAdmin && showAddIntelForm && (
            <form onSubmit={handlePostIntelSubmit} className="bg-zinc-900/90 border border-amber-500/50 p-3.5 space-y-3 rounded-xs shadow-xl relative">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="text-[9.5px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5 font-grotesk">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {editingIntelId ? "EDITING DISPATCH / GOAL" : "AUTHORIZE NEW NETWORK DISPATCH"}
                </div>
                {/* Mode Selector */}
                <div className="flex items-center gap-1.5">
                  <div className="flex bg-black border border-white/15 p-0.5 rounded-xs gap-1">
                    <button
                      type="button"
                      onClick={() => { sounds.playTick(); setDispatchType('ESCAPE_GOAL'); }}
                      className={`text-[8px] font-black uppercase px-2 py-0.5 tracking-wider transition-all cursor-pointer ${
                        dispatchType === 'ESCAPE_GOAL' ? 'bg-amber-500 text-black font-extrabold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Escape Goal
                    </button>
                    <button
                      type="button"
                      onClick={() => { sounds.playTick(); setDispatchType('INTEL'); }}
                      className={`text-[8px] font-black uppercase px-2 py-0.5 tracking-wider transition-all cursor-pointer ${
                        dispatchType === 'INTEL' ? 'bg-red-600 text-white font-extrabold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Patrol Alert
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={resetIntelForm}
                    className="text-zinc-500 hover:text-white text-[9px] font-mono px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {dispatchType === 'ESCAPE_GOAL' ? (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-bold text-amber-400 uppercase tracking-wider block">ESCAPE GOAL TITLE</label>
                    <input
                      type="text"
                      placeholder="e.g. MIDNIGHT COASTAL RADAR EVASION"
                      value={intelHeadline}
                      onChange={(e) => setIntelHeadline(e.target.value)}
                      required
                      className="w-full bg-black border border-amber-500/30 text-white text-[10px] p-2 outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                    <div>
                      <label className="text-zinc-400 block mb-1">TARGET SECTOR / DISTRICT</label>
                      <input
                        type="text"
                        placeholder="e.g. Accra [ACC]"
                        value={intelSector}
                        onChange={(e) => setIntelSector(e.target.value)}
                        className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">DIFFICULTY LEVEL</label>
                      <select
                        value={goalDifficulty}
                        onChange={(e: any) => setGoalDifficulty(e.target.value)}
                        className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                      >
                        <option value="Core">Core (Easy)</option>
                        <option value="Concrete">Concrete (Medium)</option>
                        <option value="Ledge">Ledge (Hard)</option>
                        <option value="Vandal">Vandal (Extreme)</option>
                        <option value="Steel">Steel (Outlaw)</option>
                        <option value="Insane">Insane (Legendary)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-zinc-400 block">OBJECTIVE DESCRIPTION / TACTICS</label>
                    <textarea
                      placeholder="Specify required tricks, evasion routes, or spot maneuvers..."
                      value={goalDescription}
                      onChange={(e) => setGoalDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-black border border-white/20 text-white text-[10px] p-2 outline-none focus:border-amber-400 font-mono resize-none"
                    />
                  </div>

                  {/* REWARD CONFIGURATION ENGINE */}
                  <div className="border border-amber-500/30 bg-amber-950/20 p-2.5 rounded-xs space-y-2">
                    <div className="text-[8.5px] font-black uppercase text-amber-300 tracking-wider flex items-center gap-1">
                      <Award className="w-3 h-3 text-amber-400" />
                      CUSTOM REWARD CONFIGURATION
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div>
                        <label className="text-zinc-400 block mb-1">XP ALLOCATION</label>
                        <input
                          type="number"
                          value={goalXpReward}
                          onChange={(e) => setGoalXpReward(Number(e.target.value))}
                          step={50}
                          min={50}
                          max={5000}
                          className="w-full bg-black border border-amber-500/30 text-amber-400 text-[10px] p-1.5 outline-none font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">REWARD CATEGORY</label>
                        <select
                          value={goalRewardType}
                          onChange={(e: any) => setGoalRewardType(e.target.value)}
                          className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                        >
                          <option value="XP">XP & Rep Boost</option>
                          <option value="Title Badge">Outlaw Title Badge</option>
                          <option value="Gear Item">Deck / Gear Item</option>
                          <option value="Reputation Boost">Multiplier Chip</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1 text-[8.5px]">CUSTOM UNLOCK DESCRIPTION / PERK NAME (OPTIONAL)</label>
                      <input
                        type="text"
                        placeholder="e.g. Ghost Stealth Deck + 'Night Crawler' Badge"
                        value={goalCustomReward}
                        onChange={(e) => setGoalCustomReward(e.target.value)}
                        className="w-full bg-black border border-white/20 text-amber-300 text-[10px] p-1.5 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    placeholder="Enter Intel Headline / Patrol Alert..."
                    value={intelHeadline}
                    onChange={(e) => setIntelHeadline(e.target.value)}
                    required
                    className="w-full bg-black border border-white/20 text-white text-[10px] p-2 outline-none focus:border-red-500 font-mono"
                  />
                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                    <div>
                      <label className="text-zinc-400 block mb-1">SECTOR / DISTRICT</label>
                      <input
                        type="text"
                        value={intelSector}
                        onChange={(e) => setIntelSector(e.target.value)}
                        className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">ALERT SEVERITY</label>
                      <select
                        value={intelSeverity}
                        onChange={(e: any) => setIntelSeverity(e.target.value)}
                        className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="ALERT">ALERT</option>
                        <option value="INFO">INFO</option>
                        <option value="CLEAR">CLEAR</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingIntel}
                className={`w-full font-black text-[10px] uppercase py-2 cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                  dispatchType === 'ESCAPE_GOAL' ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {isSubmittingIntel ? (
                  "BROADCASTING TO NETWORK..."
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    {dispatchType === 'ESCAPE_GOAL' ? "PUBLISH CUSTOM ESCAPE GOAL" : "DISPATCH INTEL ALERT"}
                  </>
                )}
              </button>
            </form>
          )}

          {/* Intel & Escape Goals List */}
          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {intelList && intelList.length > 0 ? (
              intelList.map((item) => {
                const isEscapeGoal = item.isEscapeGoal || item.severity === 'ESCAPE_GOAL';
                const hasClaimed = currentUser && item.completedByUsers?.includes(currentUser.uid);

                if (isEscapeGoal) {
                  return (
                    <div key={item.id} className="border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-black to-zinc-950 p-3 space-y-2 rounded-xs hover:border-amber-500/50 transition-all shadow-md">
                      <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-amber-500 text-black uppercase tracking-wider flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 fill-black" />
                            ESCAPE GOAL
                          </span>
                          <span className="text-[8.5px] text-amber-300/80 font-bold uppercase tracking-wider">{item.sector}</span>
                          {item.difficulty && (
                            <span className="text-[7.5px] border border-white/20 px-1 py-0.5 text-zinc-300 font-mono">
                              {item.difficulty}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-zinc-500 font-mono">{item.timestamp}</span>
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditIntel(item)}
                                className="text-zinc-400 hover:text-amber-400 p-0.5 cursor-pointer"
                                title="Edit Goal Entry"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              {onDeleteIntel && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteIntel(item.id)}
                                  className="text-zinc-500 hover:text-red-400 p-0.5 cursor-pointer"
                                  title="Delete Goal Entry"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-white uppercase tracking-wide leading-tight flex items-center gap-1.5">
                          {item.title}
                        </h4>
                        {item.description && (
                          <p className="text-[9px] text-zinc-300 font-sans leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* REWARDS BREAKDOWN BADGES */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                        <span className="text-[8.5px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-xs flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          +{item.xpReward || 500} XP
                        </span>
                        {item.rewardType && (
                          <span className="text-[8px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded-xs font-mono uppercase">
                            TYPE: {item.rewardType}
                          </span>
                        )}
                        {item.customReward && (
                          <span className="text-[8px] bg-red-950/60 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-xs font-mono font-bold uppercase flex items-center gap-1">
                            <Award className="w-2.5 h-2.5 text-red-400" />
                            REWARD: {item.customReward}
                          </span>
                        )}
                      </div>

                      {/* CLAIM GOAL ACTION */}
                      <div className="pt-1">
                        {hasClaimed ? (
                          <div className="w-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold uppercase py-1.5 px-3 flex items-center justify-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            ESCAPE GOAL CLAIMED (+{item.xpReward || 500} XP)
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (onClaimIntelEscapeGoal) {
                                onClaimIntelEscapeGoal(item);
                              } else {
                                sounds.playTrickSuccess();
                                onAwardXp(item.xpReward || 500, item.title);
                              }
                            }}
                            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black text-[9.5px] uppercase py-1.5 px-3 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Zap className="w-3 h-3 fill-black" />
                            ACCEPT & CLAIM ESCAPE REWARD (+{item.xpReward || 500} XP)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const badgeColor = 
                  item.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                  item.severity === 'ALERT' ? 'bg-amber-600 text-white' :
                  item.severity === 'CLEAR' ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-200';

                return (
                  <div key={item.id} className="border border-white/10 bg-black/50 p-2.5 space-y-1.5 hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-xs uppercase ${badgeColor}`}>
                          {item.severity}
                        </span>
                        <span className="text-[8.5px] text-zinc-400 font-bold uppercase">{item.sector}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-zinc-500 font-mono">{item.timestamp}</span>
                        {isAdmin && onDeleteIntel && (
                          <button
                            type="button"
                            onClick={() => onDeleteIntel(item.id)}
                            className="text-zinc-500 hover:text-red-400 p-0.5 cursor-pointer"
                            title="Delete Intel Entry"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-white uppercase tracking-wide leading-snug">
                      {item.title}
                    </div>
                    <div className="text-[8px] text-zinc-500 font-mono">
                      Dispatched by @{item.author || 'ADMIN'}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[9px] font-mono text-zinc-500 italic text-center py-8 border border-dashed border-white/10 bg-black/20">
                Outlaw intel box quiet. No critical security dispatches logged.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: CUSTOM EVENTS WITH MINIMAL COUNTDOWN */}
      {activeTab === 'events' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <h4 className="text-xs font-black uppercase text-white font-syne tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-500" />
                Organized Outlaw Events
              </h4>
              <p className="text-[9px] text-zinc-400 font-sans mt-0.5">Official night skate rallies, jam sessions & spot takeovers.</p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  sounds.playSelect();
                  setEditingEventId(null);
                  setEventTitle('');
                  setEventLocation('');
                  setEventDateStr('');
                  setEventDetails('');
                  setShowEventForm(!showEventForm);
                }}
                className="bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase px-2.5 py-1 flex items-center gap-1 transition-all shrink-0 cursor-pointer"
              >
                <PlusCircle className="w-3 h-3" />
                {showEventForm ? "Close Form" : "+ Create Event"}
              </button>
            )}
          </div>

          {/* Admin Event Form */}
          {isAdmin && showEventForm && (
            <form onSubmit={handleEventFormSubmit} className="bg-zinc-900/90 border border-red-500/40 p-3 space-y-2.5 rounded-xs">
              <div className="text-[9px] font-black uppercase text-red-400 tracking-wider">
                {editingEventId ? "EDIT EVENT DETAILS" : "ORGANIZATION OF NEW OUTLAW EVENT"}
              </div>
              <div className="space-y-2 text-[9px]">
                <div>
                  <label className="text-zinc-400 block mb-1">EVENT TITLE</label>
                  <input
                    type="text"
                    placeholder="e.g., MIDNIGHT ACCRA CAR PARK RALLY"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    required
                    className="w-full bg-black border border-white/20 text-white text-[10px] p-2 outline-none font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">SPOT / LOCATION</label>
                    <input
                      type="text"
                      placeholder="e.g., Accra Mall Car Park"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      required
                      className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">EVENT DATE & TIME</label>
                    <input
                      type="datetime-local"
                      value={eventDateStr}
                      onChange={(e) => setEventDateStr(e.target.value)}
                      required
                      className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">XP REWARD</label>
                    <input
                      type="number"
                      value={eventXp}
                      onChange={(e) => setEventXp(Number(e.target.value))}
                      className="w-full bg-black border border-white/20 text-white text-[10px] p-1.5 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">ORGANIZER</label>
                    <input
                      type="text"
                      value={(profile as any)?.handle || 'ADMIN'}
                      disabled
                      className="w-full bg-black/50 border border-white/10 text-zinc-500 text-[10px] p-1.5 font-mono cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">EVENT DETAILS & RULES</label>
                  <textarea
                    rows={2}
                    placeholder="Provide details about the line, meets, and rules..."
                    value={eventDetails}
                    onChange={(e) => setEventDetails(e.target.value)}
                    className="w-full bg-black border border-white/20 text-white text-[10px] p-2 outline-none font-mono resize-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmittingEvent}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase py-2 cursor-pointer transition-all"
              >
                {isSubmittingEvent ? "SAVING EVENT..." : (editingEventId ? "UPDATE EVENT DETAILS" : "PUBLISH EVENT TO NETWORK")}
              </button>
            </form>
          )}

          {/* Events List */}
          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {eventsList && eventsList.length > 0 ? (
              eventsList.map((ev) => {
                const isPassed = new Date().getTime() >= new Date(ev.eventDate).getTime();

                return (
                  <div
                    key={ev.id}
                    className={`border p-3 space-y-2.5 transition-all ${
                      isPassed 
                        ? 'border-zinc-800 bg-zinc-950/30' 
                        : 'border-red-500/30 bg-red-950/10 hover:border-red-500/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-[8px] text-zinc-400 uppercase font-bold tracking-widest block">
                          SPOT: {ev.location}
                        </span>
                        <h4 className={`text-xs font-black uppercase tracking-wide font-syne ${
                          isPassed ? 'line-through text-zinc-500' : 'text-white'
                        }`}>
                          {ev.title}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <MinimalEventCountdown targetDate={ev.eventDate} />
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditEvent(ev)}
                              className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                              title="Edit Event Details"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            {onDeleteEvent && (
                              <button
                                type="button"
                                onClick={() => onDeleteEvent(ev.id)}
                                className="text-zinc-400 hover:text-red-400 p-1 cursor-pointer"
                                title="Delete Event"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className={`text-[10px] font-sans leading-relaxed select-text ${
                      isPassed ? 'line-through text-zinc-600' : 'text-zinc-300'
                    }`}>
                      "{ev.details}"
                    </p>

                    <div className="flex items-center justify-between text-[8.5px] font-mono text-zinc-400 pt-1 border-t border-white/5">
                      <span>DATE: {new Date(ev.eventDate).toLocaleString()}</span>
                      <span className="text-amber-400 font-bold">REWARD: +{ev.xpReward} XP</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[9px] font-mono text-zinc-500 italic text-center py-8 border border-dashed border-white/10 bg-black/20">
                No active organized outlaw events scheduled.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

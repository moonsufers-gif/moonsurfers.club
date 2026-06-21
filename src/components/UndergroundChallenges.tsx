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
  ChevronRight
} from 'lucide-react';
import { DynamicChallenge } from '../lib/firebase';

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
}

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
  onAwardXp
}: UndergroundChallengesProps) {
  const [activeTab, setActiveTab] = useState<'personal' | 'weekly'>('personal');
  const [activeCuratedList, setActiveCuratedList] = useState<CuratedChallenge[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'patrol' | 'reward'>('reward');
  const [completedWeeklyIds, setCompletedWeeklyIds] = useState<string[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [selectedCurated, setSelectedCurated] = useState<CuratedChallenge | null>(null);

  // Initialize weekly challenges by shuffling a set of 4 challenges on mounts
  useEffect(() => {
    shuffleCuratedPool();
    // Load completed weekly challenge IDs from localStorage based on user
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
    // Shuffle and pick 4 unique challenges
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
    
    // Complete and add to state
    const newCompleted = [...completedWeeklyIds, ch.id];
    setCompletedWeeklyIds(newCompleted);

    const key = `moonsurfers_weeklies_v1_${currentUser.uid}`;
    localStorage.setItem(key, JSON.stringify(newCompleted));

    // Award XP via applet's callback
    await onAwardXp(ch.xpReward, ch.title);
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
      <div className="p-4 bg-black/60 flex items-center justify-between">
        <div className="flex flex-col space-y-0.5">
          <span className="text-[9px] text-red-600 font-bold tracking-widest uppercase animate-pulse">CHALLENGE MOTORWAY v2.8</span>
          <h3 className="text-base font-black italic uppercase font-syne tracking-tight text-white">OUTLAW INTEL BOX</h3>
        </div>

        {/* TABS CONTROLLER */}
        <div className="flex bg-zinc-950 border border-white/15 p-1 rounded-sm gap-1">
          <button
            onClick={() => { sounds.playTick(); setActiveTab('personal'); }}
            className={`text-[9px] font-black uppercase px-2.5 py-1 tracking-wider transition-all rounded-xs cursor-pointer ${activeTab === 'personal' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Personal
          </button>
          <button
            onClick={() => { sounds.playTick(); setActiveTab('weekly'); }}
            className={`text-[9px] font-black uppercase px-2.5 py-1 tracking-wider transition-all rounded-xs cursor-pointer ${activeTab === 'weekly' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Weekly Goals
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
              <div className="absolute inset-0 bg-linear-gradient(to bottom, rgba(239, 68, 68, 0.05) 1px, transparent 1px) bg-[size:100%_8px] pointer-events-none opacity-40"></div>
              
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
    </div>
  );
}

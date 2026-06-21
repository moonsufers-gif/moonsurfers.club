import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Sparkles, AlertCircle, BarChart3, TrendingUp, Calendar, Zap, Compass, Activity, Award } from 'lucide-react';
import { LiveTrickUpload } from '../lib/firebase';

interface PerformanceDashboardProps {
  userTricks: LiveTrickUpload[];
  onPlayTick: () => void;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  userTricks,
  onPlayTick,
}) => {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(6); // Defaults to index 6 (today) in 7-day range
  const [activeMetricTab, setActiveMetricTab] = useState<'activity' | 'distance' | 'performance'>('activity');

  // Robust parsing to date helper
  const getTrickDate = (trick: LiveTrickUpload): Date | null => {
    // If createdAt is missing or pending (like during instant optimistic offline UI writes)
    // fallback immediately to parsing the timestamp from its ID which holds the exact epoch
    let dateVal = trick.createdAt;
    if (!dateVal) {
      if (trick.id && trick.id.startsWith('clip_')) {
        const parts = trick.id.split('_');
        const epoch = parseInt(parts[1], 10);
        if (!isNaN(epoch)) {
          return new Date(epoch);
        }
      }
      return new Date(); // ultimate fallback to today
    }
    
    if (typeof dateVal.toDate === 'function') {
      return dateVal.toDate();
    }
    if (dateVal instanceof Date) {
      return dateVal;
    }
    if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      return new Date(dateVal);
    }
    // Check if it's a Firestore-like timestamp object
    if (typeof dateVal === 'object' && 'seconds' in dateVal) {
      return new Date((dateVal as any).seconds * 1000);
    }
    return new Date();
  };

  // Build the last 7 days metrics ranging from 6 days ago up to today
  const last7DaysData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i)); // 6 days ago up to today
    
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dateStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();

    // Filter user's tricks landed on this specific day
    const tricksOnDay = userTricks.filter(t => {
      const tDate = getTrickDate(t);
      return tDate && tDate >= startOfDay && tDate <= endOfDay;
    });

    // Sum distance
    const totalDistance = tricksOnDay.reduce(
      (acc, t) => acc + (t.stuntDistance !== undefined ? t.stuntDistance : Math.round((t.text || '').length * 2.5 + 15)),
      0
    );

    // Style performance rating average
    const avgPerformance = tricksOnDay.length > 0
      ? Math.round(
          tricksOnDay.reduce(
            (acc, t) => acc + (t.performanceScore !== undefined ? t.performanceScore : Math.min(100, 60 + ((t.text || '').length % 35))),
            0
          ) / tricksOnDay.length
        )
      : 0;

    return {
      day: dayName,
      date: dateStr,
      count: tricksOnDay.length,
      distance: totalDistance,
      performance: avgPerformance,
      tricks: tricksOnDay.map(t => ({
        ...t,
        stuntDistance: t.stuntDistance !== undefined ? t.stuntDistance : Math.round((t.text || '').length * 2.5 + 15),
        performanceScore: t.performanceScore !== undefined ? t.performanceScore : Math.min(100, 60 + ((t.text || '').length % 35))
      }))
    };
  });

  const selectedDayData = selectedDayIndex !== null ? last7DaysData[selectedDayIndex] : null;

  // Aggregate stats
  const totalTricksInWeeklyRange = last7DaysData.reduce((acc, curr) => acc + curr.count, 0);
  const totalDistanceInWeeklyRange = last7DaysData.reduce((acc, curr) => acc + curr.distance, 0);
  const averagePerformanceInWeeklyRange = last7DaysData.filter(d => d.count > 0).length > 0
    ? Math.round(last7DaysData.filter(d => d.count > 0).reduce((acc, curr) => acc + curr.performance, 0) / last7DaysData.filter(d => d.count > 0).length)
    : 0;

  // Handle graph clicks
  const handleGraphPointClick = (index: number) => {
    onPlayTick();
    setSelectedDayIndex(index);
  };

  return (
    <div id="performance-dashboard-container" className="border border-white/15 bg-zinc-950/90 shadow-[0_12px_40px_rgba(0,0,0,0.8)] p-4 font-mono space-y-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-1.5 text-xs text-white font-black tracking-wider uppercase font-grotesk">
          <Activity className="w-3.5 h-3.5 text-red-500 animate-pulse" />
          <span>STUNT PERFORMANCE ANALYTICS</span>
        </div>
        <div className="flex items-center gap-2 text-[8px] sm:text-[9px] font-bold text-zinc-500">
          <span>REAL-TIME TELEMETRY CORE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
        </div>
      </div>

      {/* Segmented Controls for Sub-Metrics */}
      <div className="grid grid-cols-3 gap-1 bg-black p-[2px] border border-white/5">
        <button
          type="button"
          onClick={() => { onPlayTick(); setActiveMetricTab('activity'); }}
          className={`py-1.5 text-[9px] font-black uppercase text-center font-mono tracking-widest transition-all cursor-pointer ${
            activeMetricTab === 'activity'
              ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.3)]'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          ACTIVITY
        </button>
        <button
          type="button"
          onClick={() => { onPlayTick(); setActiveMetricTab('distance'); }}
          className={`py-1.5 text-[9px] font-black uppercase text-center font-mono tracking-widest transition-all cursor-pointer ${
            activeMetricTab === 'distance'
              ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.3)]'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          DISTANCE
        </button>
        <button
          type="button"
          onClick={() => { onPlayTick(); setActiveMetricTab('performance'); }}
          className={`py-1.5 text-[9px] font-black uppercase text-center font-mono tracking-widest transition-all cursor-pointer ${
            activeMetricTab === 'performance'
              ? 'bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.3)]'
              : 'text-zinc-500 hover:text-white hover:bg-white/5'
          }`}
        >
          STYLE %
        </button>
      </div>

      {/* Aggregate Mini Metrics Drawer */}
      <div className="grid grid-cols-3 gap-2 bg-white/2 border border-white/5 p-2 text-center">
        <div className="border-r border-white/5">
          <div className="text-[7.5px] text-zinc-500 tracking-wider uppercase font-medium">Weekly Tricks</div>
          <div className="text-sm font-black text-red-400 font-mono">{totalTricksInWeeklyRange} LZ</div>
        </div>
        <div className="border-r border-white/5">
          <div className="text-[7.5px] text-zinc-500 tracking-wider uppercase font-medium">Surfed Dist</div>
          <div className="text-sm font-black text-blue-400 font-mono">{totalDistanceInWeeklyRange} M</div>
        </div>
        <div>
          <div className="text-[7.5px] text-zinc-500 tracking-wider uppercase font-medium">Avg Style</div>
          <div className="text-sm font-black text-emerald-400 font-mono">{averagePerformanceInWeeklyRange}%</div>
        </div>
      </div>

      {/* Graph Area */}
      <div className="h-32 w-full pr-2 pt-1 relative">
        <ResponsiveContainer width="100%" height="100%">
          {activeMetricTab === 'activity' ? (
            <BarChart
              data={last7DaysData}
              margin={{ top: 5, right: 0, left: -40, bottom: 0 }}
            >
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-white/15 p-2 text-[10px] space-y-0.5 shadow-xl font-mono">
                        <p className="text-red-400 font-extrabold">{data.date}</p>
                        <p className="text-white uppercase">{data.count} LANDED STUNTS</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                radius={[1, 1, 0, 0]}
                onClick={(data, index) => handleGraphPointClick(index)}
                className="cursor-pointer"
              >
                {last7DaysData.map((entry, index) => {
                  const isSelected = selectedDayIndex === index;
                  const hasValue = entry.count > 0;
                  
                  let fill = 'rgba(255, 255, 255, 0.12)';
                  if (isSelected) {
                    fill = '#ef4444'; // Vibrant Red
                  } else if (hasValue) {
                    fill = 'rgba(239, 68, 68, 0.6)';
                  }

                  return (
                    <Cell
                      key={`cell-activity-${index}`}
                      fill={fill}
                      className="transition-all duration-150 hover:opacity-100"
                    />
                  );
                })}
              </Bar>
            </BarChart>
          ) : activeMetricTab === 'distance' ? (
            <AreaChart
              data={last7DaysData}
              margin={{ top: 5, right: 0, left: -40, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(59, 130, 246, 0.2)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-white/15 p-2 text-[10px] space-y-0.5 shadow-xl font-mono">
                        <p className="text-blue-400 font-extrabold">{data.date}</p>
                        <p className="text-white uppercase">{data.distance} METERS SURFED</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="distance"
                stroke="#3bf6"
                fillOpacity={1}
                fill="url(#colorDistance)"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  const isSelected = selectedDayIndex === index;
                  return (
                    <circle
                      key={`dot-dis-${index}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 4 : 2}
                      className="cursor-pointer"
                      fill={isSelected ? '#3b82f6' : '#1e3a8a'}
                      stroke={isSelected ? '#ffffff' : '#3b82f6'}
                      strokeWidth={1.5}
                      onClick={() => handleGraphPointClick(index)}
                    />
                  );
                }}
              />
            </AreaChart>
          ) : (
            <LineChart
              data={last7DaysData}
              margin={{ top: 5, right: 0, left: -40, bottom: 0 }}
            >
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(16, 185, 129, 0.2)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-white/15 p-2 text-[10px] space-y-0.5 shadow-xl font-mono">
                        <p className="text-emerald-400 font-extrabold">{data.date}</p>
                        <p className="text-white uppercase">{data.performance}% AVG STYLE</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                type="monotone"
                dataKey="performance"
                stroke="#10b981"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  const isSelected = selectedDayIndex === index;
                  return (
                    <circle
                      key={`dot-perf-${index}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 4 : 2}
                      className="cursor-pointer"
                      fill={isSelected ? '#10b981' : '#064e3b'}
                      stroke={isSelected ? '#ffffff' : '#10b981'}
                      strokeWidth={1.5}
                      onClick={() => handleGraphPointClick(index)}
                    />
                  );
                }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Selected Day Stats & Logged Stunts Details */}
      <div className="bg-[#0b0b0c] border border-white/10 p-3 relative overflow-hidden">
        {/* Subtle decorative grid background inside panel */}
        <div className="absolute inset-0 bg-grid-white/[0.01] pointer-events-none" />

        <AnimatePresence mode="wait">
          {selectedDayData && (
            <motion.div
              key={selectedDayIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="space-y-2.5 relative z-10"
            >
              {/* Day info title block */}
              <div className="flex items-center justify-between text-[10.5px] border-b border-white/5 pb-2">
                <div className="flex items-center gap-1 text-white/50">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="font-extrabold text-white tracking-wide">{selectedDayData.date}</span>
                </div>
                <div className="flex items-center gap-2 text-[8px] sm:text-[9.5px]">
                  <span className="text-zinc-500 font-bold font-mono">DAY OUTCOME:</span>
                  <span className="font-black text-red-500 font-mono uppercase bg-red-950/20 border border-red-500/20 px-1.5 py-0.5">
                    {selectedDayData.count} LANDS
                  </span>
                </div>
              </div>

              {/* Day's physical outcome logs */}
              {selectedDayData.count > 0 && (
                <div className="grid grid-cols-2 gap-2 bg-black/40 border border-white/5 p-2 font-mono text-[9px]">
                  <div className="flex items-center gap-1.5 text-white/75">
                    <Compass className="w-3 h-3 text-blue-400" />
                    <span>TRAVERSED: <b className="text-white font-extrabold">{selectedDayData.distance}M</b></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/75">
                    <Award className="w-3 h-3 text-emerald-400" />
                    <span>AVG SCORE: <b className="text-white font-extrabold">{selectedDayData.performance}%</b></span>
                  </div>
                </div>
              )}

              {/* Individual Tricks Lists */}
              <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1">
                {selectedDayData.count > 0 ? (
                  selectedDayData.tricks.map((trick) => (
                    <div
                      key={trick.id}
                      className="bg-black/60 border border-white/5 p-2.5 hover:border-white/15 transition-all space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[9.5px] font-black text-white leading-tight uppercase tracking-wider block">
                          {trick.text.replace('[LIVE GPS RUN] ', '').trim()}
                        </span>
                        <div className="flex items-center gap-1 text-[8px] bg-red-500/10 border border-red-500/20 text-red-400 px-1 hover:bg-red-500/20 transition-all cursor-default select-none">
                          <Zap className="w-2.5 h-2.5" />
                          <span>+50 XP</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center justify-between text-[8px] text-zinc-500 font-mono gap-1.5 pt-1 border-t border-white/5">
                        <span className="truncate">
                          📍 {trick.spotName || 'STREET RUN'}
                        </span>
                        
                        {/* Dynamic performance indicators rendered clearly for each logged trick */}
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400 font-bold">
                            📐 {trick.stuntDistance || 40}M
                          </span>
                          <span className="text-emerald-400 font-bold">
                            ⚡ {trick.performanceScore || 75}%
                          </span>
                          <span className="text-[7px] text-zinc-600">
                            {getTrickDate(trick)?.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })} SECTOR
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-5 text-center space-y-1.5">
                    <AlertCircle className="w-5 h-5 text-zinc-600 animate-bounce" />
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold block leading-snug">
                      NO ACTIVE DISPATCHES RECORDED
                    </span>
                    <span className="text-[7.5px] text-zinc-600 font-mono block max-w-xs">
                      LAND STUNTS VIA SATELLITE RADAR VIEW, INITIATE MISSIONS, OR UPLOAD VIDEO FILES TO GENERATE SHRED METRICS.
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

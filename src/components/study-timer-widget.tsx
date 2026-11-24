'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Clock, Pause, Play, RotateCcw, Timer } from 'lucide-react';

type TimerPreset = 'POMODORO_25' | 'DEEP_50' | 'STOPWATCH';

const emptySubscribe = () => () => {};

export function StudyTimerWidget({ compact = false }: { compact?: boolean }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [preset, setPreset] = useState<TimerPreset>('POMODORO_25');
  const [running, setRunning] = useState(false);
  const [secondsValue, setSecondsValue] = useState(25 * 60);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsValue((prev) => {
        if (preset === 'STOPWATCH') return prev + 1;
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, preset]);

  const istClock = useMemo(() => {
    if (!mounted) return '--:--:-- IST';
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(nowMs)) + ' IST'
    );
  }, [mounted, nowMs]);

  const istDate = useMemo(() => {
    if (!mounted) return '';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(new Date(nowMs));
  }, [mounted, nowMs]);

  const selectPreset = (next: TimerPreset) => {
    setRunning(false);
    setPreset(next);
    if (next === 'POMODORO_25') setSecondsValue(25 * 60);
    else if (next === 'DEEP_50') setSecondsValue(50 * 60);
    else setSecondsValue(0);
  };

  const resetTimer = () => {
    setRunning(false);
    if (preset === 'POMODORO_25') setSecondsValue(25 * 60);
    else if (preset === 'DEEP_50') setSecondsValue(50 * 60);
    else setSecondsValue(0);
  };

  const formattedCountdown = useMemo(() => {
    const hrs = Math.floor(secondsValue / 3600);
    const mins = Math.floor((secondsValue % 3600) / 60);
    const secs = secondsValue % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [secondsValue]);

  return (
    <div
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Clock className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {istClock}
          </span>
          {istDate ? <span>· {istDate}</span> : null}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Focus Timer
        </span>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-emerald-500" />
            <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
              {formattedCountdown}
            </p>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {preset === 'POMODORO_25'
              ? '25-minute Pomodoro sprint'
              : preset === 'DEEP_50'
              ? '50-minute deep study block'
              : 'Open-ended stopwatch session'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Pause' : secondsValue === 0 && preset !== 'STOPWATCH' ? 'Resume' : 'Start'}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            aria-label="Reset study timer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(
          [
            { id: 'POMODORO_25', label: '25m Pomodoro' },
            { id: 'DEEP_50', label: '50m Deep Block' },
            { id: 'STOPWATCH', label: 'Stopwatch' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectPreset(item.id)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              preset === item.id
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

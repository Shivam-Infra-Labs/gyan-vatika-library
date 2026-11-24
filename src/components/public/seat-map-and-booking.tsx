'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BellPlus,
  Check,
  Clock,
  Grid,
  List,
  Lock,
  Plug,
  Snowflake,
  SunMedium,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  FLEXIBLE_SLOT_PRESETS,
  formatDateDisplay,
  formatINR,
  formatMinute12h,
  formatMinuteRangeLabel,
  todayIST,
} from '@/src/lib/format';
import { PublicCenterPayload, SeatAvailabilityDTO } from '@/src/types/library';

interface SeatMapAndBookingProps {
  data: PublicCenterPayload;
  requestSheetOpen: boolean;
  setRequestSheetOpen: (open: boolean) => void;
}

const MINUTE_OPTIONS = Array.from({ length: 25 }, (_, i) => 540 + i * 30); // 09:00 AM (540) to 09:00 PM (1260)
const emptySubscribe = () => () => {};

export function SeatMapAndBooking({
  data,
  requestSheetOpen,
  setRequestSheetOpen,
}: SeatMapAndBookingProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const rawReducedMotion = useReducedMotion();
  const prefersReduced = mounted ? Boolean(rawReducedMotion) : true;
  const [startDate, setStartDate] = useState(() => todayIST());
  const [selectedPlanId, setSelectedPlanId] = useState<number>(data.plans[0]?.id ?? 0);
  const [selectedShiftId, setSelectedShiftId] = useState<number>(data.shifts[0]?.id ?? 0);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(data.rooms[0]?.id ?? 0);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  // Flexible 2-3 hour custom window state
  const [customStartMinute, setCustomStartMinute] = useState<number>(540);
  const [customEndMinute, setCustomEndMinute] = useState<number>(720);

  const [seats, setSeats] = useState<SeatAvailabilityDTO[]>([]);
  const [summary, setSummary] = useState({ available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 });
  const [endDate, setEndDate] = useState('');
  const [loadingMap, setLoadingMap] = useState(false);

  const [selectedSeat, setSelectedSeat] = useState<SeatAvailabilityDTO | null>(null);

  // Booking Request Drawer State
  const [step, setStep] = useState<'review-seat' | 'contact' | 'confirm' | 'submitted'>('review-seat');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [examTarget, setExamTarget] = useState('UPSC / State PCS');
  const [submitting, setSubmitting] = useState(false);
  const [alternatives, setAlternatives] = useState<SeatAvailabilityDTO[]>([]);
  const [conflictMsg, setConflictMsg] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [submittedResult, setSubmittedResult] = useState<{
    referenceCode: string;
    seatNumber: number;
    shiftName: string;
    shiftHours: string;
    planName: string;
    totalPaise: number;
  } | null>(null);

  // Waitlist Modal State
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistPhone, setWaitlistPhone] = useState('');
  const [waitlistExam, setWaitlistExam] = useState('UPSC / State PCS');
  const [waitlistNotes, setWaitlistNotes] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);

  const activePlan = useMemo(
    () => data.plans.find((p) => p.id === selectedPlanId) ?? data.plans[0],
    [data.plans, selectedPlanId]
  );
  const activeShift = useMemo(
    () => data.shifts.find((s) => s.id === selectedShiftId) ?? data.shifts[0],
    [data.shifts, selectedShiftId]
  );
  const activeRoom = useMemo(
    () => data.rooms.find((r) => r.id === selectedRoomId) ?? data.rooms[0],
    [data.rooms, selectedRoomId]
  );

  const isFlexible = Boolean(activeShift?.isFlexible);
  const customDurationOk = customEndMinute - customStartMinute >= 120 && customEndMinute - customStartMinute <= 180;
  const activeWindowLabel = isFlexible
    ? formatMinuteRangeLabel(customStartMinute, customEndMinute)
    : activeShift?.displayHours || '';

  const buildAvailabilityParams = useCallback(() => {
    if (!activeShift || !activePlan) return null;
    if (activeShift.isFlexible && !customDurationOk) return null;
    return new URLSearchParams({
      shiftId: String(activeShift.id),
      startDate,
      durationMonths: String(activePlan.durationMonths),
      ...(activeRoom ? { roomId: String(activeRoom.id) } : {}),
      ...(activeShift.isFlexible
        ? {
            customStartMinute: String(customStartMinute),
            customEndMinute: String(customEndMinute),
          }
        : {}),
    });
  }, [activeShift, activePlan, activeRoom, startDate, customStartMinute, customEndMinute, customDurationOk]);

  const loadAvailability = useCallback(async () => {
    const params = buildAvailabilityParams();
    if (!params) return;
    setLoadingMap(true);
    try {
      const res = await fetch(`/api/public/availability?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load seats');
      const json = await res.json();
      setSeats(json.seats || []);
      setSummary(json.summary || { available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 });
      setEndDate(json.endDate || '');
    } catch {
      toast.error('Unable to refresh seat map right now.');
    } finally {
      setLoadingMap(false);
    }
  }, [buildAvailabilityParams]);

  useEffect(() => {
    const params = buildAvailabilityParams();
    if (!params) return;
    let cancelled = false;
    fetch(`/api/public/availability?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load seats');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setSeats(json.seats || []);
          setSummary(json.summary || { available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 });
          setEndDate(json.endDate || '');
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Unable to refresh seat map right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMap(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [buildAvailabilityParams]);

  const computeFee = useCallback(
    (shiftMonthlyPaise: number) => {
      if (!activePlan) return { subtotal: 0, discount: 0, total: 0 };
      const subtotal = shiftMonthlyPaise * activePlan.durationMonths;
      const discount = Math.round((subtotal * activePlan.discountPercent) / 100);
      return {
        subtotal,
        discount,
        total: subtotal - discount,
      };
    },
    [activePlan]
  );

  const activeQuote = activeShift ? computeFee(activeShift.monthlyFeePaise) : { subtotal: 0, discount: 0, total: 0 };

  const openSeatDrawer = (seat: SeatAvailabilityDTO) => {
    setSelectedSeat(seat);
    setConflictMsg('');
    setAlternatives([]);
    setStep('review-seat');
    setSubmittedResult(null);
    setRequestSheetOpen(true);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat || !activeShift || !activePlan) return;
    if (activeShift.isFlexible && !customDurationOk) {
      toast.error('Flexible Short Pass window must be between 2 hours and 3 hours.');
      return;
    }

    setSubmitting(true);
    setConflictMsg('');
    setAlternatives([]);

    try {
      const res = await fetch('/api/public/booking-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          whatsappNumber: whatsappNumber || phone,
          email,
          emergencyContactPhone,
          examTarget,
          shiftId: activeShift.id,
          planId: activePlan.id,
          seatId: selectedSeat.seatId,
          startDate,
          customStartMinute: activeShift.isFlexible ? customStartMinute : null,
          customEndMinute: activeShift.isFlexible ? customEndMinute : null,
          customSlotLabel: activeShift.isFlexible ? activeWindowLabel : '',
          idempotencyKey,
        }),
      });

      const json = await res.json();
      if (res.status === 409) {
        setConflictMsg(json.error || 'Selected desk is no longer available.');
        setAlternatives(json.alternatives || []);
        setStep('review-seat');
        setIdempotencyKey(`req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        loadAvailability();
        return;
      }

      if (!res.ok) {
        toast.error(json.error || 'Could not submit seat request.');
        return;
      }

      setSubmittedResult({
        referenceCode: json.request.referenceCode,
        seatNumber: json.seatNumber,
        shiftName: json.shiftName,
        shiftHours: json.shiftHours || activeWindowLabel,
        planName: json.planName,
        totalPaise: json.quote?.totalPaise ?? activeQuote.total,
      });
      setStep('submitted');
      setIdempotencyKey(`req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      toast.success('Seat request submitted');
    } catch {
      toast.error('Network error while submitting request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaitlistSubmitting(true);
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: waitlistName,
          phone: waitlistPhone,
          whatsappNumber: waitlistPhone,
          examTarget: waitlistExam,
          shiftId: activeShift?.id ?? null,
          preferredDate: startDate,
          notes: waitlistNotes || (isFlexible ? `Preferred slot: ${activeWindowLabel}` : ''),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not join waitlist.');
        return;
      }
      toast.success(json.message || 'Joined waitlist');
      setWaitlistOpen(false);
      setWaitlistName('');
      setWaitlistPhone('');
      setWaitlistNotes('');
    } catch {
      toast.error('Network error while joining waitlist.');
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  // Dynamic Floor Matrix (9x6 default, expanding if owner adds rows)
  const maxSeatY = seats.reduce((acc, s) => Math.max(acc, s.gridY), 0);
  const cols = activeRoom?.cols ?? 9;
  const rows = Math.max(activeRoom?.rows ?? 6, maxSeatY + 1);
  const entranceX = activeRoom?.layoutMeta?.entrance?.x ?? 4;
  const entranceY = activeRoom?.layoutMeta?.entrance?.y ?? 5;
  const walkwayCols = activeRoom?.layoutMeta?.walkwayCols ?? [4];

  const seatByCoord = useMemo(() => {
    const map = new Map<string, SeatAvailabilityDTO>();
    for (const s of seats) map.set(`${s.gridX}-${s.gridY}`, s);
    return map;
  }, [seats]);

  const statusMeta = (avail: SeatAvailabilityDTO['availability']) => {
    if (avail === 'AVAILABLE') {
      return {
        label: 'Available',
        classes:
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400',
        Icon: Check,
      };
    }
    if (avail === 'EXPIRING_SOON') {
      return {
        label: 'Expiring Soon',
        classes:
          'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400',
        Icon: Clock,
      };
    }
    if (avail === 'OCCUPIED') {
      return {
        label: 'Occupied',
        classes:
          'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 opacity-80',
        Icon: Lock,
      };
    }
    return {
      label: 'Unavailable',
      classes:
        'border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 opacity-60',
      Icon: Wrench,
    };
  };

  return (
    <>
      {/* SECTION D: SHIFT-AWARE ARCHITECTURAL SEAT MAP */}
      <section id="seats" className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Live Shift-Aware Floor Plan</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400">
                  {seats.length || data.center.totalConfiguredSeats} Study Desks
                </span>
              </div>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Inspect desks and pick your shift
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWaitlistOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
              >
                <BellPlus className="h-3.5 w-3.5 text-emerald-500" />
                Join Desk Waitlist
              </button>

              <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 p-1 bg-white dark:bg-[#18181B]">
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'map'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Grid className="h-3.5 w-3.5" />
                  Floor Plan
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'list'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  List View
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label htmlFor="map-start-date" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Start Date
                </label>
                <input
                  id="map-start-date"
                  type="date"
                  value={startDate}
                  min={todayIST()}
                  onChange={(e) => setStartDate(e.target.value || todayIST())}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label htmlFor="map-term" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Membership Term
                </label>
                <select
                  id="map-term"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {data.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.durationMonths} mo{p.discountPercent > 0 ? ` · ${p.discountPercent}% off` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="map-room" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Reading Hall
                </label>
                <select
                  id="map-room"
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {data.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="map-shift" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Shift Window
                </label>
                <select
                  id="map-shift"
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {data.shifts.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.name} · {sh.displayHours}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isFlexible && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Flexible Short Pass (2–3 Hours Custom Slot) · Custom Timing · Fee Negotiable at Counter
                  </p>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
                    Selected: {activeWindowLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {FLEXIBLE_SLOT_PRESETS.map((preset) => {
                    const active =
                      customStartMinute === preset.startMinute && customEndMinute === preset.endMinute;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCustomStartMinute(preset.startMinute);
                          setCustomEndMinute(preset.endMinute);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                      Custom Start Time
                    </label>
                    <select
                      value={customStartMinute}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        setCustomStartMinute(s);
                        if (customEndMinute - s < 120 || customEndMinute - s > 180) {
                          setCustomEndMinute(Math.min(1260, s + 180));
                        }
                      }}
                      className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-xs font-mono"
                    >
                      {MINUTE_OPTIONS.filter((m) => m <= 1140).map((m) => (
                        <option key={m} value={m}>
                          {formatMinute12h(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                      Custom End Time (2–3 hrs window)
                    </label>
                    <select
                      value={customEndMinute}
                      onChange={(e) => setCustomEndMinute(Number(e.target.value))}
                      className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-xs font-mono"
                    >
                      {MINUTE_OPTIONS.filter(
                        (m) => m - customStartMinute >= 120 && m - customStartMinute <= 180
                      ).map((m) => (
                        <option key={m} value={m}>
                          {formatMinute12h(m)} ({Math.round((m - customStartMinute) / 60 * 10) / 10} hrs)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!customDurationOk && (
                  <p className="text-xs text-rose-500">
                    Please pick an end time 2 to 3 hours after your start time.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Legend & Live Totals */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                <Check className="h-3.5 w-3.5" />
                Available (<span className="font-mono tabular-nums">{summary.available}</span>)
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
                <Clock className="h-3.5 w-3.5" />
                Expiring Soon (<span className="font-mono tabular-nums">{summary.expiringSoon}</span>)
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-medium">
                <Lock className="h-3.5 w-3.5" />
                Occupied (<span className="font-mono tabular-nums">{summary.occupied}</span>)
              </span>
              <span className="inline-flex items-center gap-1.5 text-zinc-500 font-medium">
                <Wrench className="h-3.5 w-3.5" />
                Unavailable (<span className="font-mono tabular-nums">{summary.unavailable}</span>)
              </span>
            </div>

            {endDate && (
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                Checking term: {formatDateDisplay(startDate)} → {formatDateDisplay(endDate)}
              </span>
            )}
          </div>

          {viewMode === 'map' ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 md:p-6 overflow-x-auto">
              <div className="min-w-[700px] space-y-4">
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pb-2 border-b border-dashed border-zinc-200 dark:border-zinc-800">
                  <span>Tree-Shaped Bookshelf Wall (Desks 41 & 42)</span>
                  <span className="inline-flex items-center gap-1">
                    <Snowflake className="h-3.5 w-3.5 text-sky-400" />
                    Split AC Cooling Zone
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <SunMedium className="h-3.5 w-3.5 text-amber-400" />
                    Daylight Curtain Windows
                  </span>
                </div>

                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: rows }).map((_, y) =>
                    Array.from({ length: cols }).map((__, x) => {
                      const seat = seatByCoord.get(`${x}-${y}`);
                      if (!seat) {
                        const isEntrance = x === entranceX && y === entranceY;
                        const isWalkway = walkwayCols.includes(x);
                        return (
                          <div
                            key={`aisle-${x}-${y}`}
                            className="h-14 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/70 flex items-center justify-center text-[10px] text-zinc-400 dark:text-zinc-500 px-1 text-center"
                          >
                            {isEntrance ? 'Entrance' : isWalkway ? 'Aisle' : ''}
                          </div>
                        );
                      }

                      const meta = statusMeta(seat.availability);
                      const StatusIcon = meta.Icon;

                      return (
                        <button
                          key={seat.seatId}
                          type="button"
                          onClick={() => openSeatDrawer(seat)}
                          aria-label={`Desk ${seat.seatNumber}, ${seat.zone}, ${meta.label}`}
                          className={`group relative h-14 rounded-xl border p-2 flex flex-col justify-between text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${meta.classes}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-mono text-xs font-semibold tabular-nums">
                              #{seat.seatNumber}
                            </span>
                            <StatusIcon className="h-3 w-3 shrink-0" />
                          </div>
                          <div className="flex items-center justify-between w-full text-[10px] opacity-80">
                            <span className="truncate">
                              {seat.nearWindow ? 'Win' : seat.nearAc ? 'AC' : 'Desk'}
                            </span>
                            {seat.hasPowerOutlet && <Plug className="h-2.5 w-2.5 shrink-0" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {loadingMap && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Updating desk availability...
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-3 px-4 font-medium">Desk</th>
                      <th className="py-3 px-4 font-medium">Zone</th>
                      <th className="py-3 px-4 font-medium">Features</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {seats.map((seat) => {
                      const meta = statusMeta(seat.availability);
                      const StatusIcon = meta.Icon;
                      return (
                        <tr
                          key={seat.seatId}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                            {seat.label || `Desk #${seat.seatNumber}`}
                          </td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                            {seat.zone}
                          </td>
                          <td className="py-3 px-4 text-xs text-zinc-500 dark:text-zinc-400">
                            {[
                              seat.hasPowerOutlet ? 'Power Socket' : null,
                              seat.nearWindow ? 'Window Light' : null,
                              seat.nearAc ? 'AC Zone' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                seat.availability === 'AVAILABLE'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : seat.availability === 'EXPIRING_SOON'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : seat.availability === 'OCCUPIED'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-zinc-500'
                              }`}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openSeatDrawer(seat)}
                              className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION E: PLANS & PRICING */}
      <section id="plans" className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Real Library Shifts & Term Plans
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Choose your shift and term
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
                Pick Morning, Evening, Full Day, or our Flexible 2–3 Hour Short Pass. Full Day reserves both Morning and Evening windows on your desk.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Membership term"
              className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-1 self-start"
            >
              {data.plans.map((p) => {
                const isSelected = p.id === activePlan?.id;
                return (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`relative rounded-lg px-4 py-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'text-zinc-950 dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId={!mounted || prefersReduced ? undefined : 'pricing-pill'}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0 rounded-lg bg-emerald-400"
                      />
                    )}
                    <span className="relative z-10">
                      {p.name}
                      {p.discountPercent > 0 ? ` (-${p.discountPercent}%)` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.shifts.map((sh) => {
              const q = computeFee(sh.monthlyFeePaise);
              const isSelectedShift = sh.id === activeShift?.id;
              return (
                <div
                  key={sh.id}
                  className={`rounded-2xl border p-6 flex flex-col justify-between transition-colors ${
                    isSelectedShift
                      ? 'border-emerald-500/50 bg-white dark:bg-[#18181B]'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B]'
                  }`}
                >
                  <div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                        {sh.name}
                      </h3>
                      <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {sh.displayHours}
                      </span>
                    </div>

                    <motion.div
                      key={`${sh.id}-${activePlan?.id}`}
                      initial={mounted && !prefersReduced ? { opacity: 0.4, y: 4 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReduced ? { duration: 0 } : { duration: 0.18 }}
                      className="mt-5"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {sh.isFlexible ? `From ${formatINR(q.total)}` : formatINR(q.total)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          / {activePlan?.durationMonths} {activePlan?.durationMonths === 1 ? 'month' : 'months'}
                        </span>
                      </div>
                      {q.discount > 0 ? (
                        <p className="mt-1 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                          Saves {formatINR(q.discount)} ({activePlan?.discountPercent}% off {formatINR(q.subtotal)})
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          {sh.isFlexible
                            ? 'Starting ₹400/mo · Custom Timing · Fee Negotiable at Counter'
                            : `${formatINR(sh.monthlyFeePaise)} per month`}
                        </p>
                      )}
                    </motion.div>

                    <p className="mt-4 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {sh.isFlexible
                        ? 'Choose any 2–3 hour window between 09:00 AM and 09:00 PM. Final fee confirmed by reception.'
                        : `Includes partitioned desk in ${activeRoom?.name || 'Main Hall'}, Wi-Fi, AC, power backup & RO water.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShiftId(sh.id);
                      const el = document.getElementById('seats');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="mt-6 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-900 hover:bg-emerald-500 hover:text-zinc-950 py-2.5 text-xs font-semibold transition-colors"
                  >
                    Select {sh.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION F: SEAT DETAIL & REQUEST SLIDE-OVER SHEET */}
      {requestSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seat Request Sheet"
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
          onClick={() => setRequestSheetOpen(false)}
        >
          <div
            className="w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-[#18181B] border-l border-zinc-200 dark:border-zinc-800 p-6 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Seat Request · {activeShift?.name}
                  </p>
                  <h3 className="mt-0.5 font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
                    {selectedSeat ? `Desk #${selectedSeat.seatNumber}` : 'Select an available desk'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestSheetOpen(false)}
                  aria-label="Close seat request sheet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!selectedSeat && (
                <div className="mt-5 space-y-3">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Pick an available desk for <span className="font-semibold">{activeShift?.name}</span> ({activeWindowLabel}) starting{' '}
                    <span className="font-mono">{formatDateDisplay(startDate)}</span>:
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {seats
                      .filter((s) => s.availability === 'AVAILABLE')
                      .slice(0, 20)
                      .map((s) => (
                        <button
                          key={s.seatId}
                          type="button"
                          onClick={() => setSelectedSeat(s)}
                          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                        >
                          #{s.seatNumber}
                        </button>
                      ))}
                  </div>
                  {seats.filter((s) => s.availability === 'AVAILABLE').length === 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-2">
                      <p className="text-amber-700 dark:text-amber-300">
                        All desks are occupied for this time window.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestSheetOpen(false);
                          setWaitlistOpen(true);
                        }}
                        className="underline font-semibold"
                      >
                        Join the Waitlist instead →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedSeat && step === 'review-seat' && (
                <div className="mt-5 space-y-5">
                  {conflictMsg && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-3">
                      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                        {conflictMsg}
                      </p>
                      {alternatives.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300 mb-2">
                            Eligible alternative desks (your details are preserved):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {alternatives.map((alt) => (
                              <button
                                key={alt.seatId}
                                type="button"
                                onClick={() => {
                                  setSelectedSeat(alt);
                                  setConflictMsg('');
                                  setAlternatives([]);
                                }}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                              >
                                Switch to #{alt.seatNumber}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Zone & Amenities</span>
                      <span className="font-medium text-right">
                        {selectedSeat.zone}
                        {selectedSeat.nearWindow ? ' · Window' : ''}
                        {selectedSeat.nearAc ? ' · AC' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Shift Window</span>
                      <span className="font-mono text-right">{activeWindowLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Term Dates</span>
                      <span className="font-mono text-right">
                        {formatDateDisplay(startDate)} → {formatDateDisplay(endDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Availability</span>
                      <span className="font-medium text-right">
                        {selectedSeat.availability === 'AVAILABLE'
                          ? 'Available for full term'
                          : selectedSeat.conflictReason || selectedSeat.availability}
                      </span>
                    </div>
                  </div>

                  {selectedSeat.notes && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedSeat.notes}</p>
                  )}

                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>{activePlan?.name} Base Fee</span>
                      <span className="font-mono">{formatINR(activeQuote.subtotal)}</span>
                    </div>
                    {activeQuote.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Term Savings ({activePlan?.discountPercent}%)</span>
                        <span className="font-mono">-{formatINR(activeQuote.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 font-semibold">
                      <span>{isFlexible ? 'Starting Estimate' : 'Estimated Total'}</span>
                      <span className="font-mono text-base">{formatINR(activeQuote.total)}</span>
                    </div>
                    {isFlexible && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                        Custom Timing · Fee Negotiable at Counter
                      </p>
                    )}
                  </div>

                  {selectedSeat.availability === 'AVAILABLE' ? (
                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => setStep('contact')}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 py-3 text-sm font-semibold text-white dark:text-zinc-950 transition-colors"
                      >
                        Quick Seat Request
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/admission?shiftId=${activeShift?.id ?? ''}&planId=${activePlan?.id ?? ''}&seatId=${selectedSeat.seatId}`}
                        className="w-full inline-flex items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Or Fill Complete KYC Admission Form →
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                      <p>
                        Desk #{selectedSeat.seatNumber} is currently not open for instant request in this slot.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedSeat(null)}
                          className="underline font-semibold"
                        >
                          Pick an available desk
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRequestSheetOpen(false);
                            setWaitlistOpen(true);
                          }}
                          className="underline font-semibold"
                        >
                          Join Waitlist
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedSeat && step === 'contact' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep('confirm');
                  }}
                  className="mt-5 space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Full Name *
                    </label>
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Ankit Mahato"
                      className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        10-Digit Mobile *
                      </label>
                      <input
                        required
                        type="tel"
                        pattern="[6-9][0-9]{9}"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="98XXXXXXXX"
                        className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        WhatsApp Number
                      </label>
                      <input
                        type="tel"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        placeholder="Same as mobile"
                        className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.in"
                      className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Emergency Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        placeholder="Parent / Guardian"
                        className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Exam / Goal
                      </label>
                      <select
                        value={examTarget}
                        onChange={(e) => setExamTarget(e.target.value)}
                        className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                      >
                        <option>UPSC / State PCS</option>
                        <option>SSC / Banking</option>
                        <option>GATE / Engineering</option>
                        <option>NEET / Medical</option>
                        <option>General Reading</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('review-seat')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm font-medium"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 py-3 text-sm font-semibold text-white dark:text-zinc-950"
                    >
                      Review Request
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              )}

              {selectedSeat && step === 'confirm' && (
                <form onSubmit={handleSubmitRequest} className="mt-5 space-y-4">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Applicant</span>
                      <span className="font-medium">{fullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Mobile</span>
                      <span className="font-mono">{phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Requested Desk</span>
                      <span className="font-mono font-semibold">Desk #{selectedSeat.seatNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Shift & Plan</span>
                      <span className="text-right">
                        {activeShift?.name} ({activeWindowLabel}) · {activePlan?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Start Date</span>
                      <span className="font-mono">{formatDateDisplay(startDate)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 font-semibold">
                      <span>Quoted Payable</span>
                      <span className="font-mono">{formatINR(activeQuote.total)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Submitting sends your request to reception without locking the desk yet. Final fee (including any custom counter negotiation for Flexible passes) is confirmed at approval.
                  </p>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('contact')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm font-medium"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 py-3 text-sm font-semibold text-white dark:text-zinc-950 disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Seat Request'}
                    </button>
                  </div>
                </form>
              )}

              {step === 'submitted' && submittedResult && (
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-2">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Awaiting owner approval
                    </p>
                    <p className="font-mono text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                      {submittedResult.referenceCode}
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Desk #{submittedResult.seatNumber} · {submittedResult.shiftName} ({submittedResult.shiftHours}) · {submittedResult.planName} ·{' '}
                      <span className="font-mono font-semibold">{formatINR(submittedResult.totalPaise)}</span>
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Keep this reference code handy. Visit reception at Sunful Complex or call{' '}
                    <a href={data.center.callLink} className="underline font-mono">
                      {data.center.phoneDisplay}
                    </a>{' '}
                    for confirmation.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequestSheetOpen(false)}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 py-3 text-sm font-medium"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WAITLIST MODAL */}
      {waitlistOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Join Desk Waitlist"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setWaitlistOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-zinc-950 dark:text-zinc-50">
                  Join Desk Waitlist
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  We’ll call or WhatsApp you as soon as a desk opens for {activeShift?.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWaitlistOpen(false)}
                aria-label="Close waitlist modal"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleWaitlistSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Full Name *
                </label>
                <input
                  required
                  type="text"
                  value={waitlistName}
                  onChange={(e) => setWaitlistName(e.target.value)}
                  placeholder="Your name"
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  10-Digit Mobile / WhatsApp *
                </label>
                <input
                  required
                  type="tel"
                  pattern="[6-9][0-9]{9}"
                  value={waitlistPhone}
                  onChange={(e) => setWaitlistPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Exam Target
                </label>
                <input
                  type="text"
                  value={waitlistExam}
                  onChange={(e) => setWaitlistExam(e.target.value)}
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Seat / Timing Preference (Optional)
                </label>
                <input
                  type="text"
                  value={waitlistNotes}
                  onChange={(e) => setWaitlistNotes(e.target.value)}
                  placeholder="e.g. Window row, Morning shift"
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={waitlistSubmitting}
                className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
              >
                {waitlistSubmitting ? 'Saving...' : 'Notify Me When Desk Opens'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

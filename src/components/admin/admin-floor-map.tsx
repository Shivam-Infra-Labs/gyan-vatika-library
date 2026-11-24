'use client';

import React from 'react';
import { BookOpen, DoorOpen, Plug, Snowflake, Sun } from 'lucide-react';
import type { RoomInfo, SeatAvailabilityDTO } from '@/src/types/library';
import type { SeatAssignmentInfo } from './admin-types';

interface AdminFloorMapProps {
  room?: RoomInfo;
  seats: SeatAvailabilityDTO[];
  assignmentsBySeat?: SeatAssignmentInfo[];
  selectedSeatId?: number | null;
  onSelectSeat: (seat: SeatAvailabilityDTO) => void;
  compact?: boolean;
}

export function AdminFloorMap({
  room,
  seats,
  assignmentsBySeat = [],
  selectedSeatId,
  onSelectSeat,
  compact = false,
}: AdminFloorMapProps) {
  const maxSeatY = seats.reduce((acc, s) => Math.max(acc, s.gridY), 0);
  const cols = room?.cols || 9;
  const rows = Math.max(room?.rows || 6, maxSeatY + 1);
  const entrance = room?.layoutMeta?.entrance ?? { x: 4, y: 5, label: 'Glass Entrance' };
  const walkwayCols = room?.layoutMeta?.walkwayCols ?? [4];

  const seatGrid = new Map<string, SeatAvailabilityDTO>();
  for (const s of seats) {
    seatGrid.set(`${s.gridX}-${s.gridY}`, s);
  }

  const assignmentMap = new Map<number, SeatAssignmentInfo[]>();
  for (const a of assignmentsBySeat) {
    const list = assignmentMap.get(a.allocation.seatId) ?? [];
    list.push(a);
    assignmentMap.set(a.allocation.seatId, list);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            Expiring / Grace
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
            Occupied
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-zinc-400 dark:bg-zinc-600" />
            Unavailable / Maint.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1">
            <DoorOpen className="h-3.5 w-3.5 text-emerald-500" />
            {entrance.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5 text-amber-500" />
            {room?.layoutMeta?.bookshelfZone?.label || 'Tree Shelf'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Snowflake className="h-3.5 w-3.5 text-sky-400" />
            AC Zone
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-1.5 min-w-[660px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows }).map((_, y) =>
            Array.from({ length: cols }).map((__, x) => {
              const seat = seatGrid.get(`${x}-${y}`);
              if (!seat) {
                const isEntrance = entrance.x === x && entrance.y === y;
                const isWalkway = walkwayCols.includes(x);
                if (isEntrance) {
                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-500/40 text-[10px] font-mono text-emerald-500 ${
                        compact ? 'h-12' : 'h-16'
                      }`}
                    >
                      <DoorOpen className="h-3.5 w-3.5" />
                      <span>Door</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`${x}-${y}`}
                    className={`${compact ? 'h-12' : 'h-16'} ${
                      isWalkway ? 'border-x border-dashed border-zinc-200/40 dark:border-zinc-800/40' : ''
                    }`}
                  />
                );
              }

              const isSelected = selectedSeatId === seat.seatId;
              const occupants = assignmentMap.get(seat.seatId) ?? [];

              let toneClass =
                'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
              if (seat.availability === 'OCCUPIED') {
                toneClass =
                  'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300';
              } else if (seat.availability === 'EXPIRING_SOON') {
                toneClass =
                  'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300';
              } else if (seat.availability === 'UNAVAILABLE') {
                toneClass =
                  'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-500';
              }

              return (
                <button
                  key={seat.seatId}
                  type="button"
                  onClick={() => onSelectSeat(seat)}
                  title={`Desk ${seat.seatNumber} · ${seat.availability}${
                    occupants.length > 0
                      ? ` · ${occupants
                          .map((o) => `${o.studentName} (${o.allocation.customSlotLabel || o.shiftName})`)
                          .join(', ')}`
                      : ''
                  }`}
                  className={`relative rounded-xl border p-1.5 text-left transition-all ${
                    compact ? 'h-12' : 'h-16'
                  } ${toneClass} ${
                    isSelected
                      ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-[#18181B]'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      #{seat.seatNumber}
                    </span>
                    <span className="flex items-center gap-0.5 opacity-75">
                      {seat.hasPowerOutlet && <Plug className="h-2.5 w-2.5" />}
                      {seat.nearWindow && <Sun className="h-2.5 w-2.5" />}
                    </span>
                  </div>
                  {!compact && (
                    <div className="mt-1 truncate text-[10px] leading-tight opacity-85">
                      {occupants[0]
                        ? occupants[0].studentName.split(' ')[0]
                        : seat.availability === 'UNAVAILABLE'
                        ? 'Maint.'
                        : 'Free'}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

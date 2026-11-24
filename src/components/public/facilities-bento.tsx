'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Armchair, BatteryCharging, BookOpen, Droplets, LampDesk, Snowflake, Wifi } from 'lucide-react';
import { FacilityItem } from '@/src/types/library';

interface FacilitiesBentoProps {
  facilities: FacilityItem[];
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  desks: LampDesk,
  wifi: Wifi,
  ac: Snowflake,
  chairs: Armchair,
  power: BatteryCharging,
  books: BookOpen,
  water: Droplets,
  cafeteria: Droplets,
};

function SpotlightCard({ item }: { item: FacilityItem }) {
  const [pos, setPos] = useState({ x: 0, y: 0, active: false });
  const Icon = ICON_MAP[item.id] || LampDesk;
  const isWide = item.span === 'wide';

  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, active: true });
      }}
      onMouseLeave={() => setPos((p) => ({ ...p, active: false }))}
      className={`relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 transition-colors ${
        isWide ? 'md:col-span-2' : 'md:col-span-1'
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px transition-opacity duration-200"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, rgba(16, 185, 129, 0.12), transparent 65%)`,
        }}
      />
      <div className="relative flex flex-col justify-between h-full gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 text-right">
            {item.pricingNote}
          </span>
        </div>

        <div>
          <h3 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {item.title}
          </h3>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {item.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FacilitiesBento({ facilities }: FacilitiesBentoProps) {
  const visibleFacilities = facilities.filter(
    (f) => f.id !== 'lockers' && !f.title.toLowerCase().includes('locker')
  );
  if (!visibleFacilities.length) return null;

  return (
    <section id="facilities" className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Facilities & Comfort
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Built for long study hours without distractions
            </h2>
            <p className="mt-2 text-sm md:text-base text-zinc-600 dark:text-zinc-400">
              Every essential study facility is included directly in your shift membership—quiet partitioned desks, AC cooling, dual-band Wi-Fi, power backup, RO water, and our reading bookshelf.
            </p>
          </div>

          <Link
            href="/admission"
            className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            Start Online Admission →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visibleFacilities.map((item) => (
            <SpotlightCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

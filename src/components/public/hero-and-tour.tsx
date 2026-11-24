'use client';

import React, { useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from 'motion/react';
import { ArrowDownRight, ChevronLeft, ChevronRight, FileText, MapPin, Play, Star } from 'lucide-react';
import { HERO_PHOTO, PRIMARY_TOUR_VIDEO, TOUR_PHOTOS, MediaVideoAsset } from '@/src/lib/media';
import { formatDateDisplay } from '@/src/lib/format';
import { PublicCenterPayload } from '@/src/types/library';

interface HeroAndTourProps {
  data: PublicCenterPayload;
  onBookSeat: () => void;
  onWatchTour: (video: MediaVideoAsset) => void;
}

const emptySubscribe = () => () => {};

export function HeroAndTour({ data, onBookSeat, onWatchTour }: HeroAndTourProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const rawReducedMotion = useReducedMotion();
  const prefersReduced = mounted ? Boolean(rawReducedMotion) : true;

  const tourContainerRef = useRef<HTMLDivElement>(null);
  const [activeScene, setActiveScene] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const { scrollYProgress } = useScroll({
    target: tourContainerRef,
    offset: ['start center', 'end center'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    if (!mounted || prefersReduced) return;
    if (latest < 0.34) setActiveScene(0);
    else if (latest < 0.68) setActiveScene(1);
    else setActiveScene(2);
  });

  const headline = data.cms?.heroHeadline || 'Quiet desks, steady light, and room to focus.';
  const subheadline =
    data.cms?.heroSubheadline ||
    `Gyan Vatika Library is a self-study hall in Chota Gamaria with ${data.center.totalConfiguredSeats || 50} partitioned cubicles, curated shelves, and flexible shift schedules.`;

  const headlineLines = headline.includes(',')
    ? [headline.slice(0, headline.indexOf(',') + 1), headline.slice(headline.indexOf(',') + 1).trim()]
    : [headline];

  const avail = data.heroAvailability;

  const tourScenes = [
    {
      indexLabel: '01',
      kicker: 'Main Reading Room',
      title: TOUR_PHOTOS[0].title,
      caption: TOUR_PHOTOS[0].caption,
      photo: TOUR_PHOTOS[0],
    },
    {
      indexLabel: '02',
      kicker: 'Signature Wall Shelf',
      title: TOUR_PHOTOS[1].title,
      caption: TOUR_PHOTOS[1].caption,
      photo: TOUR_PHOTOS[1],
    },
    {
      indexLabel: '03',
      kicker: 'Explore the Collection',
      title: TOUR_PHOTOS[2].title,
      caption: TOUR_PHOTOS[2].caption,
      photo: TOUR_PHOTOS[2],
    },
  ];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -40) setActiveScene((s) => Math.min(2, s + 1));
    else if (dx > 40) setActiveScene((s) => Math.max(0, s - 1));
    touchStartX.current = null;
  };

  return (
    <>
      {/* SECTION A: HERO & LIVE AVAILABILITY */}
      <section className="pt-24 md:pt-28 pb-16 md:pb-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between py-2">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-zinc-600 dark:text-zinc-400">
                  <span>{data.center.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>Chota Gamaria, Jharkhand</span>
                  <span aria-hidden="true">·</span>
                  <span>{data.center.landmark}</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.08] text-zinc-950 dark:text-zinc-50 [text-wrap:balance]">
                  {headlineLines.map((line, i) => (
                    <motion.span
                      key={i}
                      initial={false}
                      animate={mounted && !prefersReduced ? { opacity: 1, y: 0 } : undefined}
                      transition={{ duration: 0.35, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      className="block"
                    >
                      {line}
                    </motion.span>
                  ))}
                </h1>

                <p className="max-w-xl text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {subheadline}
                </p>

                {avail && avail.totalSeats > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs md:text-sm">
                    {avail.availableCount > 0 ? (
                      <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 font-medium text-emerald-700 dark:text-emerald-300">
                        <span className="font-mono font-semibold tabular-nums">
                          {avail.availableCount} / {avail.totalSeats} desks open
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{avail.shiftName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{formatDateDisplay(avail.date)}</span>
                      </div>
                    ) : (
                      <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 font-medium text-rose-700 dark:text-rose-300">
                        <span>Full for {avail.shiftName}</span>
                        <span aria-hidden="true">·</span>
                        <a href="#seats" className="underline">
                          Check Evening, Flexible or Join Waitlist
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onBookSeat}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 px-6 py-3 text-sm font-semibold text-white dark:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
                  >
                    Book a Seat
                    <ArrowDownRight className="h-4 w-4" />
                  </button>

                  <Link
                    href="/admission"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] hover:bg-zinc-50 dark:hover:bg-zinc-800 px-5 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-4 w-4 text-emerald-500" />
                    Online Admission Form
                  </Link>
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs md:text-sm">
                <a
                  href={data.center.googleBusinessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2.5 text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <Star className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-mono font-semibold tabular-nums">
                      {data.center.googleRating} / 5 ({data.center.googleReviewCount} reviews)
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 group-hover:underline">
                      Google Business Profile
                    </p>
                  </div>
                </a>

                <div className="flex items-start gap-2.5 text-zinc-700 dark:text-zinc-300">
                  <MapPin className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-medium">Sunful Complex Service Rd</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {data.center.landmark}, 832108
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {data.center.phoneDisplay}
                  </p>
                  <a
                    href={data.center.callLink}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Tap to call reception
                  </a>
                </div>
              </div>
            </div>

            {/* Hero Portrait Photograph (unnamed2) + Watch the Room Tour Overlay */}
            <div className="lg:col-span-5">
              <div className="relative h-[440px] sm:h-[520px] lg:h-full lg:min-h-[560px] w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-900">
                <Image
                  src={HERO_PHOTO.src}
                  alt={HERO_PHOTO.alt}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  referrerPolicy="no-referrer"
                  className="object-cover object-[50%_42%]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none" />

                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                  <div className="text-white">
                    <p className="text-xs text-zinc-300">Main Reading Hall</p>
                    <p className="font-display text-sm font-semibold">
                      Central study aisle & partitioned desks
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onWatchTour(PRIMARY_TOUR_VIDEO)}
                    className="inline-flex items-center gap-2 rounded-xl bg-zinc-950/85 hover:bg-zinc-900 border border-white/20 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3.5 w-3.5 fill-current text-emerald-400" />
                    Watch the room tour
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: INSIDE GYAN VATIKA (GUIDED PHOTOGRAPHIC TOUR) */}
      <section id="tour" className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Inside Gyan Vatika
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Walk through the reading room and shelves
              </h2>
            </div>
            <a
              href="#seats"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              Skip to seat map
              <ArrowDownRight className="h-4 w-4" />
            </a>
          </div>

          <div ref={tourContainerRef} className="hidden lg:grid lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-6 py-4">
              {tourScenes.map((scene, idx) => {
                const isActive = prefersReduced ? true : activeScene === idx;
                return (
                  <button
                    key={scene.indexLabel}
                    type="button"
                    onClick={() => setActiveScene(idx)}
                    className={`w-full text-left rounded-2xl border p-6 transition-all ${
                      isActive
                        ? 'border-emerald-500/50 bg-white dark:bg-[#18181B]'
                        : 'border-zinc-200 dark:border-zinc-800/70 bg-transparent opacity-65 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                      <span>{scene.indexLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{scene.kicker}</span>
                    </div>
                    <h3 className="mt-2 font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {scene.title}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {scene.caption}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 lg:sticky lg:top-24">
              {prefersReduced ? (
                <div className="grid grid-cols-1 gap-4">
                  {tourScenes.map((scene) => (
                    <div
                      key={scene.indexLabel}
                      className="relative h-80 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
                    >
                      <Image
                        src={scene.photo.src}
                        alt={scene.photo.alt}
                        fill
                        sizes="55vw"
                        referrerPolicy="no-referrer"
                        className="object-cover"
                        style={{ objectPosition: scene.photo.focalPoint }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative h-[560px] w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950">
                  {tourScenes.map((scene, idx) => (
                    <motion.div
                      key={scene.indexLabel}
                      initial={false}
                      animate={{
                        opacity: activeScene === idx ? 1 : 0,
                        scale: activeScene === idx ? 1 : 1.03,
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0"
                      style={{ pointerEvents: activeScene === idx ? 'auto' : 'none' }}
                    >
                      <Image
                        src={scene.photo.src}
                        alt={scene.photo.alt}
                        fill
                        sizes="58vw"
                        referrerPolicy="no-referrer"
                        className="object-cover"
                        style={{ objectPosition: scene.photo.focalPoint }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                      <div className="absolute bottom-6 left-6 right-6 text-white">
                        <p className="font-mono text-xs text-emerald-300">
                          {scene.indexLabel} · {scene.kicker}
                        </p>
                        <p className="mt-1 font-display text-xl font-semibold">{scene.title}</p>
                        <p className="mt-1 text-sm text-zinc-200 max-w-xl">{scene.caption}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile Swipeable Sequence */}
          <div className="lg:hidden space-y-4">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="relative h-[420px] w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950"
            >
              <Image
                src={tourScenes[activeScene].photo.src}
                alt={tourScenes[activeScene].photo.alt}
                fill
                sizes="100vw"
                referrerPolicy="no-referrer"
                className="object-cover"
                style={{ objectPosition: tourScenes[activeScene].photo.focalPoint }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <p className="font-mono text-xs text-emerald-300">
                  {tourScenes[activeScene].indexLabel} · {tourScenes[activeScene].kicker}
                </p>
                <p className="mt-1 font-display text-lg font-semibold">
                  {tourScenes[activeScene].title}
                </p>
                <p className="mt-1 text-xs text-zinc-200 leading-relaxed">
                  {tourScenes[activeScene].caption}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setActiveScene((s) => Math.max(0, s - 1))}
                disabled={activeScene === 0}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 text-xs font-medium disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <div className="flex items-center gap-2">
                {tourScenes.map((s, idx) => (
                  <button
                    key={s.indexLabel}
                    type="button"
                    aria-label={`Scene ${idx + 1}: ${s.title}`}
                    onClick={() => setActiveScene(idx)}
                    className={`h-2.5 rounded-full transition-all ${
                      activeScene === idx
                        ? 'w-7 bg-emerald-500'
                        : 'w-2.5 bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveScene((s) => Math.min(2, s + 1))}
                disabled={activeScene === 2}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 text-xs font-medium disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

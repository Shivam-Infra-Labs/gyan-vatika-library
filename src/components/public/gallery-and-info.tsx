'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import {
  Award,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Instagram,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Pin,
  Play,
  Star,
  Video,
  X,
} from 'lucide-react';
import { GALLERY_PHOTOS, LIBRARY_VIDEOS, MediaVideoAsset } from '@/src/lib/media';
import { buildWhatsAppLink, daysUntil, formatDateDisplay } from '@/src/lib/format';
import { StudyTimerWidget } from '@/src/components/study-timer-widget';
import { PublicCenterPayload } from '@/src/types/library';

interface GalleryAndInfoProps {
  data: PublicCenterPayload;
  onWatchFilm: (video: MediaVideoAsset) => void;
  onBookSeat: () => void;
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function AchieverPortrait({ fullName, photoUrl }: { fullName: string; photoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const trimmed = (photoUrl || '').trim();
  const showImage = Boolean(trimmed) && !failed;
  const useNextImage = trimmed.startsWith('/') || trimmed.startsWith('https://');

  return (
    <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-full overflow-hidden border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
      {showImage ? (
        useNextImage ? (
          <Image
            src={trimmed}
            alt={`${fullName} portrait`}
            fill
            sizes="56px"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="object-cover"
          />
        ) : (
          <img
            src={trimmed}
            alt={`${fullName} portrait`}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <span className="font-display text-sm font-bold tracking-tight">
          {getInitials(fullName)}
        </span>
      )}
    </div>
  );
}

function getSafeYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return `https://www.youtube.com${u.pathname}`;
      const v = u.searchParams.get('v');
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

const emptySubscribe = () => () => {};

export function GalleryAndInfo({ data, onWatchFilm, onBookSeat }: GalleryAndInfoProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const rawReducedMotion = useReducedMotion();
  const prefersReduced = mounted ? Boolean(rawReducedMotion) : true;
  const [mediaTab, setMediaTab] = useState<'photos' | 'films' | 'vlogs'>('photos');
  const [eventCategory, setEventCategory] = useState<string>('All');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(data.cms?.faqs[0]?.id ?? null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastTriggerIdx = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const photos = data.cms?.gallery?.photos?.length ? data.cms.gallery.photos : GALLERY_PHOTOS;
  const videos = LIBRARY_VIDEOS;
  const achievers = data.achievers || [];
  const vlogs = data.vlogs || [];
  const events = data.events || [];

  const filteredEvents = useMemo(() => {
    if (eventCategory === 'All') return events;
    return events.filter((ev) => ev.category === eventCategory);
  }, [events, eventCategory]);

  const openLightbox = (idx: number) => {
    lastTriggerIdx.current = idx;
    setLightboxIdx(idx);
  };

  const closeLightbox = () => {
    const restoreIdx = lastTriggerIdx.current;
    setLightboxIdx(null);
    setTimeout(() => {
      if (restoreIdx !== null) triggerRefs.current[restoreIdx]?.focus();
    }, 0);
  };

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i === null ? null : (i + 1) % photos.length));
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, photos.length]);

  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${data.center.name}, ${data.center.address}`
  )}`;

  const whatsappActive = Boolean(data.center.whatsappEnabled && data.center.whatsappNumber);
  const whatsappUrl = whatsappActive
    ? buildWhatsAppLink(
        data.center.whatsappNumber,
        'Namaste Gyan Vatika Library! I would like to enquire about desk availability and admission.'
      )
    : '#';

  return (
    <>
      {/* SECTION G: GALLERY, FILMS, VLOGS & REVIEWS */}
      <section id="gallery" className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Real Venue Photography, Films & Vlogs
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Gallery, student vlogs & walkthroughs
              </h2>
            </div>

            <div className="inline-flex flex-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-1 self-start">
              <button
                type="button"
                onClick={() => setMediaTab('photos')}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mediaTab === 'photos'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Photos ({photos.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaTab('films')}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mediaTab === 'films'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Walkthroughs ({videos.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaTab('vlogs')}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mediaTab === 'vlogs'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Vlogs ({vlogs.length})
              </button>
            </div>
          </div>

          {mediaTab === 'photos' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  ref={(el) => {
                    triggerRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => openLightbox(idx)}
                  className="group text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-900">
                    {photo.src.startsWith('data:') ? (
                      <img
                        src={photo.src}
                        alt={photo.alt}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        style={{ objectPosition: photo.focalPoint || '50% 50%' }}
                      />
                    ) : (
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        referrerPolicy="no-referrer"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        style={{ objectPosition: photo.focalPoint || '50% 50%' }}
                      />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{photo.category}</span>
                      <span className="font-mono">{photo.originalFilename}</span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {photo.title}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {photo.caption}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {mediaTab === 'films' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {videos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onWatchFilm(vid)}
                  className="group text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="relative aspect-[9/16] max-h-[420px] w-full overflow-hidden bg-zinc-950">
                    <Image
                      src={vid.posterSrc}
                      alt={`${vid.title} video poster`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      referrerPolicy="no-referrer"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-zinc-950/80 border border-white/25 text-white group-hover:scale-105 transition-transform">
                        <Play className="h-5 w-5 fill-current text-emerald-400 ml-0.5" />
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-zinc-200 font-mono">
                      <span>{vid.originalFilename}</span>
                      <span>{vid.durationLabel}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {vid.title}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {vid.caption}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {mediaTab === 'vlogs' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {vlogs.length === 0 ? (
                <p className="text-sm text-zinc-500 col-span-full">
                  No vlogs published yet. Add YouTube or local reels from the Owner Desk.
                </p>
              ) : (
                vlogs.map((vlog) => {
                  const ytEmbed = vlog.videoType === 'YOUTUBE' ? getSafeYoutubeEmbedUrl(vlog.videoUrl) : null;
                  return (
                    <div
                      key={vlog.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-video w-full bg-zinc-950">
                        {ytEmbed ? (
                          <iframe
                            src={ytEmbed}
                            title={vlog.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        ) : (
                          <video
                            src={vlog.videoUrl}
                            poster={vlog.thumbnailUrl || undefined}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1">
                            <Video className="h-3.5 w-3.5 text-emerald-500" />
                            {vlog.videoType === 'YOUTUBE' ? 'YouTube Vlog' : 'Library Reel'}
                          </span>
                          <span className="font-mono">{vlog.durationLabel || 'Vlog'}</span>
                        </div>
                        <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          {vlog.title}
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {vlog.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Verified Google Rating + Reviews */}
          <div className="mt-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    <span className="font-mono">{data.center.googleRating} / 5</span> on Google from{' '}
                    <span className="font-mono">{data.center.googleReviewCount}</span> student reviews
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Supplied Google Business snapshot · Read verified member feedback directly on Google.
                  </p>
                </div>
              </div>
              <a
                href={data.center.googleBusinessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap self-start"
              >
                View Google Reviews
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {data.cms?.reviews && data.cms.reviews.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.cms.reviews.map((rev) => (
                  <div key={rev.id} className="space-y-1.5">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">“{rev.quote}”</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {rev.author} · {rev.examOrRole} · {rev.source} ({rev.verifiedDate})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION G2: HALL OF FAME & COMMUNITY EVENTS */}
      {(achievers.length > 0 || events.length > 0) && (
        <section className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
            {achievers.length > 0 && (
              <div>
                <div className="mb-8">
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Hall of Fame · Member Selections
                  </p>
                  <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                    Students who cleared exams from these desks
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {achievers.map((ach) => (
                    <div
                      key={ach.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <AchieverPortrait
                          key={ach.photoUrl || 'none'}
                          fullName={ach.fullName}
                          photoUrl={ach.photoUrl}
                        />
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                            {ach.fullName}
                          </h3>
                          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <Award className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {ach.examCleared} · {ach.postOrRank} · {ach.selectionYear}
                            </span>
                          </p>
                        </div>
                      </div>
                      {ach.quote && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          “{ach.quote}”
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {events.length > 0 && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Library Life & Community
                    </p>
                    <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                      Festivals, picnics & student meetups
                    </h2>
                  </div>

                  <div className="inline-flex flex-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-1 self-start">
                    {['All', 'Festivals', 'Picnic & Camps', 'Student Meetups'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEventCategory(cat)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          eventCategory === cat
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {filteredEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden flex flex-col"
                    >
                      {ev.mediaUrl ? (
                        <div className="relative aspect-[16/10] w-full bg-zinc-900 overflow-hidden">
                          <img
                            src={ev.mediaUrl}
                            alt={ev.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="p-5 space-y-2">
                        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {ev.category} · {formatDateDisplay(ev.eventDate)}
                        </p>
                        <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          {ev.title}
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {ev.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION H: NOTICES, EXAM COUNTDOWNS, TIMER & FAQS */}
      <section className="py-16 md:py-24 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-14">
          {data.cms?.examCountdowns && data.cms.examCountdowns.length > 0 && (
            <div>
              <div className="mb-6">
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Upcoming Competitive Exam Targets
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                  Exam countdowns
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.cms.examCountdowns.map((exam) => {
                  const left = daysUntil(exam.examDate);
                  return (
                    <div
                      key={exam.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 flex flex-col justify-between"
                    >
                      <div>
                        <p className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {exam.exam}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {exam.eventName}
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-end justify-between">
                        <div>
                          <p className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {left}d
                          </p>
                          <p className="font-mono text-[11px] text-zinc-500">
                            {formatDateDisplay(exam.examDate)}
                          </p>
                        </div>
                        <a
                          href={exam.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300 hover:underline"
                        >
                          {exam.sourceLabel}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notices + Focus Timer + FAQs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-5">
              <StudyTimerWidget compact />

              <div className="space-y-4">
                <h3 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
                  Public Notice Board
                </h3>
                {data.cms?.notices && data.cms.notices.length > 0 ? (
                  <div className="space-y-3">
                    {data.cms.notices.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {n.isPinned && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                          )}
                          {n.isPinned && <span aria-hidden="true">·</span>}
                          <span>{n.category || 'General'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {formatDateDisplay(n.publishDate)} to {formatDateDisplay(n.expiryDate)}
                          </span>
                        </div>
                        <h4 className="mt-1.5 font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {n.title}
                        </h4>
                        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {n.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No active notices posted.</p>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <h3 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
                Frequently Asked Questions
              </h3>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B]">
                {(data.cms?.faqs || []).map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div key={faq.id}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                      >
                        <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-zinc-500 shrink-0 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 text-xs md:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION I: VISIT AND CONTACT */}
      <section id="visit" className="py-16 md:py-24 pb-28 md:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-5">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Visit Gyan Vatika Library
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Easy to reach, {data.center.landmark}
              </h2>
              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-xl">
                {data.center.address}
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={mapsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 px-5 py-3 text-sm font-semibold text-white dark:text-zinc-950 transition-colors"
                >
                  <Navigation className="h-4 w-4" />
                  Google Directions
                </a>

                <a
                  href={data.center.callLink}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Phone className="h-4 w-4 text-emerald-500" />
                  <span className="font-mono">{data.center.phoneDisplay}</span>
                </a>

                {whatsappActive && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                    WhatsApp Reception
                  </a>
                )}

                <a
                  href={data.center.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181B] px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Landmark: {data.center.landmark}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Service Road, Tata Kandra Rd, Chota Gamaria, Jharkhand 832108.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Admission, Member Portal & Reception</span>
                <div className="flex items-center gap-4">
                  <Link href="/admission" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                    Online Admission →
                  </Link>
                  <Link href="/student" className="hover:underline font-medium">
                    Student Portal →
                  </Link>
                  <Link href="/admin" className="hover:underline font-medium">
                    Owner Desk →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <footer className="mt-14 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
              {data.center.name} · Chota Gamaria, Jharkhand 832108
            </span>
            <span>Timezone: Asia/Kolkata · Currency: INR</span>
          </footer>
        </div>
      </section>

      {/* Mobile Compact Bottom Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-4 py-2.5 flex items-center gap-2.5">
        <a
          href={mapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 text-xs font-semibold whitespace-nowrap"
        >
          <Navigation className="h-3.5 w-3.5 text-emerald-500" />
          Directions
        </a>
        <button
          type="button"
          onClick={onBookSeat}
          className="flex-1 h-11 rounded-xl bg-emerald-600 dark:bg-emerald-500 text-xs font-semibold text-white dark:text-zinc-950 whitespace-nowrap"
        >
          Book a Seat
        </button>
      </div>

      {/* ACCESSIBLE PHOTO LIGHTBOX */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={photos[lightboxIdx].title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={closeLightbox}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (dx < -40) setLightboxIdx((lightboxIdx + 1) % photos.length);
            if (dx > 40) setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length);
            touchStartX.current = null;
          }}
        >
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-4xl rounded-2xl border border-zinc-800 bg-[#18181B] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div>
                <p className="font-display text-sm font-semibold text-zinc-100">
                  {photos[lightboxIdx].title}
                </p>
                <p className="text-xs text-zinc-400">
                  {photos[lightboxIdx].category} · {lightboxIdx + 1} / {photos.length}
                </p>
              </div>
              <button
                type="button"
                onClick={closeLightbox}
                autoFocus
                aria-label="Close photo viewer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative h-[62vh] w-full bg-black">
              {photos[lightboxIdx].src.startsWith('data:') ? (
                <img
                  src={photos[lightboxIdx].src}
                  alt={photos[lightboxIdx].alt}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Image
                  src={photos[lightboxIdx].src}
                  alt={photos[lightboxIdx].alt}
                  fill
                  sizes="90vw"
                  referrerPolicy="no-referrer"
                  className="object-contain"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length)}
                aria-label="Previous photo"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <p className="text-xs text-zinc-300 text-center line-clamp-2">
                {photos[lightboxIdx].caption}
              </p>
              <button
                type="button"
                onClick={() => setLightboxIdx((lightboxIdx + 1) % photos.length)}
                aria-label="Next photo"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

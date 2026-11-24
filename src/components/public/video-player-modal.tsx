'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { MediaVideoAsset } from '@/src/lib/media';

interface VideoPlayerModalProps {
  video: MediaVideoAsset | null;
  onClose: () => void;
}

export function VideoPlayerModal({ video, onClose }: VideoPlayerModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!video) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [video, onClose]);

  if (!video) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#18181B] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="font-display text-sm font-semibold text-zinc-100">{video.title}</p>
            <p className="text-xs text-zinc-400">{video.durationLabel} · Portrait walkthrough</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close film player"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="aspect-[9/16] max-h-[72vh] w-full bg-black flex items-center justify-center">
          <video
            key={video.src}
            src={video.src}
            poster={video.posterSrc}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        </div>

        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-300 leading-relaxed">{video.caption}</p>
        </div>
      </div>
    </div>
  );
}

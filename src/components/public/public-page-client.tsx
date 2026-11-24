'use client';

import React, { useState } from 'react';
import { MediaVideoAsset } from '@/src/lib/media';
import { PublicCenterPayload } from '@/src/types/library';
import { PublicNavbar } from './public-navbar';
import { HeroAndTour } from './hero-and-tour';
import { FacilitiesBento } from './facilities-bento';
import { SeatMapAndBooking } from './seat-map-and-booking';
import { GalleryAndInfo } from './gallery-and-info';
import { VideoPlayerModal } from './video-player-modal';
import { SmartAssistant } from '@/src/components/assistant/smart-assistant';

export function PublicPageClient({ initialData }: { initialData: PublicCenterPayload }) {
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<MediaVideoAsset | null>(null);

  const openBookSeat = () => {
    const el = document.getElementById('seats');
    el?.scrollIntoView({ behavior: 'smooth' });
    setRequestSheetOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B] dark:bg-[#09090B] dark:text-zinc-100">
      <PublicNavbar onBookSeat={openBookSeat} />

      <main>
        <HeroAndTour
          data={initialData}
          onBookSeat={openBookSeat}
          onWatchTour={(vid) => setActiveVideo(vid)}
        />

        <FacilitiesBento facilities={initialData.cms?.facilities ?? []} />

        <SeatMapAndBooking
          data={initialData}
          requestSheetOpen={requestSheetOpen}
          setRequestSheetOpen={setRequestSheetOpen}
        />

        <GalleryAndInfo
          data={initialData}
          onWatchFilm={(vid) => setActiveVideo(vid)}
          onBookSeat={openBookSeat}
        />
      </main>

      <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      <SmartAssistant />
    </div>
  );
}

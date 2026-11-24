import React from 'react';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, withDbRetry } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  achievers,
  centers,
  cmsStates,
  libraryEvents,
  plans,
  rooms,
  shifts,
  vlogs,
} from '@/src/db/schema.ts';
import { computeSeatAvailability } from '@/src/lib/domain.ts';
import { todayIST } from '@/src/lib/format.ts';
import { PublicPageClient } from '@/src/components/public/public-page-client';
import { PublicCenterPayload } from '@/src/types/library';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const sp = await searchParams;
  const centerId = await ensureSeeded();
  const stage = sp.preview === '1' ? 'DRAFT' : 'PUBLISHED';

  const {
    center,
    activeRooms,
    activeShifts,
    activePlans,
    publishedAchievers,
    publishedVlogs,
    publishedEvents,
    cmsRow,
  } = await withDbRetry(async () => {
    const [c] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
    const r = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.centerId, centerId), eq(rooms.isActive, true)));
    const sh = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.centerId, centerId), eq(shifts.isActive, true)))
      .orderBy(asc(shifts.sortOrder), asc(shifts.id));
    const pl = await db
      .select()
      .from(plans)
      .where(and(eq(plans.centerId, centerId), eq(plans.isActive, true)))
      .orderBy(asc(plans.sortOrder), asc(plans.id));
    const ach = await db
      .select()
      .from(achievers)
      .where(and(eq(achievers.centerId, centerId), eq(achievers.isPublished, true)))
      .orderBy(asc(achievers.sortOrder), desc(achievers.id));
    const vl = await db
      .select()
      .from(vlogs)
      .where(and(eq(vlogs.centerId, centerId), eq(vlogs.isPublished, true)))
      .orderBy(asc(vlogs.sortOrder), desc(vlogs.id));
    const ev = await db
      .select()
      .from(libraryEvents)
      .where(and(eq(libraryEvents.centerId, centerId), eq(libraryEvents.isPublished, true)))
      .orderBy(desc(libraryEvents.eventDate), desc(libraryEvents.id));
    const [cms] = await db
      .select()
      .from(cmsStates)
      .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, stage)))
      .limit(1);

    return {
      center: c,
      activeRooms: r,
      activeShifts: sh,
      activePlans: pl,
      publishedAchievers: ach,
      publishedVlogs: vl,
      publishedEvents: ev,
      cmsRow: cms,
    };
  }, 'homepage-load');

  const today = todayIST();
  const defaultShift = activeShifts[0];
  const heroAvail = defaultShift
    ? await computeSeatAvailability({
        centerId,
        roomId: activeRooms[0]?.id,
        shiftId: defaultShift.id,
        startDate: today,
        durationMonths: 1,
      })
    : null;

  const rawNotices =
    (cmsRow?.noticesJson as NonNullable<PublicCenterPayload['cms']>['notices']) ?? [];
  const activeNotices = rawNotices
    .filter((n) => n.publishDate <= today && n.expiryDate >= today)
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));

  const rawExams =
    (cmsRow?.examCountdownsJson as NonNullable<PublicCenterPayload['cms']>['examCountdowns']) ??
    [];
  const activeExams = rawExams.filter((e) => e.confirmed && e.examDate >= today);

  const rawFacilities =
    (cmsRow?.facilitiesJson as NonNullable<PublicCenterPayload['cms']>['facilities']) ?? [];
  const enabledFacilities = rawFacilities.filter((f) => f.enabled);

  const safeCenter: PublicCenterPayload['center'] = {
    id: center.id,
    slug: center.slug,
    name: center.name,
    category: center.category,
    phoneDisplay: center.phoneDisplay,
    callLink: center.callLink,
    address: center.address,
    landmark: center.landmark,
    instagramUrl: center.instagramUrl,
    googleBusinessUrl: center.googleBusinessUrl,
    googleRating: center.googleRating,
    googleReviewCount: center.googleReviewCount,
    timezone: center.timezone,
    currency: center.currency,
    isDemoMode: center.isDemoMode,
    whatsappEnabled: center.whatsappEnabled,
    whatsappNumber: center.whatsappNumber,
    gracePeriodDays: center.gracePeriodDays,
    totalConfiguredSeats: center.totalConfiguredSeats,
    hasAdminPin: Boolean(center.adminPinHash),
    geofenceEnabled: center.geofenceEnabled,
    centerLat: center.centerLat,
    centerLng: center.centerLng,
    geofenceRadiusMeters: center.geofenceRadiusMeters,
  };

  const payload: PublicCenterPayload = {
    center: safeCenter,
    rooms: activeRooms.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      floorLabel: r.floorLabel,
      rows: r.rows,
      cols: r.cols,
      layoutMeta: (r.layoutMeta as PublicCenterPayload['rooms'][number]['layoutMeta']) || {},
    })),
    shifts: activeShifts,
    plans: activePlans,
    achievers: publishedAchievers,
    vlogs: publishedVlogs,
    events: publishedEvents,
    cms: cmsRow
      ? {
          heroHeadline: cmsRow.heroHeadline,
          heroSubheadline: cmsRow.heroSubheadline,
          facilities: enabledFacilities,
          gallery: cmsRow.galleryJson as NonNullable<PublicCenterPayload['cms']>['gallery'],
          reviews:
            (cmsRow.reviewsJson as NonNullable<PublicCenterPayload['cms']>['reviews']) || [],
          notices: activeNotices,
          examCountdowns: activeExams,
          faqs: (cmsRow.faqsJson as NonNullable<PublicCenterPayload['cms']>['faqs']) || [],
          contactOverrides:
            (cmsRow.contactOverridesJson as NonNullable<PublicCenterPayload['cms']>['contactOverrides']) ||
            {},
        }
      : null,
    heroAvailability: heroAvail
      ? {
          shiftId: defaultShift.id,
          shiftName: defaultShift.name,
          shiftHours: defaultShift.displayHours,
          date: today,
          availableCount: heroAvail.summary.available,
          totalSeats: heroAvail.seats.length,
        }
      : null,
  };

  return <PublicPageClient initialData={payload} />;
}

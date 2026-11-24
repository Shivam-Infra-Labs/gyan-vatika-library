import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const previewParam = req.nextUrl.searchParams.get('preview') === '1';

    const {
      centerRow,
      activeRooms,
      activeShifts,
      activePlans,
      cms,
      publishedAchievers,
      publishedVlogs,
      publishedEvents,
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

      const [publishedCms] = await db
        .select()
        .from(cmsStates)
        .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, 'PUBLISHED')))
        .limit(1);

      const resolvedCms = previewParam
        ? (
            await db
              .select()
              .from(cmsStates)
              .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, 'DRAFT')))
              .limit(1)
          )[0] ?? publishedCms
        : publishedCms;

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

      return {
        centerRow: c,
        activeRooms: r,
        activeShifts: sh,
        activePlans: pl,
        cms: resolvedCms,
        publishedAchievers: ach,
        publishedVlogs: vl,
        publishedEvents: ev,
      };
    }, 'public-center');

    const today = todayIST();
    const defaultShift = activeShifts[0];
    const heroAvailability = defaultShift
      ? await computeSeatAvailability({
          centerId,
          roomId: activeRooms[0]?.id,
          shiftId: defaultShift.id,
          startDate: today,
          durationMonths: 1,
        })
      : null;

    const rawNotices = (cms?.noticesJson as Array<{
      id: string;
      title: string;
      body: string;
      category?: string;
      isPinned?: boolean;
      publishDate: string;
      expiryDate: string;
    }>) ?? [];

    const activeNotices = rawNotices
      .filter((n) => n.publishDate <= today && n.expiryDate >= today)
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));

    const rawExams = (cms?.examCountdownsJson as Array<{
      id: string;
      exam: string;
      eventName: string;
      examDate: string;
      sourceLabel: string;
      sourceUrl: string;
      confirmed: boolean;
    }>) ?? [];
    const activeExams = rawExams.filter((e) => e.confirmed && e.examDate >= today);

    const rawFacilities = (cms?.facilitiesJson as Array<{
      id: string;
      title: string;
      detail: string;
      enabled: boolean;
      pricingNote: string;
      span?: string;
    }>) ?? [];
    const enabledFacilities = rawFacilities.filter((f) => f.enabled);

    const safeCenter = centerRow
      ? {
          id: centerRow.id,
          slug: centerRow.slug,
          name: centerRow.name,
          category: centerRow.category,
          phoneDisplay: centerRow.phoneDisplay,
          callLink: centerRow.callLink,
          address: centerRow.address,
          landmark: centerRow.landmark,
          instagramUrl: centerRow.instagramUrl,
          googleBusinessUrl: centerRow.googleBusinessUrl,
          googleRating: centerRow.googleRating,
          googleReviewCount: centerRow.googleReviewCount,
          timezone: centerRow.timezone,
          currency: centerRow.currency,
          isDemoMode: centerRow.isDemoMode,
          whatsappEnabled: centerRow.whatsappEnabled,
          whatsappNumber: centerRow.whatsappNumber,
          gracePeriodDays: centerRow.gracePeriodDays,
          totalConfiguredSeats: centerRow.totalConfiguredSeats,
          hasAdminPin: Boolean(centerRow.adminPinHash),
          geofenceEnabled: centerRow.geofenceEnabled,
          centerLat: centerRow.centerLat,
          centerLng: centerRow.centerLng,
          geofenceRadiusMeters: centerRow.geofenceRadiusMeters,
        }
      : null;

    return NextResponse.json({
      center: safeCenter,
      rooms: activeRooms,
      shifts: activeShifts,
      plans: activePlans,
      achievers: publishedAchievers,
      vlogs: publishedVlogs,
      events: publishedEvents,
      cms: cms
        ? {
            heroHeadline: cms.heroHeadline,
            heroSubheadline: cms.heroSubheadline,
            facilities: enabledFacilities,
            gallery: cms.galleryJson,
            reviews: cms.reviewsJson,
            notices: activeNotices,
            examCountdowns: activeExams,
            faqs: cms.faqsJson,
            contactOverrides: cms.contactOverridesJson,
          }
        : null,
      heroAvailability: heroAvailability
        ? {
            shiftId: defaultShift.id,
            shiftName: defaultShift.name,
            shiftHours: defaultShift.displayHours,
            date: today,
            availableCount: heroAvailability.summary.available,
            totalSeats: heroAvailability.seats.length,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /api/public/center error:', err);
    return NextResponse.json({ error: 'Unable to load library information.' }, { status: 500 });
  }
}

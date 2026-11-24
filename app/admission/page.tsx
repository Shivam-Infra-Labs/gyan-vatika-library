import React from 'react';
import { and, asc, eq } from 'drizzle-orm';
import { db, withDbRetry } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { centers, plans, rooms, shifts } from '@/src/db/schema.ts';
import { AdmissionFormClient } from '@/src/components/public/admission-form-client';

export const dynamic = 'force-dynamic';

export default async function AdmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string; planId?: string; seatId?: string }>;
}) {
  const sp = await searchParams;
  const centerId = await ensureSeeded();

  const { center, activeRooms, activeShifts, activePlans } = await withDbRetry(async () => {
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
    return { center: c, activeRooms: r, activeShifts: sh, activePlans: pl };
  }, 'admission-page-load');

  return (
    <AdmissionFormClient
      center={{
        name: center.name,
        phoneDisplay: center.phoneDisplay,
        callLink: center.callLink,
        address: center.address,
        whatsappEnabled: center.whatsappEnabled,
        whatsappNumber: center.whatsappNumber,
      }}
      rooms={activeRooms.map((r) => ({ id: r.id, name: r.name }))}
      shifts={activeShifts}
      plans={activePlans}
      initialShiftId={sp.shiftId ? Number(sp.shiftId) : undefined}
      initialPlanId={sp.planId ? Number(sp.planId) : undefined}
      initialSeatId={sp.seatId ? Number(sp.seatId) : undefined}
    />
  );
}

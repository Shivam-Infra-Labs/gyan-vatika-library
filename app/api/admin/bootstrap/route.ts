import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  bookingRequests,
  centers,
  expenses,
  invoices,
  memberships,
  payments,
  plans,
  rooms,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
  supportTickets,
  waitlistEntries,
} from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { computeSeatAvailability, syncMembershipStates } from '@/src/lib/domain.ts';
import { todayIST } from '@/src/lib/format.ts';

function dateStrIST(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof d === 'string' ? new Date(d) : d);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const staff = auth.staff;
    const centerId = staff.centerId;
    await syncMembershipStates(centerId);

    const [centerRow] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
    const activeRooms = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.centerId, centerId), eq(rooms.isActive, true)));
    const allShifts = await db
      .select()
      .from(shifts)
      .where(eq(shifts.centerId, centerId))
      .orderBy(asc(shifts.sortOrder), asc(shifts.id));
    const allPlans = await db
      .select()
      .from(plans)
      .where(eq(plans.centerId, centerId))
      .orderBy(asc(plans.sortOrder), asc(plans.id));

    const shiftParam = req.nextUrl.searchParams.get('shiftId');
    const selectedShiftId = shiftParam ? Number(shiftParam) : allShifts[0]?.id;
    const today = todayIST();

    const shiftAvailability = selectedShiftId
      ? await computeSeatAvailability({
          centerId,
          shiftId: selectedShiftId,
          startDate: today,
          durationMonths: 1,
        })
      : null;

    const allSeats = await db.select().from(seats).where(eq(seats.centerId, centerId));
    const openAttendance = await db
      .select()
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.centerId, centerId), eq(attendanceSessions.status, 'OPEN')));

    const allPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.centerId, centerId), eq(payments.status, 'POSTED')))
      .orderBy(desc(payments.paidAt));

    const allExpenses = await db
      .select()
      .from(expenses)
      .where(eq(expenses.centerId, centerId))
      .orderBy(desc(expenses.expenseDate));

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.centerId, centerId));

    const monthPrefix = today.slice(0, 7);
    const todayCollectionPaise = allPayments
      .filter((p) => dateStrIST(p.paidAt) === today)
      .reduce((sum, p) => sum + p.amountPaise, 0);

    const monthlyRevenuePaise = allPayments
      .filter((p) => dateStrIST(p.paidAt).slice(0, 7) === monthPrefix)
      .reduce((sum, p) => sum + p.amountPaise, 0);

    const monthlyExpensesPaise = allExpenses
      .filter((e) => e.expenseDate.startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amountPaise, 0);

    const pendingDuesPaise = allInvoices
      .filter((inv) => inv.status !== 'REVERSED' && inv.balancePaise > 0)
      .reduce((sum, inv) => sum + inv.balancePaise, 0);

    const chartMonths: Array<{ month: string; label: string; income: number; expenses: number }> = [];
    const [cy, cm] = monthPrefix.split('-').map(Number);
    for (let offset = 5; offset >= 0; offset--) {
      const dt = new Date(Date.UTC(cy, cm - 1 - offset, 1));
      const key = dt.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(dt);
      const inc = allPayments
        .filter((p) => dateStrIST(p.paidAt).slice(0, 7) === key)
        .reduce((s, p) => s + p.amountPaise, 0);
      const exp = allExpenses
        .filter((e) => e.expenseDate.startsWith(key))
        .reduce((s, e) => s + e.amountPaise, 0);
      chartMonths.push({
        month: key,
        label,
        income: Math.round(inc / 100),
        expenses: Math.round(exp / 100),
      });
    }

    const shiftOccupancy: Array<{ name: string; occupied: number; available: number }> = [];
    for (const sh of allShifts.filter((s) => s.isActive)) {
      const av = await computeSeatAvailability({
        centerId,
        shiftId: sh.id,
        startDate: today,
        durationMonths: 1,
      });
      shiftOccupancy.push({
        name: sh.name,
        occupied: av.summary.occupied + av.summary.expiringSoon,
        available: av.summary.available,
      });
    }

    const pendingRequestsRaw = await db
      .select({
        request: bookingRequests,
        shiftName: shifts.name,
        planName: plans.name,
        seatNumber: seats.seatNumber,
      })
      .from(bookingRequests)
      .innerJoin(shifts, eq(bookingRequests.shiftId, shifts.id))
      .innerJoin(plans, eq(bookingRequests.planId, plans.id))
      .leftJoin(seats, eq(bookingRequests.seatId, seats.id))
      .where(and(eq(bookingRequests.centerId, centerId), eq(bookingRequests.status, 'PENDING')))
      .orderBy(desc(bookingRequests.createdAt));

    // Redact raw KYC document base64 from list responses; fetch on-demand via /api/admin/students/[id]/document
    const pendingRequests = pendingRequestsRaw.map((r) => ({
      ...r,
      request: {
        ...r.request,
        govIdDocData: undefined,
        hasGovIdDoc: Boolean(r.request.govIdDocData),
      },
    }));

    const expiringMemberships = await db
      .select({
        membership: memberships,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        studentPhone: studentProfiles.phone,
        studentWhatsapp: studentProfiles.whatsappNumber,
        studentId: studentProfiles.id,
        shiftName: shifts.name,
      })
      .from(memberships)
      .innerJoin(studentProfiles, eq(memberships.studentId, studentProfiles.id))
      .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
      .where(
        and(
          eq(memberships.centerId, centerId),
          inArray(memberships.status, ['EXPIRING_SOON', 'IN_GRACE'])
        )
      )
      .orderBy(asc(memberships.endDate));

    const overdueInvoices = await db
      .select({
        invoice: invoices,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        studentPhone: studentProfiles.phone,
        studentWhatsapp: studentProfiles.whatsappNumber,
      })
      .from(invoices)
      .innerJoin(studentProfiles, eq(invoices.studentId, studentProfiles.id))
      .where(
        and(
          eq(invoices.centerId, centerId),
          inArray(invoices.status, ['UNPAID', 'PARTIAL'])
        )
      );

    const openTickets = await db
      .select({
        ticket: supportTickets,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
      })
      .from(supportTickets)
      .innerJoin(studentProfiles, eq(supportTickets.studentId, studentProfiles.id))
      .where(
        and(
          eq(supportTickets.centerId, centerId),
          inArray(supportTickets.status, ['PENDING', 'IN_PROGRESS'])
        )
      )
      .orderBy(desc(supportTickets.createdAt));

    const waitlistCountRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.centerId, centerId), eq(waitlistEntries.status, 'WAITING')));

    const activeAllocs = await db
      .select({
        studentId: seatAllocations.studentId,
        seatNumber: seats.seatNumber,
      })
      .from(seatAllocations)
      .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
      .where(and(eq(seatAllocations.centerId, centerId), eq(seatAllocations.status, 'ACTIVE')));

    const seatByStudent = new Map<number, number>();
    for (const a of activeAllocs) seatByStudent.set(a.studentId, a.seatNumber);

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
      staff,
      center: safeCenter,
      rooms: activeRooms,
      shifts: allShifts,
      plans: allPlans,
      waitlistCount: waitlistCountRows[0]?.c ?? 0,
      kpis: {
        totalSeats: allSeats.length,
        insideNow: openAttendance.length,
        selectedShiftAvailable: shiftAvailability?.summary.available ?? 0,
        selectedShiftId,
        todayCollectionPaise,
        monthlyRevenuePaise,
        monthlyExpensesPaise,
        netProfitPaise: monthlyRevenuePaise - monthlyExpensesPaise,
        pendingDuesPaise,
        profitBasisNote:
          'Cash-collected basis: Monthly collected payments (posted receipts) minus recorded expenses for the current IST month. Unpaid dues are tracked separately.',
      },
      charts: {
        monthlyIncomeVsExpenses: chartMonths,
        shiftOccupancy,
      },
      attentionQueue: {
        pendingRequests,
        expiringMemberships,
        overdueInvoices: overdueInvoices.map((o) => ({
          ...o,
          seatNumber: seatByStudent.get(o.invoice.studentId) ?? null,
        })),
        openTickets,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/bootstrap error:', err);
    return NextResponse.json({ error: 'Unable to load admin workspace.' }, { status: 500 });
  }
}

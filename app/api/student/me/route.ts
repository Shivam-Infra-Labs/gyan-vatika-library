import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import {
  attendanceSessions,
  bookCopies,
  bookLoans,
  books,
  centers,
  invoices,
  memberships,
  payments,
  plans,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
  supportTickets,
  ticketMessages,
} from '@/src/db/schema.ts';
import { getStudentSessionFromCookies } from '@/src/lib/student-session.ts';
import { syncMembershipStates } from '@/src/lib/domain.ts';
import { addDaysDateStr, addMonthsDateStr, todayIST } from '@/src/lib/format.ts';

export async function GET() {
  try {
    const session = await getStudentSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    await syncMembershipStates(session.centerId);

    const [centerRow] = await db
      .select()
      .from(centers)
      .where(eq(centers.id, session.centerId))
      .limit(1);

    const safeCenter = centerRow
      ? {
          id: centerRow.id,
          name: centerRow.name,
          phoneDisplay: centerRow.phoneDisplay,
          address: centerRow.address,
          geofenceEnabled: centerRow.geofenceEnabled,
          geofenceRadiusMeters: centerRow.geofenceRadiusMeters,
        }
      : null;

    const [student] = await db
      .select({
        id: studentProfiles.id,
        centerId: studentProfiles.centerId,
        studentCode: studentProfiles.studentCode,
        fullName: studentProfiles.fullName,
        phone: studentProfiles.phone,
        whatsappNumber: studentProfiles.whatsappNumber,
        email: studentProfiles.email,
        examTarget: studentProfiles.examTarget,
        photoUrl: studentProfiles.photoUrl,
        qrSecret: studentProfiles.qrSecret,
        status: studentProfiles.status,
      })
      .from(studentProfiles)
      .where(
        and(
          eq(studentProfiles.id, session.studentId),
          eq(studentProfiles.centerId, session.centerId)
        )
      )
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: 'Student account not found' }, { status: 401 });
    }

    const membershipRows = await db
      .select({
        membership: memberships,
        shift: shifts,
        plan: plans,
      })
      .from(memberships)
      .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(
        and(
          eq(memberships.studentId, student.id),
          eq(memberships.centerId, student.centerId)
        )
      )
      .orderBy(desc(memberships.id))
      .limit(5);

    const currentMembership = membershipRows[0] ?? null;

    const activeSeatRows = currentMembership
      ? await db
          .select({
            allocation: seatAllocations,
            seat: seats,
          })
          .from(seatAllocations)
          .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
          .where(
            and(
              eq(seatAllocations.membershipId, currentMembership.membership.id),
              eq(seatAllocations.status, 'ACTIVE')
            )
          )
          .limit(1)
      : [];

    const attendanceList = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.studentId, student.id),
          eq(attendanceSessions.centerId, student.centerId)
        )
      )
      .orderBy(desc(attendanceSessions.checkInAt))
      .limit(60);

    const openSession = attendanceList.find((s) => s.status === 'OPEN') ?? null;

    const now = new Date();
    const todayStr = todayIST();
    const monthPrefix = todayStr.slice(0, 7);
    const [yr, mo] = monthPrefix.split('-').map(Number);
    const monthStartUtc = new Date(Date.UTC(yr, mo - 1, 1, -5, -30, 0));
    const monthEndUtc = new Date(Date.UTC(yr, mo, 1, -5, -30, 0));

    let monthlyMinutes = 0;
    for (const s of attendanceList) {
      const sStart = new Date(s.checkInAt);
      const sEnd = s.checkOutAt ? new Date(s.checkOutAt) : now;
      const clampedStart = Math.max(sStart.getTime(), monthStartUtc.getTime());
      const clampedEnd = Math.min(sEnd.getTime(), monthEndUtc.getTime());
      if (clampedEnd > clampedStart) {
        monthlyMinutes += Math.floor((clampedEnd - clampedStart) / 60000);
      }
    }

    const studentInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.studentId, student.id),
          eq(invoices.centerId, student.centerId)
        )
      )
      .orderBy(desc(invoices.id));

    const studentPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.studentId, student.id),
          eq(payments.centerId, student.centerId)
        )
      )
      .orderBy(desc(payments.paidAt));

    const totalPendingBalancePaise = studentInvoices.reduce(
      (acc, inv) => acc + (inv.status !== 'REVERSED' ? inv.balancePaise : 0),
      0
    );

    const loans = await db
      .select({
        loan: bookLoans,
        copy: bookCopies,
        book: books,
      })
      .from(bookLoans)
      .innerJoin(bookCopies, eq(bookLoans.copyId, bookCopies.id))
      .innerJoin(books, eq(bookCopies.bookId, books.id))
      .where(
        and(
          eq(bookLoans.studentId, student.id),
          eq(bookLoans.centerId, student.centerId)
        )
      )
      .orderBy(desc(bookLoans.issuedAt));

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.studentId, student.id),
          eq(supportTickets.centerId, student.centerId)
        )
      )
      .orderBy(desc(supportTickets.createdAt));

    const ticketIds = tickets.map((t) => t.id);
    const messages =
      ticketIds.length > 0
        ? await db
            .select()
            .from(ticketMessages)
            .where(eq(ticketMessages.centerId, student.centerId))
            .orderBy(ticketMessages.createdAt)
        : [];

    const allPlans = await db
      .select()
      .from(plans)
      .where(and(eq(plans.centerId, student.centerId), eq(plans.isActive, true)));

    let renewalPreview = null;
    if (currentMembership) {
      const nextStart =
        currentMembership.membership.endDate >= todayStr
          ? addDaysDateStr(currentMembership.membership.endDate, 1)
          : todayStr;
      const nextEnd = addMonthsDateStr(nextStart, currentMembership.plan.durationMonths);
      const effectiveMonthly =
        currentMembership.membership.negotiatedMonthlyFeePaise ??
        currentMembership.shift.monthlyFeePaise;
      const base = effectiveMonthly * currentMembership.plan.durationMonths;
      const disc = Math.round((base * currentMembership.plan.discountPercent) / 100);
      renewalPreview = {
        currentExpiry: currentMembership.membership.endDate,
        renewalStart: nextStart,
        newExpiry: nextEnd,
        shiftName: currentMembership.shift.name,
        customSlotLabel: currentMembership.membership.customSlotLabel || '',
        planName: currentMembership.plan.name,
        seatNumber: activeSeatRows[0]?.seat.seatNumber ?? null,
        amountPaise: base - disc,
      };
    }

    return NextResponse.json({
      center: safeCenter,
      student,
      qrPayload: JSON.stringify({
        type: 'GV_STUDENT_ID',
        token: student.qrSecret,
        centerId: student.centerId,
      }),
      currentMembership: currentMembership
        ? {
            ...currentMembership.membership,
            shift: currentMembership.shift,
            plan: currentMembership.plan,
          }
        : null,
      seat: activeSeatRows[0]?.seat ?? null,
      openSession,
      attendanceHistory: attendanceList,
      monthlyStudyMinutes: monthlyMinutes,
      totalPendingBalancePaise,
      invoices: studentInvoices,
      payments: studentPayments,
      bookLoans: loans,
      tickets: tickets.map((t) => ({
        ...t,
        messages: messages.filter((m) => m.ticketId === t.id),
      })),
      plans: allPlans,
      renewalPreview,
    });
  } catch (err) {
    console.error('GET /api/student/me error:', err);
    return NextResponse.json({ error: 'Unable to load student portal.' }, { status: 500 });
  }
}

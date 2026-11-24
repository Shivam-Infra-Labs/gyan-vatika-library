import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  bookCopies,
  bookLoans,
  bookingRequests,
  books,
  centers,
  cmsStates,
  invoices,
  memberships,
  payments,
  plans,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
  supportTickets,
  waitlistEntries,
} from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { computeSeatAvailability } from '@/src/lib/domain.ts';
import { formatDateDisplay, formatINR, todayIST } from '@/src/lib/format.ts';
import { getStudentSessionFromCookies } from '@/src/lib/student-session.ts';

export async function POST(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const body = await req.json().catch(() => ({}));
    const rawQuestion = typeof body.question === 'string' ? body.question.trim() : '';
    const q = rawQuestion.toLowerCase();

    if (!rawQuestion) {
      return NextResponse.json({ error: 'Please ask a question.' }, { status: 400 });
    }

    // Server-verified role resolution (never trusts client claims alone)
    let detectedRole: 'ADMIN' | 'STUDENT' | 'PUBLIC' = 'PUBLIC';
    let staffCtx: { userId: number; fullName: string; role: string } | null = null;
    let studentId: number | null = null;

    if (req.headers.get('authorization')?.startsWith('Bearer ')) {
      const auth = await authenticateStaff(req);
      if (auth.ok) {
        detectedRole = 'ADMIN';
        staffCtx = {
          userId: auth.staff.userId,
          fullName: auth.staff.fullName,
          role: auth.staff.role,
        };
      }
    }

    if (detectedRole === 'PUBLIC') {
      const studentSess = await getStudentSessionFromCookies();
      if (studentSess && studentSess.centerId === centerId) {
        detectedRole = 'STUDENT';
        studentId = studentSess.studentId;
      }
    }

    const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
    const activeShifts = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.centerId, centerId), eq(shifts.isActive, true)))
      .orderBy(asc(shifts.sortOrder));
    const activePlans = await db
      .select()
      .from(plans)
      .where(and(eq(plans.centerId, centerId), eq(plans.isActive, true)))
      .orderBy(asc(plans.sortOrder));
    const [cms] = await db
      .select()
      .from(cmsStates)
      .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, 'PUBLISHED')))
      .limit(1);

    const today = todayIST();

    // ───────────────────────────────────────────────────────────────────────────
    // ADMIN ROLE-AWARE RESPONSES (Verified Staff Only)
    // ───────────────────────────────────────────────────────────────────────────
    if (detectedRole === 'ADMIN' && staffCtx) {
      if (
        q.includes('check') ||
        q.includes('inside') ||
        q.includes('present') ||
        q.includes('attendance') ||
        q.includes('who')
      ) {
        const openSessions = await db
          .select({
            fullName: studentProfiles.fullName,
            studentCode: studentProfiles.studentCode,
            seatNumber: seats.seatNumber,
          })
          .from(attendanceSessions)
          .innerJoin(studentProfiles, eq(attendanceSessions.studentId, studentProfiles.id))
          .leftJoin(seats, eq(attendanceSessions.seatId, seats.id))
          .where(
            and(
              eq(attendanceSessions.centerId, centerId),
              eq(attendanceSessions.status, 'OPEN')
            )
          );

        const names = openSessions
          .slice(0, 8)
          .map(
            (s) =>
              `${s.fullName} (${s.studentCode}${s.seatNumber ? ` · Desk #${s.seatNumber}` : ''})`
          );

        return NextResponse.json({
          detectedRole,
          topic: 'admin-attendance',
          answer:
            openSessions.length === 0
              ? 'No students are currently checked into the reading hall.'
              : `${openSessions.length} student(s) currently inside the reading hall:\n• ${names.join('\n• ')}${
                  openSessions.length > 8 ? `\n• +${openSessions.length - 8} more` : ''
                }`,
        });
      }

      if (
        q.includes('revenue') ||
        q.includes('collect') ||
        q.includes('due') ||
        q.includes('balance') ||
        q.includes('finance')
      ) {
        const monthPrefix = today.slice(0, 7);
        const allPayments = await db
          .select({ amountPaise: payments.amountPaise, paidAt: payments.paidAt, status: payments.status })
          .from(payments)
          .where(eq(payments.centerId, centerId));
        const monthCollected = allPayments
          .filter(
            (p) =>
              p.status === 'POSTED' &&
              new Date(p.paidAt).toISOString().slice(0, 7) === monthPrefix
          )
          .reduce((acc, p) => acc + p.amountPaise, 0);

        const openInvoices = await db
          .select({ balancePaise: invoices.balancePaise })
          .from(invoices)
          .where(
            and(
              eq(invoices.centerId, centerId),
              sql`${invoices.balancePaise} > 0`,
              sql`${invoices.status} <> 'REVERSED'`
            )
          );
        const totalDues = openInvoices.reduce((acc, inv) => acc + inv.balancePaise, 0);

        return NextResponse.json({
          detectedRole,
          topic: 'admin-finance',
          answer: `Staff Summary (${staffCtx.role}):\n• Collected this month (${monthPrefix}): ${formatINR(monthCollected)}\n• Total pending student dues: ${formatINR(totalDues)} across ${openInvoices.length} open invoice(s).`,
        });
      }

      if (
        q.includes('pending') ||
        q.includes('request') ||
        q.includes('expir') ||
        q.includes('waitlist') ||
        q.includes('ticket') ||
        q.includes('grace')
      ) {
        const [pendingReqs] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(bookingRequests)
          .where(
            and(eq(bookingRequests.centerId, centerId), eq(bookingRequests.status, 'PENDING'))
          );
        const [waitCount] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(waitlistEntries)
          .where(
            and(eq(waitlistEntries.centerId, centerId), eq(waitlistEntries.status, 'WAITING'))
          );
        const [expiringCount] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(memberships)
          .where(
            and(
              eq(memberships.centerId, centerId),
              inArray(memberships.status, ['EXPIRING_SOON', 'IN_GRACE'])
            )
          );
        const [ticketCount] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(supportTickets)
          .where(
            and(
              eq(supportTickets.centerId, centerId),
              inArray(supportTickets.status, ['PENDING', 'IN_PROGRESS'])
            )
          );

        return NextResponse.json({
          detectedRole,
          topic: 'admin-operations',
          answer: `Live Operations Queue:\n• Pending Online Admissions/Requests: ${pendingReqs?.c ?? 0}\n• Active Seat Waitlist: ${waitCount?.c ?? 0}\n• Expiring Soon / In-Grace Memberships: ${expiringCount?.c ?? 0}\n• Open Helpdesk Tickets: ${ticketCount?.c ?? 0}`,
        });
      }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // STUDENT ROLE-AWARE RESPONSES (Verified Student Cookie Only)
    // ───────────────────────────────────────────────────────────────────────────
    if (detectedRole === 'STUDENT' && studentId) {
      const [stu] = await db
        .select()
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, studentId), eq(studentProfiles.centerId, centerId)))
        .limit(1);

      if (stu) {
        if (
          q.includes('my') ||
          q.includes('desk') ||
          q.includes('membership') ||
          q.includes('expir') ||
          q.includes('valid') ||
          q.includes('due') ||
          q.includes('balance') ||
          q.includes('loan') ||
          q.includes('borrow')
        ) {
          const [latestMem] = await db
            .select({
              membership: memberships,
              shift: shifts,
              plan: plans,
            })
            .from(memberships)
            .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
            .innerJoin(plans, eq(memberships.planId, plans.id))
            .where(eq(memberships.studentId, stu.id))
            .orderBy(desc(memberships.id))
            .limit(1);

          const [alloc] = await db
            .select({ seatNumber: seats.seatNumber })
            .from(seatAllocations)
            .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
            .where(
              and(
                eq(seatAllocations.studentId, stu.id),
                eq(seatAllocations.status, 'ACTIVE')
              )
            )
            .limit(1);

          const openInvs = await db
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.studentId, stu.id),
                sql`${invoices.balancePaise} > 0`,
                sql`${invoices.status} <> 'REVERSED'`
              )
            );
          const dueTotal = openInvs.reduce((acc, inv) => acc + inv.balancePaise, 0);

          const activeLoans = await db
            .select({ title: books.title, dueDate: bookLoans.dueDate })
            .from(bookLoans)
            .innerJoin(bookCopies, eq(bookLoans.copyId, bookCopies.id))
            .innerJoin(books, eq(bookCopies.bookId, books.id))
            .where(
              and(
                eq(bookLoans.studentId, stu.id),
                inArray(bookLoans.status, ['ISSUED', 'OVERDUE'])
              )
            );

          if (q.includes('due') || q.includes('balance') || q.includes('fee') || q.includes('pay')) {
            return NextResponse.json({
              detectedRole,
              topic: 'student-fees',
              answer:
                dueTotal > 0
                  ? `${stu.fullName} (${stu.studentCode}), your current pending balance is ${formatINR(dueTotal)} across ${openInvs.length} invoice(s). Pay at reception (Cash/UPI) to download your PDF receipt.`
                  : `${stu.fullName} (${stu.studentCode}), you have zero pending dues! All fee receipts are downloadable in the Fees tab.`,
            });
          }

          if (q.includes('book') || q.includes('loan') || q.includes('borrow')) {
            return NextResponse.json({
              detectedRole,
              topic: 'student-books',
              answer:
                activeLoans.length === 0
                  ? `You have no books currently issued on ${stu.studentCode}. Ask reception to borrow from our library bookshelf.`
                  : `Issued books on ${stu.studentCode}:\n• ${activeLoans.map((l) => `${l.title} (Due ${formatDateDisplay(l.dueDate)})`).join('\n• ')}`,
            });
          }

          const shiftHours =
            latestMem?.membership.customSlotLabel || latestMem?.shift.displayHours || '—';
          return NextResponse.json({
            detectedRole,
            topic: 'student-membership',
            answer: `${stu.fullName} (${stu.studentCode}):\n• Desk: ${alloc ? `Desk #${alloc.seatNumber}` : 'Unassigned'}\n• Shift: ${latestMem?.shift.name || 'None'} (${shiftHours})\n• Status: ${latestMem?.membership.status || 'NONE'}${latestMem ? ` · Valid until ${formatDateDisplay(latestMem.membership.endDate)}` : ''}\n• Pending Balance: ${formatINR(dueTotal)}`,
          });
        }
      }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // PUBLIC & SHARED QUERIES
    // ───────────────────────────────────────────────────────────────────────────
    if (
      q.includes('seat') ||
      q.includes('desk') ||
      q.includes('availab') ||
      q.includes('vacant') ||
      q.includes('empty') ||
      q.includes('open')
    ) {
      const summaries = await Promise.all(
        activeShifts.map(async (sh) => {
          const av = await computeSeatAvailability({
            centerId,
            shiftId: sh.id,
            startDate: today,
            durationMonths: 1,
          });
          return `${sh.name} (${sh.displayHours}): ${av.summary.available} open out of ${av.seats.length} desks`;
        })
      );
      return NextResponse.json({
        detectedRole,
        topic: 'availability',
        answer: `Live desk availability for today (${today}) across our ${center?.totalConfiguredSeats ?? 50} desks:\n• ${summaries.join('\n• ')}\n\nYou can pick any green desk on the floor map on the homepage or join the waitlist if your preferred slot fills up.`,
      });
    }

    if (
      q.includes('fee') ||
      q.includes('price') ||
      q.includes('cost') ||
      q.includes('shift') ||
      q.includes('timing') ||
      q.includes('hour') ||
      q.includes('flex') ||
      q.includes('plan')
    ) {
      const shiftLines = activeShifts.map(
        (sh) =>
          `${sh.name} (${sh.displayHours}): ${formatINR(sh.monthlyFeePaise)}/month${sh.isFlexible ? ' (Starting rate · Fee negotiable at counter)' : ''}`
      );
      const planLines = activePlans.map(
        (p) => `${p.name} (${p.durationMonths} mo${p.discountPercent > 0 ? `, ${p.discountPercent}% savings` : ''})`
      );
      return NextResponse.json({
        detectedRole,
        topic: 'fees',
        answer: `Our reading hall shifts & monthly rates:\n• ${shiftLines.join('\n• ')}\n\nMembership durations: ${planLines.join(' · ')}. Two students in non-overlapping shifts (such as Morning & Evening or custom 2–3 hr Flexible slots) can share a desk cleanly.`,
      });
    }

    if (
      q.includes('address') ||
      q.includes('where') ||
      q.includes('locat') ||
      q.includes('map') ||
      q.includes('phone') ||
      q.includes('call') ||
      q.includes('contact')
    ) {
      return NextResponse.json({
        detectedRole,
        topic: 'location',
        answer: `${center?.name} is located at ${center?.address} (Landmark: ${center?.landmark}). Call or WhatsApp reception at ${center?.phoneDisplay}. Reading hall hours run from 09:00 AM to 09:00 PM.`,
      });
    }

    if (q.includes('locker')) {
      return NextResponse.json({
        detectedRole,
        topic: 'facilities',
        answer:
          'Gyan Vatika Library does not have personal lockers. All 50 desks come with individual cubicle privacy dividers, bag space at your desk, power charging outlets, AC, Wi-Fi, and RO water.',
      });
    }

    if (
      q.includes('admi') ||
      q.includes('join') ||
      q.includes('kyc') ||
      q.includes('id') ||
      q.includes('document') ||
      q.includes('rule')
    ) {
      return NextResponse.json({
        detectedRole,
        topic: 'admission',
        answer:
          'To join: fill out the Online Admission & KYC form (/admission) or select a desk on the floor map. Bring or upload a valid Government ID (last 4 digits + photo), accept the Silence Zone etiquette, and confirm Cash/UPI payment at reception to activate your Student ID & QR Pass.',
      });
    }

    if (q.includes('book') || q.includes('shelf') || q.includes('novel')) {
      const bookCountRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(books)
        .where(eq(books.centerId, centerId));
      return NextResponse.json({
        detectedRole,
        topic: 'books',
        answer: `We maintain a curated bookshelf (${bookCountRows[0]?.c ?? 6}+ cataloged titles across Novels, Hindi Literature, Humanity, and Biographies) that active members can borrow through reception and track inside the Student Portal.`,
      });
    }

    const faqs = (cms?.faqsJson as Array<{ question: string; answer: string }>) ?? [];
    const matchedFaq = faqs.find(
      (f) =>
        f.question.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.includes(w)) ||
        f.answer.toLowerCase().split(/\s+/).some((w) => w.length > 4 && q.includes(w))
    );
    if (matchedFaq) {
      return NextResponse.json({
        detectedRole,
        topic: 'faq',
        answer: `${matchedFaq.question}\n${matchedFaq.answer}`,
      });
    }

    const roleHint =
      detectedRole === 'ADMIN'
        ? 'You can ask about "today check-ins", "monthly revenue & dues", "pending requests & waitlist", or "live open seats".'
        : detectedRole === 'STUDENT'
        ? 'You can ask about "my desk & expiry", "my pending fees", "my issued books", or "live open seats".'
        : 'Try asking "How many seats are open today?", "What are the shift fees?", or "How do I apply for admission?"';

    return NextResponse.json({
      detectedRole,
      topic: 'general',
      answer: `I am connected to live Gyan Vatika Library records (${center?.totalConfiguredSeats ?? 50} desks, ${center?.phoneDisplay}). ${roleHint}`,
    });
  } catch (err) {
    console.error('POST /api/assistant error:', err);
    return NextResponse.json({ error: 'Assistant is temporarily unavailable.' }, { status: 500 });
  }
}

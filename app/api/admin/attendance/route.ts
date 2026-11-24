import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  memberships,
  seatAllocations,
  seats,
  studentProfiles,
} from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { generateRotatingReceptionQr, recordAuditEvent } from '@/src/lib/domain.ts';
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
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const centerId = staff.centerId;
    const rows = await db
      .select({
        session: attendanceSessions,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        seatNumber: seats.seatNumber,
      })
      .from(attendanceSessions)
      .innerJoin(studentProfiles, eq(attendanceSessions.studentId, studentProfiles.id))
      .leftJoin(seats, eq(attendanceSessions.seatId, seats.id))
      .where(eq(attendanceSessions.centerId, centerId))
      .orderBy(desc(attendanceSessions.checkInAt))
      .limit(100);

    const today = todayIST();
    const todayRows = rows.filter((r) => dateStrIST(r.session.checkInAt) === today);

    const qr = generateRotatingReceptionQr(centerId);

    return NextResponse.json({
      insideNow: rows.filter((r) => r.session.status === 'OPEN'),
      needsReview: rows.filter((r) => r.session.status === 'NEEDS_REVIEW'),
      todayRegister: todayRows,
      recentSessions: rows,
      activeReceptionQr: {
        token: qr.token,
        expiresAt: qr.expiresAt,
        secondsRemaining: qr.secondsRemaining,
        payload: JSON.stringify({
          type: 'GV_RECEPTION_QR',
          token: qr.token,
          centerId,
        }),
      },
    });
  } catch (err) {
    console.error('GET /api/admin/attendance error:', err);
    return NextResponse.json({ error: 'Unable to load attendance desk.' }, { status: 500 });
  }
}

const AttendancePostSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('GENERATE_RECEPTION_QR') }),
  z.object({
    action: z.literal('SCAN_STUDENT_QR'),
    qrPayload: z.string().min(4),
  }),
  z.object({
    action: z.literal('MANUAL_CORRECTION'),
    sessionId: z.number().int().positive(),
    checkInAt: z.string(),
    checkOutAt: z.string().nullable().optional(),
    status: z.enum(['OPEN', 'CLOSED', 'NEEDS_REVIEW']),
    reason: z.string().trim().min(3, 'Correction reason is required'),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = AttendancePostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid attendance request.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'GENERATE_RECEPTION_QR') {
      const qr = generateRotatingReceptionQr(staff.centerId);
      return NextResponse.json({
        token: qr.token,
        expiresAt: qr.expiresAt,
        secondsRemaining: qr.secondsRemaining,
        payload: JSON.stringify({
          type: 'GV_RECEPTION_QR',
          token: qr.token,
          centerId: staff.centerId,
        }),
      });
    }

    if (parsed.data.action === 'SCAN_STUDENT_QR') {
      let token = parsed.data.qrPayload.trim();
      try {
        const obj = JSON.parse(token);
        if (obj?.token) token = String(obj.token);
      } catch {
        // Also allow Student ID fallback
      }

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(
          and(
            eq(studentProfiles.centerId, staff.centerId),
            eq(studentProfiles.qrSecret, token)
          )
        )
        .limit(1);

      const resolvedStudent =
        student ??
        (
          await db
            .select()
            .from(studentProfiles)
            .where(
              and(
                eq(studentProfiles.centerId, staff.centerId),
                eq(studentProfiles.studentCode, token.toUpperCase())
              )
            )
            .limit(1)
        )[0];

      if (!resolvedStudent) {
        return NextResponse.json({ error: 'Invalid or revoked student QR code.' }, { status: 404 });
      }

      const [openSession] = await db
        .select()
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.studentId, resolvedStudent.id),
            eq(attendanceSessions.centerId, staff.centerId),
            eq(attendanceSessions.status, 'OPEN')
          )
        )
        .orderBy(desc(attendanceSessions.checkInAt))
        .limit(1);

      const now = new Date();
      if (openSession) {
        const diffSec = Math.floor((now.getTime() - new Date(openSession.checkInAt).getTime()) / 1000);
        if (diffSec < 60) {
          return NextResponse.json({
            duplicatePrevented: true,
            studentName: resolvedStudent.fullName,
            message: `${resolvedStudent.fullName} just checked in. Duplicate scan ignored.`,
          });
        }
        const durationMinutes = Math.max(
          1,
          Math.round((now.getTime() - new Date(openSession.checkInAt).getTime()) / 60000)
        );
        const [closed] = await db
          .update(attendanceSessions)
          .set({
            checkOutAt: now,
            durationMinutes,
            status: 'CLOSED',
          })
          .where(eq(attendanceSessions.id, openSession.id))
          .returning();

        await recordAuditEvent({
          centerId: staff.centerId,
          actorType: 'STAFF',
          actorId: String(staff.userId),
          actorName: staff.fullName,
          action: 'STAFF_QR_CHECK_OUT',
          entityType: 'ATTENDANCE_SESSION',
          entityId: String(closed.id),
          summary: `Scanned ${resolvedStudent.fullName} (${resolvedStudent.studentCode}) out.`,
        });

        return NextResponse.json({
          mode: 'CHECKED_OUT',
          studentName: resolvedStudent.fullName,
          studentCode: resolvedStudent.studentCode,
          session: closed,
        });
      }

      const [latestMembership] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.studentId, resolvedStudent.id))
        .orderBy(desc(memberships.id))
        .limit(1);

      const [alloc] = latestMembership
        ? await db
            .select()
            .from(seatAllocations)
            .where(
              and(
                eq(seatAllocations.membershipId, latestMembership.id),
                eq(seatAllocations.status, 'ACTIVE')
              )
            )
            .limit(1)
        : [];

      const [opened] = await db
        .insert(attendanceSessions)
        .values({
          centerId: staff.centerId,
          studentId: resolvedStudent.id,
          membershipId: latestMembership?.id ?? null,
          seatId: alloc?.seatId ?? null,
          checkInAt: now,
          source: 'STAFF_SCAN',
          status: 'OPEN',
        })
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STAFF_QR_CHECK_IN',
        entityType: 'ATTENDANCE_SESSION',
        entityId: String(opened.id),
        summary: `Scanned ${resolvedStudent.fullName} (${resolvedStudent.studentCode}) in.`,
      });

      return NextResponse.json({
        mode: 'CHECKED_IN',
        studentName: resolvedStudent.fullName,
        studentCode: resolvedStudent.studentCode,
        session: opened,
      });
    }

    const [existing] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.id, parsed.data.sessionId),
          eq(attendanceSessions.centerId, staff.centerId)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Attendance session not found.' }, { status: 404 });
    }

    const newIn = new Date(parsed.data.checkInAt);
    const newOut = parsed.data.checkOutAt ? new Date(parsed.data.checkOutAt) : null;
    const durationMinutes =
      newOut && newOut > newIn ? Math.round((newOut.getTime() - newIn.getTime()) / 60000) : null;

    const [updated] = await db
      .update(attendanceSessions)
      .set({
        originalCheckInAt: existing.originalCheckInAt ?? existing.checkInAt,
        originalCheckOutAt: existing.originalCheckOutAt ?? existing.checkOutAt,
        checkInAt: newIn,
        checkOutAt: newOut,
        durationMinutes,
        status: parsed.data.status,
        source: 'MANUAL_CORRECTION',
        correctionReason: parsed.data.reason,
        correctedByUserId: staff.userId,
      })
      .where(eq(attendanceSessions.id, existing.id))
      .returning();

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'ATTENDANCE_MANUAL_CORRECTION',
      entityType: 'ATTENDANCE_SESSION',
      entityId: String(existing.id),
      summary: `Corrected session #${existing.id}: ${parsed.data.reason}`,
      metadata: {
        originalCheckInAt: existing.checkInAt,
        originalCheckOutAt: existing.checkOutAt,
        newCheckInAt: newIn,
        newCheckOutAt: newOut,
      },
    });

    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error('POST /api/admin/attendance error:', err);
    return NextResponse.json({ error: 'Unable to process attendance action.' }, { status: 500 });
  }
}

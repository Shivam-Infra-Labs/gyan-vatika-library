import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import {
  attendanceSessions,
  centers,
  memberships,
  receptionQrTokens,
  seatAllocations,
  studentProfiles,
} from '@/src/db/schema.ts';
import { getStudentSessionFromCookies } from '@/src/lib/student-session.ts';
import { recordAuditEvent, verifyRotatingReceptionQr } from '@/src/lib/domain.ts';
import { haversineDistanceMeters } from '@/src/lib/format.ts';

const AttendanceActionSchema = z.object({
  action: z.enum(['CHECK_IN', 'CHECK_OUT', 'SCAN_RECEPTION_QR', 'CLOSE_FORGOTTEN_SESSION']),
  qrPayload: z.string().optional(),
  manualCheckoutTime: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = AttendanceActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid attendance action.' }, { status: 400 });
    }

    const [center] = await db
      .select()
      .from(centers)
      .where(eq(centers.id, session.centerId))
      .limit(1);

    const [student] = await db
      .select()
      .from(studentProfiles)
      .where(
        and(
          eq(studentProfiles.id, session.studentId),
          eq(studentProfiles.centerId, session.centerId)
        )
      )
      .limit(1);

    if (!student || !center) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const openSessions = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.studentId, student.id),
          eq(attendanceSessions.centerId, student.centerId),
          eq(attendanceSessions.status, 'OPEN')
        )
      )
      .orderBy(desc(attendanceSessions.checkInAt))
      .limit(1);

    const openSession = openSessions[0];
    const now = new Date();

    const enforceGeofenceIfNeeded = () => {
      if (!center.geofenceEnabled) return null;
      if (typeof parsed.data.lat !== 'number' || typeof parsed.data.lng !== 'number') {
        return NextResponse.json(
          {
            error:
              'Location permission is required for Check-In at Gyan Vatika Library. Please enable GPS location or check in at reception.',
          },
          { status: 403 }
        );
      }
      const dist = haversineDistanceMeters(
        parsed.data.lat,
        parsed.data.lng,
        Number(center.centerLat),
        Number(center.centerLng)
      );
      if (dist > center.geofenceRadiusMeters) {
        return NextResponse.json(
          {
            error: `You appear to be ${dist}m away from Gyan Vatika Library (allowed radius: ${center.geofenceRadiusMeters}m). Check in inside the reading hall or ask reception.`,
          },
          { status: 403 }
        );
      }
      return null;
    };

    if (parsed.data.action === 'SCAN_RECEPTION_QR') {
      const raw = parsed.data.qrPayload?.trim() || '';
      let tokenValue = raw;
      try {
        const parsedJson = JSON.parse(raw);
        if (parsedJson?.token) tokenValue = String(parsedJson.token);
      } catch {
        // Accept raw token string
      }

      const validRotating = verifyRotatingReceptionQr(student.centerId, tokenValue, now.getTime());
      let validDbQr = false;
      let expiredDbQr = false;

      if (!validRotating) {
        const [qrRow] = await db
          .select()
          .from(receptionQrTokens)
          .where(
            and(
              eq(receptionQrTokens.centerId, student.centerId),
              eq(receptionQrTokens.token, tokenValue)
            )
          )
          .limit(1);

        if (qrRow) {
          if (new Date(qrRow.expiresAt) >= now) {
            validDbQr = true;
          } else {
            expiredDbQr = true;
          }
        }
      }

      if (!validRotating && !validDbQr) {
        return NextResponse.json(
          {
            error: expiredDbQr
              ? 'Reception QR code expired. Scan the fresh 60-second QR code on the reception screen.'
              : 'Unrecognized or expired reception QR code. Scan the live 60-second Reception QR code.',
          },
          { status: expiredDbQr ? 410 : 400 }
        );
      }

      if (openSession) {
        const diffSec = Math.floor((now.getTime() - new Date(openSession.checkInAt).getTime()) / 1000);
        if (diffSec < 120) {
          return NextResponse.json({
            duplicatePrevented: true,
            message: 'Already checked in just now. Duplicate scan ignored.',
            session: openSession,
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

        return NextResponse.json({
          mode: 'CHECKED_OUT',
          message: 'Checked out via reception QR. Your desk remains reserved for your membership.',
          session: closed,
        });
      }
    }

    if (parsed.data.action === 'CHECK_OUT' || parsed.data.action === 'CLOSE_FORGOTTEN_SESSION') {
      if (!openSession) {
        return NextResponse.json({ error: 'No active check-in session found.' }, { status: 400 });
      }
      const outTime =
        parsed.data.action === 'CLOSE_FORGOTTEN_SESSION' && parsed.data.manualCheckoutTime
          ? new Date(parsed.data.manualCheckoutTime)
          : now;
      const safeOut =
        Number.isNaN(outTime.getTime()) || outTime <= new Date(openSession.checkInAt)
          ? now
          : outTime;
      const durationMinutes = Math.max(
        1,
        Math.round((safeOut.getTime() - new Date(openSession.checkInAt).getTime()) / 60000)
      );

      const isForgotten = parsed.data.action === 'CLOSE_FORGOTTEN_SESSION';
      const [closed] = await db
        .update(attendanceSessions)
        .set({
          checkOutAt: safeOut,
          durationMinutes,
          status: isForgotten ? 'NEEDS_REVIEW' : 'CLOSED',
          correctionReason: isForgotten ? 'Student reported forgotten checkout' : '',
        })
        .where(eq(attendanceSessions.id, openSession.id))
        .returning();

      return NextResponse.json({
        mode: 'CHECKED_OUT',
        message: isForgotten
          ? 'Previous open session closed and flagged for reception review.'
          : 'Checked out successfully. Your seat remains assigned to your membership.',
        session: closed,
      });
    }

    if (openSession) {
      return NextResponse.json({
        duplicatePrevented: true,
        message: 'You are already checked in.',
        session: openSession,
      });
    }

    const geoErr = enforceGeofenceIfNeeded();
    if (geoErr) return geoErr;

    const [activeMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.studentId, student.id),
          eq(memberships.centerId, student.centerId)
        )
      )
      .orderBy(desc(memberships.id))
      .limit(1);

    if (!activeMembership || activeMembership.status === 'EXPIRED' || activeMembership.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Your membership is not currently active. Contact reception to renew.' },
        { status: 403 }
      );
    }

    const [activeAlloc] = await db
      .select()
      .from(seatAllocations)
      .where(
        and(
          eq(seatAllocations.membershipId, activeMembership.id),
          eq(seatAllocations.status, 'ACTIVE')
        )
      )
      .limit(1);

    const [created] = await db
      .insert(attendanceSessions)
      .values({
        centerId: student.centerId,
        studentId: student.id,
        membershipId: activeMembership.id,
        seatId: activeAlloc?.seatId ?? null,
        checkInAt: now,
        source: 'STUDENT_SCAN',
        status: 'OPEN',
      })
      .returning();

    await recordAuditEvent({
      centerId: student.centerId,
      actorType: 'STUDENT',
      actorId: student.studentCode,
      actorName: student.fullName,
      action: 'ATTENDANCE_CHECK_IN',
      entityType: 'ATTENDANCE_SESSION',
      entityId: String(created.id),
      summary: `${student.fullName} (${student.studentCode}) checked in.`,
    });

    return NextResponse.json({
      mode: 'CHECKED_IN',
      message: 'Checked in successfully. Have a focused study session.',
      session: created,
    });
  } catch (err) {
    console.error('POST /api/student/attendance error:', err);
    return NextResponse.json({ error: 'Unable to update attendance.' }, { status: 500 });
  }
}

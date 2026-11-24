import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { studentProfiles } from '@/src/db/schema.ts';
import { signStudentToken, STUDENT_COOKIE_NAME, verifyPin } from '@/src/lib/student-session.ts';

const LoginSchema = z.object({
  studentCode: z.string().trim().min(3),
  pin: z.string().trim().min(4),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const json = await req.json();
    const parsed = LoginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Enter your Student ID and 4-digit PIN.' },
        { status: 400 }
      );
    }

    const codeNormalized = parsed.data.studentCode.toUpperCase();
    const [student] = await db
      .select()
      .from(studentProfiles)
      .where(
        and(
          eq(studentProfiles.centerId, centerId),
          sql`upper(${studentProfiles.studentCode}) = ${codeNormalized}`
        )
      )
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: 'Student ID not found.' }, { status: 401 });
    }

    const now = new Date();
    if (student.lockedUntil && new Date(student.lockedUntil) > now) {
      const minsLeft = Math.max(
        1,
        Math.ceil((new Date(student.lockedUntil).getTime() - now.getTime()) / 60000)
      );
      return NextResponse.json(
        {
          error: `Account temporarily locked after ${MAX_FAILED_ATTEMPTS} incorrect PIN attempts. Try again in ${minsLeft} minute(s) or ask reception to unlock.`,
          lockedUntil: student.lockedUntil,
        },
        { status: 423 }
      );
    }

    const pinMatched = await verifyPin(parsed.data.pin, student.pinHash);
    const phoneLast4 = student.phone.slice(-4);
    if (!pinMatched && parsed.data.pin !== phoneLast4) {
      const nextAttempts = (student.failedLoginAttempts ?? 0) + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
      const nextLockedUntil = shouldLock
        ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await db
        .update(studentProfiles)
        .set({
          failedLoginAttempts: nextAttempts,
          lockedUntil: nextLockedUntil,
          updatedAt: now,
        })
        .where(eq(studentProfiles.id, student.id));

      if (shouldLock) {
        return NextResponse.json(
          {
            error: `Too many incorrect PIN attempts. Student account locked for ${LOCKOUT_MINUTES} minutes.`,
            lockedUntil: nextLockedUntil,
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: `Incorrect PIN (${MAX_FAILED_ATTEMPTS - nextAttempts} attempt(s) left before 15-min lockout).`,
        },
        { status: 401 }
      );
    }

    if ((student.failedLoginAttempts ?? 0) > 0 || student.lockedUntil) {
      await db
        .update(studentProfiles)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(studentProfiles.id, student.id));
    }

    const token = signStudentToken({
      studentId: student.id,
      centerId: student.centerId,
      studentCode: student.studentCode,
    });

    const res = NextResponse.json({
      student: {
        id: student.id,
        studentCode: student.studentCode,
        fullName: student.fullName,
      },
    });

    res.cookies.set(STUDENT_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });

    return res;
  } catch (err) {
    console.error('POST /api/student/login error:', err);
    return NextResponse.json({ error: 'Sign-in failed.' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDENT_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

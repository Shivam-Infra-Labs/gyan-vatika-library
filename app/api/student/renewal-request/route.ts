import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { memberships, studentProfiles } from '@/src/db/schema.ts';
import { getStudentSessionFromCookies } from '@/src/lib/student-session.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === 'string' ? body.note.trim() : '';

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

    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.studentId, session.studentId),
          eq(memberships.centerId, session.centerId)
        )
      )
      .orderBy(desc(memberships.id))
      .limit(1);

    if (!student || !membership) {
      return NextResponse.json({ error: 'Active membership not found.' }, { status: 404 });
    }

    await db
      .update(memberships)
      .set({ renewalRequested: true, updatedAt: new Date() })
      .where(eq(memberships.id, membership.id));

    await recordAuditEvent({
      centerId: student.centerId,
      actorType: 'STUDENT',
      actorId: student.studentCode,
      actorName: student.fullName,
      action: 'RENEWAL_REQUESTED',
      entityType: 'MEMBERSHIP',
      entityId: String(membership.id),
      summary: `${student.fullName} requested membership renewal (${note || 'Cash/UPI at reception'}).`,
    });

    return NextResponse.json({
      ok: true,
      message: 'Renewal request sent to reception. Pay Cash or UPI at the counter to extend your seat.',
    });
  } catch (err) {
    console.error('POST /api/student/renewal-request error:', err);
    return NextResponse.json({ error: 'Unable to submit renewal request.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { bookingRequests, studentProfiles } from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const staff = auth.staff;
    const { id } = await context.params;
    const recordId = Number(id);
    if (!recordId || Number.isNaN(recordId)) {
      return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });
    }

    const source = req.nextUrl.searchParams.get('source') || 'student';

    if (source === 'request') {
      const [reqRow] = await db
        .select({
          id: bookingRequests.id,
          fullName: bookingRequests.fullName,
          govIdType: bookingRequests.govIdType,
          govIdLast4: bookingRequests.govIdLast4,
          govIdDocData: bookingRequests.govIdDocData,
          idProofMode: bookingRequests.idProofMode,
          idVerificationStatus: bookingRequests.idVerificationStatus,
          idVerificationNote: bookingRequests.idVerificationNote,
          idVerifiedAt: bookingRequests.idVerifiedAt,
          photoUrl: bookingRequests.photoUrl,
        })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.id, recordId),
            eq(bookingRequests.centerId, staff.centerId)
          )
        )
        .limit(1);

      if (!reqRow) {
        return NextResponse.json({ error: 'Admission request not found.' }, { status: 404 });
      }
      return NextResponse.json(reqRow);
    }

    const [student] = await db
      .select({
        id: studentProfiles.id,
        fullName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        govIdType: studentProfiles.govIdType,
        govIdLast4: studentProfiles.govIdLast4,
        govIdDocData: studentProfiles.govIdDocData,
        idProofMode: studentProfiles.idProofMode,
        idVerificationStatus: studentProfiles.idVerificationStatus,
        idVerificationNote: studentProfiles.idVerificationNote,
        idVerifiedAt: studentProfiles.idVerifiedAt,
        photoUrl: studentProfiles.photoUrl,
      })
      .from(studentProfiles)
      .where(
        and(
          eq(studentProfiles.id, recordId),
          eq(studentProfiles.centerId, staff.centerId)
        )
      )
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (err) {
    console.error('GET /api/admin/students/[id]/document error:', err);
    return NextResponse.json({ error: 'Unable to load private KYC document.' }, { status: 500 });
  }
}

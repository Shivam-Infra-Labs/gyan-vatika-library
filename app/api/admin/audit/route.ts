import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { auditEvents } from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.centerId, staff.centerId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(150);

    return NextResponse.json({ events });
  } catch (err) {
    console.error('GET /api/admin/audit error:', err);
    return NextResponse.json({ error: 'Unable to load staff activity.' }, { status: 500 });
  }
}

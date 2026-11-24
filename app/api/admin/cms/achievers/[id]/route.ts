import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { achievers } from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

const UpdateAchieverSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  examCleared: z.string().trim().min(2).optional(),
  postOrRank: z.string().trim().optional(),
  selectionYear: z.string().trim().optional(),
  photoUrl: z.string().trim().max(1_500_000, 'Achiever photo is too large.').optional(),
  quote: z.string().optional(),
  isPublished: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const { id } = await context.params;
    const achieverId = Number(id);
    if (!achieverId || Number.isNaN(achieverId)) {
      return NextResponse.json({ error: 'Invalid achiever ID.' }, { status: 400 });
    }

    const json = await req.json();
    const parsed = UpdateAchieverSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid achiever update.' },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(achievers)
      .set(parsed.data)
      .where(and(eq(achievers.id, achieverId), eq(achievers.centerId, staff.centerId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Achiever not found.' }, { status: 404 });
    }

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'ACHIEVER_UPDATED',
      entityType: 'ACHIEVER',
      entityId: String(updated.id),
      summary: `Updated achiever ${updated.fullName} (${updated.examCleared}).`,
    });

    return NextResponse.json({ achiever: updated });
  } catch (err) {
    console.error('PATCH /api/admin/cms/achievers/[id] error:', err);
    return NextResponse.json({ error: 'Unable to update achiever.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const { id } = await context.params;
    const achieverId = Number(id);
    if (!achieverId || Number.isNaN(achieverId)) {
      return NextResponse.json({ error: 'Invalid achiever ID.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(achievers)
      .where(and(eq(achievers.id, achieverId), eq(achievers.centerId, staff.centerId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Achiever not found.' }, { status: 404 });
    }

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'ACHIEVER_DELETED',
      entityType: 'ACHIEVER',
      entityId: String(deleted.id),
      summary: `Removed achiever ${deleted.fullName} (${deleted.examCleared}).`,
    });

    return NextResponse.json({ deleted: true, id: deleted.id });
  } catch (err) {
    console.error('DELETE /api/admin/cms/achievers/[id] error:', err);
    return NextResponse.json({ error: 'Unable to delete achiever.' }, { status: 500 });
  }
}

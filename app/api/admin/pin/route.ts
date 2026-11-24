import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { centers } from '@/src/db/schema.ts';
import { authenticateStaff, hashAdminPin, isSuperAdmin, verifyAdminPin } from '@/src/lib/auth.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

const PinSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('VERIFY_PIN'),
    pin: z.string().regex(/^\d{4}$/, 'Enter your 4-digit Admin PIN'),
  }),
  z.object({
    action: z.literal('SET_PIN'),
    pin: z.string().regex(/^\d{4}$/, 'Admin PIN must be exactly 4 digits'),
  }),
  z.object({
    action: z.literal('CLEAR_PIN'),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const staff = auth.staff;

    const json = await req.json();
    const parsed = PinSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid PIN request.' },
        { status: 400 }
      );
    }

    const [center] = await db
      .select()
      .from(centers)
      .where(eq(centers.id, staff.centerId))
      .limit(1);

    if (!center) {
      return NextResponse.json({ error: 'Center not found.' }, { status: 404 });
    }

    if (parsed.data.action === 'VERIFY_PIN') {
      if (!center.adminPinHash) {
        return NextResponse.json({ verified: true });
      }
      const ok = verifyAdminPin(parsed.data.pin, center.adminPinHash);
      if (!ok) {
        return NextResponse.json({ error: 'Incorrect 4-digit Security PIN.' }, { status: 403 });
      }
      return NextResponse.json({ verified: true });
    }

    if (!isSuperAdmin(staff)) {
      return NextResponse.json(
        { error: 'Only the Center Owner (SUPER_ADMIN) can change the Admin Security PIN.' },
        { status: 403 }
      );
    }

    if (parsed.data.action === 'SET_PIN') {
      await db
        .update(centers)
        .set({ adminPinHash: hashAdminPin(parsed.data.pin), updatedAt: new Date() })
        .where(eq(centers.id, staff.centerId));

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'ADMIN_PIN_SET',
        entityType: 'CENTER',
        entityId: String(staff.centerId),
        summary: 'Enabled / updated 4-digit Admin Security PIN lock.',
      });

      return NextResponse.json({ hasAdminPin: true });
    }

    await db
      .update(centers)
      .set({ adminPinHash: '', updatedAt: new Date() })
      .where(eq(centers.id, staff.centerId));

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'ADMIN_PIN_CLEARED',
      entityType: 'CENTER',
      entityId: String(staff.centerId),
      summary: 'Disabled 4-digit Admin Security PIN lock.',
    });

    return NextResponse.json({ hasAdminPin: false });
  } catch (err) {
    console.error('POST /api/admin/pin error:', err);
    return NextResponse.json({ error: 'Unable to update Admin PIN.' }, { status: 500 });
  }
}

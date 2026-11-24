import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { waitlistEntries } from '@/src/db/schema.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';
import { todayIST } from '@/src/lib/format.ts';

const WaitlistSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  whatsappNumber: z.string().trim().optional().default(''),
  examTarget: z.string().trim().optional().default('General'),
  shiftId: z.number().int().positive().nullable().optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().optional().default(''),
});

export async function POST(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const json = await req.json();
    const parsed = WaitlistSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid waitlist details.' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const preferredDate = data.preferredDate || todayIST();

    const [entry] = await db
      .insert(waitlistEntries)
      .values({
        centerId,
        fullName: data.fullName,
        phone: data.phone,
        whatsappNumber: data.whatsappNumber || data.phone,
        examTarget: data.examTarget || 'General',
        shiftId: data.shiftId ?? null,
        preferredDate,
        status: 'WAITING',
        notes: data.notes || '',
      })
      .returning();

    await recordAuditEvent({
      centerId,
      actorType: 'SYSTEM',
      actorId: data.phone,
      actorName: data.fullName,
      action: 'WAITLIST_JOINED',
      entityType: 'WAITLIST',
      entityId: String(entry.id),
      summary: `${data.fullName} (${data.phone}) joined the desk waitlist for ${preferredDate}.`,
    });

    return NextResponse.json({
      entry,
      message: 'Added to the desk waitlist. Reception will WhatsApp or call you as soon as a desk opens.',
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/public/waitlist error:', err);
    return NextResponse.json({ error: 'Unable to join waitlist.' }, { status: 500 });
  }
}

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { bookingRequests, plans, shifts } from '@/src/db/schema.ts';
import {
  calculateQuote,
  computeSeatAvailability,
  recordAuditEvent,
  resolveShiftMinutes,
} from '@/src/lib/domain.ts';

const RequestSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  whatsappNumber: z.string().trim().optional().default(''),
  email: z.string().trim().email('Valid email required').optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().optional().default(''),
  examTarget: z.string().trim().optional().default('General'),
  shiftId: z.number().int().positive(),
  planId: z.number().int().positive(),
  seatId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customStartMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customEndMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customSlotLabel: z.string().trim().optional().default(''),
  idempotencyKey: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const json = await req.json();
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid booking details.' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const existing = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.idempotencyKey, data.idempotencyKey))
      .limit(1);

    if (existing[0]) {
      return NextResponse.json({
        request: existing[0],
        statusLabel: 'Awaiting owner approval',
      });
    }

    const [shiftRow] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, data.shiftId), eq(shifts.centerId, centerId)))
      .limit(1);
    const [planRow] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.id, data.planId), eq(plans.centerId, centerId)))
      .limit(1);

    if (!shiftRow || !planRow) {
      return NextResponse.json({ error: 'Selected shift or plan was not found.' }, { status: 404 });
    }

    const resolvedWindow = resolveShiftMinutes({
      shift: shiftRow,
      customStartMinute: data.customStartMinute,
      customEndMinute: data.customEndMinute,
      customSlotLabel: data.customSlotLabel,
    });

    const availability = await computeSeatAvailability({
      centerId,
      shiftId: shiftRow.id,
      startDate: data.startDate,
      durationMonths: planRow.durationMonths,
      customStartMinute: resolvedWindow.startMinute,
      customEndMinute: resolvedWindow.endMinute,
    });

    const targetSeat = availability.seats.find((s) => s.seatId === data.seatId);
    if (!targetSeat || targetSeat.availability !== 'AVAILABLE') {
      const alternatives = availability.seats
        .filter((s) => s.availability === 'AVAILABLE')
        .slice(0, 6);
      return NextResponse.json(
        {
          error: targetSeat
            ? `Desk ${targetSeat.seatNumber} is no longer available for this shift and date.`
            : 'Selected desk is unavailable.',
          alternatives,
        },
        { status: 409 }
      );
    }

    const quote = calculateQuote({
      shiftMonthlyPaise: shiftRow.monthlyFeePaise,
      durationMonths: planRow.durationMonths,
      discountPercent: planRow.discountPercent,
    });

    const referenceCode = `REQ-${data.startDate.slice(0, 4)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}${String(Date.now()).slice(-2)}`;

    const [created] = await db
      .insert(bookingRequests)
      .values({
        centerId,
        referenceCode,
        fullName: data.fullName,
        phone: data.phone,
        whatsappNumber: data.whatsappNumber || data.phone,
        email: data.email || '',
        emergencyContactPhone: data.emergencyContactPhone || '',
        examTarget: data.examTarget || 'General',
        requestSource: 'BOOKING_DRAWER',
        shiftId: shiftRow.id,
        planId: planRow.id,
        seatId: targetSeat.seatId,
        lockerRequested: false,
        startDate: data.startDate,
        customStartMinute: shiftRow.isFlexible ? resolvedWindow.startMinute : null,
        customEndMinute: shiftRow.isFlexible ? resolvedWindow.endMinute : null,
        customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
        quotedTotalPaise: quote.totalPaise,
        status: 'PENDING',
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    await recordAuditEvent({
      centerId,
      actorType: 'SYSTEM',
      actorId: data.phone,
      actorName: data.fullName,
      action: 'BOOKING_REQUEST_CREATED',
      entityType: 'BOOKING_REQUEST',
      entityId: String(created.id),
      summary: `Public seat request ${created.referenceCode} submitted for Desk ${targetSeat.seatNumber} (${shiftRow.name}${shiftRow.isFlexible ? ` · ${resolvedWindow.slotLabel}` : ''}).`,
    });

    return NextResponse.json(
      {
        request: created,
        seatNumber: targetSeat.seatNumber,
        shiftName: shiftRow.name,
        shiftHours: resolvedWindow.slotLabel,
        planName: planRow.name,
        quote,
        statusLabel: 'Awaiting owner approval',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/public/booking-request error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to submit seat request.' },
      { status: 400 }
    );
  }
}

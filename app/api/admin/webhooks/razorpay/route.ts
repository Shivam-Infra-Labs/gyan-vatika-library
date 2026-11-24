import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/index.ts';
import { invoices, payments, webhookEvents } from '@/src/db/schema.ts';
import { todayIST } from '@/src/lib/format.ts';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (secret) {
      const sig = req.headers.get('x-razorpay-signature') || '';
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody) as {
      eventId?: string;
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            amount?: number;
            notes?: { invoiceId?: number; centerId?: number };
          };
        };
      };
    };

    const eventId =
      payload.eventId ||
      req.headers.get('x-razorpay-event-id') ||
      payload.payload?.payment?.entity?.id;

    if (!eventId) {
      return NextResponse.json({ error: 'Missing webhook event identifier' }, { status: 400 });
    }

    // Idempotent check: repeated webhook event produces zero duplicate payments/receipts
    const alreadyProcessed = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, String(eventId)))
      .limit(1);

    if (alreadyProcessed[0]) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    const entity = payload.payload?.payment?.entity;
    const invoiceId = Number(entity?.notes?.invoiceId);
    const amountPaise = Number(entity?.amount || 0);

    if (!invoiceId || amountPaise <= 0) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const result = await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new Error('Invoice not found for webhook');

      await tx.insert(webhookEvents).values({
        centerId: inv.centerId,
        provider: 'RAZORPAY',
        eventId: String(eventId),
        payloadJson: payload,
      });

      const applied = Math.min(inv.balancePaise, amountPaise);
      if (applied <= 0) return { deduplicated: true };

      const rcpCode = `RCP-${todayIST().slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const [payment] = await tx
        .insert(payments)
        .values({
          centerId: inv.centerId,
          invoiceId: inv.id,
          studentId: inv.studentId,
          receiptNumber: rcpCode,
          amountPaise: applied,
          method: 'RAZORPAY',
          referenceCode: String(entity?.id || eventId),
          status: 'POSTED',
          idempotencyKey: `rzp-${eventId}`,
        })
        .returning();

      const newPaid = inv.paidPaise + applied;
      const newBal = inv.totalPaise - newPaid;
      await tx
        .update(invoices)
        .set({
          paidPaise: newPaid,
          balancePaise: newBal,
          status: newBal === 0 ? 'PAID' : 'PARTIAL',
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id));

      return { payment };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /api/admin/webhooks/razorpay error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

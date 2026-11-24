import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  auditEvents,
  centers,
  expenses,
  invoices,
  memberships,
  paymentReversals,
  payments,
  plans,
  seatAllocations,
  shifts,
  studentProfiles,
} from '@/src/db/schema.ts';
import { authenticateStaff, isSuperAdmin } from '@/src/lib/auth.ts';
import {
  calculateQuote,
  recordAuditEvent,
  resolveShiftMinutes,
} from '@/src/lib/domain.ts';
import {
  addDaysDateStr,
  addMonthsDateStr,
  dateRangesOverlap,
  shiftIntervalsOverlap,
  todayIST,
} from '@/src/lib/format.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const centerId = staff.centerId;
    const invRows = await db
      .select({
        invoice: invoices,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        studentPhone: studentProfiles.phone,
        studentWhatsapp: studentProfiles.whatsappNumber,
        membershipEndDate: memberships.endDate,
      })
      .from(invoices)
      .innerJoin(studentProfiles, eq(invoices.studentId, studentProfiles.id))
      .innerJoin(memberships, eq(invoices.membershipId, memberships.id))
      .where(eq(invoices.centerId, centerId))
      .orderBy(desc(invoices.id));

    const payRows = await db
      .select({
        payment: payments,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        studentPhone: studentProfiles.phone,
        studentWhatsapp: studentProfiles.whatsappNumber,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(payments)
      .innerJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(eq(payments.centerId, centerId))
      .orderBy(desc(payments.paidAt));

    const reversalRows = await db
      .select()
      .from(paymentReversals)
      .where(eq(paymentReversals.centerId, centerId))
      .orderBy(desc(paymentReversals.createdAt));

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.centerId, centerId))
      .orderBy(desc(expenses.expenseDate));

    return NextResponse.json({
      invoices: invRows,
      payments: payRows,
      reversals: reversalRows,
      expenses: expenseRows,
    });
  } catch (err) {
    console.error('GET /api/admin/finance error:', err);
    return NextResponse.json({ error: 'Unable to load financial records.' }, { status: 500 });
  }
}

const FinanceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('COLLECT_BALANCE'),
    invoiceId: z.number().int().positive(),
    amountPaise: z.number().int().positive(),
    method: z.enum(['CASH', 'UPI', 'CARD']),
    referenceCode: z.string().optional().default(''),
    idempotencyKey: z.string().min(6),
  }),
  z.object({
    action: z.literal('RENEW_MEMBERSHIP'),
    studentId: z.number().int().positive(),
    shiftId: z.number().int().positive(),
    planId: z.number().int().positive(),
    seatId: z.number().int().positive(),
    customStartMinute: z.number().int().min(360).max(1380).nullable().optional(),
    customEndMinute: z.number().int().min(360).max(1380).nullable().optional(),
    customSlotLabel: z.string().trim().optional().default(''),
    negotiatedMonthlyFeePaise: z.number().int().positive().nullable().optional(),
    negotiationNote: z.string().trim().optional().default(''),
    amountReceivedPaise: z.number().int().min(0),
    method: z.enum(['CASH', 'UPI', 'CARD']),
    referenceCode: z.string().optional().default(''),
    idempotencyKey: z.string().min(6),
  }),
  z.object({
    action: z.literal('REVERSE_PAYMENT'),
    paymentId: z.number().int().positive(),
    reason: z.string().trim().min(4, 'Reversal reason is required'),
  }),
  z.object({
    action: z.literal('RECORD_EXPENSE'),
    category: z.enum(['RENT', 'ELECTRICITY', 'INTERNET', 'HOUSEKEEPING', 'SALARIES', 'OTHER']),
    title: z.string().trim().min(2),
    amountPaise: z.number().int().positive(),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER']).default('UPI'),
    vendorName: z.string().optional().default(''),
    notes: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('DELETE_EXPENSE'),
    expenseId: z.number().int().positive(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = FinanceActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid financial request.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'RECORD_EXPENSE') {
      const [exp] = await db
        .insert(expenses)
        .values({
          centerId: staff.centerId,
          category: parsed.data.category,
          title: parsed.data.title,
          amountPaise: parsed.data.amountPaise,
          expenseDate: parsed.data.expenseDate,
          paymentMethod: parsed.data.paymentMethod,
          vendorName: parsed.data.vendorName,
          notes: parsed.data.notes,
          recordedByUserId: staff.userId,
        })
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'EXPENSE_RECORDED',
        entityType: 'EXPENSE',
        entityId: String(exp.id),
        summary: `Recorded ${parsed.data.category} expense "${parsed.data.title}" (${parsed.data.amountPaise} paise).`,
      });
      return NextResponse.json({ expense: exp }, { status: 201 });
    }

    if (parsed.data.action === 'DELETE_EXPENSE') {
      if (!isSuperAdmin(staff)) {
        return NextResponse.json(
          { error: 'Only the Center Owner (SUPER_ADMIN) can delete recorded expenses.' },
          { status: 403 }
        );
      }
      const [deleted] = await db
        .delete(expenses)
        .where(
          and(eq(expenses.id, parsed.data.expenseId), eq(expenses.centerId, staff.centerId))
        )
        .returning();

      if (!deleted) {
        return NextResponse.json({ error: 'Expense not found.' }, { status: 404 });
      }
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'EXPENSE_DELETED',
        entityType: 'EXPENSE',
        entityId: String(deleted.id),
        summary: `Deleted expense "${deleted.title}" (${deleted.amountPaise} paise).`,
      });
      return NextResponse.json({ deleted: true });
    }

    if (parsed.data.action === 'REVERSE_PAYMENT') {
      if (!isSuperAdmin(staff)) {
        return NextResponse.json(
          { error: 'Only the Center Owner (SUPER_ADMIN) can reverse posted payments.' },
          { status: 403 }
        );
      }
      const reverseData = parsed.data;
      const result = await db.transaction(async (tx) => {
        const [pay] = await tx
          .select()
          .from(payments)
          .where(
            and(eq(payments.id, reverseData.paymentId), eq(payments.centerId, staff.centerId))
          )
          .limit(1);

        if (!pay) throw new Error('Payment not found.');
        if (pay.status === 'REVERSED') throw new Error('Payment is already reversed.');

        const [inv] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.id, pay.invoiceId))
          .limit(1);
        if (!inv) throw new Error('Linked invoice not found.');

        await tx
          .update(payments)
          .set({ status: 'REVERSED' })
          .where(eq(payments.id, pay.id));

        const [reversal] = await tx
          .insert(paymentReversals)
          .values({
            centerId: staff.centerId,
            paymentId: pay.id,
            invoiceId: inv.id,
            amountPaise: pay.amountPaise,
            reason: reverseData.reason,
            reversedByUserId: staff.userId,
          })
          .returning();

        const newPaid = Math.max(0, inv.paidPaise - pay.amountPaise);
        const newBal = inv.totalPaise - newPaid;
        const newStatus = newBal === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

        const [updatedInv] = await tx
          .update(invoices)
          .set({
            paidPaise: newPaid,
            balancePaise: newBal,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, inv.id))
          .returning();

        await tx.insert(auditEvents).values({
          centerId: staff.centerId,
          actorType: 'STAFF',
          actorId: String(staff.userId),
          actorName: staff.fullName,
          action: 'PAYMENT_REVERSED',
          entityType: 'PAYMENT',
          entityId: String(pay.id),
          summary: `Reversed receipt ${pay.receiptNumber} (${pay.amountPaise} paise): ${reverseData.reason}`,
        });

        return { reversal, invoice: updatedInv };
      });
      return NextResponse.json(result);
    }

    if (parsed.data.action === 'COLLECT_BALANCE') {
      const collectData = parsed.data;
      const existingPay = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, collectData.idempotencyKey))
        .limit(1);

      if (existingPay[0]) {
        return NextResponse.json({ duplicatePrevented: true, payment: existingPay[0] });
      }

      const result = await db.transaction(async (tx) => {
        const lockedInvRes = await tx.execute(
          sql`SELECT * FROM invoices WHERE id = ${collectData.invoiceId} AND center_id = ${staff.centerId} FOR UPDATE`
        );
        const inv = lockedInvRes.rows[0] as
          | {
              id: number;
              student_id: number;
              invoice_number: string;
              total_paise: number;
              paid_paise: number;
              balance_paise: number;
            }
          | undefined;

        if (!inv) throw new Error('Invoice not found.');
        if (inv.balance_paise <= 0) throw new Error('Invoice has zero remaining balance.');

        const collectAmount = Math.min(inv.balance_paise, collectData.amountPaise);
        const newPaid = inv.paid_paise + collectAmount;
        const newBalance = inv.total_paise - newPaid;
        const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

        const rcpCode = `RCP-${todayIST().slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const [payment] = await tx
          .insert(payments)
          .values({
            centerId: staff.centerId,
            invoiceId: inv.id,
            studentId: inv.student_id,
            receiptNumber: rcpCode,
            amountPaise: collectAmount,
            method: collectData.method,
            referenceCode: collectData.referenceCode,
            status: 'POSTED',
            idempotencyKey: collectData.idempotencyKey,
            collectedByUserId: staff.userId,
          })
          .returning();

        const [updatedInvoice] = await tx
          .update(invoices)
          .set({
            paidPaise: newPaid,
            balancePaise: newBalance,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, inv.id))
          .returning();

        await tx.insert(auditEvents).values({
          centerId: staff.centerId,
          actorType: 'STAFF',
          actorId: String(staff.userId),
          actorName: staff.fullName,
          action: 'BALANCE_COLLECTED',
          entityType: 'INVOICE',
          entityId: String(inv.id),
          summary: `Collected ${collectAmount} paise (${collectData.method}) against ${inv.invoice_number}; receipt ${rcpCode}.`,
        });

        return { payment, invoice: updatedInvoice };
      });
      return NextResponse.json(result, { status: 201 });
    }

    // RENEW_MEMBERSHIP
    const renewData = parsed.data;
    const existingRenewPay = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, renewData.idempotencyKey))
      .limit(1);
    if (existingRenewPay[0]) {
      return NextResponse.json({ duplicatePrevented: true, payment: existingRenewPay[0] });
    }

    const renewalRes = await db.transaction(async (tx) => {
      const [center] = await tx
        .select()
        .from(centers)
        .where(eq(centers.id, staff.centerId))
        .limit(1);
      const [student] = await tx
        .select()
        .from(studentProfiles)
        .where(
          and(
            eq(studentProfiles.id, renewData.studentId),
            eq(studentProfiles.centerId, staff.centerId)
          )
        )
        .limit(1);
      const [shiftRow] = await tx
        .select()
        .from(shifts)
        .where(eq(shifts.id, renewData.shiftId))
        .limit(1);
      const [planRow] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, renewData.planId))
        .limit(1);

      if (!center || !student || !shiftRow || !planRow) {
        throw new Error('Missing student, shift, or plan.');
      }

      if (
        typeof renewData.negotiatedMonthlyFeePaise === 'number' &&
        renewData.negotiatedMonthlyFeePaise > 0 &&
        renewData.negotiatedMonthlyFeePaise < shiftRow.monthlyFeePaise &&
        !isSuperAdmin(staff)
      ) {
        throw new Error('Only Super Admin (Owner) can lower monthly fees below standard shift rates.');
      }

      const [prevMembership] = await tx
        .select()
        .from(memberships)
        .where(eq(memberships.studentId, student.id))
        .orderBy(desc(memberships.id))
        .limit(1);

      const resolvedWindow = resolveShiftMinutes({
        shift: shiftRow,
        customStartMinute: renewData.customStartMinute ?? prevMembership?.customStartMinute,
        customEndMinute: renewData.customEndMinute ?? prevMembership?.customEndMinute,
        customSlotLabel: renewData.customSlotLabel || prevMembership?.customSlotLabel,
      });

      const today = todayIST();
      const renewalStart =
        prevMembership && prevMembership.endDate >= today
          ? addDaysDateStr(prevMembership.endDate, 1)
          : today;
      const newExpiry = addMonthsDateStr(renewalStart, planRow.durationMonths);
      const graceEnd = addDaysDateStr(newExpiry, center.gracePeriodDays);

      const lockedSeatRes = await tx.execute(
        sql`SELECT id, seat_number, status FROM seats WHERE id = ${renewData.seatId} AND center_id = ${staff.centerId} FOR UPDATE`
      );
      const seatRow = lockedSeatRes.rows[0] as
        | { id: number; seat_number: number; status: string }
        | undefined;
      if (!seatRow || seatRow.status !== 'ACTIVE') {
        throw new Error('Selected desk is not available.');
      }

      const activeAllocs = await tx
        .select()
        .from(seatAllocations)
        .innerJoin(memberships, eq(seatAllocations.membershipId, memberships.id))
        .where(
          and(
            eq(seatAllocations.centerId, staff.centerId),
            eq(seatAllocations.seatId, renewData.seatId),
            eq(seatAllocations.status, 'ACTIVE'),
            inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
          )
        );

      const conflict = activeAllocs.find(
        (r) =>
          r.seat_allocations.studentId !== student.id &&
          dateRangesOverlap(
            renewalStart,
            newExpiry,
            r.seat_allocations.startDate,
            r.seat_allocations.endDate
          ) &&
          shiftIntervalsOverlap(
            resolvedWindow.startMinute,
            resolvedWindow.endMinute,
            r.seat_allocations.startMinute,
            r.seat_allocations.endMinute
          )
      );

      if (conflict) {
        throw new Error(`Desk #${seatRow.seat_number} is already reserved during that renewal window.`);
      }

      const negotiatedFee =
        typeof renewData.negotiatedMonthlyFeePaise === 'number' &&
        renewData.negotiatedMonthlyFeePaise > 0
          ? renewData.negotiatedMonthlyFeePaise
          : null;

      const [newMembership] = await tx
        .insert(memberships)
        .values({
          centerId: staff.centerId,
          studentId: student.id,
          shiftId: shiftRow.id,
          planId: planRow.id,
          startDate: renewalStart,
          endDate: newExpiry,
          graceEndDate: graceEnd,
          customStartMinute: shiftRow.isFlexible ? resolvedWindow.startMinute : null,
          customEndMinute: shiftRow.isFlexible ? resolvedWindow.endMinute : null,
          customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
          negotiatedMonthlyFeePaise: negotiatedFee,
          negotiationNote: renewData.negotiationNote || '',
          status: 'ACTIVE',
          renewedFromId: prevMembership?.id ?? null,
        })
        .returning();

      if (prevMembership) {
        await tx
          .update(memberships)
          .set({ renewalRequested: false, updatedAt: new Date() })
          .where(eq(memberships.id, prevMembership.id));
      }

      await tx.insert(seatAllocations).values({
        centerId: staff.centerId,
        seatId: seatRow.id,
        membershipId: newMembership.id,
        studentId: student.id,
        shiftId: shiftRow.id,
        startDate: renewalStart,
        endDate: newExpiry,
        startMinute: resolvedWindow.startMinute,
        endMinute: resolvedWindow.endMinute,
        customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
        status: 'ACTIVE',
      });

      const quote = calculateQuote({
        shiftMonthlyPaise: shiftRow.monthlyFeePaise,
        negotiatedMonthlyFeePaise: negotiatedFee,
        durationMonths: planRow.durationMonths,
        discountPercent: planRow.discountPercent,
      });

      const received = Math.min(quote.totalPaise, Math.max(0, renewData.amountReceivedPaise));
      const balance = quote.totalPaise - received;
      const invStatus = balance === 0 ? 'PAID' : received > 0 ? 'PARTIAL' : 'UNPAID';
      const invCode = `INV-${today.slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const [invoice] = await tx
        .insert(invoices)
        .values({
          centerId: staff.centerId,
          invoiceNumber: invCode,
          studentId: student.id,
          membershipId: newMembership.id,
          subtotalPaise: quote.subtotalPaise,
          discountPaise: quote.discountPaise,
          lockerFeePaise: 0,
          totalPaise: quote.totalPaise,
          paidPaise: received,
          balancePaise: balance,
          status: invStatus,
          dueDate: renewalStart,
          snapshotJson: {
            planName: planRow.name,
            durationMonths: planRow.durationMonths,
            discountPercent: planRow.discountPercent,
            shiftName: shiftRow.name,
            shiftHours: resolvedWindow.slotLabel,
            monthlyFeePaise: quote.effectiveMonthlyPaise,
            standardMonthlyFeePaise: shiftRow.monthlyFeePaise,
            negotiationNote: renewData.negotiationNote || '',
            seatNumber: seatRow.seat_number,
            renewedFrom: prevMembership?.id ?? null,
          },
        })
        .returning();

      let payment = null;
      if (received > 0) {
        const rcpCode = `RCP-${today.slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const [payRow] = await tx
          .insert(payments)
          .values({
            centerId: staff.centerId,
            invoiceId: invoice.id,
            studentId: student.id,
            receiptNumber: rcpCode,
            amountPaise: received,
            method: renewData.method,
            referenceCode: renewData.referenceCode,
            status: 'POSTED',
            idempotencyKey: renewData.idempotencyKey,
            collectedByUserId: staff.userId,
          })
          .returning();
        payment = payRow;
      }

      await tx.insert(auditEvents).values({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'MEMBERSHIP_RENEWED',
        entityType: 'MEMBERSHIP',
        entityId: String(newMembership.id),
        summary: `Renewed ${student.fullName} on Desk #${seatRow.seat_number} (${renewalStart} to ${newExpiry}).`,
      });

      return { membership: newMembership, invoice, payment };
    });

    return NextResponse.json(renewalRes, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/finance error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to process financial action.' },
      { status: 400 }
    );
  }
}

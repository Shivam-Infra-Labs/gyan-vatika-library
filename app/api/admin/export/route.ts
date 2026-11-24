import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  expenses,
  invoices,
  memberships,
  payments,
  plans,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
} from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const centerId = staff.centerId;
    const sp = req.nextUrl.searchParams;
    const dataset = sp.get('dataset') || 'collections';
    const format = sp.get('format') || 'csv';
    const from = sp.get('from') || '2000-01-01';
    const to = sp.get('to') || '2099-12-31';

    let rows: Array<Record<string, string | number>> = [];

    if (dataset === 'students') {
      const stu = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.centerId, centerId));
      const mem = await db
        .select({ m: memberships, shift: shifts.name, plan: plans.name })
        .from(memberships)
        .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
        .innerJoin(plans, eq(memberships.planId, plans.id))
        .where(eq(memberships.centerId, centerId))
        .orderBy(desc(memberships.id));
      const alloc = await db
        .select({ studentId: seatAllocations.studentId, seatNumber: seats.seatNumber, status: seatAllocations.status })
        .from(seatAllocations)
        .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
        .where(eq(seatAllocations.centerId, centerId));

      rows = stu.map((s) => {
        const lm = mem.find((x) => x.m.studentId === s.id);
        const la = alloc.find((x) => x.studentId === s.id && x.status === 'ACTIVE');
        return {
          StudentID: s.studentCode,
          Name: s.fullName,
          Phone: s.phone,
          ExamTarget: s.examTarget,
          Seat: la?.seatNumber ?? 'Unassigned',
          Shift: lm?.shift ?? '—',
          Plan: lm?.plan ?? '—',
          Status: lm?.m.status ?? s.status,
          ExpiryDate: lm?.m.endDate ?? '—',
        };
      });
    } else if (dataset === 'attendance') {
      const att = await db
        .select({
          a: attendanceSessions,
          name: studentProfiles.fullName,
          code: studentProfiles.studentCode,
        })
        .from(attendanceSessions)
        .innerJoin(studentProfiles, eq(attendanceSessions.studentId, studentProfiles.id))
        .where(eq(attendanceSessions.centerId, centerId))
        .orderBy(desc(attendanceSessions.checkInAt));

      rows = att
        .filter((r) => {
          const d = new Date(r.a.checkInAt).toISOString().slice(0, 10);
          return d >= from && d <= to;
        })
        .map((r) => ({
          StudentID: r.code,
          Name: r.name,
          CheckIn: new Date(r.a.checkInAt).toISOString(),
          CheckOut: r.a.checkOutAt ? new Date(r.a.checkOutAt).toISOString() : 'Still Inside',
          DurationMinutes: r.a.durationMinutes ?? 0,
          Source: r.a.source,
          Status: r.a.status,
        }));
    } else if (dataset === 'dues') {
      const invs = await db
        .select({
          inv: invoices,
          name: studentProfiles.fullName,
          code: studentProfiles.studentCode,
          phone: studentProfiles.phone,
        })
        .from(invoices)
        .innerJoin(studentProfiles, eq(invoices.studentId, studentProfiles.id))
        .where(eq(invoices.centerId, centerId));

      rows = invs
        .filter((r) => r.inv.balancePaise > 0 && r.inv.status !== 'REVERSED')
        .map((r) => ({
          InvoiceNumber: r.inv.invoiceNumber,
          StudentID: r.code,
          Name: r.name,
          Phone: r.phone,
          TotalINR: (r.inv.totalPaise / 100).toFixed(2),
          PaidINR: (r.inv.paidPaise / 100).toFixed(2),
          BalanceDueINR: (r.inv.balancePaise / 100).toFixed(2),
          Status: r.inv.status,
          DueDate: r.inv.dueDate,
        }));
    } else if (dataset === 'expenses') {
      const exp = await db
        .select()
        .from(expenses)
        .where(eq(expenses.centerId, centerId))
        .orderBy(desc(expenses.expenseDate));

      rows = exp
        .filter((e) => e.expenseDate >= from && e.expenseDate <= to)
        .map((e) => ({
          Date: e.expenseDate,
          Category: e.category,
          Title: e.title,
          Vendor: e.vendorName,
          Method: e.paymentMethod,
          AmountINR: (e.amountPaise / 100).toFixed(2),
        }));
    } else if (dataset === 'monthly_summary') {
      const pay = await db.select().from(payments).where(eq(payments.centerId, centerId));
      const exp = await db.select().from(expenses).where(eq(expenses.centerId, centerId));
      const inv = await db.select().from(invoices).where(eq(invoices.centerId, centerId));

      const months = new Set<string>();
      for (const p of pay) months.add(new Date(p.paidAt).toISOString().slice(0, 7));
      for (const e of exp) months.add(e.expenseDate.slice(0, 7));

      rows = Array.from(months)
        .sort()
        .map((m) => {
          const collected = pay
            .filter((p) => p.status === 'POSTED' && new Date(p.paidAt).toISOString().slice(0, 7) === m)
            .reduce((s, p) => s + p.amountPaise, 0);
          const spent = exp
            .filter((e) => e.expenseDate.startsWith(m))
            .reduce((s, e) => s + e.amountPaise, 0);
          const unpaid = inv
            .filter((i) => i.status !== 'REVERSED' && i.dueDate.startsWith(m))
            .reduce((s, i) => s + i.balancePaise, 0);
          return {
            Month: m,
            CollectedINR: (collected / 100).toFixed(2),
            ExpensesINR: (spent / 100).toFixed(2),
            NetCashINR: ((collected - spent) / 100).toFixed(2),
            UnpaidReceivablesINR: (unpaid / 100).toFixed(2),
          };
        });
    } else {
      // collections
      const pay = await db
        .select({
          p: payments,
          name: studentProfiles.fullName,
          code: studentProfiles.studentCode,
          invNum: invoices.invoiceNumber,
        })
        .from(payments)
        .innerJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(eq(payments.centerId, centerId))
        .orderBy(desc(payments.paidAt));

      rows = pay
        .filter((r) => {
          const d = new Date(r.p.paidAt).toISOString().slice(0, 10);
          return d >= from && d <= to;
        })
        .map((r) => ({
          ReceiptNumber: r.p.receiptNumber,
          InvoiceNumber: r.invNum,
          StudentID: r.code,
          Name: r.name,
          Method: r.p.method,
          Reference: r.p.referenceCode,
          AmountINR: (r.p.amountPaise / 100).toFixed(2),
          Status: r.p.status,
          PaidAt: new Date(r.p.paidAt).toISOString(),
        }));
    }

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No records in selected filter' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, dataset.slice(0, 28));

    if (format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="gyan-vatika-${dataset}.xlsx"`,
        },
      });
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="gyan-vatika-${dataset}.csv"`,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/export error:', err);
    return NextResponse.json({ error: 'Unable to export report.' }, { status: 500 });
  }
}

'use client';

import React from 'react';
import {
  AlertCircle,
  Armchair,
  ArrowRight,
  Clock,
  CreditCard,
  IndianRupee,
  LifeBuoy,
  QrCode,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateDisplay, formatINR } from '@/src/lib/format';
import type {
  AdminSection,
  BootstrapPayload,
  PendingBookingRequest,
} from './admin-types';

interface OverviewAndReceptionProps {
  mode: 'overview' | 'reception';
  bootstrap: BootstrapPayload;
  selectedShiftId: number;
  onChangeShift: (shiftId: number) => void;
  onNavigate: (section: AdminSection, opts?: { studentFilter?: string }) => void;
  onOpenAdmission: () => void;
  onOpenScanner: () => void;
  onReviewRequest: (req: PendingBookingRequest) => void;
  onOpenStudent: (studentId: number) => void;
  onCollectInvoice: (invoiceId: number, studentName: string, balancePaise: number) => void;
}

export function AdminOverviewAndReception({
  mode,
  bootstrap,
  selectedShiftId,
  onChangeShift,
  onNavigate,
  onOpenAdmission,
  onOpenScanner,
  onReviewRequest,
  onOpenStudent,
  onCollectInvoice,
}: OverviewAndReceptionProps) {
  const { kpis, charts, attentionQueue } = bootstrap;

  if (mode === 'reception') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Reception Desk</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Immediate walk-in admissions, fee collection, desk assignment, and QR check-ins.
            </p>
          </div>
          {bootstrap.center.isDemoMode && (
            <span className="font-mono text-xs text-amber-500">Demo Center Active</span>
          )}
        </div>

        {/* Immediate Persistent Action Tiles */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={onOpenAdmission}
            className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 p-4 text-left transition group"
          >
            <UserPlus className="h-5 w-5 text-emerald-500 mb-3" />
            <p className="font-display text-sm font-semibold">Add Student</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              6-step walk-in admission, seat & fee receipt
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] hover:border-zinc-400 dark:hover:border-zinc-600 p-4 text-left transition"
          >
            <CreditCard className="h-5 w-5 text-amber-500 mb-3" />
            <p className="font-display text-sm font-semibold">Record Fees</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Collect balances or process membership renewals
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('seats')}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] hover:border-zinc-400 dark:hover:border-zinc-600 p-4 text-left transition"
          >
            <Armchair className="h-5 w-5 text-sky-500 mb-3" />
            <p className="font-display text-sm font-semibold">Assign Seat</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Inspect 50-desk floor plan, add/edit desks, or transfer seats
            </p>
          </button>

          <button
            type="button"
            onClick={onOpenScanner}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] hover:border-zinc-400 dark:hover:border-zinc-600 p-4 text-left transition"
          >
            <QrCode className="h-5 w-5 text-emerald-500 mb-3" />
            <p className="font-display text-sm font-semibold">Scan ID</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Camera QR check-in/out or manual Student ID entry
            </p>
          </button>
        </div>

        {bootstrap.waitlistCount > 0 && (
          <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-sky-500">
                {bootstrap.waitlistCount} student{bootstrap.waitlistCount === 1 ? '' : 's'} waiting on the Desk Waitlist Queue
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">
                Follow up via call or WhatsApp as soon as a desk frees up.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('cms')}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
            >
              Open Waitlist Queue
            </button>
          </div>
        )}

        {/* Pending Online Seat Requests */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">
                Online Admission & Seat Requests ({attentionQueue.pendingRequests.length})
              </h2>
              <p className="text-xs text-zinc-500">
                Requests submitted from the website & admission form awaiting counter verification.
              </p>
            </div>
          </div>

          {attentionQueue.pendingRequests.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">
              No pending online seat requests right now.
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {attentionQueue.pendingRequests.map((item) => (
                <div
                  key={item.request.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-500">
                      <span>{item.request.referenceCode}</span>
                      <span>·</span>
                      <span>Starts {formatDateDisplay(item.request.startDate)}</span>
                      {item.request.requestSource === 'ADMISSION_FORM' && (
                        <>
                          <span>·</span>
                          <span>KYC Form</span>
                        </>
                      )}
                      <span>·</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.request.idVerificationStatus === 'VERIFIED'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : item.request.idVerificationStatus === 'UPLOADED'
                            ? 'bg-sky-500/15 text-sky-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {item.request.idVerificationStatus === 'VERIFIED'
                          ? 'ID Verified'
                          : item.request.idVerificationStatus === 'UPLOADED'
                          ? 'Online ID Uploaded'
                          : 'Offline ID Pending'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-0.5">
                      {item.request.fullName}{' '}
                      <span className="font-mono text-xs text-zinc-500 font-normal">
                        ({item.request.phone})
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.shiftName}
                      {item.request.customSlotLabel ? ` (${item.request.customSlotLabel})` : ''} ·{' '}
                      {item.planName}{' '}
                      {item.seatNumber ? `· Requested Desk #${item.seatNumber}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onReviewRequest(item)}
                    className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold whitespace-nowrap"
                  >
                    Review & Admit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Dues Quick Collect */}
        {attentionQueue.overdueInvoices.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="font-display text-base font-semibold">
                Pending Fee Balances ({attentionQueue.overdueInvoices.length})
              </h2>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {attentionQueue.overdueInvoices.slice(0, 6).map((item) => (
                <div
                  key={item.invoice.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => onOpenStudent(item.invoice.studentId)}
                      className="text-sm font-semibold hover:underline text-left"
                    >
                      {item.studentName}
                    </button>
                    <p className="text-xs text-zinc-500 font-mono">
                      {item.studentCode} · {item.invoice.invoiceNumber}
                      {item.seatNumber ? ` · Desk #${item.seatNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-amber-500">
                      {formatINR(item.invoice.balancePaise)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCollectInvoice(
                          item.invoice.id,
                          item.studentName,
                          item.invoice.balancePaise
                        )
                      }
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                    >
                      Collect Fee
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Center Overview</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live occupancy, collections, dues, and operational follow-ups for Gyan Vatika Library.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedShiftId}
            onChange={(e) => onChangeShift(Number(e.target.value))}
            aria-label="Filter availability by shift"
            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#18181B] px-3 text-xs font-medium"
          >
            {bootstrap.shifts
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.displayHours})
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={onOpenAdmission}
            className="inline-flex items-center gap-1.5 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 text-xs font-semibold whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Admit Student
          </button>
        </div>
      </div>

      {/* Clickable KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('seats')}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Total Desks</span>
            <Armchair className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{kpis.totalSeats}</p>
          <p className="mt-1 text-[11px] text-emerald-500 font-mono">
            {kpis.selectedShiftAvailable} free in selected shift
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Students Inside Now</span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{kpis.insideNow}</p>
          <p className="mt-1 text-[11px] text-zinc-500">Open QR sessions</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Today&apos;s Collection</span>
            <IndianRupee className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-500">
            {formatINR(kpis.todayCollectionPaise)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 font-mono">
            Month: {formatINR(kpis.monthlyRevenuePaise)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('students', { studentFilter: 'OVERDUE_FEES' })}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Pending Dues</span>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-500">
            {formatINR(kpis.pendingDuesPaise)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {attentionQueue.overdueInvoices.length} unpaid/partial invoices
          </p>
        </button>
      </div>

      {/* Monthly Income, Expenses, Net Cash Profit */}
      <div className="grid sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left"
        >
          <p className="text-xs text-zinc-500">Monthly Collected Revenue</p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
            {formatINR(kpis.monthlyRevenuePaise)}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('expenses')}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 text-left"
        >
          <p className="text-xs text-zinc-500">Monthly Expenses</p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-rose-500">
            {formatINR(kpis.monthlyExpensesPaise)}
          </p>
        </button>
        <div
          title={kpis.profitBasisNote}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Net Cash Surplus</p>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-emerald-500">
            {formatINR(kpis.netProfitPaise)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 line-clamp-2">{kpis.profitBasisNote}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5">
          <h2 className="font-display text-sm font-semibold mb-4">
            Monthly Income vs Expenses (INR)
          </h2>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.monthlyIncomeVsExpenses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="income" name="Collected (INR)" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses (INR)" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5">
          <h2 className="font-display text-sm font-semibold mb-4">
            Shift-Wise Seat Occupancy Today
          </h2>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.shiftOccupancy}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" opacity={0.35} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="occupied" name="Occupied" stackId="a" fill="#F43F5E" />
                <Bar
                  dataKey="available"
                  name="Available"
                  stackId="a"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Needs Attention Queue */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Needs Attention</h2>
          <span className="font-mono text-xs text-zinc-500">
            {attentionQueue.pendingRequests.length +
              attentionQueue.expiringMemberships.length +
              attentionQueue.overdueInvoices.length +
              attentionQueue.openTickets.length}{' '}
            items
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Online Requests */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-emerald-500" />
                Pending Admissions ({attentionQueue.pendingRequests.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('reception')}
                className="text-emerald-500 inline-flex items-center gap-1"
              >
                Open <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {attentionQueue.pendingRequests.slice(0, 3).map((r) => (
              <div
                key={r.request.id}
                className="flex items-center justify-between text-xs py-1.5 border-t border-zinc-200/70 dark:border-zinc-800"
              >
                <span>
                  {r.request.fullName} · {r.shiftName}
                </span>
                <button
                  type="button"
                  onClick={() => onReviewRequest(r)}
                  className="text-emerald-500 font-medium"
                >
                  Review
                </button>
              </div>
            ))}
            {attentionQueue.pendingRequests.length === 0 && (
              <p className="text-xs text-zinc-500">All online enquiries processed.</p>
            )}
          </div>

          {/* Expiring / Grace Memberships */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Expiring & Grace ({attentionQueue.expiringMemberships.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('students', { studentFilter: 'EXPIRING_3D' })}
                className="text-amber-500 inline-flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {attentionQueue.expiringMemberships.slice(0, 3).map((m) => (
              <div
                key={m.membership.id}
                className="flex items-center justify-between text-xs py-1.5 border-t border-zinc-200/70 dark:border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => onOpenStudent(m.studentId)}
                  className="hover:underline text-left"
                >
                  {m.studentName} · {m.shiftName}
                </button>
                <span className="font-mono text-amber-500">
                  {formatDateDisplay(m.membership.endDate)}
                </span>
              </div>
            ))}
            {attentionQueue.expiringMemberships.length === 0 && (
              <p className="text-xs text-zinc-500">No memberships expiring in 3 days.</p>
            )}
          </div>

          {/* Overdue Invoices */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-rose-500" />
                Unpaid / Partial Dues ({attentionQueue.overdueInvoices.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="text-rose-500 inline-flex items-center gap-1"
              >
                Ledger <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {attentionQueue.overdueInvoices.slice(0, 3).map((inv) => (
              <div
                key={inv.invoice.id}
                className="flex items-center justify-between text-xs py-1.5 border-t border-zinc-200/70 dark:border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => onOpenStudent(inv.invoice.studentId)}
                  className="hover:underline text-left"
                >
                  {inv.studentName}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onCollectInvoice(
                      inv.invoice.id,
                      inv.studentName,
                      inv.invoice.balancePaise
                    )
                  }
                  className="font-mono text-rose-500 font-semibold"
                >
                  {formatINR(inv.invoice.balancePaise)}
                </button>
              </div>
            ))}
            {attentionQueue.overdueInvoices.length === 0 && (
              <p className="text-xs text-zinc-500">Zero pending balances.</p>
            )}
          </div>

          {/* Open Support Tickets */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <LifeBuoy className="h-3.5 w-3.5 text-sky-500" />
                Open Helpdesk Tickets ({attentionQueue.openTickets.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('tickets')}
                className="text-sky-500 inline-flex items-center gap-1"
              >
                Helpdesk <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {attentionQueue.openTickets.slice(0, 3).map((t) => (
              <div
                key={t.ticket.id}
                className="flex items-center justify-between text-xs py-1.5 border-t border-zinc-200/70 dark:border-zinc-800"
              >
                <span className="truncate pr-2">
                  {t.studentName}: {t.ticket.subject}
                </span>
                <span className="font-mono text-[11px] text-sky-500">{t.ticket.status}</span>
              </div>
            ))}
            {attentionQueue.openTickets.length === 0 && (
              <p className="text-xs text-zinc-500">No open helpdesk tickets.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  BookOpen,
  CalendarDays,
  Crosshair,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Lock,
  MessageSquare,
  Plus,
  Quote,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addDaysDateStr,
  buildWhatsAppLink,
  formatDateDisplay,
  formatDateTimeIST,
  formatINR,
  todayIST,
} from '@/src/lib/format';
import { GALLERY_PHOTOS } from '@/src/lib/media';
import type {
  ExamCountdownItem,
  FacilityItem,
  FaqItem,
  NoticeItem,
  ReviewItem,
} from '@/src/types/library';
import {
  adminApiFetch,
  type AdminTicketItem,
  type AuditEventItem,
  type BooksPayload,
  type BootstrapPayload,
  type CmsPayload,
  type FinancePayload,
  type SeatsPayload,
  type StudentSummaryRow,
} from './admin-types';

export function BookLendingSection({ token }: { token: string }) {
  const [data, setData] = useState<BooksPayload | null>(null);
  const [students, setStudents] = useState<StudentSummaryRow[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Literature');
  const [shelfLocation, setShelfLocation] = useState('Tree Shelf');
  const [copyCount, setCopyCount] = useState('1');

  const [issueCopyId, setIssueCopyId] = useState<number | ''>('');
  const [issueStudentId, setIssueStudentId] = useState<number | ''>('');
  const [issueDueDate, setIssueDueDate] = useState(addDaysDateStr(todayIST(), 14));

  const load = useCallback(async () => {
    try {
      const [bRes, sRes] = await Promise.all([
        adminApiFetch<BooksPayload>(token, '/api/admin/books'),
        adminApiFetch<{ students: StudentSummaryRow[] }>(token, '/api/admin/students'),
      ]);
      setData(bRes);
      setStudents(sRes.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load books.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApiFetch<BooksPayload>(token, '/api/admin/books'),
      adminApiFetch<{ students: StudentSummaryRow[] }>(token, '/api/admin/students'),
    ])
      .then(([bRes, sRes]) => {
        if (!active) return;
        setData(bRes);
        setStudents(sRes.students);
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'Unable to load books.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/books', {
        method: 'POST',
        body: JSON.stringify({
          action: 'ADD_BOOK',
          title,
          author,
          category,
          shelfLocation,
          copyCount: Number(copyCount || 1),
        }),
      });
      toast.success(`Added "${title}" to catalog.`);
      setTitle('');
      setAuthor('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add book.');
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueCopyId || !issueStudentId) return;
    try {
      await adminApiFetch(token, '/api/admin/books', {
        method: 'POST',
        body: JSON.stringify({
          action: 'ISSUE_COPY',
          copyId: Number(issueCopyId),
          studentId: Number(issueStudentId),
          dueDate: issueDueDate,
        }),
      });
      toast.success('Book copy issued.');
      setIssueCopyId('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue copy.');
    }
  };

  const handleReturn = async (loanId: number) => {
    try {
      await adminApiFetch(token, '/api/admin/books', {
        method: 'POST',
        body: JSON.stringify({ action: 'RETURN_COPY', loanId }),
      });
      toast.success('Book marked returned.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not return book.');
    }
  };

  const availableCopies =
    data?.books.flatMap((b) =>
      b.copies
        .filter((c) => c.status === 'AVAILABLE')
        .map((c) => ({ ...c, bookTitle: b.title }))
    ) ?? [];

  const today = todayIST();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Book Lending</h1>
        <p className="text-sm text-zinc-500">
          Track physical reading-room titles, issue copies by barcode/ID, and enforce due dates.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <form
          onSubmit={handleAddBook}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3"
        >
          <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-emerald-500" />
            Add Book & Copies
          </h2>
          <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book Title (e.g. 1984)"
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
            />
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author"
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={shelfLocation}
                onChange={(e) => setShelfLocation(e.target.value)}
                placeholder="Shelf"
                className="flex-1 h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
              />
              <input
                type="number"
                min={1}
                max={20}
                value={copyCount}
                onChange={(e) => setCopyCount(e.target.value)}
                className="w-16 h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold"
          >
            Add to Library Shelf
          </button>
        </form>

        <form
          onSubmit={handleIssue}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3"
        >
          <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-emerald-500" />
            Issue Available Copy
          </h2>
          <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
            <select
              required
              value={issueCopyId}
              onChange={(e) => setIssueCopyId(Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
            >
              <option value="">Select available copy...</option>
              {availableCopies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.copyCode} — {c.bookTitle}
                </option>
              ))}
            </select>
            <select
              required
              value={issueStudentId}
              onChange={(e) => setIssueStudentId(Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
            >
              <option value="">Select student...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.studentCode})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={issueDueDate}
              onChange={(e) => setIssueDueDate(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              Issue Copy
            </button>
          </div>
        </form>
      </div>

      {/* Active & Historical Loans */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-display text-sm font-semibold">Issued & Returned Loans</h2>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data?.loans.map((row) => {
            const isOverdue = row.loan.status === 'ISSUED' && row.loan.dueDate < today;
            return (
              <div
                key={row.loan.id}
                className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {row.bookTitle}{' '}
                    <span className="font-mono text-xs text-zinc-500 font-normal">
                      ({row.copyCode})
                    </span>
                  </p>
                  <p className="text-zinc-500">
                    {row.studentName} ({row.studentCode}) · Due{' '}
                    <span className={isOverdue ? 'text-rose-500 font-semibold' : ''}>
                      {formatDateDisplay(row.loan.dueDate)}
                    </span>
                  </p>
                </div>
                {row.loan.status === 'ISSUED' ? (
                  <button
                    type="button"
                    onClick={() => handleReturn(row.loan.id)}
                    className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-3.5 py-2 font-semibold"
                  >
                    Mark Returned
                  </button>
                ) : (
                  <span className="font-mono text-emerald-500">RETURNED</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Catalog */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3">
        <h2 className="font-display text-sm font-semibold">Catalog ({data?.books.length ?? 0})</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {data?.books.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-1.5"
            >
              <p className="font-semibold text-sm">{b.title}</p>
              <p className="text-zinc-500">
                {b.author} · {b.shelfLocation}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {b.copies.map((c) => (
                  <span
                    key={c.id}
                    className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                      c.status === 'AVAILABLE'
                        ? 'border-emerald-500/40 text-emerald-500'
                        : 'border-amber-500/40 text-amber-500'
                    }`}
                  >
                    {c.copyCode}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpdeskSection({
  token,
  bootstrap,
  onRefreshBootstrap,
}: {
  token: string;
  bootstrap: BootstrapPayload;
  onRefreshBootstrap: () => void;
}) {
  const [tickets, setTickets] = useState<AdminTicketItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [replyByTicket, setReplyByTicket] = useState<Record<number, string>>({});
  const [seatChoices, setSeatChoices] = useState<
    Array<{ seatId: number; seatNumber: number; availability: string }>
  >([]);
  const [transferSeatByTicket, setTransferSeatByTicket] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        adminApiFetch<{ tickets: AdminTicketItem[] }>(token, '/api/admin/tickets'),
        adminApiFetch<SeatsPayload>(
          token,
          `/api/admin/seats?shiftId=${bootstrap.shifts[0]?.id ?? 1}&startDate=${todayIST()}`
        ),
      ]);
      setTickets(tRes.tickets);
      setSeatChoices(
        sRes.availability.seats
          .filter((s) => s.availability === 'AVAILABLE')
          .map((s) => ({
            seatId: s.seatId,
            seatNumber: s.seatNumber,
            availability: s.availability,
          }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load helpdesk.');
    }
  }, [token, bootstrap.shifts]);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApiFetch<{ tickets: AdminTicketItem[] }>(token, '/api/admin/tickets'),
      adminApiFetch<SeatsPayload>(
        token,
        `/api/admin/seats?shiftId=${bootstrap.shifts[0]?.id ?? 1}&startDate=${todayIST()}`
      ),
    ])
      .then(([tRes, sRes]) => {
        if (!active) return;
        setTickets(tRes.tickets);
        setSeatChoices(
          sRes.availability.seats
            .filter((s) => s.availability === 'AVAILABLE')
            .map((s) => ({
              seatId: s.seatId,
              seatNumber: s.seatNumber,
              availability: s.availability,
            }))
        );
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'Unable to load helpdesk.');
      });
    return () => {
      active = false;
    };
  }, [token, bootstrap.shifts]);

  const handleReply = async (ticketId: number) => {
    const msg = (replyByTicket[ticketId] || '').trim();
    if (!msg) return;
    try {
      await adminApiFetch(token, '/api/admin/tickets', {
        method: 'POST',
        body: JSON.stringify({
          action: 'REPLY',
          ticketId,
          message: msg,
          nextStatus: 'IN_PROGRESS',
        }),
      });
      setReplyByTicket((prev) => ({ ...prev, [ticketId]: '' }));
      toast.success('Reply sent to student portal.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send reply.');
    }
  };

  const handleUpdateStatus = async (
    ticketId: number,
    status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'
  ) => {
    try {
      await adminApiFetch(token, '/api/admin/tickets', {
        method: 'POST',
        body: JSON.stringify({ action: 'UPDATE_STATUS', ticketId, status }),
      });
      toast.success(`Ticket marked ${status}.`);
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const handleTransferFromTicket = async (t: AdminTicketItem) => {
    const targetSeatId = transferSeatByTicket[t.id] || t.targetSeatId;
    if (!t.currentMembershipId || !targetSeatId) {
      toast.error('Choose an available target desk first.');
      return;
    }
    try {
      await adminApiFetch(token, '/api/admin/seats', {
        method: 'POST',
        body: JSON.stringify({
          action: 'TRANSFER_SEAT',
          membershipId: t.currentMembershipId,
          targetSeatId,
          effectiveDate: todayIST(),
          ticketId: t.id,
        }),
      });
      toast.success('Seat transferred and ticket resolved.');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seat transfer failed.');
    }
  };

  const visible = tickets.filter((t) => (filter === 'ALL' ? true : t.status === filter));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Helpdesk Tickets</h1>
          <p className="text-sm text-zinc-500">
            Respond to student requests and execute linked seat transfers in one click.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium border ${
                filter === f
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 text-sm text-zinc-500">
            No tickets in this filter.
          </div>
        ) : (
          visible.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-emerald-500">
                    {t.ticketNumber} · {t.category}
                  </span>
                  <h3 className="font-display text-base font-semibold mt-0.5">{t.subject}</h3>
                  <p className="text-zinc-500">
                    {t.studentName} ({t.studentCode})
                    {t.currentSeatNumber ? ` · Current Desk #${t.currentSeatNumber}` : ''}
                  </p>
                </div>

                <select
                  value={t.status}
                  onChange={(e) =>
                    handleUpdateStatus(
                      t.id,
                      e.target.value as 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'
                    )
                  }
                  className="h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 font-mono"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                </select>
              </div>

              {t.category === 'SEAT_CHANGE' &&
                !t.linkedTransferDone &&
                t.currentMembershipId && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-emerald-500 flex items-center gap-1.5">
                      <ArrowRightLeft className="h-4 w-4" />
                      Linked Seat Transfer
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={transferSeatByTicket[t.id] ?? t.targetSeatId ?? ''}
                        onChange={(e) =>
                          setTransferSeatByTicket((prev) => ({
                            ...prev,
                            [t.id]: Number(e.target.value),
                          }))
                        }
                        className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-2.5 font-mono"
                      >
                        <option value="">Choose free desk...</option>
                        {seatChoices.map((s) => (
                          <option key={s.seatId} value={s.seatId}>
                            Desk #{s.seatNumber}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleTransferFromTicket(t)}
                        className="rounded-lg bg-emerald-600 text-white px-3 py-2 font-semibold"
                      >
                        Transfer & Resolve
                      </button>
                    </div>
                  </div>
                )}

              <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-[#09090B]">
                {t.messages.map((m) => (
                  <div key={m.id} className="space-y-0.5">
                    <p className="font-semibold">
                      {m.senderName}{' '}
                      <span className="font-normal text-zinc-500">
                        · {formatDateTimeIST(m.createdAt)}
                      </span>
                    </p>
                    <p className="text-zinc-700 dark:text-zinc-300">{m.message}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyByTicket[t.id] || ''}
                  onChange={(e) =>
                    setReplyByTicket((prev) => ({ ...prev, [t.id]: e.target.value }))
                  }
                  placeholder="Write a reply visible in the student portal..."
                  className="flex-1 h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
                />
                <button
                  type="button"
                  onClick={() => handleReply(t.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 font-semibold"
                >
                  <Send className="h-3.5 w-3.5" />
                  Reply
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ExpensesSection({
  token,
  bootstrap,
  onRefreshBootstrap,
}: {
  token: string;
  bootstrap: BootstrapPayload;
  onRefreshBootstrap: () => void;
}) {
  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';
  const [expenses, setExpenses] = useState<FinancePayload['expenses']>([]);
  const [category, setCategory] = useState<
    'RENT' | 'ELECTRICITY' | 'INTERNET' | 'HOUSEKEEPING' | 'SALARIES' | 'OTHER'
  >('ELECTRICITY');
  const [title, setTitle] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIST());
  const [vendorName, setVendorName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminApiFetch<FinancePayload>(token, '/api/admin/finance');
      setExpenses(res.expenses);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load expenses.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    adminApiFetch<FinancePayload>(token, '/api/admin/finance')
      .then((res) => {
        if (active) setExpenses(res.expenses);
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'Unable to load expenses.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'RECORD_EXPENSE',
          category,
          title,
          amountPaise: Math.round(Number(amountRupees || 0) * 100),
          expenseDate,
          paymentMethod: 'UPI',
          vendorName,
        }),
      });
      toast.success('Expense recorded.');
      setTitle('');
      setAmountRupees('');
      setVendorName('');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add expense.');
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    try {
      await adminApiFetch(token, '/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_EXPENSE', expenseId }),
      });
      toast.success('Expense deleted.');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete expense.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-zinc-500">
          Track rent, electricity, fiber internet, housekeeping, and staff payouts.
        </p>
      </div>

      <form
        onSubmit={handleAddExpense}
        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 grid sm:grid-cols-5 gap-3 text-xs"
      >
        <select
          value={category}
          onChange={(e) =>
            setCategory(
              e.target.value as
                | 'RENT'
                | 'ELECTRICITY'
                | 'INTERNET'
                | 'HOUSEKEEPING'
                | 'SALARIES'
                | 'OTHER'
            )
          }
          className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
        >
          <option value="RENT">Rent</option>
          <option value="ELECTRICITY">Electricity</option>
          <option value="INTERNET">Internet</option>
          <option value="HOUSEKEEPING">Housekeeping</option>
          <option value="SALARIES">Salaries</option>
          <option value="OTHER">Other</option>
        </select>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Description"
          className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
        />
        <input
          type="number"
          min={1}
          required
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
          placeholder="Amount (INR)"
          className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
        />
        <input
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
        />
        <button
          type="submit"
          className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
        >
          Record Expense
        </button>
      </form>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] divide-y divide-zinc-200 dark:divide-zinc-800">
        {expenses.map((ex) => (
          <div key={ex.id} className="p-4 flex items-center justify-between text-xs gap-3">
            <div>
              <p className="text-sm font-semibold">{ex.title}</p>
              <p className="font-mono text-zinc-500">
                {ex.category} · {formatDateDisplay(ex.expenseDate)}
                {ex.vendorName ? ` · ${ex.vendorName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-rose-500 tabular-nums">
                {formatINR(ex.amountPaise)}
              </span>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => handleDeleteExpense(ex.id)}
                  aria-label="Delete expense"
                  className="h-8 w-8 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportsSection({ token }: { token: string }) {
  const [fromDate, setFromDate] = useState(todayIST().slice(0, 7) + '-01');
  const [toDate, setToDate] = useState(todayIST());
  const [downloading, setDownloading] = useState<string | null>(null);

  const datasets = [
    { key: 'collections', title: 'Fee Collections & Receipts', desc: 'All posted receipts with UTR/mode' },
    { key: 'dues', title: 'Pending Dues & Balances', desc: 'Open partial or unpaid student invoices' },
    { key: 'students', title: 'Student Roster & Seats', desc: 'Members, desk numbers, shifts & expiry' },
    { key: 'attendance', title: 'Attendance Register', desc: 'Check-in/out logs & study minutes' },
    { key: 'expenses', title: 'Expense Ledger', desc: 'Center operational expenses by category' },
    { key: 'monthly_summary', title: 'Monthly Cash Summary', desc: 'Collected vs Expenses vs Net Cash' },
  ];

  const handleDownload = async (dataset: string, format: 'csv' | 'xlsx') => {
    setDownloading(`${dataset}-${format}`);
    try {
      const res = await fetch(
        `/api/admin/export?dataset=${dataset}&format=${format}&from=${fromDate}&to=${toDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gyan-vatika-${dataset}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${dataset}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to export report.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports & Exports</h1>
          <p className="text-sm text-zinc-500">
            Filter by date range and export clean CSV or Excel (.xlsx) sheets.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#18181B] px-3 font-mono"
          />
          <span className="text-zinc-500">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#18181B] px-3 font-mono"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {datasets.map((d) => (
          <div
            key={d.key}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <FileSpreadsheet className="h-5 w-5 text-emerald-500 mb-2" />
              <h3 className="font-display text-sm font-semibold">{d.title}</h3>
              <p className="text-xs text-zinc-500 mt-1">{d.desc}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={downloading === `${d.key}-csv`}
                onClick={() => handleDownload(d.key, 'csv')}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                type="button"
                disabled={downloading === `${d.key}-xlsx`}
                onClick={() => handleDownload(d.key, 'xlsx')}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2 text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebsiteCmsSection({
  token,
  bootstrap,
  onRefreshBootstrap,
}: {
  token: string;
  bootstrap: BootstrapPayload;
  onRefreshBootstrap: () => void;
}) {
  const [cms, setCms] = useState<CmsPayload | null>(null);
  const [heroHeadline, setHeroHeadline] = useState('');
  const [heroSubheadline, setHeroSubheadline] = useState('');
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [exams, setExams] = useState<ExamCountdownItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<
    NonNullable<NonNullable<CmsPayload['draft']>['galleryJson']['photos']>
  >([]);
  const [shiftsEdit, setShiftsEdit] = useState<CmsPayload['shifts']>([]);
  const [plansEdit, setPlansEdit] = useState<CmsPayload['plans']>([]);
  const [saving, setSaving] = useState(false);

  // Achiever Form
  const [editingAchieverId, setEditingAchieverId] = useState<number | null>(null);
  const [achName, setAchName] = useState('');
  const [achExam, setAchExam] = useState('');
  const [achRank, setAchRank] = useState('');
  const [achYear, setAchYear] = useState('2026');
  const [achPhotoUrl, setAchPhotoUrl] = useState('');
  const [achQuote, setAchQuote] = useState('');
  const [achPhotoProcessing, setAchPhotoProcessing] = useState(false);
  const achPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Vlog Form
  const [editingVlogId, setEditingVlogId] = useState<number | null>(null);
  const [vlogTitle, setVlogTitle] = useState('');
  const [vlogType, setVlogType] = useState<'YOUTUBE' | 'LOCAL'>('YOUTUBE');
  const [vlogUrl, setVlogUrl] = useState('');
  const [vlogDuration, setVlogDuration] = useState('03:00');
  const [vlogDesc, setVlogDesc] = useState('');

  // Event Form
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evCategory, setEvCategory] = useState<'Festivals' | 'Picnic & Camps' | 'Student Meetups'>('Festivals');
  const [evDate, setEvDate] = useState(todayIST());
  const [evDesc, setEvDesc] = useState('');
  const [evMedia, setEvMedia] = useState('/assets/aistudio/unnamed9_31154063.jpg');

  // Add Shift Form
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftHours, setNewShiftHours] = useState('06:00 AM - 09:00 AM');
  const [newShiftStartMin, setNewShiftStartMin] = useState('360');
  const [newShiftEndMin, setNewShiftEndMin] = useState('540');
  const [newShiftFeeRupees, setNewShiftFeeRupees] = useState('500');
  const [newShiftFlexible, setNewShiftFlexible] = useState(false);

  const defaultGalleryPhotos = () =>
    GALLERY_PHOTOS.map((p) => ({
      id: p.id,
      originalFilename: p.originalFilename,
      src: p.src,
      category: p.category,
      title: p.title,
      caption: p.caption,
      alt: p.alt,
      focalPoint: p.focalPoint,
    }));

  const load = useCallback(async () => {
    try {
      const res = await adminApiFetch<CmsPayload>(token, '/api/admin/cms');
      setCms(res);
      if (res.draft) {
        setHeroHeadline(res.draft.heroHeadline);
        setHeroSubheadline(res.draft.heroSubheadline);
        setFacilities(res.draft.facilitiesJson || []);
        setNotices(res.draft.noticesJson || []);
        setExams(res.draft.examCountdownsJson || []);
        setFaqs(res.draft.faqsJson || []);
        setReviews(res.draft.reviewsJson || []);
        setGalleryPhotos(
          res.draft.galleryJson?.photos?.length
            ? res.draft.galleryJson.photos
            : defaultGalleryPhotos()
        );
      }
      setShiftsEdit(res.shifts);
      setPlansEdit(res.plans);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load website content.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    adminApiFetch<CmsPayload>(token, '/api/admin/cms')
      .then((res) => {
        if (!active) return;
        setCms(res);
        if (res.draft) {
          setHeroHeadline(res.draft.heroHeadline);
          setHeroSubheadline(res.draft.heroSubheadline);
          setFacilities(res.draft.facilitiesJson || []);
          setNotices(res.draft.noticesJson || []);
          setExams(res.draft.examCountdownsJson || []);
          setFaqs(res.draft.faqsJson || []);
          setReviews(res.draft.reviewsJson || []);
          setGalleryPhotos(
            res.draft.galleryJson?.photos?.length
              ? res.draft.galleryJson.photos
              : defaultGalleryPhotos()
          );
        }
        setShiftsEdit(res.shifts);
        setPlansEdit(res.plans);
      })
      .catch((e) => {
        if (active) toast.error(e instanceof Error ? e.message : 'Unable to load website content.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'SAVE_DRAFT',
          heroHeadline,
          heroSubheadline,
          facilitiesJson: facilities,
          galleryJson: {
            ...(cms?.draft?.galleryJson ?? {}),
            photos: galleryPhotos,
          },
          reviewsJson: reviews,
          noticesJson: notices,
          examCountdownsJson: exams,
          faqsJson: faqs,
        }),
      });
      toast.success('Draft saved. Preview at /?preview=1 before publishing.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ action: 'PUBLISH_CMS' }),
      });
      toast.success('Website updates published live!');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to publish.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePricing = async () => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPDATE_PLANS_SHIFTS',
          shifts: shiftsEdit.map((s) => ({
            id: s.id,
            name: s.name,
            displayHours: s.displayHours,
            startMinute: s.startMinute,
            endMinute: s.endMinute,
            monthlyFeePaise: s.monthlyFeePaise,
            isActive: s.isActive,
          })),
          plans: plansEdit.map((p) => ({
            id: p.id,
            name: p.name,
            discountPercent: p.discountPercent,
            description: p.description,
            isActive: p.isActive,
          })),
        }),
      });
      toast.success('Updated shift fees and plans (existing invoices preserved).');
      await load();
      onRefreshBootstrap();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Only SUPER_ADMIN can edit pricing.');
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'ADD_SHIFT',
          name: newShiftName.trim(),
          displayHours: newShiftHours.trim(),
          startMinute: Number(newShiftStartMin || 540),
          endMinute: Number(newShiftEndMin || 900),
          monthlyFeePaise: Math.round(Number(newShiftFeeRupees || 0) * 100),
          isFlexible: newShiftFlexible,
        }),
      });
      toast.success(`Added shift ${newShiftName.trim()}.`);
      setNewShiftName('');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add shift.');
    }
  };

  const handleDeleteShift = async (id: number) => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_SHIFT', id }),
      });
      toast.success('Deleted shift.');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete shift.');
    }
  };

  const getAchieverInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'GV';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const compressAchieverPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, or WebP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Source image is too large. Keep file under 10 MB.');
      return;
    }
    setAchPhotoProcessing(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const maxDim = 480;
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context unavailable'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } catch (err) {
            reject(err);
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Unable to read image file.'));
        };
        img.src = objectUrl;
      });
      setAchPhotoUrl(dataUrl);
      toast.success('Achiever photo ready.');
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string' && reader.result.length <= 1_400_000) {
          setAchPhotoUrl(reader.result);
          toast.success('Achiever photo loaded.');
        } else {
          toast.error('Could not compress image. Try a smaller photo or paste an image URL.');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setAchPhotoProcessing(false);
    }
  };

  const resetAchieverForm = () => {
    setEditingAchieverId(null);
    setAchName('');
    setAchExam('');
    setAchRank('');
    setAchYear('2026');
    setAchPhotoUrl('');
    setAchQuote('');
    if (achPhotoInputRef.current) {
      achPhotoInputRef.current.value = '';
    }
  };

  const handleSaveAchiever = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanPhotoUrl = achPhotoUrl.trim();
      if (editingAchieverId) {
        await adminApiFetch(token, `/api/admin/cms/achievers/${editingAchieverId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: achName.trim(),
            examCleared: achExam.trim(),
            postOrRank: achRank.trim(),
            selectionYear: achYear.trim() || '2026',
            photoUrl: cleanPhotoUrl,
            quote: achQuote.trim(),
            isPublished: true,
          }),
        });
        toast.success('Updated achiever.');
      } else {
        await adminApiFetch(token, '/api/admin/cms', {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPSERT_ACHIEVER',
            fullName: achName.trim(),
            examCleared: achExam.trim(),
            postOrRank: achRank.trim(),
            selectionYear: achYear.trim() || '2026',
            photoUrl: cleanPhotoUrl,
            quote: achQuote.trim(),
            isPublished: true,
          }),
        });
        toast.success('Added student to Hall of Fame.');
      }
      resetAchieverForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save achiever.');
    }
  };

  const handleDeleteAchiever = async (id: number) => {
    try {
      await adminApiFetch(token, `/api/admin/cms/achievers/${id}`, {
        method: 'DELETE',
      });
      if (editingAchieverId === id) resetAchieverForm();
      toast.success('Removed achiever.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete achiever.');
    }
  };

  const resetVlogForm = () => {
    setEditingVlogId(null);
    setVlogTitle('');
    setVlogType('YOUTUBE');
    setVlogUrl('');
    setVlogDuration('03:00');
    setVlogDesc('');
  };

  const handleSaveVlog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPSERT_VLOG',
          ...(editingVlogId ? { id: editingVlogId } : {}),
          title: vlogTitle.trim(),
          description: vlogDesc.trim(),
          videoType: vlogType,
          videoUrl: vlogUrl.trim(),
          durationLabel: vlogDuration.trim(),
          isPublished: true,
        }),
      });
      toast.success(editingVlogId ? 'Updated vlog.' : 'Added vlog to gallery.');
      resetVlogForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save vlog.');
    }
  };

  const handleDeleteVlog = async (id: number) => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_VLOG', id }),
      });
      if (editingVlogId === id) resetVlogForm();
      toast.success('Deleted vlog.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete vlog.');
    }
  };

  const resetEventForm = () => {
    setEditingEventId(null);
    setEvTitle('');
    setEvCategory('Festivals');
    setEvDate(todayIST());
    setEvDesc('');
    setEvMedia('/assets/aistudio/unnamed9_31154063.jpg');
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPSERT_EVENT',
          ...(editingEventId ? { id: editingEventId } : {}),
          title: evTitle.trim(),
          category: evCategory,
          eventDate: evDate,
          description: evDesc.trim(),
          mediaUrl: evMedia.trim(),
          isPublished: true,
        }),
      });
      toast.success(editingEventId ? 'Updated event.' : 'Published library event.');
      resetEventForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save event.');
    }
  };

  const handleDeleteEvent = async (id: number) => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_EVENT', id }),
      });
      if (editingEventId === id) resetEventForm();
      toast.success('Deleted event.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete event.');
    }
  };

  const handleWaitlistStatus = async (
    id: number,
    status: 'WAITING' | 'CONTACTED' | 'CONVERTED'
  ) => {
    await adminApiFetch(token, '/api/admin/cms', {
      method: 'POST',
      body: JSON.stringify({ action: 'UPDATE_WAITLIST_STATUS', id, status }),
    });
    toast.success(`Waitlist entry marked ${status}.`);
    await load();
    onRefreshBootstrap();
  };

  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Website Content, Community & Pricing</h1>
          <p className="text-sm text-zinc-500">
            Manage homepage copy, categorized notices, Hall of Fame achievers, vlogs, events, waitlist queue, and shift pricing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/?preview=1"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview Draft
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 text-emerald-500 px-4 py-2 text-xs font-semibold"
          >
            <Save className="h-3.5 w-3.5" />
            Save Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handlePublish}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-semibold"
          >
            <Globe className="h-3.5 w-3.5" />
            Publish Live
          </button>
        </div>
      </div>

      {/* Desk Waitlist Queue */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">
            Desk Waitlist Queue ({cms?.waitlist?.length ?? 0})
          </h2>
        </div>
        {!cms?.waitlist?.length ? (
          <p className="text-zinc-500">No students currently waiting on the seat waitlist.</p>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cms.waitlist.map((w) => (
              <div key={w.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {w.fullName}{' '}
                    <span className="font-mono text-xs text-zinc-500 font-normal">({w.phone})</span>
                  </p>
                  <p className="text-zinc-500">
                    {w.shiftName || 'Any Shift'} · Preferred {formatDateDisplay(w.preferredDate)} · {w.examTarget}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={buildWhatsAppLink(
                      w.whatsappNumber || w.phone,
                      `Namaste ${w.fullName}, a study desk is now opening up at Gyan Vatika Library for ${w.shiftName || 'your preferred shift'}. Reply or visit reception to confirm.`
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 text-emerald-500 px-2.5 py-1.5 font-medium"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                  <select
                    value={w.status}
                    onChange={(e) =>
                      handleWaitlistStatus(
                        w.id,
                        e.target.value as 'WAITING' | 'CONTACTED' | 'CONVERTED'
                      )
                    }
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
                  >
                    <option value="WAITING">WAITING</option>
                    <option value="CONTACTED">CONTACTED</option>
                    <option value="CONVERTED">CONVERTED</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hero Copy */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <h2 className="font-display text-sm font-semibold">Hero Headline & Intro</h2>
        <input
          type="text"
          value={heroHeadline}
          onChange={(e) => setHeroHeadline(e.target.value)}
          className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-medium"
        />
        <textarea
          rows={2}
          value={heroSubheadline}
          onChange={(e) => setHeroSubheadline(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent p-3 text-xs"
        />
      </div>

      {/* Categorized & Pinned Notices */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">
            Library Notices (Categorized & Pin Support)
          </h2>
          <button
            type="button"
            onClick={() =>
              setNotices((prev) => [
                ...prev,
                {
                  id: `n-${Date.now()}`,
                  title: 'New Notice',
                  body: 'Details...',
                  category: 'General',
                  isPinned: false,
                  publishDate: todayIST(),
                  expiryDate: addDaysDateStr(todayIST(), 30),
                },
              ])
            }
            className="inline-flex items-center gap-1 text-emerald-500 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Notice
          </button>
        </div>
        {notices.map((n, idx) => (
          <div
            key={n.id}
            className="grid sm:grid-cols-6 gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 items-center"
          >
            <select
              value={n.category || 'General'}
              onChange={(e) =>
                setNotices((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x))
                )
              }
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2"
            >
              <option value="Urgent">Urgent</option>
              <option value="General">General</option>
              <option value="Holiday">Holiday</option>
            </select>
            <input
              type="text"
              value={n.title}
              onChange={(e) =>
                setNotices((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                )
              }
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="text"
              value={n.body}
              onChange={(e) =>
                setNotices((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x))
                )
              }
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <label className="flex items-center gap-1.5 px-1">
              <input
                type="checkbox"
                checked={Boolean(n.isPinned)}
                onChange={(e) =>
                  setNotices((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, isPinned: e.target.checked } : x))
                  )
                }
              />
              Pinned
            </label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={n.expiryDate}
                onChange={(e) =>
                  setNotices((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, expiryDate: e.target.value } : x))
                  )
                }
                className="flex-1 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setNotices((prev) => prev.filter((_, i) => i !== idx))}
                className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Hall of Fame Achievers */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <Award className="h-4 w-4 text-amber-500" />
            Hall of Fame · Exam Achievers ({cms?.achievers?.length ?? 0})
          </h2>
          {editingAchieverId && (
            <button
              type="button"
              onClick={resetAchieverForm}
              className="text-zinc-500 hover:underline"
            >
              Cancel Edit
            </button>
          )}
        </div>
        <form onSubmit={handleSaveAchiever} className="grid sm:grid-cols-5 gap-2">
          <input
            type="text"
            required
            value={achName}
            onChange={(e) => setAchName(e.target.value)}
            placeholder="Student Name"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
          />
          <input
            type="text"
            required
            value={achExam}
            onChange={(e) => setAchExam(e.target.value)}
            placeholder="Exam (e.g. SSC CGL)"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
          />
          <input
            type="text"
            value={achRank}
            onChange={(e) => setAchRank(e.target.value)}
            placeholder="Post / Rank"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
          />
          <input
            type="text"
            value={achYear}
            onChange={(e) => setAchYear(e.target.value)}
            placeholder="Year"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
          />
          <button
            type="submit"
            disabled={achPhotoProcessing}
            className="h-9 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-60"
          >
            {editingAchieverId ? 'Update Achiever' : 'Add Achiever'}
          </button>

          <div className="sm:col-span-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-2.5">
            <div className="h-12 w-12 rounded-full overflow-hidden border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0">
              {achPhotoUrl.trim() ? (
                <img
                  src={achPhotoUrl.trim()}
                  alt={achName ? `${achName} preview` : 'Achiever preview'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {getAchieverInitials(achName)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] px-3 h-9 cursor-pointer font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <Upload className="h-3.5 w-3.5 text-emerald-500" />
                {achPhotoProcessing ? 'Processing...' : 'Upload Student Photo'}
                <input
                  ref={achPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void compressAchieverPhoto(file);
                    }
                  }}
                  className="sr-only"
                />
              </label>
              <input
                type="text"
                value={achPhotoUrl}
                onChange={(e) => setAchPhotoUrl(e.target.value)}
                placeholder="Or paste photo URL (https://... or /assets/...)"
                className="flex-1 min-w-[200px] h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2.5 font-mono"
              />
              {achPhotoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setAchPhotoUrl('');
                    if (achPhotoInputRef.current) achPhotoInputRef.current.value = '';
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 h-9 text-zinc-500 hover:text-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <input
            type="text"
            value={achQuote}
            onChange={(e) => setAchQuote(e.target.value)}
            placeholder="Short quote about studying at Gyan Vatika..."
            className="sm:col-span-5 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
          />
        </form>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {cms?.achievers?.map((a) => (
            <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full overflow-hidden border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0">
                  {a.photoUrl ? (
                    <img
                      src={a.photoUrl}
                      alt={a.fullName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {getAchieverInitials(a.fullName)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {a.fullName} · {a.examCleared} ({a.selectionYear})
                  </p>
                  <p className="text-zinc-500 truncate">
                    {a.postOrRank} {a.quote ? `— "${a.quote}"` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAchieverId(a.id);
                    setAchName(a.fullName);
                    setAchExam(a.examCleared);
                    setAchRank(a.postOrRank);
                    setAchYear(a.selectionYear);
                    setAchPhotoUrl(a.photoUrl || '');
                    setAchQuote(a.quote);
                    if (achPhotoInputRef.current) achPhotoInputRef.current.value = '';
                  }}
                  className="inline-flex items-center gap-1 text-emerald-500 hover:underline"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAchiever(a.id)}
                  className="text-rose-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vlogs & Events Managers */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <Video className="h-4 w-4 text-emerald-500" />
              Vlogs & YouTube Embeds ({cms?.vlogs?.length ?? 0})
            </h2>
            {editingVlogId && (
              <button
                type="button"
                onClick={resetVlogForm}
                className="text-zinc-500 hover:underline"
              >
                Cancel Edit
              </button>
            )}
          </div>
          <form onSubmit={handleSaveVlog} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={vlogTitle}
                onChange={(e) => setVlogTitle(e.target.value)}
                placeholder="Vlog Title"
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
              />
              <select
                value={vlogType}
                onChange={(e) => setVlogType(e.target.value as 'YOUTUBE' | 'LOCAL')}
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2"
              >
                <option value="YOUTUBE">YouTube Link</option>
                <option value="LOCAL">Local Video Path</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={vlogUrl}
                onChange={(e) => setVlogUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or /assets/..."
                className="col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
              <input
                type="text"
                value={vlogDuration}
                onChange={(e) => setVlogDuration(e.target.value)}
                placeholder="02:30"
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
            <input
              type="text"
              value={vlogDesc}
              onChange={(e) => setVlogDesc(e.target.value)}
              placeholder="Short caption"
              className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 text-white px-3.5 py-2 font-semibold"
            >
              {editingVlogId ? 'Update Vlog' : 'Add Vlog'}
            </button>
          </form>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cms?.vlogs?.map((v) => (
              <div key={v.id} className="py-2 flex items-center justify-between gap-2">
                <div className="truncate">
                  <span className="font-semibold">{v.title}</span>{' '}
                  <span className="font-mono text-zinc-500">({v.videoType})</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVlogId(v.id);
                      setVlogTitle(v.title);
                      setVlogType(v.videoType === 'LOCAL' ? 'LOCAL' : 'YOUTUBE');
                      setVlogUrl(v.videoUrl);
                      setVlogDuration(v.durationLabel || '');
                      setVlogDesc(v.description || '');
                    }}
                    className="inline-flex items-center gap-1 text-emerald-500 hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteVlog(v.id)}
                    className="text-rose-500 shrink-0"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-emerald-500" />
              Library Events & Camps ({cms?.events?.length ?? 0})
            </h2>
            {editingEventId && (
              <button
                type="button"
                onClick={resetEventForm}
                className="text-zinc-500 hover:underline"
              >
                Cancel Edit
              </button>
            )}
          </div>
          <form onSubmit={handleSaveEvent} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                placeholder="Event Title"
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
              />
              <select
                value={evCategory}
                onChange={(e) =>
                  setEvCategory(
                    e.target.value as 'Festivals' | 'Picnic & Camps' | 'Student Meetups'
                  )
                }
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2"
              >
                <option value="Festivals">Festivals</option>
                <option value="Picnic & Camps">Picnic & Camps</option>
                <option value="Student Meetups">Student Meetups</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={evDate}
                onChange={(e) => setEvDate(e.target.value)}
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
              <input
                type="text"
                value={evMedia}
                onChange={(e) => setEvMedia(e.target.value)}
                placeholder="/assets/aistudio/unnamed9_31154063.jpg"
                className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
            <input
              type="text"
              value={evDesc}
              onChange={(e) => setEvDesc(e.target.value)}
              placeholder="Event summary"
              className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 text-white px-3.5 py-2 font-semibold"
            >
              {editingEventId ? 'Update Event' : 'Add Event'}
            </button>
          </form>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cms?.events?.map((ev) => (
              <div key={ev.id} className="py-2 flex items-center justify-between gap-2">
                <div className="truncate">
                  <span className="font-semibold">{ev.title}</span>{' '}
                  <span className="font-mono text-zinc-500">
                    ({ev.category} · {formatDateDisplay(ev.eventDate)})
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEventId(ev.id);
                      setEvTitle(ev.title);
                      setEvCategory(
                        ev.category as 'Festivals' | 'Picnic & Camps' | 'Student Meetups'
                      );
                      setEvDate(ev.eventDate);
                      setEvDesc(ev.description || '');
                      setEvMedia(ev.mediaUrl || '/assets/aistudio/unnamed9_31154063.jpg');
                    }}
                    className="inline-flex items-center gap-1 text-emerald-500 hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(ev.id)}
                    className="text-rose-500 shrink-0"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Exam Countdowns (Add / Edit / Delete, saved with Save Draft + Publish Live) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">
            Competitive Exam Countdowns ({exams.length})
          </h2>
          <button
            type="button"
            onClick={() =>
              setExams((prev) => [
                ...prev,
                {
                  id: `exam-${Date.now()}`,
                  exam: 'New Exam',
                  eventName: 'Official Exam Date',
                  examDate: addDaysDateStr(todayIST(), 90),
                  confirmed: true,
                  sourceUrl: '',
                  sourceLabel: '',
                },
              ])
            }
            className="inline-flex items-center gap-1 text-emerald-500 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Exam
          </button>
        </div>
        {exams.map((ex, idx) => (
          <div
            key={ex.id}
            className="grid sm:grid-cols-6 gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 items-center"
          >
            <input
              type="text"
              value={ex.exam}
              onChange={(e) =>
                setExams((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, exam: e.target.value } : x))
                )
              }
              placeholder="Exam Name"
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-medium"
            />
            <input
              type="text"
              value={ex.eventName}
              onChange={(e) =>
                setExams((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, eventName: e.target.value } : x))
                )
              }
              placeholder="Exam Stage / Note"
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="date"
              value={ex.examDate}
              onChange={(e) =>
                setExams((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, examDate: e.target.value } : x))
                )
              }
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
            />
            <label className="flex items-center gap-2 px-2">
              <input
                type="checkbox"
                checked={ex.confirmed}
                onChange={(e) =>
                  setExams((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, confirmed: e.target.checked } : x))
                  )
                }
              />
              Confirmed
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                aria-label="Delete exam"
                onClick={() => setExams((prev) => prev.filter((_, i) => i !== idx))}
                className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Gallery Photos (Add / Edit / Delete, saved with Save Draft + Publish Live) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-emerald-500" />
              Gallery Photos ({galleryPhotos.length})
            </h2>
            <p className="text-zinc-500">
              Edit captions, URLs, or add/remove library photos. Click Save Draft then Publish Live above.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setGalleryPhotos((prev) => [
                ...prev,
                {
                  id: `photo-${Date.now()}`,
                  originalFilename: 'library-photo.jpg',
                  src: '/assets/aistudio/unnamed2_f8b3b82b.jpg',
                  category: 'Reading Room',
                  title: 'New Library Photo',
                  caption: 'Quiet reading corner at Gyan Vatika Library.',
                  alt: 'Gyan Vatika Library study hall photo',
                  focalPoint: '50% 45%',
                },
              ])
            }
            className="inline-flex items-center gap-1 text-emerald-500 font-medium shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> Add Photo
          </button>
        </div>
        <div className="space-y-2.5">
          {galleryPhotos.map((ph, idx) => (
            <div
              key={ph.id}
              className="grid sm:grid-cols-12 gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 items-center"
            >
              <input
                type="text"
                value={ph.title}
                onChange={(e) =>
                  setGalleryPhotos((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                  )
                }
                placeholder="Photo Title"
                className="sm:col-span-3 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-medium"
              />
              <select
                value={ph.category}
                onChange={(e) =>
                  setGalleryPhotos((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x))
                  )
                }
                className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2"
              >
                <option value="Reading Room">Reading Room</option>
                <option value="Book details">Book details</option>
                <option value="Around the library">Around the library</option>
              </select>
              <input
                type="text"
                value={ph.src}
                onChange={(e) =>
                  setGalleryPhotos((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, src: e.target.value } : x))
                  )
                }
                placeholder="/assets/aistudio/... or https://..."
                className="sm:col-span-3 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
              <input
                type="text"
                value={ph.caption}
                onChange={(e) =>
                  setGalleryPhotos((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, caption: e.target.value } : x))
                  )
                }
                placeholder="Short caption"
                className="sm:col-span-3 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
              />
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={() => setGalleryPhotos((prev) => prev.filter((_, i) => i !== idx))}
                  className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Verified Student Reviews (Add / Edit / Delete, saved with Save Draft + Publish Live) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <Quote className="h-4 w-4 text-emerald-500" />
            Verified Student Reviews ({reviews.length})
          </h2>
          <button
            type="button"
            onClick={() =>
              setReviews((prev) => [
                ...prev,
                {
                  id: `rev-${Date.now()}`,
                  author: 'Student Name',
                  examOrRole: 'SSC / UPSC Aspirant',
                  quote: 'Peaceful hall, steady Wi-Fi, and helpful desk discipline.',
                  source: 'Google Review',
                  verifiedDate: todayIST().slice(0, 7),
                },
              ])
            }
            className="inline-flex items-center gap-1 text-emerald-500 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Review
          </button>
        </div>
        {reviews.map((rv, idx) => (
          <div
            key={rv.id}
            className="grid sm:grid-cols-12 gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 items-center"
          >
            <input
              type="text"
              value={rv.author}
              onChange={(e) =>
                setReviews((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, author: e.target.value } : x))
                )
              }
              placeholder="Reviewer Name"
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-medium"
            />
            <input
              type="text"
              value={rv.examOrRole}
              onChange={(e) =>
                setReviews((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, examOrRole: e.target.value } : x))
                )
              }
              placeholder="Exam / Role"
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="text"
              value={rv.quote}
              onChange={(e) =>
                setReviews((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, quote: e.target.value } : x))
                )
              }
              placeholder="Review Quote"
              className="sm:col-span-5 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="text"
              value={rv.source}
              onChange={(e) =>
                setReviews((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, source: e.target.value } : x))
                )
              }
              placeholder="Source (e.g. Google Review)"
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <div className="sm:col-span-1 flex justify-end">
              <button
                type="button"
                aria-label="Delete review"
                onClick={() => setReviews((prev) => prev.filter((_, i) => i !== idx))}
                className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">FAQs ({faqs.length})</h2>
          <button
            type="button"
            onClick={() =>
              setFaqs((prev) => [
                ...prev,
                { id: `faq-${Date.now()}`, question: 'New Question?', answer: 'Answer...' },
              ])
            }
            className="inline-flex items-center gap-1 text-emerald-500 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add FAQ
          </button>
        </div>
        {faqs.map((fq, idx) => (
          <div key={fq.id} className="grid sm:grid-cols-11 gap-2 items-center">
            <input
              type="text"
              value={fq.question}
              onChange={(e) =>
                setFaqs((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x))
                )
              }
              className="sm:col-span-5 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="text"
              value={fq.answer}
              onChange={(e) =>
                setFaqs((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x))
                )
              }
              className="sm:col-span-5 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <button
              type="button"
              aria-label="Delete FAQ"
              onClick={() => setFaqs((prev) => prev.filter((_, i) => i !== idx))}
              className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Shift Fees & Plan Discounts (SUPER_ADMIN only) */}
      {isOwner && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold">
                Shifts & Membership Pricing (Owner Only)
              </h2>
              <p className="text-zinc-500">
                Edit, add, activate/pause, or delete unused shifts. Existing student invoices stay preserved.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSavePricing}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 font-semibold"
            >
              Save Shift & Plan Edits
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {shiftsEdit.map((sh, idx) => (
              <div
                key={sh.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={sh.name}
                    onChange={(e) =>
                      setShiftsEdit((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                      )
                    }
                    className="flex-1 h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-medium"
                  />
                  <input
                    type="number"
                    value={Math.round(sh.monthlyFeePaise / 100)}
                    onChange={(e) =>
                      setShiftsEdit((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, monthlyFeePaise: Number(e.target.value || 0) * 100 }
                            : x
                        )
                      )
                    }
                    className="w-24 h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono"
                  />
                </div>
                <input
                  type="text"
                  value={sh.displayHours}
                  onChange={(e) =>
                    setShiftsEdit((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, displayHours: e.target.value } : x))
                    )
                  }
                  className="w-full h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono text-zinc-500"
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={sh.isActive}
                      onChange={(e) =>
                        setShiftsEdit((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, isActive: e.target.checked } : x))
                        )
                      }
                    />
                    Active ({sh.isFlexible ? 'Flexible Pass' : 'Fixed Window'})
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteShift(sh.id)}
                    className="text-rose-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddShift}
            className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3 grid sm:grid-cols-6 gap-2 items-center"
          >
            <input
              type="text"
              required
              value={newShiftName}
              onChange={(e) => setNewShiftName(e.target.value)}
              placeholder="New Shift Name"
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
            />
            <input
              type="text"
              required
              value={newShiftHours}
              onChange={(e) => setNewShiftHours(e.target.value)}
              placeholder="06:00 AM - 09:00 AM"
              className="sm:col-span-2 h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
            />
            <input
              type="number"
              min={300}
              max={1380}
              value={newShiftStartMin}
              onChange={(e) => setNewShiftStartMin(e.target.value)}
              placeholder="Start min (360)"
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
            />
            <input
              type="number"
              min={0}
              value={newShiftFeeRupees}
              onChange={(e) => setNewShiftFeeRupees(e.target.value)}
              placeholder="Fee INR"
              className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-emerald-600 text-white font-semibold"
            >
              + Add Shift
            </button>
            <div className="sm:col-span-6 flex flex-wrap items-center gap-4 text-[11px] text-zinc-500">
              <label className="flex items-center gap-1.5">
                End Minute (from midnight):
                <input
                  type="number"
                  min={360}
                  max={1440}
                  value={newShiftEndMin}
                  onChange={(e) => setNewShiftEndMin(e.target.value)}
                  className="w-20 h-7 rounded border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newShiftFlexible}
                  onChange={(e) => setNewShiftFlexible(e.target.checked)}
                />
                Flexible 2–3 Hr Slot Mode
              </label>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function StaffAuditSection({ token }: { token: string }) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);

  useEffect(() => {
    adminApiFetch<{ events: AuditEventItem[] }>(token, '/api/admin/audit')
      .then((res) => setEvents(res.events))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Unable to load audit trail.'));
  }, [token]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Staff Activity Audit Trail</h1>
        <p className="text-sm text-zinc-500">
          Immutable log of admissions, transfers, attendance corrections, reversals, and CMS updates.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] divide-y divide-zinc-200 dark:divide-zinc-800">
        {events.map((ev) => (
          <div key={ev.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold">
                {ev.action}{' '}
                <span className="font-normal text-zinc-500">by {ev.actorName}</span>
              </p>
              <p className="text-zinc-600 dark:text-zinc-300 mt-0.5">{ev.summary}</p>
            </div>
            <span className="font-mono text-zinc-500">{formatDateTimeIST(ev.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CenterSettingsSection({
  token,
  bootstrap,
  onRefreshBootstrap,
}: {
  token: string;
  bootstrap: BootstrapPayload;
  onRefreshBootstrap: () => void;
}) {
  const [isDemoMode, setIsDemoMode] = useState(bootstrap.center.isDemoMode);
  const [whatsappEnabled, setWhatsappEnabled] = useState(bootstrap.center.whatsappEnabled);
  const [whatsappNumber, setWhatsappNumber] = useState(bootstrap.center.whatsappNumber);
  const [graceDays, setGraceDays] = useState(String(bootstrap.center.gracePeriodDays));
  const [phoneDisplay, setPhoneDisplay] = useState(bootstrap.center.phoneDisplay);
  const [address, setAddress] = useState(bootstrap.center.address);

  // Geo-fencing state
  const [geofenceEnabled, setGeofenceEnabled] = useState(bootstrap.center.geofenceEnabled);
  const [centerLat, setCenterLat] = useState(bootstrap.center.centerLat || '22.8012');
  const [centerLng, setCenterLng] = useState(bootstrap.center.centerLng || '86.1085');
  const [geofenceRadius, setGeofenceRadius] = useState(
    String(bootstrap.center.geofenceRadiusMeters || 150)
  );

  // Admin 4-digit PIN management
  const [newAdminPin, setNewAdminPin] = useState('');

  // Staff Whitelist & Users
  const [staffUsers, setStaffUsers] = useState<CmsPayload['staffUsers']>([]);
  const [staffAccess, setStaffAccess] = useState<CmsPayload['staffAccess']>([]);
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newWhitelistName, setNewWhitelistName] = useState('');
  const [newWhitelistRole, setNewWhitelistRole] = useState<'MANAGER' | 'SUPER_ADMIN'>('MANAGER');

  // Clear Demo Data confirmation state
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);

  const loadCmsMeta = useCallback(() => {
    adminApiFetch<CmsPayload>(token, '/api/admin/cms')
      .then((res) => {
        setStaffUsers(res.staffUsers || []);
        setStaffAccess(res.staffAccess || []);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    loadCmsMeta();
  }, [loadCmsMeta]);

  if (bootstrap.staff.role !== 'SUPER_ADMIN') {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-8 text-sm text-zinc-500">
        Only the Center Owner (SUPER_ADMIN) can change center configuration, security PIN, geo-fence, or staff whitelist.
      </div>
    );
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPDATE_SETTINGS',
          isDemoMode,
          whatsappEnabled,
          whatsappNumber,
          gracePeriodDays: Number(graceDays || 3),
          phoneDisplay,
          address,
          geofenceEnabled,
          centerLat: centerLat.trim(),
          centerLng: centerLng.trim(),
          geofenceRadiusMeters: Number(geofenceRadius || 150),
        }),
      });
      toast.success('Center settings & geo-fence configuration saved.');
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update settings.');
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterLat(pos.coords.latitude.toFixed(6));
        setCenterLng(pos.coords.longitude.toFixed(6));
        toast.success('Captured current GPS coordinates.');
      },
      () => {
        toast.error('Unable to read browser location. Enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/pin', {
        method: 'POST',
        body: JSON.stringify({ action: 'SET_PIN', pin: newAdminPin }),
      });
      toast.success('Enabled 4-digit Admin Security PIN.');
      setNewAdminPin('');
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set PIN.');
    }
  };

  const handleClearPin = async () => {
    try {
      await adminApiFetch(token, '/api/admin/pin', {
        method: 'POST',
        body: JSON.stringify({ action: 'CLEAR_PIN' }),
      });
      toast.success('Disabled Admin Security PIN lock.');
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear PIN.');
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPSERT_STAFF_ACCESS',
          email: newWhitelistEmail.trim().toLowerCase(),
          fullName: newWhitelistName.trim(),
          role: newWhitelistRole,
          isActive: true,
        }),
      });
      toast.success(`Whitelisted ${newWhitelistEmail.trim().toLowerCase()}`);
      setNewWhitelistEmail('');
      setNewWhitelistName('');
      loadCmsMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add staff email.');
    }
  };

  const handleDeleteWhitelist = async (id: number) => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_STAFF_ACCESS', id }),
      });
      toast.success('Removed email from staff whitelist.');
      loadCmsMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to remove staff email.');
    }
  };

  const handleRoleChange = async (
    targetUserId: number,
    role: 'SUPER_ADMIN' | 'MANAGER',
    isActive: boolean
  ) => {
    try {
      await adminApiFetch(token, '/api/admin/cms', {
        method: 'POST',
        body: JSON.stringify({
          action: 'UPDATE_STAFF_ROLE',
          targetUserId,
          role,
          isActive,
        }),
      });
      toast.success('Updated staff permissions.');
      loadCmsMeta();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update staff role.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Center Settings & Security</h1>
        <p className="text-sm text-zinc-500">
          Owner controls for live mode, WhatsApp, GPS geo-fenced attendance, 4-digit Admin PIN, and staff whitelist.
        </p>
      </div>

      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs"
      >
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={isDemoMode}
              onChange={(e) => setIsDemoMode(e.target.checked)}
            />
            Show &ldquo;Demo Center&rdquo; label on public pricing & map
          </label>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
            />
            Enable WhatsApp Fee Reminders
          </label>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={geofenceEnabled}
              onChange={(e) => setGeofenceEnabled(e.target.checked)}
            />
            Enforce GPS Geo-fence for Student QR Check-In
          </label>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-medium mb-1">WhatsApp Number (with 91)</label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="918580103307"
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Grace Period (Days)</label>
            <input
              type="number"
              min={0}
              max={30}
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Public Phone Display</label>
            <input
              type="text"
              value={phoneDisplay}
              onChange={(e) => setPhoneDisplay(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium mb-1">Full Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
          />
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Library GPS Coordinates (for Geo-Fenced Check-In)</span>
            <button
              type="button"
              onClick={handleUseCurrentGps}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <Crosshair className="h-3.5 w-3.5 text-emerald-500" />
              Use Current Location
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-zinc-500">Latitude</label>
              <input
                type="text"
                value={centerLat}
                onChange={(e) => setCenterLat(e.target.value)}
                className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 text-zinc-500">Longitude</label>
              <input
                type="text"
                value={centerLng}
                onChange={(e) => setCenterLng(e.target.value)}
                className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 text-zinc-500">Radius (meters, 30–2000)</label>
              <input
                type="number"
                min={30}
                max={2000}
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(e.target.value)}
                className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 font-semibold"
        >
          Save Center Settings
        </button>
      </form>

      {/* 4-Digit Admin Security PIN */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-500" />
              4-Digit Admin Security PIN Lock
            </h2>
            <p className="text-zinc-500">
              {bootstrap.center.hasAdminPin
                ? 'Active — Staff must enter this 4-digit PIN after Google Sign-In.'
                : 'Disabled — Enable an extra 4-digit counter lock screen on /admin.'}
            </p>
          </div>
          {bootstrap.center.hasAdminPin && (
            <button
              type="button"
              onClick={handleClearPin}
              className="rounded-xl border border-rose-500/40 text-rose-500 px-3.5 py-2 font-semibold hover:bg-rose-500/10"
            >
              Disable PIN Lock
            </button>
          )}
        </div>
        <form onSubmit={handleSetPin} className="flex flex-wrap gap-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            value={newAdminPin}
            onChange={(e) => setNewAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="New 4-digit PIN"
            className="w-44 h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={newAdminPin.length !== 4}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 font-semibold disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {bootstrap.center.hasAdminPin ? 'Change PIN' : 'Enable 4-Digit PIN'}
          </button>
        </form>
      </div>

      {/* Staff Access Whitelist */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs">
        <div>
          <h2 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Staff Google Sign-In Whitelist ({staffAccess.length})
          </h2>
          <p className="text-zinc-500">
            Only emails listed below can access /admin. All other Google accounts receive 403 Access Denied.
          </p>
        </div>

        <form onSubmit={handleAddWhitelist} className="grid sm:grid-cols-4 gap-2">
          <input
            type="email"
            required
            value={newWhitelistEmail}
            onChange={(e) => setNewWhitelistEmail(e.target.value)}
            placeholder="staff@gmail.com"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
          />
          <input
            type="text"
            required
            value={newWhitelistName}
            onChange={(e) => setNewWhitelistName(e.target.value)}
            placeholder="Staff Full Name"
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
          />
          <select
            value={newWhitelistRole}
            onChange={(e) => setNewWhitelistRole(e.target.value as 'MANAGER' | 'SUPER_ADMIN')}
            className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
          >
            <option value="MANAGER">MANAGER</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 text-white font-semibold"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Authorize Email
          </button>
        </form>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {staffAccess.map((entry) => {
            const isSelf =
              entry.email.toLowerCase() === bootstrap.staff.email.toLowerCase();
            return (
              <div
                key={entry.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">{entry.fullName}</p>
                  <p className="font-mono text-zinc-500">
                    {entry.email} · {entry.isActive ? 'ACTIVE' : 'PAUSED'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    disabled={isSelf}
                    value={entry.role}
                    onChange={async (e) => {
                      const role = e.target.value as 'MANAGER' | 'SUPER_ADMIN';
                      await adminApiFetch(token, '/api/admin/cms', {
                        method: 'POST',
                        body: JSON.stringify({
                          action: 'UPSERT_STAFF_ACCESS',
                          email: entry.email,
                          fullName: entry.fullName,
                          role,
                          isActive: entry.isActive,
                        }),
                      });
                      toast.success(`Updated ${entry.email} role to ${role}.`);
                      loadCmsMeta();
                    }}
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono disabled:opacity-60"
                  >
                    <option value="MANAGER">MANAGER</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                  {!isSelf && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminApiFetch(token, '/api/admin/cms', {
                            method: 'POST',
                            body: JSON.stringify({
                              action: 'UPSERT_STAFF_ACCESS',
                              email: entry.email,
                              fullName: entry.fullName,
                              role: entry.role,
                              isActive: !entry.isActive,
                            }),
                          });
                          toast.success(
                            entry.isActive ? `Paused ${entry.email}.` : `Activated ${entry.email}.`
                          );
                          loadCmsMeta();
                        }}
                        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      >
                        {entry.isActive ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWhitelist(entry.id)}
                        className="text-rose-500 hover:underline"
                      >
                        Revoke Access
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {staffUsers.length > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <p className="font-semibold text-zinc-500">Signed-In Staff Accounts</p>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {staffUsers.map((u) => (
                <div key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{u.fullName}</p>
                    <p className="font-mono text-zinc-500">{u.email}</p>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) =>
                      handleRoleChange(u.id, e.target.value as 'SUPER_ADMIN' | 'MANAGER', u.isActive)
                    }
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
                  >
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Clear All Demo Data (SUPER_ADMIN Only) */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Clear All Demo Data (Go-Live Cleanup)
            </h2>
            <p className="text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl">
              Removes seeded demo students (GV-2026-001 to 006), demo pending requests, sample expenses,
              and turns off the &ldquo;Demo Center&rdquo; label. Keeps all 50 study desks, 4 shifts,
              membership plans, CMS content, and staff whitelist intact.
            </p>
          </div>
          {!confirmClearDemo ? (
            <button
              type="button"
              onClick={() => setConfirmClearDemo(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 font-semibold shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All Demo Data
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={clearingDemo}
                onClick={async () => {
                  setClearingDemo(true);
                  try {
                    const res = await adminApiFetch<{
                      ok: boolean;
                      clearedStudents: number;
                      clearedRequests: number;
                      clearedExpenses: number;
                    }>(token, '/api/admin/cms', {
                      method: 'POST',
                      body: JSON.stringify({ action: 'CLEAR_DEMO_DATA' }),
                    });
                    setIsDemoMode(false);
                    setConfirmClearDemo(false);
                    toast.success(
                      `Cleared ${res.clearedStudents} demo students, ${res.clearedRequests} demo requests, and ${res.clearedExpenses} seeded expenses.`
                    );
                    onRefreshBootstrap();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Unable to clear demo data.');
                  } finally {
                    setClearingDemo(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 font-semibold disabled:opacity-50"
              >
                {clearingDemo ? 'Clearing...' : 'Confirm Clear Demo Data'}
              </button>
              <button
                type="button"
                disabled={clearingDemo}
                onClick={() => setConfirmClearDemo(false)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

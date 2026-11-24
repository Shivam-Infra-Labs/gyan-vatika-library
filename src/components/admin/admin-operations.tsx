'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Download,
  Edit3,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SeatAvailabilityDTO } from '@/src/types/library';
import {
  addDaysDateStr,
  addMonthsDateStr,
  buildWhatsAppLink,
  FLEXIBLE_SLOT_PRESETS,
  formatDateDisplay,
  formatDateTimeIST,
  formatINR,
  formatMinute12h,
  formatMinuteRangeLabel,
  todayIST,
} from '@/src/lib/format';
import { downloadPaymentReceiptPdf } from '@/src/lib/pdf-generator';
import { AdminFloorMap } from './admin-floor-map';
import {
  adminApiFetch,
  type AttendanceDeskPayload,
  type BootstrapPayload,
  type FinancePayload,
  type SeatsPayload,
  type StudentSummaryRow,
} from './admin-types';

const HALF_HOUR_OPTIONS: Array<{ minute: number; label: string }> = [];
for (let m = 540; m <= 1260; m += 30) {
  HALF_HOUR_OPTIONS.push({ minute: m, label: formatMinute12h(m) });
}

interface StudentsSectionProps {
  token: string;
  initialFilter: string;
  isOwner?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenAdmission: () => void;
  onOpenStudent: (id: number) => void;
  onRefreshBootstrap?: () => void;
}

export function StudentsSection({
  token,
  initialFilter,
  isOwner = false,
  searchInputRef,
  onOpenAdmission,
  onOpenStudent,
  onRefreshBootstrap,
}: StudentsSectionProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(initialFilter || 'ALL');
  const [rows, setRows] = useState<StudentSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StudentSummaryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadStudents = useCallback(() => {
    adminApiFetch<{ students: StudentSummaryRow[] }>(
      token,
      `/api/admin/students?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`
    )
      .then((res) => {
        setRows(res.students);
        setLoading(false);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Unable to load students.');
        setLoading(false);
      });
  }, [token, query, filter]);

  useEffect(() => {
    let active = true;
    adminApiFetch<{ students: StudentSummaryRow[] }>(
      token,
      `/api/admin/students?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`
    )
      .then((res) => {
        if (!active) return;
        setRows(res.students);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        toast.error(e instanceof Error ? e.message : 'Unable to load students.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, query, filter]);

  const handleConfirmDeleteStudent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'DELETE_STUDENT', studentId: deleteTarget.id }),
      });
      toast.success(`Permanently deleted ${deleteTarget.fullName} (${deleteTarget.studentCode}).`);
      setDeleteTarget(null);
      loadStudents();
      onRefreshBootstrap?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to delete student.');
    } finally {
      setDeleting(false);
    }
  };

  const filters = [
    { key: 'ALL', label: 'All' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'EXPIRING_3D', label: 'Expiring in 3 Days' },
    { key: 'IN_GRACE', label: 'In Grace Period' },
    { key: 'EXPIRED', label: 'Expired' },
    { key: 'OVERDUE_FEES', label: 'Overdue Fees' },
    { key: 'INACTIVE', label: 'Archived' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Student Directory</h1>
          <p className="text-sm text-zinc-500">
            Search members by name, mobile, GV ID, or desk number (press Ctrl/Cmd+K anytime).
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAdmission}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Admit Student
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-3" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, GV-2026-..., or desk #"
            className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#18181B] pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-xl px-3 py-2 text-xs font-medium border transition ${
                filter === f.key
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">No students match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium">Desk / Shift</th>
                  <th className="py-3 px-4 font-medium">Validity & ID</th>
                  <th className="py-3 px-4 font-medium">Fee Balance</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onOpenStudent(s.id)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-sm flex items-center gap-1.5">
                        <span>{s.fullName}</span>
                        {s.isLocked && (
                          <Lock className="h-3.5 w-3.5 text-rose-500" aria-label="PIN Locked" />
                        )}
                      </p>
                      <p className="font-mono text-zinc-500">
                        {s.studentCode} · {s.phone}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono font-medium">
                        {s.seatNumber ? `Desk #${s.seatNumber}` : 'Unassigned'}
                      </p>
                      <p className="text-zinc-500">
                        {s.shiftName || '—'}
                        {s.customSlotLabel ? ` (${s.customSlotLabel})` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`font-mono font-semibold ${
                            s.membershipStatus === 'ACTIVE'
                              ? 'text-emerald-500'
                              : s.membershipStatus === 'EXPIRING_SOON' ||
                                s.membershipStatus === 'IN_GRACE'
                              ? 'text-amber-500'
                              : 'text-rose-500'
                          }`}
                        >
                          {s.membershipStatus}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                            s.idVerificationStatus === 'VERIFIED'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : s.idVerificationStatus === 'UPLOADED'
                              ? 'bg-sky-500/15 text-sky-500'
                              : 'bg-amber-500/15 text-amber-500'
                          }`}
                        >
                          {s.idVerificationStatus === 'VERIFIED'
                            ? 'ID Verified'
                            : s.idVerificationStatus === 'UPLOADED'
                            ? 'Online ID'
                            : 'Offline ID Pending'}
                        </span>
                      </div>
                      <p className="font-mono text-zinc-500 mt-0.5">
                        {s.endDate ? `Ends ${formatDateDisplay(s.endDate)}` : '—'}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {s.balancePaise > 0 ? (
                        <span className="text-amber-500 font-semibold">
                          Due {formatINR(s.balancePaise)}
                        </span>
                      ) : (
                        <span className="text-emerald-500">Paid</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <span className="text-emerald-500 font-medium">Open Profile →</span>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(s);
                            }}
                            aria-label={`Delete ${s.fullName} permanently`}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm permanent student deletion"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-white dark:bg-[#18181B] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-rose-500 font-semibold">
                  SUPER_ADMIN · PERMANENT CASCADE DELETE
                </p>
                <h2 className="font-display text-lg font-bold mt-1">
                  Delete {deleteTarget.fullName}?
                </h2>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              This will permanently remove <span className="font-mono">{deleteTarget.studentCode}</span> along with all memberships, desk allocations, invoices, payment receipts, attendance logs, book loans, and helpdesk tickets in one transaction. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDeleteStudent}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Student Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SeatsSectionProps {
  token: string;
  bootstrap: BootstrapPayload;
  transferTargetMembership: { membershipId: number; currentSeatNumber: number | null } | null;
  onClearTransferTarget: () => void;
  onOpenAdmissionWithSeat: (seatId: number) => void;
  onRefreshBootstrap: () => void;
}

export function SeatsAndBuilderSection({
  token,
  bootstrap,
  transferTargetMembership,
  onClearTransferTarget,
  onOpenAdmissionWithSeat,
  onRefreshBootstrap,
}: SeatsSectionProps) {
  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';
  const [shiftId, setShiftId] = useState(bootstrap.shifts[0]?.id ?? 1);
  const [startDate, setStartDate] = useState(todayIST());
  const [customStartMinute, setCustomStartMinute] = useState(540);
  const [customEndMinute, setCustomEndMinute] = useState(720);
  const [data, setData] = useState<SeatsPayload | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatAvailabilityDTO | null>(null);
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(todayIST());
  const [conflictInfo, setConflictInfo] = useState<{
    message: string;
    window: string;
    alternatives: SeatAvailabilityDTO[];
  } | null>(null);

  // Add / Edit Desk Modal states
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addZone, setAddZone] = useState('Central Aisle');
  const [addPower, setAddPower] = useState(true);
  const [addWindow, setAddWindow] = useState(false);
  const [addAc, setAddAc] = useState(false);
  const [addNotes, setAddNotes] = useState('');

  const [editDesk, setEditDesk] = useState<SeatAvailabilityDTO | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'MAINTENANCE' | 'UNAVAILABLE'>('ACTIVE');
  const [editPower, setEditPower] = useState(true);
  const [editWindow, setEditWindow] = useState(false);
  const [editAc, setEditAc] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  const activeShift = useMemo(
    () => bootstrap.shifts.find((s) => s.id === shiftId),
    [bootstrap.shifts, shiftId]
  );
  const isFlexible = Boolean(activeShift?.isFlexible);

  const load = useCallback(async () => {
    try {
      const flexQs = isFlexible
        ? `&customStartMinute=${customStartMinute}&customEndMinute=${customEndMinute}`
        : '';
      const seatsRes = await adminApiFetch<SeatsPayload>(
        token,
        `/api/admin/seats?shiftId=${shiftId}&startDate=${startDate}${flexQs}`
      );
      setData(seatsRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load desk floor map.');
    }
  }, [token, shiftId, startDate, isFlexible, customStartMinute, customEndMinute]);

  useEffect(() => {
    let active = true;
    const flexQs = isFlexible
      ? `&customStartMinute=${customStartMinute}&customEndMinute=${customEndMinute}`
      : '';
    adminApiFetch<SeatsPayload>(
      token,
      `/api/admin/seats?shiftId=${shiftId}&startDate=${startDate}${flexQs}`
    )
      .then((seatsRes) => {
        if (active) setData(seatsRes);
      })
      .catch((e) => {
        if (active) {
          toast.error(e instanceof Error ? e.message : 'Unable to load desk floor map.');
        }
      });
    return () => {
      active = false;
    };
  }, [token, shiftId, startDate, isFlexible, customStartMinute, customEndMinute]);

  const handleSeatStatusChange = async (
    seatId: number,
    status: 'ACTIVE' | 'MAINTENANCE' | 'UNAVAILABLE'
  ) => {
    try {
      await adminApiFetch(token, '/api/admin/seats', {
        method: 'POST',
        body: JSON.stringify({ action: 'UPDATE_SEAT_STATUS', seatId, status }),
      });
      toast.success(`Desk status updated to ${status}`);
      setSelectedSeat(null);
      await load();
      onRefreshBootstrap();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update desk status.');
    }
  };

  const handleTransferSeat = async (targetSeatId: number) => {
    if (!transferTargetMembership) return;
    setConflictInfo(null);
    try {
      await adminApiFetch(token, '/api/admin/seats', {
        method: 'POST',
        body: JSON.stringify({
          action: 'TRANSFER_SEAT',
          membershipId: transferTargetMembership.membershipId,
          targetSeatId,
          effectiveDate: transferEffectiveDate,
        }),
      });
      toast.success('Seat transferred and seat history preserved.');
      onClearTransferTarget();
      setSelectedSeat(null);
      await load();
      onRefreshBootstrap();
    } catch (err) {
      const e = err as Error & {
        status?: number;
        conflictWindow?: string;
        alternatives?: SeatAvailabilityDTO[];
      };
      if (e.status === 409) {
        setConflictInfo({
          message: e.message,
          window: e.conflictWindow || '',
          alternatives: e.alternatives || [],
        });
      } else {
        toast.error(e.message || 'Transfer failed.');
      }
    }
  };

  const handleAddDesk = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminApiFetch<{ seat: { seatNumber: number } }>(
        token,
        '/api/admin/seats',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'ADD_DESK',
            label: addLabel.trim() || undefined,
            zone: addZone.trim() || 'Central Aisle',
            hasPowerOutlet: addPower,
            nearWindow: addWindow,
            nearAc: addAc,
            notes: addNotes.trim(),
          }),
        }
      );
      toast.success(`Added Desk #${res.seat.seatNumber} to reading hall.`);
      setAddOpen(false);
      setAddLabel('');
      setAddNotes('');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add desk.');
    }
  };

  const handleSaveEditDesk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDesk) return;
    try {
      await adminApiFetch(token, '/api/admin/seats', {
        method: 'POST',
        body: JSON.stringify({
          action: 'EDIT_DESK',
          seatId: editDesk.seatId,
          label: editLabel.trim(),
          zone: editZone.trim(),
          status: editStatus,
          hasPowerOutlet: editPower,
          nearWindow: editWindow,
          nearAc: editAc,
          notes: editNotes.trim(),
        }),
      });
      toast.success(`Updated Desk #${editDesk.seatNumber}.`);
      setEditDesk(null);
      setSelectedSeat(null);
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update desk.');
    }
  };

  const handleDeleteDesk = async (seat: SeatAvailabilityDTO) => {
    try {
      await adminApiFetch(token, '/api/admin/seats', {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE_DESK', seatId: seat.seatId }),
      });
      toast.success(`Deleted vacant Desk #${seat.seatNumber}.`);
      setSelectedSeat(null);
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete desk.');
    }
  };

  const seatOccupants = selectedSeat
    ? data?.assignmentsBySeat.filter((a) => a.allocation.seatId === selectedSeat.seatId) ?? []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Seat Builder & Map</h1>
          <p className="text-sm text-zinc-500">
            {data?.availability.seats.length ?? bootstrap.kpis.totalSeats}-desk architectural floor plan with time-overlap conflict check, desk builder, and dated seat transfers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#18181B] px-3 text-xs font-mono"
          />
          <select
            value={shiftId}
            onChange={(e) => setShiftId(Number(e.target.value))}
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
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Desk
          </button>
        </div>
      </div>

      {isFlexible && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-emerald-500">
            <Clock className="h-4 w-4" />
            <span>Flexible Slot Window: {formatMinuteRangeLabel(customStartMinute, customEndMinute)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FLEXIBLE_SLOT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCustomStartMinute(p.startMinute);
                  setCustomEndMinute(p.endMinute);
                }}
                className={`rounded-lg px-2.5 py-1 font-mono border ${
                  customStartMinute === p.startMinute && customEndMinute === p.endMinute
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                    : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {p.label.replace(' (3 hrs)', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {transferTargetMembership && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4" />
              Seat Transfer Mode Active (Membership #{transferTargetMembership.membershipId}
              {transferTargetMembership.currentSeatNumber
                ? ` · Currently Desk #${transferTargetMembership.currentSeatNumber}`
                : ''}
              )
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Pick the effective date and click any green desk on the floor plan below to transfer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={transferEffectiveDate}
              onChange={(e) => setTransferEffectiveDate(e.target.value)}
              className="h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs font-mono text-white"
            />
            <button
              type="button"
              onClick={onClearTransferTarget}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {conflictInfo && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
          <p className="text-xs font-semibold text-rose-500">{conflictInfo.message}</p>
          <p className="text-xs text-zinc-400">Conflict window: {conflictInfo.window}</p>
          <div className="flex flex-wrap gap-2">
            {conflictInfo.alternatives.map((alt) => (
              <button
                key={alt.seatId}
                type="button"
                onClick={() => handleTransferSeat(alt.seatId)}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-mono text-emerald-400"
              >
                Transfer to Desk #{alt.seatNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3">
              <span className="text-zinc-500">Available</span>
              <p className="font-mono text-lg font-semibold text-emerald-500 tabular-nums">
                {data.availability.summary.available}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3">
              <span className="text-zinc-500">Occupied</span>
              <p className="font-mono text-lg font-semibold text-rose-500 tabular-nums">
                {data.availability.summary.occupied}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3">
              <span className="text-zinc-500">Expiring Soon</span>
              <p className="font-mono text-lg font-semibold text-amber-500 tabular-nums">
                {data.availability.summary.expiringSoon}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3">
              <span className="text-zinc-500">Maint. / Unavailable</span>
              <p className="font-mono text-lg font-semibold tabular-nums">
                {data.availability.summary.unavailable}
              </p>
            </div>
          </div>

          <AdminFloorMap
            room={bootstrap.rooms[0]}
            seats={data.availability.seats}
            assignmentsBySeat={data.assignmentsBySeat}
            selectedSeatId={selectedSeat?.seatId ?? null}
            onSelectSeat={(seat) => {
              if (transferTargetMembership) {
                handleTransferSeat(seat.seatId);
              } else {
                setSelectedSeat(seat);
              }
            }}
          />

          {selectedSeat && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold">
                    {selectedSeat.label} (#{selectedSeat.seatNumber}) · {selectedSeat.zone}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {selectedSeat.availability}
                    {selectedSeat.hasPowerOutlet ? ' · Power Socket' : ''}
                    {selectedSeat.nearWindow ? ' · Window' : ''}
                    {selectedSeat.nearAc ? ' · Near AC' : ''}
                    {selectedSeat.conflictReason ? ` · ${selectedSeat.conflictReason}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSeat.availability === 'AVAILABLE' && (
                    <button
                      type="button"
                      onClick={() => onOpenAdmissionWithSeat(selectedSeat.seatId)}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                    >
                      Admit to Desk #{selectedSeat.seatNumber}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditDesk(selectedSeat);
                      setEditLabel(selectedSeat.label);
                      setEditZone(selectedSeat.zone);
                      setEditStatus(
                        selectedSeat.seatStatus as 'ACTIVE' | 'MAINTENANCE' | 'UNAVAILABLE'
                      );
                      setEditPower(selectedSeat.hasPowerOutlet);
                      setEditWindow(selectedSeat.nearWindow);
                      setEditAc(selectedSeat.nearAc);
                      setEditNotes(selectedSeat.notes || '');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit Desk
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSeatStatusChange(
                        selectedSeat.seatId,
                        selectedSeat.seatStatus === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    {selectedSeat.seatStatus === 'ACTIVE' ? 'Mark Maintenance' : 'Mark Active'}
                  </button>
                  {isOwner && seatOccupants.length === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDesk(selectedSeat)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 text-rose-500 px-3.5 py-2 text-xs font-medium hover:bg-rose-500/10 whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Desk
                    </button>
                  )}
                </div>
              </div>

              {seatOccupants.length > 0 && (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {seatOccupants.map((occ) => (
                    <div
                      key={occ.allocation.id}
                      className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold">
                          {occ.studentName}{' '}
                          <span className="font-mono text-zinc-500">({occ.studentCode})</span>
                        </p>
                        <p className="text-zinc-500">
                          {occ.shiftName} ({occ.allocation.customSlotLabel || occ.shiftHours}) · Until{' '}
                          {formatDateDisplay(occ.allocation.endDate)}
                        </p>
                      </div>
                      <span className="font-mono text-[11px]">{occ.membershipStatus}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Desk Modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setAddOpen(false)}
        >
          <form
            onSubmit={handleAddDesk}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Add New Desk to Reading Hall</h3>
              <button type="button" onClick={() => setAddOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Desk Label (optional)</label>
                <input
                  type="text"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  placeholder="Auto (e.g. Desk #51)"
                  className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Zone</label>
                <select
                  value={addZone}
                  onChange={(e) => setAddZone(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
                >
                  <option value="Central Aisle">Central Aisle</option>
                  <option value="Window Wing">Window Wing</option>
                  <option value="Quiet Corner">Quiet Corner</option>
                  <option value="AC Zone">AC Zone</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addPower}
                  onChange={(e) => setAddPower(e.target.checked)}
                />
                Power Socket
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addWindow}
                  onChange={(e) => setAddWindow(e.target.checked)}
                />
                Near Window
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addAc}
                  onChange={(e) => setAddAc(e.target.checked)}
                />
                Near AC
              </label>
            </div>
            <input
              type="text"
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Optional desk note"
              className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 font-semibold"
            >
              Add Desk to Floor Map
            </button>
          </form>
        </div>
      )}

      {/* Edit Desk Modal */}
      {editDesk && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setEditDesk(null)}
        >
          <form
            onSubmit={handleSaveEditDesk}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">
                Edit Desk #{editDesk.seatNumber}
              </h3>
              <button type="button" onClick={() => setEditDesk(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Label *</label>
                <input
                  type="text"
                  required
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Zone *</label>
                <input
                  type="text"
                  required
                  value={editZone}
                  onChange={(e) => setEditZone(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) =>
                  setEditStatus(e.target.value as 'ACTIVE' | 'MAINTENANCE' | 'UNAVAILABLE')
                }
                className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="UNAVAILABLE">UNAVAILABLE</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editPower}
                  onChange={(e) => setEditPower(e.target.checked)}
                />
                Power Socket
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editWindow}
                  onChange={(e) => setEditWindow(e.target.checked)}
                />
                Near Window
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editAc}
                  onChange={(e) => setEditAc(e.target.checked)}
                />
                Near AC
              </label>
            </div>
            <input
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Desk notes"
              className="w-full h-9 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 font-semibold"
            >
              Save Desk Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface AttendanceSectionProps {
  token: string;
  onOpenScanner: () => void;
  refreshSignal: number;
}

export function AttendanceDeskSection({
  token,
  onOpenScanner,
  refreshSignal,
}: AttendanceSectionProps) {
  const [data, setData] = useState<AttendanceDeskPayload | null>(null);
  const [tab, setTab] = useState<'inside' | 'today' | 'review' | 'all'>('inside');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [editingSession, setEditingSession] = useState<
    AttendanceDeskPayload['insideNow'][0] | null
  >(null);
  const [corrCheckIn, setCorrCheckIn] = useState('');
  const [corrCheckOut, setCorrCheckOut] = useState('');
  const [corrStatus, setCorrStatus] = useState<'OPEN' | 'CLOSED' | 'NEEDS_REVIEW'>('CLOSED');
  const [corrReason, setCorrReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminApiFetch<AttendanceDeskPayload>(token, '/api/admin/attendance');
      setData(res);
      if (res.activeReceptionQr) {
        setSecondsLeft(res.activeReceptionQr.secondsRemaining ?? 60);
        const url = await QRCode.toDataURL(res.activeReceptionQr.payload, {
          width: 260,
          margin: 2,
        });
        setQrDataUrl(url);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load attendance.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    adminApiFetch<AttendanceDeskPayload>(token, '/api/admin/attendance')
      .then(async (res) => {
        if (!active) return;
        setData(res);
        if (res.activeReceptionQr) {
          setSecondsLeft(res.activeReceptionQr.secondsRemaining ?? 60);
          const url = await QRCode.toDataURL(res.activeReceptionQr.payload, {
            width: 260,
            margin: 2,
          });
          if (active) setQrDataUrl(url);
        }
      })
      .catch((e) => {
        if (active) {
          toast.error(e instanceof Error ? e.message : 'Unable to load attendance.');
        }
      });
    return () => {
      active = false;
    };
  }, [token, refreshSignal]);

  // Auto-rotating 60-second timer while Reception QR modal is visible
  useEffect(() => {
    if (!showQrModal) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void load();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showQrModal, load]);

  const handleGenerateReceptionQr = async () => {
    try {
      const res = await adminApiFetch<{
        token: string;
        expiresAt: string;
        secondsRemaining: number;
        payload: string;
      }>(token, '/api/admin/attendance', {
        method: 'POST',
        body: JSON.stringify({ action: 'GENERATE_RECEPTION_QR' }),
      });
      const url = await QRCode.toDataURL(res.payload, { width: 260, margin: 2 });
      setQrDataUrl(url);
      setSecondsLeft(res.secondsRemaining ?? 60);
      setShowQrModal(true);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate Reception QR.');
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession || !corrReason.trim()) {
      toast.error('Reason is required for attendance correction.');
      return;
    }
    try {
      await adminApiFetch(token, '/api/admin/attendance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'MANUAL_CORRECTION',
          sessionId: editingSession.session.id,
          checkInAt: new Date(corrCheckIn).toISOString(),
          checkOutAt: corrCheckOut ? new Date(corrCheckOut).toISOString() : null,
          status: corrStatus,
          reason: corrReason.trim(),
        }),
      });
      toast.success('Attendance corrected and audited.');
      setEditingSession(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save correction.');
    }
  };

  const activeRows =
    tab === 'inside'
      ? data?.insideNow ?? []
      : tab === 'today'
      ? data?.todayRegister ?? []
      : tab === 'review'
      ? data?.needsReview ?? []
      : data?.recentSessions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Attendance Desk</h1>
          <p className="text-sm text-zinc-500">
            Live check-in register, 60-second auto-rotating Reception QR, staff scanner, and audited corrections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateReceptionQr}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
          >
            <QrCode className="h-3.5 w-3.5 text-emerald-500" />
            Show Reception QR
          </button>
          <button
            type="button"
            onClick={onOpenScanner}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-semibold whitespace-nowrap"
          >
            <ScanLine className="h-3.5 w-3.5" />
            Scan Student ID
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'inside', label: `Inside Now (${data?.insideNow.length ?? 0})` },
          { key: 'today', label: `Today's Register (${data?.todayRegister.length ?? 0})` },
          { key: 'review', label: `Needs Review (${data?.needsReview.length ?? 0})` },
          { key: 'all', label: 'Recent Sessions' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key as 'inside' | 'today' | 'review' | 'all')}
            className={`rounded-xl px-3.5 py-2 text-xs font-medium border ${
              tab === t.key
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
        {activeRows.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">No attendance records in this view.</div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {activeRows.map((item) => (
              <div
                key={item.session.id}
                className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {item.studentName}{' '}
                    <span className="font-mono text-xs text-zinc-500 font-normal">
                      ({item.studentCode}
                      {item.seatNumber ? ` · Desk #${item.seatNumber}` : ''})
                    </span>
                  </p>
                  <p className="font-mono text-zinc-500 mt-0.5">
                    In: {formatDateTimeIST(item.session.checkInAt)}
                    {item.session.checkOutAt
                      ? ` · Out: ${formatDateTimeIST(item.session.checkOutAt)} (${item.session.durationMinutes}m)`
                      : ' · Inside'}
                  </p>
                  {item.session.correctionReason && (
                    <p className="text-amber-500 mt-0.5">
                      Corrected: {item.session.correctionReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-zinc-400">
                    {item.session.source} · {item.session.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSession(item);
                      setCorrCheckIn(
                        new Date(item.session.checkInAt).toISOString().slice(0, 16)
                      );
                      setCorrCheckOut(
                        item.session.checkOutAt
                          ? new Date(item.session.checkOutAt).toISOString().slice(0, 16)
                          : ''
                      );
                      setCorrStatus(
                        item.session.status as 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW'
                      );
                      setCorrReason('');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <Edit3 className="h-3 w-3" />
                    Correct
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reception QR Display Modal (60s auto-rotation) */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Reception Check-In QR</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qrDataUrl && (
              <div className="inline-block rounded-2xl bg-white p-3">
                <img src={qrDataUrl} alt="Reception QR" className="h-56 w-56" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 font-mono">
                Token: {data?.activeReceptionQr?.token}
              </p>
              <p className="text-xs font-mono text-emerald-500 font-semibold tabular-nums">
                Auto-rotates in {secondsLeft}s (Anti-proxy HMAC)
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateReceptionQr}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 text-xs font-semibold"
            >
              Refresh QR Now
            </button>
          </div>
        </div>
      )}

      {/* Manual Correction Modal */}
      {editingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setEditingSession(null)}
        >
          <form
            onSubmit={handleSaveCorrection}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4"
          >
            <h3 className="font-display text-base font-semibold">
              Manual Attendance Correction · {editingSession.studentName}
            </h3>
            <p className="text-xs text-zinc-500">
              Original timestamps are preserved in audit history.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Check-In (UTC/ISO local)</label>
              <input
                type="datetime-local"
                value={corrCheckIn}
                onChange={(e) => setCorrCheckIn(e.target.value)}
                required
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Check-Out (optional)</label>
              <input
                type="datetime-local"
                value={corrCheckOut}
                onChange={(e) => setCorrCheckOut(e.target.value)}
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={corrStatus}
                onChange={(e) =>
                  setCorrStatus(e.target.value as 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW')
                }
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-xs"
              >
                <option value="CLOSED">CLOSED</option>
                <option value="OPEN">OPEN</option>
                <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Audit Reason *</label>
              <input
                type="text"
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                placeholder="e.g. Student forgot to scan out before leaving"
                required
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-xs font-semibold"
              >
                Save Correction
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

interface FinanceSectionProps {
  token: string;
  bootstrap: BootstrapPayload;
  collectTarget: { invoiceId: number; studentName: string; balancePaise: number } | null;
  renewTargetStudentId: number | null;
  onClearTargets: () => void;
  onOpenStudent: (studentId: number) => void;
  onRefreshBootstrap: () => void;
}

export function FinanceAndRenewalsSection({
  token,
  bootstrap,
  collectTarget,
  renewTargetStudentId,
  onClearTargets,
  onOpenStudent,
  onRefreshBootstrap,
}: FinanceSectionProps) {
  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';
  const [data, setData] = useState<FinancePayload | null>(null);
  const [studentsList, setStudentsList] = useState<StudentSummaryRow[]>([]);
  const [seatsList, setSeatsList] = useState<SeatAvailabilityDTO[]>([]);
  const [tab, setTab] = useState<'invoices' | 'receipts'>('invoices');

  // Collect Balance modal state
  const [activeCollect, setActiveCollect] = useState<{
    invoiceId: number;
    studentName: string;
    balancePaise: number;
  } | null>(() => collectTarget);
  const [collectRupees, setCollectRupees] = useState(() =>
    collectTarget ? String(Math.round(collectTarget.balancePaise / 100)) : ''
  );
  const [collectMethod, setCollectMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [collectRef, setCollectRef] = useState('');

  // Renew Membership modal state
  const [renewOpen, setRenewOpen] = useState(() => Boolean(renewTargetStudentId));
  const [renewStudentId, setRenewStudentId] = useState<number | ''>(
    () => renewTargetStudentId ?? ''
  );
  const [renewShiftId, setRenewShiftId] = useState(bootstrap.shifts[0]?.id ?? 1);
  const [renewPlanId, setRenewPlanId] = useState(bootstrap.plans[0]?.id ?? 1);
  const [renewCustomStart, setRenewCustomStart] = useState(540);
  const [renewCustomEnd, setRenewCustomEnd] = useState(720);
  const [renewNegotiatedRupees, setRenewNegotiatedRupees] = useState('');
  const [renewNegotiationNote, setRenewNegotiationNote] = useState('');
  const [renewSeatId, setRenewSeatId] = useState<number | ''>('');
  const [renewReceivedRupees, setRenewReceivedRupees] = useState('');
  const [renewMethod, setRenewMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [renewRef, setRenewRef] = useState('');

  // Reversal modal (SUPER_ADMIN only)
  const [reversalPayment, setReversalPayment] = useState<
    FinancePayload['payments'][0] | null
  >(null);
  const [reversalReason, setReversalReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [finRes, stuRes] = await Promise.all([
        adminApiFetch<FinancePayload>(token, '/api/admin/finance'),
        adminApiFetch<{ students: StudentSummaryRow[] }>(token, '/api/admin/students'),
      ]);
      setData(finRes);
      setStudentsList(stuRes.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load financial records.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApiFetch<FinancePayload>(token, '/api/admin/finance'),
      adminApiFetch<{ students: StudentSummaryRow[] }>(token, '/api/admin/students'),
    ])
      .then(([finRes, stuRes]) => {
        if (!active) return;
        setData(finRes);
        setStudentsList(stuRes.students);
      })
      .catch((e) => {
        if (active) {
          toast.error(e instanceof Error ? e.message : 'Unable to load financial records.');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const selectedRenewShift = bootstrap.shifts.find((s) => s.id === renewShiftId);
  const renewIsFlexible = Boolean(selectedRenewShift?.isFlexible);

  useEffect(() => {
    if (!renewOpen) return;
    const flexQs = renewIsFlexible
      ? `&customStartMinute=${renewCustomStart}&customEndMinute=${renewCustomEnd}`
      : '';
    adminApiFetch<SeatsPayload>(
      token,
      `/api/admin/seats?shiftId=${renewShiftId}&startDate=${todayIST()}${flexQs}`
    )
      .then((res) => setSeatsList(res.availability.seats))
      .catch(() => {});
  }, [renewOpen, renewShiftId, renewIsFlexible, renewCustomStart, renewCustomEnd, token]);

  const selectedRenewPlan = bootstrap.plans.find((p) => p.id === renewPlanId);
  const selectedRenewStu = studentsList.find((s) => s.id === Number(renewStudentId));
  const standardRenewRupees = selectedRenewShift
    ? Math.round(selectedRenewShift.monthlyFeePaise / 100)
    : 0;

  const effectiveRenewMonthlyPaise = useMemo(() => {
    if (!selectedRenewShift) return 0;
    const raw = renewNegotiatedRupees.trim();
    if (!raw) return selectedRenewShift.monthlyFeePaise;
    const val = Math.max(1, Math.round(Number(raw) || 0));
    if (!isOwner && val * 100 < selectedRenewShift.monthlyFeePaise) {
      return selectedRenewShift.monthlyFeePaise;
    }
    return val * 100;
  }, [selectedRenewShift, renewNegotiatedRupees, isOwner]);

  const renewPreview = (() => {
    if (!selectedRenewShift || !selectedRenewPlan) return null;
    const today = todayIST();
    const currentExp = selectedRenewStu?.endDate || today;
    const renewalStart = currentExp >= today ? addDaysDateStr(currentExp, 1) : today;
    const newExpiry = addMonthsDateStr(renewalStart, selectedRenewPlan.durationMonths);
    const sub = effectiveRenewMonthlyPaise * selectedRenewPlan.durationMonths;
    const disc = Math.round((sub * selectedRenewPlan.discountPercent) / 100);
    const totalPaise = sub - disc;
    return { currentExp, renewalStart, newExpiry, totalPaise };
  })();

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCollect) return;
    try {
      const amountPaise = Math.round(Number(collectRupees || 0) * 100);
      await adminApiFetch(token, '/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'COLLECT_BALANCE',
          invoiceId: activeCollect.invoiceId,
          amountPaise,
          method: collectMethod,
          referenceCode: collectRef.trim(),
          idempotencyKey: `COL-${activeCollect.invoiceId}-${Date.now()}`,
        }),
      });
      toast.success('Payment recorded and receipt generated.');
      setActiveCollect(null);
      onClearTargets();
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to collect payment.');
    }
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewStudentId || !renewSeatId) {
      toast.error('Select both a student and a desk.');
      return;
    }
    try {
      const receivedPaise = Math.max(
        0,
        Math.round(
          Number(
            renewReceivedRupees !== ''
              ? renewReceivedRupees
              : Math.round((renewPreview?.totalPaise ?? 0) / 100)
          ) * 100
        )
      );
      const customSlotLabel = renewIsFlexible
        ? formatMinuteRangeLabel(renewCustomStart, renewCustomEnd)
        : '';
      const negotiatedMonthlyFeePaise =
        renewNegotiatedRupees.trim() !== '' ? effectiveRenewMonthlyPaise : null;

      await adminApiFetch(token, '/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'RENEW_MEMBERSHIP',
          studentId: Number(renewStudentId),
          shiftId: renewShiftId,
          planId: renewPlanId,
          seatId: Number(renewSeatId),
          customStartMinute: renewIsFlexible ? renewCustomStart : null,
          customEndMinute: renewIsFlexible ? renewCustomEnd : null,
          customSlotLabel,
          negotiatedMonthlyFeePaise,
          negotiationNote: renewNegotiationNote.trim(),
          amountReceivedPaise: receivedPaise,
          method: renewMethod,
          referenceCode: renewRef.trim(),
          idempotencyKey: `REN-${renewStudentId}-${Date.now()}`,
        }),
      });
      toast.success('Membership renewed.');
      setRenewOpen(false);
      onClearTargets();
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Renewal failed.');
    }
  };

  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalPayment || !reversalReason.trim()) return;
    try {
      await adminApiFetch(token, '/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'REVERSE_PAYMENT',
          paymentId: reversalPayment.payment.id,
          reason: reversalReason.trim(),
        }),
      });
      toast.success(`Reversed receipt ${reversalPayment.payment.receiptNumber}`);
      setReversalPayment(null);
      setReversalReason('');
      await load();
      onRefreshBootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to reverse payment.');
    }
  };

  const waConfigured =
    bootstrap.center.whatsappEnabled && bootstrap.center.whatsappNumber.length >= 10;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Fees & Renewals</h1>
          <p className="text-sm text-zinc-500">
            Collect partial or full balances, issue PDF receipts, renew memberships, and audit reversals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRenewOpen(true);
            setRenewReceivedRupees('');
            setRenewNegotiatedRupees('');
            setRenewNegotiationNote('');
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Renew Membership
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('invoices')}
          className={`rounded-xl px-4 py-2 text-xs font-medium border ${
            tab === 'invoices'
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
              : 'border-zinc-200 dark:border-zinc-800'
          }`}
        >
          Invoices ({data?.invoices.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setTab('receipts')}
          className={`rounded-xl px-4 py-2 text-xs font-medium border ${
            tab === 'receipts'
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
              : 'border-zinc-200 dark:border-zinc-800'
          }`}
        >
          Receipts Ledger ({data?.payments.length ?? 0})
        </button>
      </div>

      {tab === 'invoices' && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data?.invoices.map((row) => (
              <div
                key={row.invoice.id}
                className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenStudent(row.invoice.studentId)}
                    className="text-sm font-semibold hover:underline text-left"
                  >
                    {row.studentName}
                  </button>
                  <p className="font-mono text-zinc-500">
                    {row.invoice.invoiceNumber} · {row.studentCode} ·{' '}
                    {row.invoice.snapshotJson?.shiftName || 'Shift'}
                    {row.invoice.snapshotJson?.shiftHours
                      ? ` (${row.invoice.snapshotJson.shiftHours})`
                      : ''}
                    {row.invoice.snapshotJson?.seatNumber
                      ? ` · Desk #${row.invoice.snapshotJson.seatNumber}`
                      : ''}
                  </p>
                  {row.invoice.snapshotJson?.negotiationNote && (
                    <p className="text-zinc-500 mt-0.5">{row.invoice.snapshotJson.negotiationNote}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right font-mono tabular-nums">
                    <p>Total {formatINR(row.invoice.totalPaise)}</p>
                    <p
                      className={
                        row.invoice.balancePaise > 0
                          ? 'text-amber-500 font-semibold'
                          : 'text-emerald-500'
                      }
                    >
                      {row.invoice.balancePaise > 0
                        ? `Due ${formatINR(row.invoice.balancePaise)}`
                        : row.invoice.status}
                    </p>
                  </div>

                  {row.invoice.balancePaise > 0 && row.invoice.status !== 'REVERSED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCollect({
                            invoiceId: row.invoice.id,
                            studentName: row.studentName,
                            balancePaise: row.invoice.balancePaise,
                          });
                          setCollectRupees(String(Math.round(row.invoice.balancePaise / 100)));
                        }}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 font-semibold"
                      >
                        Collect
                      </button>

                      {waConfigured ? (
                        <a
                          href={buildWhatsAppLink(
                            row.studentWhatsapp || row.studentPhone,
                            `Namaste ${row.studentName}, friendly reminder from Gyan Vatika Library regarding pending balance ${formatINR(row.invoice.balancePaise)} (${row.invoice.invoiceNumber}). Call 08580103307 for help.`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/40 text-emerald-500 px-3 py-2 font-medium"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      ) : (
                        <span
                          title="Enable WhatsApp in Settings with a confirmed center number"
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-400 px-3 py-2 cursor-not-allowed"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          WA Off
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'receipts' && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data?.payments.map((row) => {
              const linkedInv = data.invoices.find((i) => i.invoice.id === row.payment.invoiceId);
              return (
                <div
                  key={row.payment.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-mono font-semibold text-sm">
                      {row.payment.receiptNumber}{' '}
                      <span
                        className={
                          row.payment.status === 'REVERSED'
                            ? 'text-rose-500'
                            : 'text-emerald-500'
                        }
                      >
                        · {row.payment.status}
                      </span>
                    </p>
                    <p className="text-zinc-500">
                      {row.studentName} ({row.studentCode}) · {row.invoiceNumber} ·{' '}
                      {row.payment.method} · {formatDateTimeIST(row.payment.paidAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatINR(row.payment.amountPaise)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        downloadPaymentReceiptPdf({
                          receiptNumber: row.payment.receiptNumber,
                          invoiceNumber: row.invoiceNumber,
                          studentName: row.studentName,
                          studentCode: row.studentCode,
                          seatNumber: linkedInv?.invoice.snapshotJson?.seatNumber ?? null,
                          shiftName: linkedInv?.invoice.snapshotJson?.shiftName,
                          customSlotLabel: linkedInv?.invoice.snapshotJson?.shiftHours,
                          planName: linkedInv?.invoice.snapshotJson?.planName,
                          negotiationNote: linkedInv?.invoice.snapshotJson?.negotiationNote,
                          amountPaise: row.payment.amountPaise,
                          invoiceTotalPaise:
                            linkedInv?.invoice.totalPaise ?? row.payment.amountPaise,
                          invoiceBalancePaise: linkedInv?.invoice.balancePaise ?? 0,
                          method: row.payment.method,
                          referenceCode: row.payment.referenceCode,
                          paidAt: row.payment.paidAt,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </button>
                    {waConfigured && row.payment.status === 'POSTED' && (
                      <a
                        href={buildWhatsAppLink(
                          row.studentWhatsapp || row.studentPhone,
                          `Namaste ${row.studentName}, thank you! Receipt ${row.payment.receiptNumber} for ${formatINR(row.payment.amountPaise)} (${row.payment.method}) is recorded at Gyan Vatika Library. Remaining balance: ${formatINR(linkedInv?.invoice.balancePaise ?? 0)}.`
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 text-emerald-500 px-2.5 py-1.5"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        WA
                      </a>
                    )}
                    {isOwner && row.payment.status === 'POSTED' && (
                      <button
                        type="button"
                        onClick={() => setReversalPayment(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 text-rose-500 px-2.5 py-1.5 hover:bg-rose-500/10"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reverse
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collect Balance Modal */}
      {activeCollect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => {
            setActiveCollect(null);
            onClearTargets();
          }}
        >
          <form
            onSubmit={handleCollectSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4"
          >
            <h3 className="font-display text-base font-semibold">
              Collect Balance · {activeCollect.studentName}
            </h3>
            <p className="text-xs text-zinc-500">
              Pending balance:{' '}
              <span className="font-mono font-semibold">{formatINR(activeCollect.balancePaise)}</span>
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Amount Received (INR)</label>
              <input
                type="number"
                min={1}
                max={Math.round(activeCollect.balancePaise / 100)}
                value={collectRupees}
                onChange={(e) => setCollectRupees(e.target.value)}
                required
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Mode</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as 'CASH' | 'UPI' | 'CARD')}
                  className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Reference</label>
                <input
                  type="text"
                  value={collectRef}
                  onChange={(e) => setCollectRef(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveCollect(null);
                  onClearTargets();
                }}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-xs font-semibold"
              >
                Record Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Renew Membership Modal */}
      {renewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => {
            setRenewOpen(false);
            onClearTargets();
          }}
        >
          <form
            onSubmit={handleRenewSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Renew Membership</h3>
              <button
                type="button"
                onClick={() => {
                  setRenewOpen(false);
                  onClearTargets();
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Student</label>
                <select
                  value={renewStudentId}
                  onChange={(e) => {
                    const sid = e.target.value ? Number(e.target.value) : '';
                    setRenewStudentId(sid);
                    if (sid) {
                      const stu = studentsList.find((s) => s.id === sid);
                      if (stu?.shiftId) setRenewShiftId(stu.shiftId);
                      if (stu?.seatId) setRenewSeatId(stu.seatId);
                    }
                  }}
                  required
                  className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
                >
                  <option value="">Select member...</option>
                  {studentsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.studentCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Shift</label>
                  <select
                    value={renewShiftId}
                    onChange={(e) => {
                      setRenewShiftId(Number(e.target.value));
                      setRenewNegotiatedRupees('');
                    }}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
                  >
                    {bootstrap.shifts
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatINR(s.monthlyFeePaise)}/mo)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Plan</label>
                  <select
                    value={renewPlanId}
                    onChange={(e) => setRenewPlanId(Number(e.target.value))}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3"
                  >
                    {bootstrap.plans
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.discountPercent}% off)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {renewIsFlexible && (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div>
                    <label className="block font-medium mb-1">Slot Start</label>
                    <select
                      value={renewCustomStart}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        setRenewCustomStart(s);
                        if (renewCustomEnd - s < 120 || renewCustomEnd - s > 180) {
                          setRenewCustomEnd(Math.min(1260, s + 180));
                        }
                      }}
                      className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
                    >
                      {HALF_HOUR_OPTIONS.filter((o) => o.minute <= 1140).map((o) => (
                        <option key={o.minute} value={o.minute}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Slot End (2–3 hrs)</label>
                    <select
                      value={renewCustomEnd}
                      onChange={(e) => setRenewCustomEnd(Number(e.target.value))}
                      className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
                    >
                      {HALF_HOUR_OPTIONS.filter(
                        (o) => o.minute - renewCustomStart >= 120 && o.minute - renewCustomStart <= 180
                      ).map((o) => (
                        <option key={o.minute} value={o.minute}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Assigned Desk</label>
                <select
                  value={renewSeatId}
                  onChange={(e) => setRenewSeatId(Number(e.target.value))}
                  required
                  className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 font-mono"
                >
                  <option value="">Choose desk...</option>
                  {seatsList.map((s) => (
                    <option key={s.seatId} value={s.seatId}>
                      Desk #{s.seatNumber} ({s.availability})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Negotiated Monthly Fee (Std {formatINR(selectedRenewShift?.monthlyFeePaise ?? 0)})
                  </label>
                  <input
                    type="number"
                    min={isOwner ? 100 : standardRenewRupees}
                    placeholder={String(standardRenewRupees)}
                    value={renewNegotiatedRupees}
                    onChange={(e) => setRenewNegotiatedRupees(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Negotiation Note</label>
                  <input
                    type="text"
                    value={renewNegotiationNote}
                    onChange={(e) => setRenewNegotiationNote(e.target.value)}
                    placeholder="Optional rate note"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3"
                  />
                </div>
              </div>

              {renewPreview && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Current Expiry</span>
                    <span className="font-mono">{formatDateDisplay(renewPreview.currentExp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Renewal Period</span>
                    <span className="font-mono">
                      {formatDateDisplay(renewPreview.renewalStart)} →{' '}
                      {formatDateDisplay(renewPreview.newExpiry)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    <span>Total Renewal Fee</span>
                    <span className="font-mono text-emerald-500 tabular-nums">
                      {formatINR(renewPreview.totalPaise)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium mb-1">Collected (INR)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder={
                      renewPreview ? String(Math.round(renewPreview.totalPaise / 100)) : '0'
                    }
                    value={renewReceivedRupees}
                    onChange={(e) => setRenewReceivedRupees(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Mode</label>
                  <select
                    value={renewMethod}
                    onChange={(e) => setRenewMethod(e.target.value as 'CASH' | 'UPI' | 'CARD')}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Ref</label>
                  <input
                    type="text"
                    value={renewRef}
                    onChange={(e) => setRenewRef(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 text-xs font-semibold"
            >
              Confirm Renewal & Issue Invoice
            </button>
          </form>
        </div>
      )}

      {/* SUPER_ADMIN Payment Reversal Modal */}
      {reversalPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setReversalPayment(null)}
        >
          <form
            onSubmit={handleReversePayment}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-white dark:bg-[#18181B] p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-display text-base font-semibold">
                Reverse Posted Receipt · {reversalPayment.payment.receiptNumber}
              </h3>
            </div>
            <p className="text-xs text-zinc-500">
              This will restore {formatINR(reversalPayment.payment.amountPaise)} to the linked
              invoice balance and create an immutable reversal audit record.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Reversal Reason *</label>
              <input
                type="text"
                required
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Duplicate UPI entry / failed bank settlement"
                className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReversalPayment(null)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-rose-600 text-white px-4 py-2 text-xs font-semibold"
              >
                Confirm Reversal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

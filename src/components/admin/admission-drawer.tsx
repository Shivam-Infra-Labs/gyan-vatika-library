'use client';

import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  IdCard,
  Loader2,
  MessageSquare,
  Search,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RoomInfo, SeatAvailabilityDTO } from '@/src/types/library';
import {
  buildWhatsAppLink,
  FLEXIBLE_SLOT_PRESETS,
  formatDateDisplay,
  formatINR,
  formatMinute12h,
  formatMinuteRangeLabel,
  todayIST,
} from '@/src/lib/format';
import { downloadDigitalIdPdf, downloadPaymentReceiptPdf } from '@/src/lib/pdf-generator';
import { AdminFloorMap } from './admin-floor-map';
import {
  adminApiFetch,
  type BootstrapPayload,
  type PendingBookingRequest,
  type SeatsPayload,
  type StudentSummaryRow,
} from './admin-types';

const HALF_HOUR_OPTIONS: Array<{ minute: number; label: string }> = [];
for (let m = 540; m <= 1260; m += 30) {
  HALF_HOUR_OPTIONS.push({ minute: m, label: formatMinute12h(m) });
}

interface AdmissionDrawerProps {
  open: boolean;
  token: string;
  bootstrap: BootstrapPayload;
  preselectedSeatId?: number | null;
  onClose: () => void;
  onCompleted: () => void;
}

interface AdmissionResult {
  student: {
    id: number;
    studentCode: string;
    fullName: string;
    phone: string;
    whatsappNumber?: string;
    examTarget: string;
    qrSecret: string;
  };
  membership: {
    id: number;
    startDate: string;
    endDate: string;
    customSlotLabel?: string;
    negotiatedMonthlyFeePaise?: number | null;
    negotiationNote?: string;
  };
  invoice: {
    invoiceNumber: string;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
  };
  payment: {
    receiptNumber: string;
    amountPaise: number;
    method: string;
    referenceCode: string;
    paidAt: string;
  } | null;
  seatNumber: number;
  shiftName: string;
  shiftHours: string;
  defaultPin: string;
}

export function AdmissionDrawer({
  open,
  token,
  bootstrap,
  preselectedSeatId,
  onClose,
  onCompleted,
}: AdmissionDrawerProps) {
  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSummaryRow[]>([]);
  const [existingStudentId, setExistingStudentId] = useState<number | undefined>(undefined);

  // Step 2: Profile & private KYC
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [address, setAddress] = useState('');
  const [examTarget, setExamTarget] = useState('SSC CGL');
  const [photoUrl, setPhotoUrl] = useState('');
  const [govIdType, setGovIdType] = useState('Aadhaar');
  const [govIdLast4, setGovIdLast4] = useState('');
  const [govIdDocData, setGovIdDocData] = useState('');

  // Step 3: Dates, Plan, Shift, Flexible Slot, Seat
  const [startDate, setStartDate] = useState(todayIST());
  const [shiftId, setShiftId] = useState<number>(bootstrap.shifts[0]?.id ?? 1);
  const [planId, setPlanId] = useState<number>(bootstrap.plans[0]?.id ?? 1);
  const [customStartMinute, setCustomStartMinute] = useState<number>(540);
  const [customEndMinute, setCustomEndMinute] = useState<number>(720);
  const [seatId, setSeatId] = useState<number | null>(preselectedSeatId ?? null);
  const [seatMapData, setSeatMapData] = useState<SeatsPayload | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);

  // Step 4: Owner Fee Negotiation & Payment
  const [negotiatedMonthlyRupees, setNegotiatedMonthlyRupees] = useState('');
  const [negotiationNote, setNegotiationNote] = useState('');
  const [extraDiscountRupees, setExtraDiscountRupees] = useState('0');
  const [amountReceivedRupees, setAmountReceivedRupees] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [paymentReference, setPaymentReference] = useState('');

  // Conflict state
  const [conflictError, setConflictError] = useState<{
    message: string;
    window: string;
    alternatives: SeatAvailabilityDTO[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AdmissionResult | null>(null);
  const [idempotencyKey] = useState(
    () => `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const selectedShift = useMemo(
    () => bootstrap.shifts.find((s) => s.id === shiftId),
    [bootstrap.shifts, shiftId]
  );
  const selectedPlan = useMemo(
    () => bootstrap.plans.find((p) => p.id === planId),
    [bootstrap.plans, planId]
  );

  const isFlexible = Boolean(selectedShift?.isFlexible);
  const customSlotLabel = isFlexible
    ? formatMinuteRangeLabel(customStartMinute, customEndMinute)
    : '';

  useEffect(() => {
    if (!open) return;
    let active = true;
    adminApiFetch<{ students: StudentSummaryRow[] }>(
      token,
      `/api/admin/students?q=${encodeURIComponent(searchQuery)}`
    )
      .then((res) => {
        if (active) setSearchResults(res.students.slice(0, 6));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, searchQuery, token]);

  useEffect(() => {
    if (!open || step !== 3) return;
    let active = true;
    const flexQs = isFlexible
      ? `&customStartMinute=${customStartMinute}&customEndMinute=${customEndMinute}`
      : '';
    adminApiFetch<SeatsPayload>(
      token,
      `/api/admin/seats?shiftId=${shiftId}&startDate=${startDate}${flexQs}`
    )
      .then((res) => {
        if (active) {
          setSeatMapData(res);
          setLoadingSeats(false);
        }
      })
      .catch((e) => {
        if (active) {
          toast.error(e instanceof Error ? e.message : 'Could not load seat map.');
          setLoadingSeats(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, step, shiftId, startDate, isFlexible, customStartMinute, customEndMinute, token]);

  const standardMonthlyRupees = selectedShift
    ? Math.round(selectedShift.monthlyFeePaise / 100)
    : 0;

  const effectiveMonthlyPaise = useMemo(() => {
    if (!selectedShift) return 0;
    const raw = negotiatedMonthlyRupees.trim();
    if (!raw) return selectedShift.monthlyFeePaise;
    const parsedRupees = Math.max(1, Math.round(Number(raw) || 0));
    if (!isOwner && parsedRupees * 100 < selectedShift.monthlyFeePaise) {
      return selectedShift.monthlyFeePaise;
    }
    return parsedRupees * 100;
  }, [selectedShift, negotiatedMonthlyRupees, isOwner]);

  const feeQuote = useMemo(() => {
    if (!selectedShift || !selectedPlan) {
      return { subtotalPaise: 0, discountPaise: 0, totalPaise: 0 };
    }
    const subtotalPaise = effectiveMonthlyPaise * selectedPlan.durationMonths;
    const planDisc = Math.round((subtotalPaise * selectedPlan.discountPercent) / 100);
    const extraDisc = Math.max(0, Math.round(Number(extraDiscountRupees || 0) * 100));
    const discountPaise = Math.min(subtotalPaise, planDisc + extraDisc);
    const totalPaise = Math.max(0, subtotalPaise - discountPaise);
    return { subtotalPaise, discountPaise, totalPaise };
  }, [selectedShift, selectedPlan, effectiveMonthlyPaise, extraDiscountRupees]);

  const effectiveAmountReceivedRupees =
    amountReceivedRupees !== ''
      ? amountReceivedRupees
      : String(Math.round(feeQuote.totalPaise / 100));

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error('Please upload an image smaller than 1.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmAdmission = async () => {
    if (!seatId) {
      toast.error('Please select a desk first.');
      setStep(3);
      return;
    }
    if (isFlexible) {
      const diff = customEndMinute - customStartMinute;
      if (diff < 120 || diff > 180) {
        toast.error('Flexible Short Pass must be between 2 and 3 hours.');
        setStep(3);
        return;
      }
    }
    setSubmitting(true);
    setConflictError(null);
    try {
      const receivedPaise = Math.max(
        0,
        Math.round(Number(effectiveAmountReceivedRupees || 0) * 100)
      );
      const extraDiscountPaise = Math.max(0, Math.round(Number(extraDiscountRupees || 0) * 100));
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const cleanWa = (whatsappNumber || phone).replace(/\D/g, '').slice(-10);

      const negotiatedFeePaise =
        negotiatedMonthlyRupees.trim() !== '' ? effectiveMonthlyPaise : null;

      const res = await adminApiFetch<AdmissionResult>(token, '/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          existingStudentId,
          fullName: fullName.trim(),
          phone: cleanPhone,
          whatsappNumber: cleanWa || cleanPhone,
          email: email.trim(),
          emergencyContactName: emergencyName.trim(),
          emergencyContactPhone: emergencyPhone.replace(/\D/g, '').slice(-10),
          address: address.trim(),
          examTarget: examTarget.trim() || 'General',
          photoUrl,
          govIdType,
          govIdLast4: govIdLast4.trim(),
          govIdDocData,
          shiftId,
          planId,
          seatId,
          startDate,
          customStartMinute: isFlexible ? customStartMinute : null,
          customEndMinute: isFlexible ? customEndMinute : null,
          customSlotLabel: isFlexible ? customSlotLabel : '',
          negotiatedMonthlyFeePaise: negotiatedFeePaise,
          negotiationNote: negotiationNote.trim(),
          extraDiscountPaise,
          amountReceivedPaise: receivedPaise,
          paymentMethod,
          paymentReference: paymentReference.trim(),
          idempotencyKey,
        }),
      });
      setResult(res);
      setStep(6);
      toast.success(`Admitted ${res.student.fullName} to Desk #${res.seatNumber}`);
      onCompleted();
    } catch (err) {
      const e = err as Error & {
        status?: number;
        conflictWindow?: string;
        alternatives?: SeatAvailabilityDTO[];
      };
      if (e.status === 409) {
        setConflictError({
          message: e.message,
          window: e.conflictWindow || '',
          alternatives: e.alternatives || [],
        });
        setStep(3);
        toast.error('Seat conflict detected — choose one of the free desks shown.');
      } else {
        toast.error(e.message || 'Could not complete admission.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const receivedPaisePreview = Math.min(
    feeQuote.totalPaise,
    Math.max(0, Math.round(Number(effectiveAmountReceivedRupees || 0) * 100))
  );
  const remainingBalancePreview = Math.max(0, feeQuote.totalPaise - receivedPaisePreview);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guided Student Admission"
    >
      <div className="w-full max-w-2xl h-full overflow-y-auto bg-white dark:bg-[#09090B] border-l border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-500">
              Guided Admission · Step {step} of 6
            </p>
            <h2 className="font-display text-lg font-semibold">
              {step === 1 && 'Search Existing or New Student'}
              {step === 2 && 'Student Contact, Photo & Private ID'}
              {step === 3 && 'Choose Shift, Slot, Plan & Desk'}
              {step === 4 && 'Fee Breakdown, Negotiation & Payment'}
              {step === 5 && 'Confirm Admission'}
              {step === 6 && 'Admission Confirmed'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close admission drawer"
            className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search returning student by name, mobile, or GV ID..."
                  className="w-full h-11 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent pl-9 pr-3 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setExistingStudentId(undefined);
                  setStep(2);
                }}
                className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 text-left flex items-center justify-between hover:bg-emerald-500/15 transition"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold">New Walk-In Student</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Create a new student profile, Student ID, and seat assignment
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-emerald-500" />
              </button>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">
                    Or select an existing member to re-admit / add membership:
                  </p>
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    {searchResults.map((stu) => (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => {
                          setExistingStudentId(stu.id);
                          setFullName(stu.fullName);
                          setPhone(stu.phone);
                          setWhatsappNumber(stu.whatsappNumber || stu.phone);
                          setEmail(stu.email || '');
                          setExamTarget(stu.examTarget || 'General');
                          setStep(2);
                        }}
                        className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <div>
                          <p className="text-sm font-medium">{stu.fullName}</p>
                          <p className="text-xs text-zinc-500 font-mono">
                            {stu.studentCode} · {stu.phone}
                          </p>
                        </div>
                        <span className="text-xs text-emerald-500 font-medium">Select</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ananya Kumari"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Mobile Number (10 digits) *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">WhatsApp Number (if different)</label>
                  <input
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="Same as mobile if blank"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Target Exam</label>
                  <input
                    type="text"
                    value={examTarget}
                    onChange={(e) => setExamTarget(e.target.value)}
                    placeholder="UPSC CSE / SSC CGL / NEET"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Emergency Phone</label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Local Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Chota Gamaria / Adityapur"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 bg-zinc-50 dark:bg-[#18181B]">
                <p className="text-xs font-semibold">
                  Private Staff-Only KYC & Photo (Never shown publicly)
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Gov ID Type</label>
                    <select
                      value={govIdType}
                      onChange={(e) => setGovIdType(e.target.value)}
                      className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
                    >
                      <option value="Aadhaar">Aadhaar Card</option>
                      <option value="Voter ID">Voter ID</option>
                      <option value="PAN">PAN Card</option>
                      <option value="College ID">College ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Last 4 Digits</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={govIdLast4}
                      onChange={(e) => setGovIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1234"
                      className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-2.5 px-3 text-xs font-medium cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <Upload className="h-3.5 w-3.5 text-emerald-500" />
                    {photoUrl ? 'Passport Photo Attached' : 'Upload Passport Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, setPhotoUrl)}
                      className="hidden"
                    />
                  </label>
                  <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-2.5 px-3 text-xs font-medium cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <Upload className="h-3.5 w-3.5 text-amber-500" />
                    {govIdDocData ? 'Gov ID Copy Attached' : 'Upload Gov ID Copy'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, setGovIdDocData)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {conflictError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
                  <div className="flex items-start gap-2 text-rose-500 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{conflictError.message}</span>
                  </div>
                  {conflictError.window && (
                    <p className="text-xs text-zinc-400">Conflict window: {conflictError.window}</p>
                  )}
                  {conflictError.alternatives.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {conflictError.alternatives.map((alt) => (
                        <button
                          key={alt.seatId}
                          type="button"
                          onClick={() => {
                            setSeatId(alt.seatId);
                            setConflictError(null);
                          }}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-mono text-emerald-400 hover:bg-emerald-500/25"
                        >
                          Use Desk #{alt.seatNumber}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setLoadingSeats(true);
                      setStartDate(e.target.value);
                    }}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Shift</label>
                  <select
                    value={shiftId}
                    onChange={(e) => {
                      setLoadingSeats(true);
                      setShiftId(Number(e.target.value));
                      setSeatId(null);
                      setNegotiatedMonthlyRupees('');
                    }}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
                  >
                    {bootstrap.shifts
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.displayHours}) — {formatINR(s.monthlyFeePaise)}/mo
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Duration Plan</label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(Number(e.target.value))}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
                  >
                    {bootstrap.plans
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.durationMonths} mo · {p.discountPercent}% off)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {isFlexible && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-1.5 text-emerald-500">
                      <Clock className="h-3.5 w-3.5" />
                      Flexible Short Pass (2–3 Hours Custom Window)
                    </span>
                    <span className="font-mono text-zinc-500">{customSlotLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FLEXIBLE_SLOT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setLoadingSeats(true);
                          setCustomStartMinute(p.startMinute);
                          setCustomEndMinute(p.endMinute);
                          setSeatId(null);
                        }}
                        className={`rounded-lg px-2.5 py-1.5 font-mono border transition ${
                          customStartMinute === p.startMinute && customEndMinute === p.endMinute
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                            : 'border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 text-zinc-500">Custom Start</label>
                      <select
                        value={customStartMinute}
                        onChange={(e) => {
                          const s = Number(e.target.value);
                          setLoadingSeats(true);
                          setCustomStartMinute(s);
                          if (customEndMinute - s < 120 || customEndMinute - s > 180) {
                            setCustomEndMinute(Math.min(1260, s + 180));
                          }
                          setSeatId(null);
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
                      <label className="block mb-1 text-zinc-500">Custom End (2–3 hrs)</label>
                      <select
                        value={customEndMinute}
                        onChange={(e) => {
                          setLoadingSeats(true);
                          setCustomEndMinute(Number(e.target.value));
                          setSeatId(null);
                        }}
                        className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-2 font-mono"
                      >
                        {HALF_HOUR_OPTIONS.filter(
                          (o) => o.minute - customStartMinute >= 120 && o.minute - customStartMinute <= 180
                        ).map((o) => (
                          <option key={o.minute} value={o.minute}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">
                    Select Available Desk{' '}
                    {seatId
                      ? `(Selected: #${seatMapData?.availability.seats.find((s) => s.seatId === seatId)?.seatNumber ?? seatId})`
                      : '*'}
                  </label>
                  {loadingSeats && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                </div>
                {seatMapData && (
                  <AdminFloorMap
                    room={bootstrap.rooms[0] as RoomInfo}
                    seats={seatMapData.availability.seats}
                    assignmentsBySeat={seatMapData.assignmentsBySeat}
                    selectedSeatId={seatId}
                    compact
                    onSelectSeat={(seat) => {
                      if (seat.availability === 'AVAILABLE' || seat.availability === 'EXPIRING_SOON') {
                        setSeatId(seat.seatId);
                      } else {
                        toast.error(seat.conflictReason || 'This desk is occupied in the chosen time slot.');
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">
                    {selectedShift?.name}
                    {customSlotLabel ? ` (${customSlotLabel})` : ''} ·{' '}
                    {formatINR(effectiveMonthlyPaise)}/mo × {selectedPlan?.durationMonths} mo
                  </span>
                  <span className="font-mono tabular-nums">{formatINR(feeQuote.subtotalPaise)}</span>
                </div>
                {feeQuote.discountPaise > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Discounts</span>
                    <span className="font-mono tabular-nums">-{formatINR(feeQuote.discountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 font-semibold">
                  <span>Net Payable</span>
                  <span className="font-mono text-base tabular-nums">{formatINR(feeQuote.totalPaise)}</span>
                </div>
              </div>

              {/* Owner Fee Negotiation */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    Final Negotiated Monthly Fee (Standard: {formatINR(selectedShift?.monthlyFeePaise ?? 0)}/mo)
                  </span>
                  {!isOwner && (
                    <span className="text-zinc-500">Lowering below standard requires Owner</span>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Final Monthly Fee (INR)</label>
                    <input
                      type="number"
                      min={isOwner ? 100 : standardMonthlyRupees}
                      placeholder={String(standardMonthlyRupees)}
                      value={negotiatedMonthlyRupees}
                      onChange={(e) => setNegotiatedMonthlyRupees(e.target.value)}
                      className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Negotiation / Discount Note</label>
                    <input
                      type="text"
                      value={negotiationNote}
                      onChange={(e) => setNegotiationNote(e.target.value)}
                      placeholder="e.g. Flexible 2hr morning slot agreed at counter"
                      className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Additional Discount (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={extraDiscountRupees}
                    onChange={(e) => setExtraDiscountRupees(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Amount Collected Now (INR)</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.round(feeQuote.totalPaise / 100)}
                    value={effectiveAmountReceivedRupees}
                    onChange={(e) => setAmountReceivedRupees(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Payment Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'UPI' | 'CARD')}
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">UPI / Txn Ref (optional)</label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="UTR / Receipt Ref"
                    className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between text-xs">
                <span className="text-amber-600 dark:text-amber-300 font-medium">
                  Remaining Balance After This Payment
                </span>
                <span className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-300 tabular-nums">
                  {formatINR(remainingBalancePreview)}
                </span>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] p-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Student</span>
                  <span className="font-medium">
                    {fullName} ({phone})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Desk & Shift</span>
                  <span className="font-medium">
                    Desk #{seatMapData?.availability.seats.find((s) => s.seatId === seatId)?.seatNumber} · {selectedShift?.name}
                    {customSlotLabel ? ` (${customSlotLabel})` : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Start Date & Plan</span>
                  <span className="font-mono">
                    {formatDateDisplay(startDate)} · {selectedPlan?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Final Monthly Rate</span>
                  <span className="font-mono">{formatINR(effectiveMonthlyPaise)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total Fee</span>
                  <span className="font-mono">{formatINR(feeQuote.totalPaise)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Collecting Now ({paymentMethod})</span>
                  <span className="font-mono text-emerald-500 font-semibold">
                    {formatINR(receivedPaisePreview)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Remaining Balance</span>
                  <span className="font-mono text-amber-500 font-semibold">
                    {formatINR(remainingBalancePreview)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Confirming reserves this desk immediately across the public website, student portal, and reception desk.
              </p>
            </div>
          )}

          {step === 6 && result && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                  <h3 className="font-display text-base font-semibold">
                    {result.student.fullName} is now admitted
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Student ID</span>
                    <span className="font-mono font-semibold text-sm">{result.student.studentCode}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Portal Login PIN (Default)</span>
                    <span className="font-mono font-semibold text-sm">{result.defaultPin}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Assigned Desk & Shift</span>
                    <span className="font-medium">
                      Desk #{result.seatNumber} · {result.shiftName}
                      {result.membership.customSlotLabel ? ` (${result.membership.customSlotLabel})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Membership Dates</span>
                    <span className="font-mono">
                      {formatDateDisplay(result.membership.startDate)} → {formatDateDisplay(result.membership.endDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Invoice / Collected</span>
                    <span className="font-mono">
                      {result.invoice.invoiceNumber} · {formatINR(result.invoice.paidPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Remaining Balance</span>
                    <span className="font-mono text-amber-500 font-semibold">
                      {formatINR(result.invoice.balancePaise)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {result.payment && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadPaymentReceiptPdf({
                        receiptNumber: result.payment!.receiptNumber,
                        invoiceNumber: result.invoice.invoiceNumber,
                        studentName: result.student.fullName,
                        studentCode: result.student.studentCode,
                        seatNumber: result.seatNumber,
                        shiftName: result.shiftName,
                        customSlotLabel: result.membership.customSlotLabel,
                        planName: selectedPlan?.name || 'Membership',
                        negotiationNote: result.membership.negotiationNote,
                        amountPaise: result.payment!.amountPaise,
                        invoiceTotalPaise: result.invoice.totalPaise,
                        invoiceBalancePaise: result.invoice.balancePaise,
                        method: result.payment!.method,
                        referenceCode: result.payment!.referenceCode,
                        paidAt: result.payment!.paidAt,
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF Receipt
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    const qrDataUrl = await QRCode.toDataURL(
                      JSON.stringify({
                        type: 'GV_STUDENT_ID',
                        studentCode: result.student.studentCode,
                        token: result.student.qrSecret,
                      }),
                      { width: 220, margin: 1 }
                    );
                    downloadDigitalIdPdf({
                      studentCode: result.student.studentCode,
                      fullName: result.student.fullName,
                      examTarget: result.student.examTarget,
                      seatNumber: result.seatNumber,
                      shiftName: result.shiftName,
                      shiftHours: result.membership.customSlotLabel || result.shiftHours,
                      validUntil: result.membership.endDate,
                      qrDataUrl,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
                >
                  <IdCard className="h-4 w-4" />
                  Print / Save Digital ID
                </button>

                <a
                  href={buildWhatsAppLink(
                    result.student.whatsappNumber || result.student.phone,
                    `Namaste ${result.student.fullName}! Welcome to Gyan Vatika Library. Your Student ID is ${result.student.studentCode} (Default PIN: ${result.defaultPin}). Assigned Desk #${result.seatNumber} (${result.shiftName}). Valid till ${formatDateDisplay(result.membership.endDate)}. Paid: ${formatINR(result.invoice.paidPaise)}, Balance: ${formatINR(result.invoice.balancePaise)}.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 text-emerald-500 px-4 py-2.5 text-xs font-semibold hover:bg-emerald-500/10 whitespace-nowrap"
                >
                  <MessageSquare className="h-4 w-4" />
                  Send Welcome on WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur">
          {step < 6 ? (
            <>
              <button
                type="button"
                onClick={() => (step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5) : onClose())}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {step === 1 ? 'Cancel' : 'Back'}
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 2) {
                      const cleanPhone = phone.replace(/\D/g, '');
                      if (!fullName.trim() || !/^[6-9]\d{9}$/.test(cleanPhone)) {
                        toast.error('Enter full name and a valid 10-digit Indian mobile number.');
                        return;
                      }
                    }
                    if (step === 3 && !seatId) {
                      toast.error('Please pick an available desk on the floor plan.');
                      return;
                    }
                    setStep((s) => (s + 1) as 2 | 3 | 4 | 5);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold"
                >
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmAdmission}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  {submitting ? 'Admitting...' : 'Confirm & Generate Receipt'}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-5 py-2 text-xs font-semibold"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PendingRequestDrawerProps {
  requestItem: PendingBookingRequest | null;
  token: string;
  bootstrap: BootstrapPayload;
  onClose: () => void;
  onCompleted: () => void;
}

export function PendingRequestDrawer({
  requestItem,
  token,
  bootstrap,
  onClose,
  onCompleted,
}: PendingRequestDrawerProps) {
  const isOwner = bootstrap.staff.role === 'SUPER_ADMIN';
  const reqShift = bootstrap.shifts.find((s) => s.id === requestItem?.request.shiftId);
  const reqPlan = bootstrap.plans.find((p) => p.id === requestItem?.request.planId);

  const [seatId, setSeatId] = useState<number | null>(requestItem?.request.seatId ?? null);
  const [negotiatedRupees, setNegotiatedRupees] = useState<string>(() =>
    reqShift ? String(Math.round(reqShift.monthlyFeePaise / 100)) : ''
  );
  const [negotiationNote, setNegotiationNote] = useState('');

  const standardMonthlyRupees = reqShift ? Math.round(reqShift.monthlyFeePaise / 100) : 0;
  const effectiveMonthlyPaise = useMemo(() => {
    if (!reqShift) return 0;
    const raw = negotiatedRupees.trim();
    if (!raw) return reqShift.monthlyFeePaise;
    const val = Math.max(1, Math.round(Number(raw) || 0));
    if (!isOwner && val * 100 < reqShift.monthlyFeePaise) {
      return reqShift.monthlyFeePaise;
    }
    return val * 100;
  }, [reqShift, negotiatedRupees, isOwner]);

  const computedTotalPaise = useMemo(() => {
    if (!reqPlan) return 0;
    const sub = effectiveMonthlyPaise * reqPlan.durationMonths;
    const disc = Math.round((sub * reqPlan.discountPercent) / 100);
    return Math.max(0, sub - disc);
  }, [effectiveMonthlyPaise, reqPlan]);

  const [amountRupees, setAmountRupees] = useState<string>('');
  const effectiveAmountRupees =
    amountRupees !== '' ? amountRupees : String(Math.round(computedTotalPaise / 100));

  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD'>('UPI');
  const [reference, setReference] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [conflict, setConflict] = useState<{
    message: string;
    window: string;
    alternatives: SeatAvailabilityDTO[];
  } | null>(null);
  const [seatsPayload, setSeatsPayload] = useState<SeatsPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const [idVerifyBusy, setIdVerifyBusy] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<string>(
    requestItem?.request.idVerificationStatus || 'PENDING_OFFLINE'
  );
  const [verifyIdType, setVerifyIdType] = useState<string>(
    requestItem?.request.govIdType || ''
  );
  const [verifyIdLast4, setVerifyIdLast4] = useState<string>(
    requestItem?.request.govIdLast4 || ''
  );
  const [verifyIdNote, setVerifyIdNote] = useState<string>(
    requestItem?.request.idVerificationNote || ''
  );

  // On-demand KYC document viewer state
  const [kycDoc, setKycDoc] = useState<{
    govIdDocData: string;
    photoUrl: string;
    govIdType: string;
    govIdLast4: string;
  } | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(false);

  useEffect(() => {
    if (!requestItem) return;
    const flexQs =
      requestItem.request.customStartMinute && requestItem.request.customEndMinute
        ? `&customStartMinute=${requestItem.request.customStartMinute}&customEndMinute=${requestItem.request.customEndMinute}`
        : '';
    adminApiFetch<SeatsPayload>(
      token,
      `/api/admin/seats?shiftId=${requestItem.request.shiftId}&startDate=${requestItem.request.startDate}${flexQs}`
    )
      .then(setSeatsPayload)
      .catch(() => {});
  }, [requestItem, token]);

  if (!requestItem) return null;

  const handleFetchKycDoc = async () => {
    if (kycDoc) {
      setKycDoc(null);
      return;
    }
    setLoadingKyc(true);
    try {
      const res = await adminApiFetch<{
        govIdDocData: string;
        photoUrl: string;
        govIdType: string;
        govIdLast4: string;
      }>(token, `/api/admin/students/${requestItem.request.id}/document?source=request`);
      setKycDoc(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to load KYC copy.');
    } finally {
      setLoadingKyc(false);
    }
  };

  const handleMarkIdVerified = async () => {
    setIdVerifyBusy(true);
    try {
      await adminApiFetch(token, '/api/admin/booking-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'VERIFY_ID_PROOF',
          requestId: requestItem.request.id,
          govIdType: verifyIdType.trim(),
          govIdLast4: verifyIdLast4.trim(),
          idVerificationNote: verifyIdNote.trim() || 'Photocopy verified at reception counter',
        }),
      });
      setVerifiedStatus('VERIFIED');
      toast.success(`ID proof verified at counter for ${requestItem.request.fullName}`);
      onCompleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to verify ID proof.');
    } finally {
      setIdVerifyBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!seatId) {
      toast.error('Select a desk before approving.');
      return;
    }
    setBusy(true);
    setConflict(null);
    try {
      const negotiatedMonthlyFeePaise =
        negotiatedRupees.trim() !== '' ? effectiveMonthlyPaise : null;

      await adminApiFetch(token, '/api/admin/booking-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'APPROVE',
          requestId: requestItem.request.id,
          seatId,
          customStartMinute: requestItem.request.customStartMinute ?? null,
          customEndMinute: requestItem.request.customEndMinute ?? null,
          customSlotLabel: requestItem.request.customSlotLabel || '',
          negotiatedMonthlyFeePaise,
          negotiationNote: negotiationNote.trim(),
          amountReceivedPaise: Math.max(0, Math.round(Number(effectiveAmountRupees || 0) * 100)),
          paymentMethod: method,
          paymentReference: reference.trim(),
          idempotencyKey: `REQ-${requestItem.request.id}-${Date.now()}`,
        }),
      });
      toast.success(`Approved ${requestItem.request.fullName}`);
      onCompleted();
      onClose();
    } catch (err) {
      const e = err as Error & {
        status?: number;
        conflictWindow?: string;
        alternatives?: SeatAvailabilityDTO[];
      };
      if (e.status === 409) {
        setConflict({
          message: e.message,
          window: e.conflictWindow || '',
          alternatives: e.alternatives || [],
        });
      } else {
        toast.error(e.message || 'Unable to approve request.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error('Please enter a short reason before rejecting.');
      return;
    }
    setBusy(true);
    try {
      await adminApiFetch(token, '/api/admin/booking-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'REJECT',
          requestId: requestItem.request.id,
          reviewNote: rejectNote.trim(),
        }),
      });
      toast.success(`Rejected request ${requestItem.request.referenceCode}`);
      onCompleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to reject request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Review Online Request"
    >
      <div className="w-full max-w-xl h-full overflow-y-auto bg-white dark:bg-[#09090B] border-l border-zinc-200 dark:border-zinc-800 p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <p className="font-mono text-xs text-amber-500">{requestItem.request.referenceCode}</p>
            <h2 className="font-display text-lg font-semibold">
              Review Seat Request · {requestItem.request.fullName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] p-4 grid sm:grid-cols-2 gap-2.5 text-xs">
          <div>
            <span className="text-zinc-500 block">Phone / WhatsApp</span>
            <span className="font-mono">
              {requestItem.request.phone}
              {requestItem.request.whatsappNumber &&
              requestItem.request.whatsappNumber !== requestItem.request.phone
                ? ` · WA ${requestItem.request.whatsappNumber}`
                : ''}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Target Exam</span>
            <span>{requestItem.request.examTarget || 'General'}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Shift & Plan</span>
            <span>
              {requestItem.shiftName}
              {requestItem.request.customSlotLabel ? ` (${requestItem.request.customSlotLabel})` : ''} ·{' '}
              {requestItem.planName}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Requested Start</span>
            <span className="font-mono">{formatDateDisplay(requestItem.request.startDate)}</span>
          </div>
          <div className="sm:col-span-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold font-mono ${
                    verifiedStatus === 'VERIFIED'
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : verifiedStatus === 'UPLOADED'
                      ? 'bg-sky-500/15 text-sky-500'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {verifiedStatus === 'VERIFIED'
                    ? 'ID Verified'
                    : verifiedStatus === 'UPLOADED'
                    ? 'Online ID Uploaded'
                    : 'Offline ID Pending'}
                </span>
                <span>
                  Mode: {requestItem.request.idProofMode === 'ONLINE' ? 'Online Upload' : 'Offline Photocopy'}
                  {verifyIdType ? ` · ${verifyIdType}` : ''}
                  {verifyIdLast4 ? ` (•••• ${verifyIdLast4})` : ''}
                </span>
              </div>
              {requestItem.request.hasGovIdDoc && (
                <button
                  type="button"
                  onClick={handleFetchKycDoc}
                  disabled={loadingKyc}
                  className="inline-flex items-center gap-1 text-emerald-500 font-semibold"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {loadingKyc ? 'Loading...' : kycDoc ? 'Hide KYC Copy' : 'View Uploaded KYC'}
                </button>
              )}
            </div>

            {verifiedStatus !== 'VERIFIED' && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-2.5 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={verifyIdType}
                    onChange={(e) => setVerifyIdType(e.target.value)}
                    placeholder="ID Type (Aadhaar, Voter ID...)"
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 text-xs"
                  />
                  <input
                    type="text"
                    maxLength={4}
                    value={verifyIdLast4}
                    onChange={(e) => setVerifyIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Last 4 digits"
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={verifyIdNote}
                    onChange={(e) => setVerifyIdNote(e.target.value)}
                    placeholder="Counter note (optional)"
                    className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={idVerifyBusy}
                  onClick={handleMarkIdVerified}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-semibold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {idVerifyBusy ? 'Verifying...' : 'Mark Offline ID Verified'}
                </button>
              </div>
            )}
          </div>
        </div>

        {kycDoc && (kycDoc.govIdDocData || kycDoc.photoUrl) && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 grid sm:grid-cols-2 gap-3 bg-zinc-50 dark:bg-[#18181B]">
            {kycDoc.photoUrl && (
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">Applicant Photo</p>
                <img
                  src={kycDoc.photoUrl}
                  alt="Applicant photo"
                  className="max-h-40 rounded-lg object-contain border border-zinc-300 dark:border-zinc-700"
                />
              </div>
            )}
            {kycDoc.govIdDocData && (
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">Uploaded ID Document</p>
                <img
                  src={kycDoc.govIdDocData}
                  alt="Uploaded KYC ID"
                  className="max-h-40 rounded-lg object-contain border border-zinc-300 dark:border-zinc-700"
                />
              </div>
            )}
          </div>
        )}

        {conflict && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
            <p className="text-xs font-semibold text-rose-500">{conflict.message}</p>
            {conflict.window && <p className="text-xs text-zinc-400">Conflict: {conflict.window}</p>}
            {conflict.alternatives.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {conflict.alternatives.map((alt) => (
                  <button
                    key={alt.seatId}
                    type="button"
                    onClick={() => {
                      setSeatId(alt.seatId);
                      setConflict(null);
                    }}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-mono text-emerald-400"
                  >
                    Switch to Desk #{alt.seatNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {seatsPayload && (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Assign Desk{' '}
              {seatId
                ? `(#${seatsPayload.availability.seats.find((s) => s.seatId === seatId)?.seatNumber ?? seatId})`
                : ''}
            </p>
            <AdminFloorMap
              room={bootstrap.rooms[0]}
              seats={seatsPayload.availability.seats}
              selectedSeatId={seatId}
              compact
              onSelectSeat={(s) => {
                if (s.availability === 'AVAILABLE' || s.availability === 'EXPIRING_SOON') {
                  setSeatId(s.seatId);
                } else {
                  toast.error(s.conflictReason || 'Desk occupied');
                }
              }}
            />
          </div>
        )}

        {/* Negotiated Monthly Fee */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              Monthly Rate Override (Standard {formatINR(reqShift?.monthlyFeePaise ?? 0)}/mo)
            </span>
            <span className="font-mono text-emerald-500">Total: {formatINR(computedTotalPaise)}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block mb-1 text-zinc-500">Final Monthly Fee (INR)</label>
              <input
                type="number"
                min={isOwner ? 100 : standardMonthlyRupees}
                value={negotiatedRupees}
                onChange={(e) => setNegotiatedRupees(e.target.value)}
                className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
              />
            </div>
            <div>
              <label className="block mb-1 text-zinc-500">Negotiation / Counter Note</label>
              <input
                type="text"
                value={negotiationNote}
                onChange={(e) => setNegotiationNote(e.target.value)}
                placeholder="Optional agreed rate note"
                className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
              />
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Amount Collected (INR)</label>
            <input
              type="number"
              min={0}
              value={effectiveAmountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Mode</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'CASH' | 'UPI' | 'CARD')}
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3 text-sm"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Ref Code</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-sm font-mono"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleApprove}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 text-xs font-semibold"
        >
          {busy ? 'Processing...' : 'Approve & Admit Student'}
        </button>

        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <p className="text-xs font-medium text-zinc-500">Or reject request</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason (e.g. Shift full, duplicate enquiry)"
              className="flex-1 h-10 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 text-xs"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleReject}
              className="rounded-xl border border-rose-500/40 text-rose-500 px-4 text-xs font-semibold hover:bg-rose-500/10"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

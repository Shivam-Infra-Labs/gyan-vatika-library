'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, FileCheck2, MessageCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildWhatsAppLink,
  FLEXIBLE_SLOT_PRESETS,
  formatDateDisplay,
  formatINR,
  formatMinute12h,
  formatMinuteRangeLabel,
  todayIST,
} from '@/src/lib/format';
import { downloadAdmissionFormPdf } from '@/src/lib/pdf-generator';
import { PlanInfo, SeatAvailabilityDTO, ShiftInfo } from '@/src/types/library';
import { SmartAssistant } from '@/src/components/assistant/smart-assistant';

interface AdmissionFormClientProps {
  center: {
    name: string;
    phoneDisplay: string;
    callLink: string;
    address: string;
    whatsappEnabled: boolean;
    whatsappNumber: string;
  };
  rooms: Array<{ id: number; name: string }>;
  shifts: ShiftInfo[];
  plans: PlanInfo[];
  initialShiftId?: number;
  initialPlanId?: number;
  initialSeatId?: number;
}

const MINUTE_OPTIONS = Array.from({ length: 25 }, (_, i) => 540 + i * 30);

export function AdmissionFormClient({
  center,
  rooms,
  shifts,
  plans,
  initialShiftId,
  initialPlanId,
  initialSeatId,
}: AdmissionFormClientProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [examTarget, setExamTarget] = useState('UPSC / State PCS');
  const [idProofMode, setIdProofMode] = useState<'OFFLINE' | 'ONLINE'>('OFFLINE');
  const [govIdType, setGovIdType] = useState('Aadhaar Card');
  const [govIdLast4, setGovIdLast4] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [govIdDocData, setGovIdDocData] = useState('');
  const [rulesAccepted, setRulesAccepted] = useState(false);

  const [shiftId, setShiftId] = useState<number>(initialShiftId || shifts[0]?.id || 0);
  const [planId, setPlanId] = useState<number>(initialPlanId || plans[0]?.id || 0);
  const [startDate, setStartDate] = useState(() => todayIST());
  const [seatId, setSeatId] = useState<number | null>(initialSeatId || null);

  const [customStartMinute, setCustomStartMinute] = useState<number>(540);
  const [customEndMinute, setCustomEndMinute] = useState<number>(720);

  const [seats, setSeats] = useState<SeatAvailabilityDTO[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const [submitted, setSubmitted] = useState<{
    referenceCode: string;
    seatNumber: number | null;
    shiftName: string;
    shiftHours: string;
    planName: string;
    totalPaise: number;
    idProofMode: string;
    idVerificationStatus: string;
  } | null>(null);

  const activeShift = useMemo(() => shifts.find((s) => s.id === shiftId) ?? shifts[0], [shifts, shiftId]);
  const activePlan = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);
  const isFlexible = Boolean(activeShift?.isFlexible);
  const customDurationOk = customEndMinute - customStartMinute >= 120 && customEndMinute - customStartMinute <= 180;
  const activeWindowLabel = isFlexible
    ? formatMinuteRangeLabel(customStartMinute, customEndMinute)
    : activeShift?.displayHours || '';

  const quote = useMemo(() => {
    if (!activeShift || !activePlan) return { subtotal: 0, discount: 0, total: 0 };
    const subtotal = activeShift.monthlyFeePaise * activePlan.durationMonths;
    const discount = Math.round((subtotal * activePlan.discountPercent) / 100);
    return { subtotal, discount, total: subtotal - discount };
  }, [activeShift, activePlan]);

  useEffect(() => {
    if (!activeShift || !activePlan) return;
    if (activeShift.isFlexible && !customDurationOk) return;
    let cancelled = false;
    const params = new URLSearchParams({
      shiftId: String(activeShift.id),
      startDate,
      durationMonths: String(activePlan.durationMonths),
      ...(rooms[0]?.id ? { roomId: String(rooms[0].id) } : {}),
      ...(activeShift.isFlexible
        ? {
            customStartMinute: String(customStartMinute),
            customEndMinute: String(customEndMinute),
          }
        : {}),
    });
    fetch(`/api/public/availability?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setSeats(json.seats || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Unable to check available desks.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeats(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeShift, activePlan, startDate, rooms, customStartMinute, customEndMinute, customDurationOk]);

  const handleFileRead = (
    file: File | undefined,
    maxBytes: number,
    onDone: (dataUrl: string) => void
  ) => {
    if (!file) return;
    if (file.size > maxBytes) {
      toast.error(`File too large. Keep file under ${Math.round(maxBytes / 1024)} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onDone(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift || !activePlan) return;
    if (!rulesAccepted) {
      toast.error('Please accept the Library Silence & Conduct Rules.');
      return;
    }
    if (isFlexible && !customDurationOk) {
      toast.error('Flexible Short Pass slot must be between 2 and 3 hours.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          whatsappNumber: whatsappNumber || phone,
          email,
          guardianName,
          emergencyContactPhone,
          address,
          examTarget,
          photoUrl,
          idProofMode,
          govIdType,
          govIdLast4,
          govIdDocData: idProofMode === 'ONLINE' ? govIdDocData : '',
          rulesAccepted: true,
          shiftId: activeShift.id,
          planId: activePlan.id,
          seatId,
          startDate,
          customStartMinute: isFlexible ? customStartMinute : null,
          customEndMinute: isFlexible ? customEndMinute : null,
          customSlotLabel: isFlexible ? activeWindowLabel : '',
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not submit admission form.');
        return;
      }

      setSubmitted({
        referenceCode: json.request.referenceCode,
        seatNumber: json.seatNumber ?? null,
        shiftName: json.shiftName || activeShift.name,
        shiftHours: json.shiftHours || activeWindowLabel,
        planName: json.planName || activePlan.name,
        totalPaise: json.quote?.totalPaise ?? quote.total,
        idProofMode: json.request?.idProofMode || idProofMode,
        idVerificationStatus: json.request?.idVerificationStatus || 'PENDING_OFFLINE',
      });
      toast.success('Online Admission & KYC submitted');
    } catch {
      toast.error('Network error while submitting admission.');
    } finally {
      setSubmitting(false);
    }
  };

  const availableSeats = seats.filter((s) => s.availability === 'AVAILABLE');

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B] dark:bg-[#09090B] dark:text-zinc-100 pb-24">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-[#121215]/85 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {center.name}
          </Link>
          <span className="font-display text-sm font-semibold">Online Admission & KYC Form</span>
          <Link
            href="/student"
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            Student Login →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 pt-8">
        {submitted ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-white dark:bg-[#18181B] p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Submitted · Pending Reception Verification
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold">
                  Admission Reference: <span className="font-mono">{submitted.referenceCode}</span>
                </h1>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {fullName} · {submitted.shiftName} ({submitted.shiftHours}) · {submitted.planName} ·{' '}
                  {submitted.seatNumber ? `Desk #${submitted.seatNumber}` : 'Desk assigned at reception'} ·{' '}
                  <span className="font-mono font-semibold">{formatINR(submitted.totalPaise)}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadAdmissionFormPdf({
                    referenceCode: submitted.referenceCode,
                    fullName,
                    phone,
                    whatsappNumber: whatsappNumber || phone,
                    email,
                    guardianName,
                    emergencyContactPhone,
                    address,
                    examTarget,
                    govIdType,
                    govIdLast4,
                    idProofMode: submitted.idProofMode,
                    idVerificationStatus: submitted.idVerificationStatus,
                    shiftName: submitted.shiftName,
                    shiftHours: submitted.shiftHours,
                    planName: submitted.planName,
                    seatLabel: submitted.seatNumber ? `Desk #${submitted.seatNumber}` : 'Any available desk',
                    startDate,
                    quotedTotalPaise: submitted.totalPaise,
                    photoUrl,
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Printable Admission Form (A4 PDF)
              </button>

              {center.whatsappEnabled && center.whatsappNumber && (
                <a
                  href={buildWhatsAppLink(
                    center.whatsappNumber,
                    `Namaste! I submitted Online Admission ${submitted.referenceCode} for ${fullName} (${submitted.shiftName}, ${submitted.planName}${submitted.seatNumber ? `, Desk #${submitted.seatNumber}` : ''}). Please confirm my seat approval.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-500" />
                  Share Reference on WhatsApp
                </a>
              )}
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Carry your original Government ID to {center.address} or call{' '}
              <a href={center.callLink} className="underline font-mono">
                {center.phoneDisplay}
              </a>{' '}
              to complete Cash/UPI fee confirmation.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                Join Gyan Vatika Library
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Complete your admission & KYC details online, reserve your preferred shift and desk, and print your A4 form for reception verification.
              </p>
            </div>

            {/* Section 1: Applicant & KYC Details */}
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <h2 className="font-display text-base font-semibold">1. Personal & KYC Details</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Full Name *</label>
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Student full name"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">10-Digit Mobile *</label>
                  <input
                    required
                    type="tel"
                    pattern="[6-9][0-9]{9}"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98XXXXXXXX"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="Same as mobile if blank"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="optional@example.in"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Guardian / Parent Name *</label>
                  <input
                    required
                    type="text"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Father / Mother / Guardian"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Emergency Contact *</label>
                  <input
                    required
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="10-digit parent mobile"
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Residential Address *</label>
                <input
                  required
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House / Street / Locality, Chota Gamaria / Jamshedpur"
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    ID Proof Submission Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIdProofMode('OFFLINE')}
                      className={`rounded-xl border p-3.5 text-left transition-colors ${
                        idProofMode === 'OFFLINE'
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Submit Photocopy Offline at Library Counter
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Default · Bring a photocopy of your ID when visiting reception.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdProofMode('ONLINE')}
                      className={`rounded-xl border p-3.5 text-left transition-colors ${
                        idProofMode === 'ONLINE'
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Upload ID Proof Online Now
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Optional · Attach a photo or PDF copy now for faster approval.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      Exam / Course Target *
                    </label>
                    <input
                      required
                      type="text"
                      value={examTarget}
                      onChange={(e) => setExamTarget(e.target.value)}
                      className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      ID Type (Optional)
                    </label>
                    <select
                      value={govIdType}
                      onChange={(e) => setGovIdType(e.target.value)}
                      className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                    >
                      <option value="">Share at counter (Optional)</option>
                      <option value="Aadhaar Card">Aadhaar Card</option>
                      <option value="Voter ID">Voter ID</option>
                      <option value="College/School ID">College/School ID</option>
                      <option value="Driving License">Driving License</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      ID Last 4 Digits (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={govIdLast4}
                      onChange={(e) => setGovIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Optional (4 digits)"
                      className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className={`grid grid-cols-1 ${idProofMode === 'ONLINE' ? 'sm:grid-cols-2' : ''} gap-4 pt-1`}>
                  <label className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-500 transition-colors">
                    <div className="flex items-center gap-3">
                      <Upload className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-xs font-medium">
                          {photoUrl ? 'Passport Photo Attached' : 'Upload Passport Photo (Optional)'}
                        </p>
                        <p className="text-[11px] text-zinc-500">JPG/PNG under 900 KB</p>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => handleFileRead(e.target.files?.[0], 950_000, setPhotoUrl)}
                    />
                  </label>

                  {idProofMode === 'ONLINE' && (
                    <label className="rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5 p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-500 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileCheck2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div>
                          <p className="text-xs font-medium">
                            {govIdDocData
                              ? 'KYC ID Copy Attached (Private)'
                              : 'Upload ID Proof Copy (Optional)'}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Image/PDF under 1.5 MB · Staff-only
                          </p>
                        </div>
                      </div>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        onChange={(e) => handleFileRead(e.target.files?.[0], 1_500_000, setGovIdDocData)}
                      />
                    </label>
                  )}
                </div>
              </div>
            </section>

            {/* Section 2: Shift, Plan & Seat Selection */}
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <h2 className="font-display text-base font-semibold">2. Shift, Plan & Desk Selection</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Shift *</label>
                  <select
                    value={shiftId}
                    onChange={(e) => {
                      setShiftId(Number(e.target.value));
                      setSeatId(null);
                    }}
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                  >
                    {shifts.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.name} ({formatINR(sh.monthlyFeePaise)}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Plan Term *</label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(Number(e.target.value))}
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.durationMonths} mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Start Date *</label>
                  <input
                    required
                    type="date"
                    min={todayIST()}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value || todayIST())}
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Preferred Desk</label>
                  <select
                    value={seatId ?? ''}
                    onChange={(e) => setSeatId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm font-mono"
                  >
                    <option value="">Any Available ({availableSeats.length} open)</option>
                    {availableSeats.map((s) => (
                      <option key={s.seatId} value={s.seatId}>
                        Desk #{s.seatNumber} ({s.zone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isFlexible && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Flexible 2–3 Hours Slot · Custom Timing · Fee Negotiable at Counter
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FLEXIBLE_SLOT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCustomStartMinute(preset.startMinute);
                          setCustomEndMinute(preset.endMinute);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                          customStartMinute === preset.startMinute && customEndMinute === preset.endMinute
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={customStartMinute}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        setCustomStartMinute(s);
                        if (customEndMinute - s < 120 || customEndMinute - s > 180) {
                          setCustomEndMinute(Math.min(1260, s + 180));
                        }
                      }}
                      className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-mono"
                    >
                      {MINUTE_OPTIONS.filter((m) => m <= 1140).map((m) => (
                        <option key={m} value={m}>
                          {formatMinute12h(m)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customEndMinute}
                      onChange={(e) => setCustomEndMinute(Number(e.target.value))}
                      className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-mono"
                    >
                      {MINUTE_OPTIONS.filter(
                        (m) => m - customStartMinute >= 120 && m - customStartMinute <= 180
                      ).map((m) => (
                        <option key={m} value={m}>
                          {formatMinute12h(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">
                    {activeShift?.name} ({activeWindowLabel}) · {activePlan?.name} · Starting {formatDateDisplay(startDate)}
                  </p>
                  {loadingSeats && <p className="text-[11px] text-zinc-400">Checking live desks...</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">{isFlexible ? 'Starting Estimate' : 'Estimated Fee'}</p>
                  <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatINR(quote.total)}
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3: Rules & Submit */}
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rulesAccepted}
                  onChange={(e) => setRulesAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-500"
                />
                <span className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  I agree to maintain strict silence inside the reading hall, keep my phone on silent, take calls outside the glass doors, care for desk property, and verify my original Government ID at reception.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting Admission Form...' : 'Submit Online Admission & KYC'}
              </button>
            </section>
          </form>
        )}
      </main>
      <SmartAssistant />
    </div>
  );
}

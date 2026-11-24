'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  HelpCircle,
  Home,
  IdCard,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Send,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/src/components/theme-provider';
import { QrScannerModal } from '@/src/components/qr-scanner-modal';
import { StudyTimerWidget } from '@/src/components/study-timer-widget';
import { SmartAssistant } from '@/src/components/assistant/smart-assistant';
import {
  daysUntil,
  formatDateDisplay,
  formatDateTimeIST,
  formatINR,
  formatTimeIST,
  todayIST,
} from '@/src/lib/format';
import { downloadDigitalIdPdf, downloadPaymentReceiptPdf } from '@/src/lib/pdf-generator';

type StudentTab = 'home' | 'id' | 'attendance' | 'membership' | 'payments' | 'books' | 'helpdesk';

interface StudentPortalPayload {
  center: {
    id: number;
    name: string;
    phoneDisplay: string;
    address: string;
    geofenceEnabled?: boolean;
    geofenceRadiusMeters?: number;
  } | null;
  student: {
    id: number;
    studentCode: string;
    fullName: string;
    phone: string;
    whatsappNumber?: string;
    email: string;
    examTarget: string;
    photoUrl: string;
    qrSecret: string;
    status: string;
  };
  qrPayload: string;
  currentMembership: {
    id: number;
    startDate: string;
    endDate: string;
    graceEndDate: string;
    status: string;
    renewalRequested: boolean;
    customSlotLabel?: string;
    negotiatedMonthlyFeePaise?: number | null;
    negotiationNote?: string;
    shift: { id: number; name: string; displayHours: string; monthlyFeePaise: number };
    plan: { id: number; name: string; durationMonths: number; discountPercent: number };
  } | null;
  seat: { id: number; seatNumber: number; label: string; zone: string } | null;
  openSession: { id: number; checkInAt: string; source: string } | null;
  attendanceHistory: Array<{
    id: number;
    checkInAt: string;
    checkOutAt: string | null;
    durationMinutes: number | null;
    source: string;
    status: string;
  }>;
  monthlyStudyMinutes: number;
  totalPendingBalancePaise: number;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
    status: string;
    dueDate: string;
    snapshotJson: {
      planName?: string;
      shiftName?: string;
      customSlotLabel?: string;
      negotiationNote?: string;
      seatNumber?: number;
    };
  }>;
  payments: Array<{
    id: number;
    invoiceId: number;
    receiptNumber: string;
    amountPaise: number;
    method: string;
    referenceCode: string;
    status: string;
    paidAt: string;
  }>;
  bookLoans: Array<{
    loan: { id: number; issuedAt: string; dueDate: string; returnedAt: string | null; status: string };
    copy: { copyCode: string };
    book: { title: string; author: string };
  }>;
  tickets: Array<{
    id: number;
    ticketNumber: string;
    category: string;
    subject: string;
    status: string;
    createdAt: string;
    messages: Array<{ id: number; senderType: string; senderName: string; message: string; createdAt: string }>;
  }>;
  renewalPreview: {
    currentExpiry: string;
    renewalStart: string;
    newExpiry: string;
    shiftName: string;
    customSlotLabel?: string;
    planName: string;
    seatNumber: number | null;
    amountPaise: number;
  } | null;
}

function getBrowserCoords(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GPS location is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Please enable location permission to check in inside Gyan Vatika Library.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export function StudentPortalClient() {
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StudentTab>('home');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  // Login Form
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [lockoutBanner, setLockoutBanner] = useState('');
  const [loginError, setLoginError] = useState('');

  // Helpdesk form
  const [ticketCategory, setTicketCategory] = useState<'SEAT_CHANGE' | 'WIFI' | 'AC' | 'BOOK_REQUEST' | 'GENERAL'>('SEAT_CHANGE');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [replyByTicket, setReplyByTicket] = useState<Record<number, string>>({});

  // Attendance busy + forgotten checkout recovery
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [recoveryTime, setRecoveryTime] = useState('');

  const loadPortal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student/me');
      if (res.status === 401) {
        setData(null);
        return;
      }
      if (!res.ok) throw new Error('Load error');
      const json = (await res.json()) as StudentPortalPayload;
      setData(json);
    } catch {
      toast.error('Unable to refresh student portal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/student/me')
      .then(async (res) => {
        if (res.status === 401) return null;
        if (!res.ok) throw new Error('Load error');
        return (await res.json()) as StudentPortalPayload;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Unable to refresh student portal.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.qrPayload) return;
    QRCode.toDataURL(data.qrPayload, {
      width: 320,
      margin: 2,
      color: { dark: '#09090B', light: '#FFFFFF' },
    }).then(setQrDataUrl);
  }, [data?.qrPayload]);

  const handleLogin = async (codeOverride?: string, pinOverride?: string) => {
    setAuthBusy(true);
    setLockoutBanner('');
    setLoginError('');
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentCode: codeOverride ?? studentCode,
          pin: pinOverride ?? pin,
        }),
      });
      const json = await res.json();
      if (res.status === 423) {
        const msg = json.error || 'Account temporarily locked after 5 incorrect PIN attempts.';
        setLockoutBanner(msg);
        toast.error(msg);
        return;
      }
      if (!res.ok) {
        setLoginError(json.error || 'Login failed');
        toast.error(json.error || 'Login failed');
        return;
      }
      toast.success(`Welcome back, ${json.student.fullName}`);
      await loadPortal();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/student/login', { method: 'DELETE' });
    setData(null);
  };

  const handleAttendanceAction = async (
    action: 'CHECK_IN' | 'CHECK_OUT' | 'SCAN_RECEPTION_QR' | 'CLOSE_FORGOTTEN_SESSION',
    qrPayload?: string
  ) => {
    setAttendanceBusy(true);
    try {
      let coords: { lat?: number; lng?: number } = {};
      const needsGeo =
        Boolean(data?.center?.geofenceEnabled) &&
        (action === 'CHECK_IN' || (action === 'SCAN_RECEPTION_QR' && !data?.openSession));

      if (needsGeo) {
        try {
          coords = await getBrowserCoords();
        } catch (geoErr) {
          toast.error(geoErr instanceof Error ? geoErr.message : 'Location permission is required.');
          return;
        }
      }

      const res = await fetch('/api/student/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          qrPayload,
          manualCheckoutTime: recoveryTime || undefined,
          ...coords,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Attendance update failed');
        return;
      }
      if (json.duplicatePrevented) {
        toast.info(json.message);
      } else {
        toast.success(json.message);
      }
      setScannerOpen(false);
      await loadPortal();
    } finally {
      setAttendanceBusy(false);
    }
  };

  const handleRenewalRequest = async () => {
    const res = await fetch('/api/student/renewal-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Requested via Student Portal' }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Could not request renewal.');
      return;
    }
    toast.success(json.message);
    await loadPortal();
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/student/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'CREATE',
        category: ticketCategory,
        subject: ticketSubject,
        description: ticketDesc,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Failed to open ticket');
      return;
    }
    toast.success('Support ticket created');
    setTicketSubject('');
    setTicketDesc('');
    await loadPortal();
  };

  const handleTicketReply = async (ticketId: number) => {
    const msg = replyByTicket[ticketId]?.trim();
    if (!msg) return;
    const res = await fetch('/api/student/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'REPLY', ticketId, message: msg }),
    });
    if (res.ok) {
      setReplyByTicket((prev) => ({ ...prev, [ticketId]: '' }));
      await loadPortal();
    }
  };

  const calendarDays = useMemo(() => {
    if (!data) return [];
    const today = todayIST();
    const [y, m] = today.split('-').map(Number);
    const totalDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const checkedDates = new Set(
      data.attendanceHistory.map((s) => new Date(s.checkInAt).toISOString().slice(0, 10))
    );
    return Array.from({ length: totalDays }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return { dayNum, dateStr, present: checkedDates.has(dateStr), isToday: dateStr === today };
    });
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B]">
        <p className="text-sm text-zinc-500">Loading Student Portal...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-[#FAFAFA] dark:bg-[#09090B] px-4 py-8">
        <div className="mx-auto w-full max-w-6xl flex items-center justify-between">
          <Link href="/" className="font-display text-lg font-bold tracking-tight">
            Gyan Vatika
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admission" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
              Online Admission
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link href="/" className="text-xs font-medium text-zinc-500 hover:underline">
              Public Website
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 sm:p-8 shadow-sm my-8">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Student Member Portal
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Sign in with your Student ID
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            Access your digital ID, QR check-in, desk status, receipts, and library books.
          </p>

          {lockoutBanner && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">PIN Temporarily Locked</p>
                <p>{lockoutBanner}</p>
              </div>
            </div>
          )}

          {!lockoutBanner && loginError && (
            <p className="mt-4 text-xs font-medium text-rose-600 dark:text-rose-400">
              {loginError}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Student ID
              </label>
              <input
                required
                type="text"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="GV-2026-001"
                className="w-full h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                4-Digit PIN (or last 4 digits of mobile)
              </label>
              <input
                required
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-sm font-semibold text-white transition-colors"
            >
              {authBusy ? 'Signing in...' : 'Open Student Portal'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Demo Center Quick Sign-In (PIN: 1234)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleLogin('GV-2026-001', '1234')}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-2.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  GV-2026-001
                </p>
                <p className="text-zinc-500 truncate">Aarav · Desk 42</p>
              </button>
              <button
                type="button"
                onClick={() => handleLogin('GV-2026-002', '1234')}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-2.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <p className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                  GV-2026-002
                </p>
                <p className="text-zinc-500 truncate">Priya · Dues & Book</p>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-500">
          Need help unlocking your PIN or activating your account? Call reception at 08580103307.
        </p>
      </div>
    );
  }

  const m = data.currentMembership;
  const shiftWindowDisplay = m?.customSlotLabel || m?.shift.displayHours || '—';
  const daysLeft = m ? daysUntil(m.endDate) : 0;
  const studyHours = (data.monthlyStudyMinutes / 60).toFixed(1);

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-24 md:pb-12">
      <header className="sticky top-0 z-30 h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-[#18181B]/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl h-full px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="font-display text-sm font-bold tracking-tight whitespace-nowrap">
              Gyan Vatika
            </Link>
            <span className="text-zinc-400" aria-hidden="true">/</span>
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 truncate">
              {data.student.studentCode}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {(
              [
                ['home', 'Home'],
                ['id', 'Digital ID'],
                ['attendance', 'Attendance'],
                ['membership', 'Membership'],
                ['payments', 'Receipts'],
                ['books', 'My Books'],
                ['helpdesk', 'Helpdesk'],
              ] as Array<[StudentTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === key
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 space-y-6">
        {/* HOME TAB */}
        {tab === 'home' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {data.student.examTarget} · {data.student.studentCode}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
                      {data.student.fullName}
                    </h1>
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      data.openSession
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-500'
                    }`}
                  >
                    {data.openSession ? 'Checked In Now' : 'Not Checked In'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5">
                    <p className="text-xs text-zinc-500">Assigned Desk</p>
                    <p className="mt-1 font-mono text-xl font-bold">
                      {data.seat ? `Desk #${data.seat.seatNumber}` : 'Unassigned'}
                    </p>
                    <p className="text-[11px] text-zinc-500">{data.seat?.zone || '—'}</p>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5">
                    <p className="text-xs text-zinc-500">Shift Window</p>
                    <p className="mt-1 font-display text-base font-semibold">
                      {m?.shift.name || 'No Active Shift'}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500">
                      {shiftWindowDisplay}
                    </p>
                  </div>

                  <div className="col-span-2 sm:col-span-1 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5">
                    <p className="text-xs text-zinc-500">Membership Expiry</p>
                    <p className="mt-1 font-mono text-base font-bold">
                      {m ? formatDateDisplay(m.endDate) : '—'}
                    </p>
                    <p
                      className={`text-[11px] font-medium ${
                        daysLeft <= 3 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    >
                      {m
                        ? daysLeft >= 0
                          ? `${daysLeft} days remaining`
                          : `In grace period until ${formatDateDisplay(m.graceEndDate)}`
                        : 'Inactive'}
                    </p>
                  </div>
                </div>

                {data.center?.geofenceEnabled && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    On-site GPS check-in active (within {data.center.geofenceRadiusMeters}m of reading hall).
                  </p>
                )}

                <div className="flex flex-wrap gap-3 pt-1">
                  {data.openSession ? (
                    <button
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceAction('CHECK_OUT')}
                      className="flex-1 min-w-[160px] h-12 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      Check Out ({formatTimeIST(data.openSession.checkInAt)})
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceAction('CHECK_IN')}
                      className="flex-1 min-w-[160px] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <LogIn className="h-4 w-4" />
                      {attendanceBusy ? 'Checking Location...' : 'Check In Now'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    <QrCode className="h-4 w-4 text-emerald-500" />
                    Scan Reception QR
                  </button>
                </div>
              </div>

              {data.totalPendingBalancePaise > 0 && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-display text-sm font-semibold">
                        Pending Fee Balance: <span className="font-mono">{formatINR(data.totalPendingBalancePaise)}</span>
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
                        Pay Cash or UPI at the reception counter to clear your invoice balance.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('payments')}
                    className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-xs font-semibold whitespace-nowrap self-start sm:self-center"
                  >
                    View Invoice
                  </button>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-5">
              <StudyTimerWidget compact />

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6">
                <p className="text-xs text-zinc-500">This Month Study Hours</p>
                <p className="mt-1 font-mono text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {studyHours} hrs
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Calculated across all completed and active IST sessions this month.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('attendance')}
                  className="mt-4 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Open Attendance Calendar →
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base font-semibold">Digital Member ID</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Show your revocable QR at reception for quick entry.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('id')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-semibold"
                  >
                    <IdCard className="h-3.5 w-3.5" />
                    Open Digital ID
                  </button>
                </div>
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="Member QR code preview"
                    className="h-20 w-20 rounded-xl border border-zinc-200 bg-white p-1 shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* DIGITAL ID TAB */}
        {tab === 'id' && (
          <div className="max-w-md mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {data.center?.name || 'Gyan Vatika Library'}
                </p>
                <h2 className="font-display text-xl font-bold">{data.student.fullName}</h2>
                <p className="font-mono text-xs text-zinc-500">
                  {data.student.studentCode} · {data.student.examTarget}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-display font-bold text-emerald-600 dark:text-emerald-300">
                {data.student.fullName.slice(0, 2).toUpperCase()}
              </div>
            </div>

            <div className="flex justify-center py-2">
              {qrDataUrl ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <img src={qrDataUrl} alt="Digital ID QR" className="h-52 w-52" />
                </div>
              ) : (
                <div className="h-52 w-52 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Assigned Desk</span>
                <span className="font-mono font-semibold">
                  {data.seat ? `Desk #${data.seat.seatNumber}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Shift</span>
                <span>
                  {m?.shift.name || '—'} ({shiftWindowDisplay})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Valid Until</span>
                <span className="font-mono">{m ? formatDateDisplay(m.endDate) : '—'}</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 text-center">
              Opaque revocable QR token — contains zero personal phone or government ID details.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadDigitalIdPdf({
                    studentCode: data.student.studentCode,
                    fullName: data.student.fullName,
                    examTarget: data.student.examTarget,
                    seatNumber: data.seat?.seatNumber,
                    shiftName: m?.shift.name || 'Member',
                    shiftHours: shiftWindowDisplay,
                    validUntil: m?.endDate || todayIST(),
                    qrDataUrl,
                  })
                }
                className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                Download PDF ID
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print ID
              </button>
            </div>
          </div>
        )}

        {/* ATTENDANCE TAB */}
        {tab === 'attendance' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 space-y-5">
              <StudyTimerWidget compact />

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold">Attendance Controls</h2>
                  <span className="font-mono text-sm font-semibold text-emerald-500">
                    {studyHours} hrs this month
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {data.openSession ? (
                    <button
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceAction('CHECK_OUT')}
                      className="h-12 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      Check Out (Started {formatTimeIST(data.openSession.checkInAt)})
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceAction('CHECK_IN')}
                      className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <LogIn className="h-4 w-4" />
                      {attendanceBusy ? 'Checking Location...' : 'Check In'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <QrCode className="h-4 w-4 text-emerald-500" />
                    Scan Rotating Reception QR
                  </button>
                </div>

                {data.openSession && (
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Forgot to check out earlier?
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={recoveryTime}
                        onChange={(e) => setRecoveryTime(e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2.5 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleAttendanceAction('CLOSE_FORGOTTEN_SESSION')}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap"
                      >
                        Flag & Close
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-display text-sm font-semibold">Monthly Attendance Calendar</h3>
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {calendarDays.map((d) => (
                    <div
                      key={d.dateStr}
                      className={`h-9 rounded-lg flex items-center justify-center font-mono text-xs border ${
                        d.present
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : d.isToday
                          ? 'border-zinc-400 dark:border-zinc-600'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                      }`}
                    >
                      {d.dayNum}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6">
              <h3 className="font-display text-lg font-semibold mb-4">Daily Session History</h3>
              {data.attendanceHistory.length === 0 ? (
                <p className="text-sm text-zinc-500">No attendance sessions recorded yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.attendanceHistory.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <p className="font-mono font-medium">
                          {formatDateTimeIST(s.checkInAt)}
                        </p>
                        <p className="text-zinc-500 mt-0.5">
                          {s.checkOutAt ? `Out: ${formatTimeIST(s.checkOutAt)}` : 'Active session'} · {s.source}
                        </p>
                      </div>
                      <span className="font-mono font-semibold">
                        {s.durationMinutes ? `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m` : s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MEMBERSHIP & RENEWAL TAB */}
        {tab === 'membership' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Current Membership</h2>
              {m ? (
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Plan</span>
                    <span className="font-medium">{m.plan.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Shift</span>
                    <span className="text-right">
                      {m.shift.name} · {shiftWindowDisplay}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Desk</span>
                    <span className="font-mono font-semibold">
                      {data.seat ? `Desk #${data.seat.seatNumber}` : 'Unassigned'}
                    </span>
                  </div>
                  {m.negotiatedMonthlyFeePaise != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Approved Monthly Rate</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatINR(m.negotiatedMonthlyFeePaise)}/mo
                      </span>
                    </div>
                  )}
                  {m.negotiationNote && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Rate Note</span>
                      <span className="text-xs text-zinc-500 text-right">{m.negotiationNote}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Period</span>
                    <span className="font-mono">
                      {formatDateDisplay(m.startDate)} → {formatDateDisplay(m.endDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {m.status}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No active membership.</p>
              )}
            </div>

            {data.renewalPreview && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
                <h2 className="font-display text-lg font-semibold">Renewal Preview</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Renewal Start</span>
                    <span className="font-mono">{formatDateDisplay(data.renewalPreview.renewalStart)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">New Expiry</span>
                    <span className="font-mono">{formatDateDisplay(data.renewalPreview.newExpiry)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Retained Desk</span>
                    <span className="font-mono">
                      {data.renewalPreview.seatNumber ? `Desk #${data.renewalPreview.seatNumber}` : 'TBD'}
                    </span>
                  </div>
                  {data.renewalPreview.customSlotLabel && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Custom Slot</span>
                      <span className="font-mono">{data.renewalPreview.customSlotLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 font-semibold">
                    <span>Estimated Renewal Amount</span>
                    <span className="font-mono">{formatINR(data.renewalPreview.amountPaise)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRenewalRequest}
                  disabled={m?.renewalRequested}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  {m?.renewalRequested ? 'Renewal Requested (Pay at Reception)' : 'Request Renewal (Cash / UPI at Counter)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS & RECEIPTS TAB */}
        {tab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">My Invoices</h2>
              <div className="space-y-3">
                {data.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{inv.invoiceNumber}</span>
                      <span
                        className={`font-semibold ${
                          inv.balancePaise === 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-zinc-500">
                      {inv.snapshotJson?.planName} · {inv.snapshotJson?.shiftName}
                      {inv.snapshotJson?.customSlotLabel ? ` (${inv.snapshotJson.customSlotLabel})` : ''} · Desk #{inv.snapshotJson?.seatNumber ?? '—'}
                    </p>
                    <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 font-mono">
                      <span>Total: {formatINR(inv.totalPaise)}</span>
                      <span>Paid: {formatINR(inv.paidPaise)}</span>
                      <span>Due: {formatINR(inv.balancePaise)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Payment Receipts</h2>
              {data.payments.length === 0 ? (
                <p className="text-sm text-zinc-500">No payments posted yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.payments.map((pay) => {
                    const inv = data.invoices.find((i) => i.id === pay.invoiceId);
                    return (
                      <div
                        key={pay.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="text-xs space-y-1">
                          <p className="font-mono font-semibold">{pay.receiptNumber}</p>
                          <p className="text-zinc-500">
                            {formatINR(pay.amountPaise)} · {pay.method} · {formatDateTimeIST(pay.paidAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            downloadPaymentReceiptPdf({
                              receiptNumber: pay.receiptNumber,
                              invoiceNumber: inv?.invoiceNumber || '—',
                              studentName: data.student.fullName,
                              studentCode: data.student.studentCode,
                              seatNumber: inv?.snapshotJson?.seatNumber ?? data.seat?.seatNumber,
                              shiftName: inv?.snapshotJson?.shiftName ?? m?.shift.name,
                              customSlotLabel: inv?.snapshotJson?.customSlotLabel ?? m?.customSlotLabel,
                              planName: inv?.snapshotJson?.planName ?? m?.plan.name,
                              negotiationNote: inv?.snapshotJson?.negotiationNote ?? m?.negotiationNote,
                              amountPaise: pay.amountPaise,
                              invoiceTotalPaise: inv?.totalPaise ?? pay.amountPaise,
                              invoiceBalancePaise: inv?.balancePaise ?? 0,
                              method: pay.method,
                              referenceCode: pay.referenceCode,
                              paidAt: pay.paidAt,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF Receipt
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MY BOOKS TAB */}
        {tab === 'books' && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold">Issued & Returned Books</h2>
            {data.bookLoans.length === 0 ? (
              <p className="text-sm text-zinc-500">No books borrowed yet. Ask at reception to borrow from the shelf.</p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.bookLoans.map((item) => (
                  <div key={item.loan.id} className="py-3.5 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold">{item.book.title}</p>
                      <p className="text-xs text-zinc-500">
                        {item.book.author} · Copy <span className="font-mono">{item.copy.copyCode}</span>
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span
                        className={`font-semibold ${
                          item.loan.status === 'OVERDUE'
                            ? 'text-rose-500'
                            : item.loan.status === 'RETURNED'
                            ? 'text-zinc-500'
                            : 'text-emerald-500'
                        }`}
                      >
                        {item.loan.status}
                      </span>
                      <p className="font-mono text-zinc-500 mt-0.5">
                        Due {formatDateDisplay(item.loan.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HELPDESK TAB */}
        {tab === 'helpdesk' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleCreateTicket}
              className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-4 self-start"
            >
              <h2 className="font-display text-lg font-semibold">Raise a Support Ticket</h2>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Category</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as typeof ticketCategory)}
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                >
                  <option value="SEAT_CHANGE">Seat Change Request</option>
                  <option value="WIFI">Wi-Fi Issue</option>
                  <option value="AC">AC / Cooling</option>
                  <option value="BOOK_REQUEST">Book Request</option>
                  <option value="GENERAL">General Help</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Subject</label>
                <input
                  required
                  type="text"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="e.g. Move closer to window"
                  className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Details</label>
                <textarea
                  required
                  rows={3}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  placeholder="Describe your request..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-3 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 text-white text-xs font-semibold"
              >
                Submit Ticket
              </button>
            </form>

            <div className="lg:col-span-7 space-y-4">
              {data.tickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-zinc-500">
                        {t.ticketNumber} · {t.category}
                      </span>
                      <h3 className="font-display text-base font-semibold">{t.subject}</h3>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        t.status === 'RESOLVED'
                          ? 'text-emerald-500'
                          : t.status === 'IN_PROGRESS'
                          ? 'text-amber-500'
                          : 'text-zinc-500'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                    {t.messages.map((msg) => (
                      <div key={msg.id} className="text-xs">
                        <span className="font-semibold">{msg.senderName}: </span>
                        <span className="text-zinc-600 dark:text-zinc-300">{msg.message}</span>
                      </div>
                    ))}
                  </div>

                  {t.status !== 'RESOLVED' && (
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={replyByTicket[t.id] || ''}
                        onChange={(e) =>
                          setReplyByTicket((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                        placeholder="Write a reply..."
                        className="flex-1 h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleTicketReply(t.id)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 px-3 text-xs font-semibold"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <nav
        aria-label="Student portal navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md grid grid-cols-5 items-center"
      >
        {(
          [
            ['home', 'Home', Home],
            ['id', 'ID', IdCard],
            ['attendance', 'Scan', CheckCircle2],
            ['payments', 'Fees', Receipt],
            ['books', 'Books', BookOpen],
          ] as Array<[StudentTab, string, React.ComponentType<{ className?: string }>]>
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              tab === key
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium mt-0.5">{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'home' && (
        <div className="md:hidden mx-auto max-w-6xl px-4 mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTab('membership')}
            className="h-11 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-xs font-semibold inline-flex items-center justify-center gap-2"
          >
            <CreditCard className="h-4 w-4 text-emerald-500" />
            Membership & Renewal
          </button>
          <button
            type="button"
            onClick={() => setTab('helpdesk')}
            className="h-11 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-xs font-semibold inline-flex items-center justify-center gap-2"
          >
            <HelpCircle className="h-4 w-4 text-emerald-500" />
            Helpdesk ({data.tickets.length})
          </button>
        </div>
      )}

      <QrScannerModal
        open={scannerOpen}
        title="Scan Reception QR"
        subtitle="Point camera at the live 60-second reception counter QR code"
        placeholder="Or paste reception QR token (GV2-...)"
        onDetected={(payload) => handleAttendanceAction('SCAN_RECEPTION_QR', payload)}
        onClose={() => setScannerOpen(false)}
      />
      <SmartAssistant mode="STUDENT" />
    </div>
  );
}

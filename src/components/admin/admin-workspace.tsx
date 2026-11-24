'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Activity,
  Armchair,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth, googleAuthProvider } from '@/src/lib/firebase';
import { useTheme } from '@/src/components/theme-provider';
import { QrScannerModal } from '@/src/components/qr-scanner-modal';
import { SmartAssistant } from '@/src/components/assistant/smart-assistant';
import {
  adminApiFetch,
  type AdminSection,
  type BootstrapPayload,
  type PendingBookingRequest,
} from './admin-types';
import { AdminOverviewAndReception } from './admin-overview-reception';
import {
  AttendanceDeskSection,
  FinanceAndRenewalsSection,
  SeatsAndBuilderSection,
  StudentsSection,
} from './admin-operations';
import {
  BookLendingSection,
  CenterSettingsSection,
  ExpensesSection,
  HelpdeskSection,
  ReportsSection,
  StaffAuditSection,
  WebsiteCmsSection,
} from './admin-secondary';
import { AdmissionDrawer, PendingRequestDrawer } from './admission-drawer';
import { StudentDetailDrawer } from './student-detail-drawer';

const NAV_ITEMS: Array<{
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'reception', label: 'Reception', icon: UserCheck },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'seats', label: 'Seat Builder & Map', icon: Armchair },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'finance', label: 'Fees & Renewals', icon: CreditCard },
  { id: 'books', label: 'Book Lending', icon: BookOpen },
  { id: 'tickets', label: 'Helpdesk', icon: LifeBuoy },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'cms', label: 'Website Content', icon: Globe },
  { id: 'audit', label: 'Staff Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings, ownerOnly: true },
];

export function AdminWorkspace() {
  const { theme, toggleTheme } = useTheme();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessDeniedEmail, setAccessDeniedEmail] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<number>(1);
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Admin 4-digit PIN gate (optional owner-configured lock)
  const [pinUnlocked, setPinUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('gv_admin_pin_ok') === '1';
  });
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Cross-module interactive states
  const [studentFilter, setStudentFilter] = useState<string>('ALL');
  const studentSearchRef = useRef<HTMLInputElement | null>(null);
  const [admissionOpen, setAdmissionOpen] = useState(false);
  const [admissionSeatId, setAdmissionSeatId] = useState<number | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<PendingBookingRequest | null>(null);
  const [detailStudentId, setDetailStudentId] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [attendanceRefreshSignal, setAttendanceRefreshSignal] = useState(0);
  const [collectTarget, setCollectTarget] = useState<{
    invoiceId: number;
    studentName: string;
    balancePaise: number;
  } | null>(null);
  const [renewTargetStudentId, setRenewTargetStudentId] = useState<number | null>(null);
  const [transferTargetMembership, setTransferTargetMembership] = useState<{
    membershipId: number;
    currentSeatNumber: number | null;
  } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const tok = await user.getIdToken();
        setIdToken(tok);
      } else {
        setIdToken(null);
        setBootstrap(null);
        sessionStorage.removeItem('gv_admin_pin_ok');
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const loadBootstrap = useCallback(
    async (tok: string, shiftIdOverride?: number) => {
      setLoadingBootstrap(true);
      setAuthError(null);
      try {
        const qs = shiftIdOverride ? `?shiftId=${shiftIdOverride}` : '';
        const res = await adminApiFetch<BootstrapPayload>(tok, `/api/admin/bootstrap${qs}`);
        setBootstrap(res);
        setSelectedShiftId(res.kpis.selectedShiftId || res.shifts[0]?.id || 1);
        setAccessDeniedEmail(null);
      } catch (e) {
        const err = e as Error & { status?: number };
        const msg = err.message || 'Unable to verify staff account.';
        setAuthError(msg);
        if (err.status === 403) {
          setAccessDeniedEmail(auth.currentUser?.email || 'this account');
          await signOut(auth).catch(() => {});
        }
      } finally {
        setLoadingBootstrap(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!idToken) return;
    let active = true;
    adminApiFetch<BootstrapPayload>(idToken, '/api/admin/bootstrap')
      .then((res) => {
        if (!active) return;
        setBootstrap(res);
        setSelectedShiftId(res.kpis.selectedShiftId || res.shifts[0]?.id || 1);
        setAuthError(null);
        setAccessDeniedEmail(null);
      })
      .catch(async (e) => {
        if (!active) return;
        const err = e as Error & { status?: number };
        setAuthError(err.message || 'Unable to verify staff account.');
        if (err.status === 403) {
          setAccessDeniedEmail(auth.currentUser?.email || 'this account');
          await signOut(auth).catch(() => {});
        }
      });
    return () => {
      active = false;
    };
  }, [idToken]);

  // Global Ctrl/Cmd+K shortcut to jump to student search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSection('students');
        setTimeout(() => {
          studentSearchRef.current?.focus();
        }, 80);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    setAccessDeniedEmail(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const tok = await cred.user.getIdToken();
      setIdToken(tok);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setVerifyingPin(true);
    try {
      await adminApiFetch(idToken, '/api/admin/pin', {
        method: 'POST',
        body: JSON.stringify({ action: 'VERIFY_PIN', pin: pinInput }),
      });
      sessionStorage.setItem('gv_admin_pin_ok', '1');
      setPinUnlocked(true);
      setPinInput('');
      toast.success('Admin session unlocked.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Incorrect Security PIN.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleStaffScanDetected = useCallback(
    async (payload: string) => {
      if (!idToken) return;
      try {
        const res = await adminApiFetch<{
          duplicatePrevented?: boolean;
          mode?: string;
          studentName?: string;
          message?: string;
        }>(idToken, '/api/admin/attendance', {
          method: 'POST',
          body: JSON.stringify({ action: 'SCAN_STUDENT_QR', qrPayload: payload }),
        });
        setScannerOpen(false);
        setAttendanceRefreshSignal((n) => n + 1);
        loadBootstrap(idToken, selectedShiftId);
        if (res.duplicatePrevented) {
          toast.info(res.message || 'Duplicate scan ignored.');
        } else {
          toast.success(
            `${res.studentName} ${res.mode === 'CHECKED_OUT' ? 'checked out' : 'checked in'}.`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid student QR code.');
      }
    },
    [idToken, loadBootstrap, selectedShiftId]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!firebaseUser || !idToken || !bootstrap) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-[#FAFAFA] dark:bg-[#09090B] px-4 py-8">
        <div className="max-w-md w-full mx-auto my-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-emerald-500">
              Staff & Owner Portal
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div>
            <h1 className="font-display text-2xl font-semibold">Gyan Vatika Admin</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Sign in with an authorized Google account to manage admissions, desks, fee receipts, attendance, and website content.
            </p>
          </div>

          {accessDeniedEmail && (
            <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 text-xs text-rose-500 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Access Denied · Unauthorized Google Account</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                <span className="font-mono">{accessDeniedEmail}</span> is not in the authorized staff whitelist. Please sign in with the library owner or approved staff Google account.
              </p>
            </div>
          )}

          {authError && !accessDeniedEmail && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500 space-y-1">
              <p>{authError}</p>
              <p className="text-zinc-500 dark:text-zinc-400">
                If sign-in popup is blocked inside an embedded preview, open{' '}
                <a
                  href="/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-emerald-500"
                >
                  /admin in a new browser tab
                </a>
                .
              </p>
            </div>
          )}

          {loadingBootstrap ? (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
              Verifying staff whitelist & loading workspace...
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleSignIn}
              className="w-full h-11 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
            >
              {signingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              )}
              Continue with Google
            </button>
          )}

          {firebaseUser && (
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full text-xs text-zinc-500 hover:underline"
            >
              Sign out ({firebaseUser.email})
            </button>
          )}

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <Link href="/" className="hover:underline">
              ← Public Website
            </Link>
            <Link href="/student" className="hover:underline">
              Student Portal →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Optional 4-digit Admin Security PIN Lock Overlay
  if (bootstrap.center.hasAdminPin && !pinUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B] px-4">
        <form
          onSubmit={handleVerifyPin}
          className="max-w-sm w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-6 space-y-5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-500">
              <Lock className="h-4 w-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Admin PIN Lock</span>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-xs text-zinc-500 hover:text-rose-500"
            >
              Sign Out
            </button>
          </div>

          <div>
            <h1 className="font-display text-xl font-semibold">Enter 4-Digit Security PIN</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Signed in as {bootstrap.staff.fullName} ({bootstrap.staff.email})
            </p>
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-full h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-center font-mono text-2xl tracking-[0.6em]"
          />

          <button
            type="submit"
            disabled={verifyingPin || pinInput.length !== 4}
            className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {verifyingPin ? 'Verifying...' : 'Unlock Workspace'}
          </button>
        </form>
      </div>
    );
  }

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || bootstrap.staff.role === 'SUPER_ADMIN'
  );

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] dark:bg-[#09090B]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] p-4 justify-between sticky top-0 h-screen">
        <div className="space-y-5 overflow-y-auto">
          <div className="px-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-500">
              Gyan Vatika
            </p>
            <h2 className="font-display text-base font-semibold">Reception & Admin</h2>
          </div>

          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition whitespace-nowrap ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.id === 'reception' &&
                    bootstrap.attentionQueue.pendingRequests.length > 0 && (
                      <span className="ml-auto font-mono text-[11px] text-amber-500 tabular-nums">
                        {bootstrap.attentionQueue.pendingRequests.length}
                      </span>
                    )}
                  {item.id === 'cms' && bootstrap.waitlistCount > 0 && (
                    <span className="ml-auto font-mono text-[11px] text-sky-500 tabular-nums">
                      {bootstrap.waitlistCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="px-2">
            <p className="text-xs font-semibold truncate">{bootstrap.staff.fullName}</p>
            <p className="font-mono text-[11px] text-emerald-500">{bootstrap.staff.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Site
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-9 w-9 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              aria-label="Sign out"
              className="h-9 w-9 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-rose-500"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Mobile Bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap"
          >
            <Menu className="h-5 w-5" />
            <span>{visibleNav.find((n) => n.id === section)?.label}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-emerald-500">{bootstrap.staff.role}</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {(section === 'overview' || section === 'reception') && (
            <AdminOverviewAndReception
              mode={section}
              bootstrap={bootstrap}
              selectedShiftId={selectedShiftId}
              onChangeShift={(sid) => {
                setSelectedShiftId(sid);
                loadBootstrap(idToken, sid);
              }}
              onNavigate={(sec, opts) => {
                if (opts?.studentFilter) setStudentFilter(opts.studentFilter);
                setSection(sec);
              }}
              onOpenAdmission={() => {
                setAdmissionSeatId(null);
                setAdmissionOpen(true);
              }}
              onOpenScanner={() => setScannerOpen(true)}
              onReviewRequest={(req) => setReviewingRequest(req)}
              onOpenStudent={(sid) => setDetailStudentId(sid)}
              onCollectInvoice={(invoiceId, studentName, balancePaise) => {
                setCollectTarget({ invoiceId, studentName, balancePaise });
                setSection('finance');
              }}
            />
          )}

          {section === 'students' && (
            <StudentsSection
              key={studentFilter}
              token={idToken}
              initialFilter={studentFilter}
              isOwner={bootstrap.staff.role === 'SUPER_ADMIN'}
              searchInputRef={studentSearchRef}
              onOpenAdmission={() => {
                setAdmissionSeatId(null);
                setAdmissionOpen(true);
              }}
              onOpenStudent={(sid) => setDetailStudentId(sid)}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'seats' && (
            <SeatsAndBuilderSection
              token={idToken}
              bootstrap={bootstrap}
              transferTargetMembership={transferTargetMembership}
              onClearTransferTarget={() => setTransferTargetMembership(null)}
              onOpenAdmissionWithSeat={(seatId) => {
                setAdmissionSeatId(seatId);
                setAdmissionOpen(true);
              }}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'attendance' && (
            <AttendanceDeskSection
              token={idToken}
              onOpenScanner={() => setScannerOpen(true)}
              refreshSignal={attendanceRefreshSignal}
            />
          )}

          {section === 'finance' && (
            <FinanceAndRenewalsSection
              key={`${collectTarget?.invoiceId ?? 'none'}-${renewTargetStudentId ?? 'none'}`}
              token={idToken}
              bootstrap={bootstrap}
              collectTarget={collectTarget}
              renewTargetStudentId={renewTargetStudentId}
              onClearTargets={() => {
                setCollectTarget(null);
                setRenewTargetStudentId(null);
              }}
              onOpenStudent={(sid) => setDetailStudentId(sid)}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'books' && <BookLendingSection token={idToken} />}

          {section === 'tickets' && (
            <HelpdeskSection
              token={idToken}
              bootstrap={bootstrap}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'expenses' && (
            <ExpensesSection
              token={idToken}
              bootstrap={bootstrap}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'reports' && <ReportsSection token={idToken} />}

          {section === 'cms' && (
            <WebsiteCmsSection
              token={idToken}
              bootstrap={bootstrap}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}

          {section === 'audit' && <StaffAuditSection token={idToken} />}

          {section === 'settings' && (
            <CenterSettingsSection
              token={idToken}
              bootstrap={bootstrap}
              onRefreshBootstrap={() => loadBootstrap(idToken, selectedShiftId)}
            />
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/75"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="w-72 bg-white dark:bg-[#111113] h-full p-4 flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold">Gyan Vatika Admin</span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSection(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium whitespace-nowrap ${
                        section === item.id
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="rounded-xl border border-rose-500/40 text-rose-500 py-2 text-xs font-semibold"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Drawers & Modals */}
      {admissionOpen && (
        <AdmissionDrawer
          key={`adm-${admissionSeatId ?? 'new'}`}
          open={admissionOpen}
          token={idToken}
          bootstrap={bootstrap}
          preselectedSeatId={admissionSeatId}
          onClose={() => setAdmissionOpen(false)}
          onCompleted={() => loadBootstrap(idToken, selectedShiftId)}
        />
      )}

      {reviewingRequest && (
        <PendingRequestDrawer
          key={reviewingRequest.request.id}
          requestItem={reviewingRequest}
          token={idToken}
          bootstrap={bootstrap}
          onClose={() => setReviewingRequest(null)}
          onCompleted={() => loadBootstrap(idToken, selectedShiftId)}
        />
      )}

      {detailStudentId && (
        <StudentDetailDrawer
          key={detailStudentId}
          studentId={detailStudentId}
          token={idToken}
          bootstrap={bootstrap}
          onClose={() => setDetailStudentId(null)}
          onUpdated={() => loadBootstrap(idToken, selectedShiftId)}
          onCollectInvoice={(invoiceId, studentName, balancePaise) => {
            setDetailStudentId(null);
            setCollectTarget({ invoiceId, studentName, balancePaise });
            setSection('finance');
          }}
          onRenewStudent={(sid) => {
            setDetailStudentId(null);
            setRenewTargetStudentId(sid);
            setSection('finance');
          }}
          onTransferSeat={(membershipId, currentSeatNumber) => {
            setDetailStudentId(null);
            setTransferTargetMembership({ membershipId, currentSeatNumber });
            setSection('seats');
          }}
        />
      )}

      <QrScannerModal
        open={scannerOpen}
        title="Scan Student ID QR"
        subtitle="Scan a student's Digital ID QR or enter their Student ID (e.g. GV-2026-001)"
        onDetected={handleStaffScanDetected}
        onClose={() => setScannerOpen(false)}
      />
      <SmartAssistant mode="ADMIN" staffToken={idToken} />
    </div>
  );
}

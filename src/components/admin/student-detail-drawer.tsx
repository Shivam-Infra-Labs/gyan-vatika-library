'use client';

import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Archive,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  IdCard,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Unlock,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildWhatsAppLink,
  formatDateDisplay,
  formatDateTimeIST,
  formatINR,
  todayIST,
} from '@/src/lib/format';
import { downloadDigitalIdPdf, downloadPaymentReceiptPdf } from '@/src/lib/pdf-generator';
import {
  adminApiFetch,
  type BootstrapPayload,
  type StudentDetailPayload,
} from './admin-types';

interface StudentDetailDrawerProps {
  studentId: number | null;
  token: string;
  bootstrap: BootstrapPayload;
  onClose: () => void;
  onUpdated?: () => void;
  onCollectInvoice: (invoiceId: number, studentName: string, balancePaise: number) => void;
  onRenewStudent: (studentId: number) => void;
  onTransferSeat: (membershipId: number, currentSeatNumber: number | null) => void;
}

export function StudentDetailDrawer({
  studentId,
  token,
  bootstrap,
  onClose,
  onUpdated,
  onCollectInvoice,
  onRenewStudent,
  onTransferSeat,
}: StudentDetailDrawerProps) {
  const [detail, setDetail] = useState<StudentDetailPayload | null>(null);
  const [kycDoc, setKycDoc] = useState<{ govIdDocData: string; photoUrl: string } | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(false);

  // Inline Edit Profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGuardian, setEditGuardian] = useState('');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editExam, setEditExam] = useState('');
  const [editGovType, setEditGovType] = useState('');
  const [editGovLast4, setEditGovLast4] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [verifyIdType, setVerifyIdType] = useState('');
  const [verifyIdLast4, setVerifyIdLast4] = useState('');
  const [verifyIdNote, setVerifyIdNote] = useState('');

  const reloadDetail = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await adminApiFetch<StudentDetailPayload>(
        token,
        `/api/admin/students?id=${studentId}`
      );
      setDetail(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to reload student profile.');
    }
  }, [studentId, token]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    adminApiFetch<StudentDetailPayload>(token, `/api/admin/students?id=${studentId}`)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err) => {
        if (active) {
          toast.error(err instanceof Error ? err.message : 'Unable to load student profile.');
        }
      });
    return () => {
      active = false;
    };
  }, [studentId, token]);

  if (!studentId) return null;

  const currentMembership = detail?.memberships[0];
  const activeSeat = detail?.seatHistory.find((s) => s.allocation.status === 'ACTIVE');
  const openInvoice = detail?.invoices.find((i) => i.balancePaise > 0 && i.status !== 'REVERSED');
  const isLocked = Boolean(
    detail?.student.lockedUntil && new Date(detail.student.lockedUntil) > new Date()
  );

  const handleToggleKycDoc = async () => {
    if (!detail) return;
    if (kycDoc) {
      setKycDoc(null);
      return;
    }
    setLoadingKyc(true);
    try {
      const res = await adminApiFetch<{ govIdDocData: string; photoUrl: string }>(
        token,
        `/api/admin/students/${detail.student.id}/document?source=student`
      );
      setKycDoc(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load KYC document.');
    } finally {
      setLoadingKyc(false);
    }
  };

  const handleStartEdit = () => {
    if (!detail) return;
    setEditName(detail.student.fullName);
    setEditPhone(detail.student.phone);
    setEditWhatsapp(detail.student.whatsappNumber || detail.student.phone);
    setEditEmail(detail.student.email || '');
    setEditGuardian(detail.student.guardianName || detail.student.emergencyContactName || '');
    setEditEmergencyPhone(detail.student.emergencyContactPhone || '');
    setEditAddress(detail.student.address || '');
    setEditExam(detail.student.examTarget || 'General');
    setEditGovType(detail.student.govIdType || '');
    setEditGovLast4(detail.student.govIdLast4 || '');
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBusyAction(true);
    try {
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'EDIT_STUDENT',
          studentId: detail.student.id,
          fullName: editName.trim(),
          phone: editPhone.replace(/\D/g, '').slice(-10),
          whatsappNumber: editWhatsapp.replace(/\D/g, '').slice(-10),
          email: editEmail.trim(),
          guardianName: editGuardian.trim(),
          emergencyContactPhone: editEmergencyPhone.replace(/\D/g, '').slice(-10),
          address: editAddress.trim(),
          examTarget: editExam.trim() || 'General',
          govIdType: editGovType.trim(),
          govIdLast4: editGovLast4.trim(),
        }),
      });
      toast.success('Student profile updated.');
      setEditing(false);
      await reloadDetail();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleArchiveOrReactivate = async () => {
    if (!detail) return;
    setBusyAction(true);
    try {
      const action =
        detail.student.status === 'INACTIVE' ? 'REACTIVATE_STUDENT' : 'ARCHIVE_STUDENT';
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          studentId: detail.student.id,
          ...(action === 'ARCHIVE_STUDENT' ? { releaseSeat: true } : {}),
        }),
      });
      toast.success(
        action === 'ARCHIVE_STUDENT'
          ? 'Student archived and assigned desk released.'
          : 'Student reactivated.'
      );
      await reloadDetail();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update student status.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnlockPin = async () => {
    if (!detail) return;
    setBusyAction(true);
    try {
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'UNLOCK_PIN', studentId: detail.student.id }),
      });
      toast.success('Cleared student PIN lockout.');
      await reloadDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to unlock PIN.');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!detail) return;
    setBusyAction(true);
    try {
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'DELETE_STUDENT', studentId: detail.student.id }),
      });
      toast.success(`Permanently deleted ${detail.student.fullName} and freed linked desk/books.`);
      setConfirmPermanentDelete(false);
      onUpdated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete student.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleMarkOfflineIdVerified = async () => {
    if (!detail) return;
    setBusyAction(true);
    try {
      await adminApiFetch(token, '/api/admin/students', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'VERIFY_ID_PROOF',
          studentId: detail.student.id,
          govIdType: verifyIdType.trim() || detail.student.govIdType || '',
          govIdLast4: verifyIdLast4.trim() || detail.student.govIdLast4 || '',
          idVerificationNote:
            verifyIdNote.trim() ||
            detail.student.idVerificationNote ||
            'Photocopy verified at reception counter',
        }),
      });
      toast.success(`ID proof marked verified for ${detail.student.fullName}.`);
      await reloadDetail();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to mark ID verified.');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePrintDigitalId = async () => {
    if (!detail) return;
    const qrDataUrl = await QRCode.toDataURL(
      JSON.stringify({ type: 'GV_STUDENT_ID', studentCode: detail.student.studentCode }),
      { width: 220, margin: 1 }
    );
    downloadDigitalIdPdf({
      studentCode: detail.student.studentCode,
      fullName: detail.student.fullName,
      examTarget: detail.student.examTarget,
      seatNumber: activeSeat?.seat.seatNumber ?? null,
      shiftName: currentMembership?.shift.name ?? 'Active Shift',
      shiftHours:
        currentMembership?.membership.customSlotLabel ||
        currentMembership?.shift.displayHours ||
        '',
      validUntil: currentMembership?.membership.endDate ?? todayIST(),
      qrDataUrl,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Student Profile"
    >
      <div className="w-full max-w-2xl h-full overflow-y-auto bg-white dark:bg-[#09090B] border-l border-zinc-200 dark:border-zinc-800 p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <p className="font-mono text-xs text-emerald-500">
              {detail?.student.studentCode || 'Loading...'}
              {detail?.student.status === 'INACTIVE' ? ' · ARCHIVED' : ''}
            </p>
            <h2 className="font-display text-lg font-semibold">
              {detail?.student.fullName || 'Student Profile'}
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

        {!detail ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Quick Actions Bar */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onRenewStudent(detail.student.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Renew
              </button>
              {currentMembership && (
                <button
                  type="button"
                  onClick={() =>
                    onTransferSeat(
                      currentMembership.membership.id,
                      activeSeat?.seat.seatNumber ?? null
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Change Seat
                </button>
              )}
              {openInvoice && (
                <button
                  type="button"
                  onClick={() =>
                    onCollectInvoice(
                      openInvoice.id,
                      detail.student.fullName,
                      openInvoice.balancePaise
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Collect {formatINR(openInvoice.balancePaise)}
                </button>
              )}
              <button
                type="button"
                onClick={handlePrintDigitalId}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
              >
                <IdCard className="h-3.5 w-3.5" />
                Print ID
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultPin = detail.student.phone.slice(-4);
                  navigator.clipboard?.writeText(
                    `Gyan Vatika Student Portal\nURL: ${window.location.origin}/student\nStudent ID: ${detail.student.studentCode}\nPIN: ${defaultPin} (last 4 digits of registered phone)`
                  );
                  toast.success('Copied portal login instructions for this student.');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                Copy Login
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 whitespace-nowrap"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Profile
              </button>
              <a
                href={buildWhatsAppLink(
                  detail.student.whatsappNumber || detail.student.phone,
                  openInvoice
                    ? `Namaste ${detail.student.fullName}, reminder from Gyan Vatika Library regarding pending balance ${formatINR(openInvoice.balancePaise)} (${openInvoice.invoiceNumber}).`
                    : `Namaste ${detail.student.fullName}, message from Gyan Vatika Library (${detail.student.studentCode}).`
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 text-emerald-500 px-3.5 py-2 text-xs font-semibold hover:bg-emerald-500/10 whitespace-nowrap"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </a>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleArchiveOrReactivate}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 text-rose-500 px-3.5 py-2 text-xs font-semibold hover:bg-rose-500/10 whitespace-nowrap"
              >
                {detail.student.status === 'INACTIVE' ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    Reactivate
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5" />
                    Archive & Release Seat
                  </>
                )}
              </button>
              {bootstrap.staff.role === 'SUPER_ADMIN' && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => setConfirmPermanentDelete((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-600/50 bg-rose-600/10 text-rose-500 px-3.5 py-2 text-xs font-semibold hover:bg-rose-600/20 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Permanently
                </button>
              )}
            </div>

            {confirmPermanentDelete && bootstrap.staff.role === 'SUPER_ADMIN' && (
              <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 space-y-2.5 text-xs">
                <p className="font-semibold text-rose-500">
                  Permanently delete {detail.student.fullName} ({detail.student.studentCode})?
                </p>
                <p className="text-zinc-600 dark:text-zinc-300">
                  This cascades and removes memberships, seat allocations, invoices, payments, attendance logs, and tickets, and returns any issued books or desk. Use &ldquo;Archive &amp; Release Seat&rdquo; instead if you want to keep fee history.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handlePermanentDelete}
                    className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 font-semibold"
                  >
                    {busyAction ? 'Deleting...' : 'Confirm Permanent Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPermanentDelete(false)}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isLocked && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-rose-500 font-medium">
                  Portal PIN locked until {formatDateTimeIST(detail.student.lockedUntil)} after 5 failed attempts.
                </span>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={handleUnlockPin}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 font-semibold whitespace-nowrap"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  Unlock PIN
                </button>
              </div>
            )}

            {editing ? (
              <form
                onSubmit={handleSaveEdit}
                className="rounded-2xl border border-emerald-500/40 bg-zinc-50 dark:bg-[#18181B] p-4 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">Edit Student Details</h3>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-zinc-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full Name"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
                  />
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Mobile (10 digits)"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
                  />
                  <input
                    type="tel"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="WhatsApp Number"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
                  />
                  <input
                    type="text"
                    value={editExam}
                    onChange={(e) => setEditExam(e.target.value)}
                    placeholder="Target Exam"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
                  />
                  <input
                    type="text"
                    value={editGuardian}
                    onChange={(e) => setEditGuardian(e.target.value)}
                    placeholder="Guardian / Emergency Name"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
                  />
                  <input
                    type="tel"
                    value={editEmergencyPhone}
                    onChange={(e) => setEditEmergencyPhone(e.target.value)}
                    placeholder="Emergency Phone"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
                  />
                  <input
                    type="text"
                    value={editGovType}
                    onChange={(e) => setEditGovType(e.target.value)}
                    placeholder="Gov ID Type"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
                  />
                  <input
                    type="text"
                    maxLength={4}
                    value={editGovLast4}
                    onChange={(e) => setEditGovLast4(e.target.value)}
                    placeholder="ID Last 4"
                    className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5 font-mono"
                  />
                </div>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Address"
                  className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2.5"
                />
                <button
                  type="submit"
                  disabled={busyAction}
                  className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-semibold"
                >
                  Save Profile Changes
                </button>
              </form>
            ) : (
              /* Profile & Private KYC */
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181B] p-4 grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500 block">Mobile / WhatsApp</span>
                  <span className="font-mono text-sm">
                    {detail.student.phone}
                    {detail.student.whatsappNumber &&
                    detail.student.whatsappNumber !== detail.student.phone
                      ? ` · WA ${detail.student.whatsappNumber}`
                      : ''}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Target Exam</span>
                  <span>{detail.student.examTarget || 'General'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Emergency / Guardian</span>
                  <span>
                    {detail.student.guardianName || detail.student.emergencyContactName || '—'}{' '}
                    {detail.student.emergencyContactPhone
                      ? `(${detail.student.emergencyContactPhone})`
                      : ''}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Address</span>
                  <span>{detail.student.address || '—'}</span>
                </div>
                <div className="sm:col-span-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-500" />
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold font-mono ${
                          detail.student.idVerificationStatus === 'VERIFIED'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : detail.student.idVerificationStatus === 'UPLOADED'
                            ? 'bg-sky-500/15 text-sky-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {detail.student.idVerificationStatus === 'VERIFIED'
                          ? 'ID Verified'
                          : detail.student.idVerificationStatus === 'UPLOADED'
                          ? 'Online ID Uploaded'
                          : 'Offline ID Pending'}
                      </span>
                      <span>
                        {detail.student.govIdType || 'ID Type not set'}{' '}
                        {detail.student.govIdLast4 ? `· •••• ${detail.student.govIdLast4}` : ''}
                        {detail.student.idVerificationNote
                          ? ` · ${detail.student.idVerificationNote}`
                          : ''}
                      </span>
                    </div>
                    {detail.student.hasGovIdDoc && (
                      <button
                        type="button"
                        disabled={loadingKyc}
                        onClick={handleToggleKycDoc}
                        className="inline-flex items-center gap-1 text-emerald-500 font-medium"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {loadingKyc ? 'Loading...' : kycDoc ? 'Hide Document' : 'View ID Copy'}
                      </button>
                    )}
                  </div>

                  {detail.student.idVerificationStatus !== 'VERIFIED' && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-3 space-y-2">
                      <div className="grid sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={verifyIdType}
                          onChange={(e) => setVerifyIdType(e.target.value)}
                          placeholder={detail.student.govIdType || 'ID Type (Aadhaar...)'}
                          className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-transparent px-2 text-xs"
                        />
                        <input
                          type="text"
                          maxLength={4}
                          value={verifyIdLast4}
                          onChange={(e) =>
                            setVerifyIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))
                          }
                          placeholder={detail.student.govIdLast4 || 'Last 4 digits'}
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
                        disabled={busyAction}
                        onClick={handleMarkOfflineIdVerified}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-semibold"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark Offline ID Verified
                      </button>
                    </div>
                  )}
                </div>
                {kycDoc?.govIdDocData && (
                  <div className="sm:col-span-2">
                    <img
                      src={kycDoc.govIdDocData}
                      alt="Private KYC document"
                      className="max-h-56 rounded-xl border border-zinc-300 dark:border-zinc-700 object-contain"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Active Membership & Seat History */}
            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold">Memberships & Seat History</h3>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {detail.memberships.map((m) => (
                  <div key={m.membership.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium">
                        {m.shift.name}
                        {m.membership.customSlotLabel ? ` (${m.membership.customSlotLabel})` : ''} ·{' '}
                        {m.plan.name}
                      </p>
                      <p className="font-mono text-zinc-500">
                        {formatDateDisplay(m.membership.startDate)} →{' '}
                        {formatDateDisplay(m.membership.endDate)}
                        {m.membership.negotiatedMonthlyFeePaise
                          ? ` · Rate ${formatINR(m.membership.negotiatedMonthlyFeePaise)}/mo`
                          : ''}
                      </p>
                      {m.membership.negotiationNote && (
                        <p className="text-zinc-500 mt-0.5">{m.membership.negotiationNote}</p>
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-semibold">
                      {m.membership.status}
                    </span>
                  </div>
                ))}
              </div>
              {detail.seatHistory.length > 0 && (
                <div className="text-xs text-zinc-500 flex flex-wrap gap-3">
                  {detail.seatHistory.map((s) => (
                    <span key={s.allocation.id} className="font-mono">
                      Desk #{s.seat.seatNumber} ({s.allocation.status} · {s.allocation.startDate})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices & Receipts */}
            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold">Invoices & Receipts</h3>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {detail.invoices.map((inv) => (
                  <div key={inv.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-mono font-medium">{inv.invoiceNumber}</p>
                      <p className="text-zinc-500">
                        Total {formatINR(inv.totalPaise)} · Paid {formatINR(inv.paidPaise)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-amber-500">
                        {inv.balancePaise > 0 ? `Due ${formatINR(inv.balancePaise)}` : inv.status}
                      </p>
                    </div>
                  </div>
                ))}
                {detail.payments.map((pay) => {
                  const inv = detail.invoices.find((i) => i.id === pay.invoiceId);
                  return (
                    <div
                      key={pay.id}
                      className="p-3 flex items-center justify-between text-xs bg-zinc-50/50 dark:bg-zinc-900/30"
                    >
                      <div>
                        <p className="font-mono font-medium">
                          {pay.receiptNumber} · {pay.method}
                        </p>
                        <p className="text-zinc-500">{formatDateTimeIST(pay.paidAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          downloadPaymentReceiptPdf({
                            receiptNumber: pay.receiptNumber,
                            invoiceNumber: inv?.invoiceNumber || 'INV',
                            studentName: detail.student.fullName,
                            studentCode: detail.student.studentCode,
                            seatNumber: activeSeat?.seat.seatNumber ?? null,
                            shiftName: inv?.snapshotJson?.shiftName || currentMembership?.shift.name,
                            customSlotLabel:
                              inv?.snapshotJson?.shiftHours ||
                              currentMembership?.membership.customSlotLabel,
                            planName: inv?.snapshotJson?.planName || currentMembership?.plan.name,
                            negotiationNote:
                              inv?.snapshotJson?.negotiationNote ||
                              currentMembership?.membership.negotiationNote,
                            amountPaise: pay.amountPaise,
                            invoiceTotalPaise: inv?.totalPaise ?? pay.amountPaise,
                            invoiceBalancePaise: inv?.balancePaise ?? 0,
                            method: pay.method,
                            referenceCode: pay.referenceCode,
                            paidAt: pay.paidAt,
                          })
                        }
                        className="inline-flex items-center gap-1 text-emerald-500 font-medium"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {formatINR(pay.amountPaise)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attendance & Loans */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold">Recent Attendance</h3>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 max-h-48 overflow-y-auto">
                  {detail.attendance.length === 0 ? (
                    <p className="p-3 text-xs text-zinc-500">No visits logged yet.</p>
                  ) : (
                    detail.attendance.slice(0, 8).map((a) => (
                      <div key={a.id} className="p-2.5 text-xs flex justify-between">
                        <span>{formatDateTimeIST(a.checkInAt)}</span>
                        <span className="font-mono text-zinc-500">
                          {a.durationMinutes ? `${a.durationMinutes}m` : a.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  Book Loans
                </h3>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 max-h-48 overflow-y-auto">
                  {detail.loans.length === 0 ? (
                    <p className="p-3 text-xs text-zinc-500">No books borrowed.</p>
                  ) : (
                    detail.loans.map((l) => (
                      <div key={l.loan.id} className="p-2.5 text-xs">
                        <p className="font-medium">{l.book.title}</p>
                        <p className="font-mono text-zinc-500">
                          {l.copy.copyCode} · {l.loan.status} (Due {formatDateDisplay(l.loan.dueDate)})
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {bootstrap.center.whatsappEnabled && bootstrap.center.whatsappNumber && (
              <p className="text-xs text-zinc-500">
                Center WhatsApp active: +{bootstrap.center.whatsappNumber}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

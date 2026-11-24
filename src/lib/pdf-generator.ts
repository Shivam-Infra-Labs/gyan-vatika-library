'use client';

import { jsPDF } from 'jspdf';
import { formatDateDisplay, formatDateTimeIST, formatINR } from './format.ts';

export interface ReceiptPdfPayload {
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  studentCode: string;
  seatNumber?: number | null;
  shiftName?: string;
  customSlotLabel?: string;
  planName?: string;
  negotiationNote?: string;
  amountPaise: number;
  invoiceTotalPaise: number;
  invoiceBalancePaise: number;
  method: string;
  referenceCode?: string;
  paidAt: string | Date;
}

export function downloadPaymentReceiptPdf(data: ReceiptPdfPayload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 420, 74, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('GYAN VATIKA LIBRARY', 28, 34);
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 210);
  doc.text('Sunful Complex Service Rd, Near Manish Net Cafe, Chota Gamaria', 28, 50);
  doc.text('Phone: 08580103307', 28, 62);

  doc.setTextColor(24, 24, 27);
  doc.setFontSize(13);
  doc.text('FEE PAYMENT RECEIPT', 28, 106);

  doc.setFontSize(9.5);
  doc.setTextColor(82, 82, 91);
  doc.text(`Receipt No: ${data.receiptNumber}`, 28, 130);
  doc.text(`Invoice No: ${data.invoiceNumber}`, 230, 130);
  doc.text(`Paid On: ${formatDateTimeIST(data.paidAt)}`, 28, 148);
  doc.text(`Payment Mode: ${data.method}${data.referenceCode ? ` (${data.referenceCode})` : ''}`, 230, 148);

  doc.setDrawColor(228, 228, 231);
  doc.line(28, 166, 392, 166);

  doc.setTextColor(24, 24, 27);
  doc.setFontSize(10.5);
  doc.text(`Member: ${data.studentName} (${data.studentCode})`, 28, 190);
  const shiftDesc = data.customSlotLabel
    ? `${data.shiftName || 'Flexible'} (${data.customSlotLabel})`
    : data.shiftName || '—';
  doc.text(`Assigned Desk: ${data.seatNumber ? `Desk #${data.seatNumber}` : '—'} · ${shiftDesc}`, 28, 208);
  doc.text(`Plan: ${data.planName || 'Membership'}`, 28, 226);
  if (data.negotiationNote) {
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text(`Rate Note: ${data.negotiationNote}`, 28, 241);
  }

  doc.setTextColor(24, 24, 27);
  doc.setFillColor(244, 244, 245);
  doc.rect(28, 254, 364, 90, 'F');
  doc.setFontSize(10);
  doc.text('Invoice Total', 44, 280);
  doc.text(formatINR(data.invoiceTotalPaise), 376, 280, { align: 'right' });

  doc.setFontSize(11);
  doc.text('Amount Paid (This Receipt)', 44, 304);
  doc.text(formatINR(data.amountPaise), 376, 304, { align: 'right' });

  doc.setFontSize(10);
  doc.text('Remaining Balance', 44, 328);
  doc.text(formatINR(data.invoiceBalancePaise), 376, 328, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text('System-generated receipt · Gyan Vatika Library, Chota Gamaria, Jharkhand 832108', 28, 385);

  doc.save(`${data.receiptNumber}.pdf`);
}

export interface DigitalIdPdfPayload {
  studentCode: string;
  fullName: string;
  examTarget: string;
  seatNumber?: number | null;
  shiftName: string;
  shiftHours: string;
  validUntil: string;
  qrDataUrl: string;
}

export function downloadDigitalIdPdf(data: DigitalIdPdfPayload) {
  const doc = new jsPDF({ unit: 'pt', format: [260, 400] });
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 260, 400, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(9);
  doc.text('GYAN VATIKA LIBRARY · MEMBER ID', 20, 30);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(data.fullName, 20, 58);

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(10);
  doc.text(`${data.studentCode} · ${data.examTarget}`, 20, 76);

  if (data.qrDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(55, 100, 150, 150, 8, 8, 'F');
    doc.addImage(data.qrDataUrl, 'PNG', 63, 108, 134, 134);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`Desk: ${data.seatNumber ? `#${data.seatNumber}` : 'Unassigned'}`, 20, 282);
  doc.text(`Shift: ${data.shiftName}`, 20, 300);
  doc.setFontSize(9.5);
  doc.setTextColor(161, 161, 170);
  doc.text(data.shiftHours, 20, 316);
  doc.text(`Valid Until: ${formatDateDisplay(data.validUntil)}`, 20, 338);
  doc.setFontSize(8);
  doc.text('Chota Gamaria · 08580103307', 20, 376);

  doc.save(`${data.studentCode}-ID.pdf`);
}

export interface AdmissionFormPdfPayload {
  referenceCode: string;
  fullName: string;
  phone: string;
  whatsappNumber?: string;
  email?: string;
  guardianName?: string;
  emergencyContactPhone?: string;
  address?: string;
  examTarget: string;
  govIdType?: string;
  govIdLast4?: string;
  idProofMode?: string;
  idVerificationStatus?: string;
  idVerificationNote?: string;
  shiftName: string;
  shiftHours: string;
  planName: string;
  seatLabel?: string;
  startDate: string;
  quotedTotalPaise: number;
  photoUrl?: string;
}

export function downloadAdmissionFormPdf(data: AdmissionFormPdfPayload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 595, 84, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('GYAN VATIKA LIBRARY — ADMISSION & KYC FORM', 36, 36);
  doc.setFontSize(9.5);
  doc.setTextColor(200, 200, 210);
  doc.text('SUNFUL COMPLEX Service Rd, Tata Kandra Rd, Near Manish Net Cafe, Chota Gamaria, Jharkhand 832108', 36, 56);
  doc.text('Phone: 08580103307 · Reference: ' + data.referenceCode, 36, 70);

  if (data.photoUrl && data.photoUrl.startsWith('data:image/')) {
    try {
      const fmt = data.photoUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.setDrawColor(212, 212, 216);
      doc.rect(456, 104, 102, 118);
      doc.addImage(data.photoUrl, fmt, 460, 108, 94, 110);
    } catch {
      // ignore invalid data url image embedding
    }
  }

  doc.setTextColor(24, 24, 27);
  doc.setFontSize(12);
  doc.text('1. Applicant Personal & Contact Details', 36, 120);

  doc.setFontSize(10);
  const rows: Array<[string, string]> = [
    ['Full Name', data.fullName],
    ['Mobile Number', data.phone],
    ['WhatsApp Number', data.whatsappNumber || data.phone],
    ['Email Address', data.email || '—'],
    ['Guardian / Parent Name', data.guardianName || '—'],
    ['Emergency Contact', data.emergencyContactPhone || '—'],
    ['Exam / Study Target', data.examTarget],
    ['Residential Address', data.address || '—'],
    [
      'ID Proof Details',
      data.govIdType
        ? `${data.govIdType}${data.govIdLast4 ? ` (ending ${data.govIdLast4})` : ''}`
        : 'To be checked at counter',
    ],
    [
      'ID Verification',
      data.idVerificationStatus === 'VERIFIED'
        ? `Verified Offline at Counter${data.idVerificationNote ? ` (${data.idVerificationNote})` : ''}`
        : data.idVerificationStatus === 'UPLOADED' || data.idProofMode === 'ONLINE'
        ? 'Online ID Uploaded (Counter Check Pending)'
        : 'Offline Photocopy to be Attached at Library Counter',
    ],
  ];

  let y = 144;
  for (const [label, value] of rows) {
    doc.setTextColor(82, 82, 91);
    doc.text(`${label}:`, 36, y);
    doc.setTextColor(24, 24, 27);
    const wrapped = doc.splitTextToSize(value, 280);
    doc.text(wrapped, 175, y);
    y += Math.max(20, wrapped.length * 14);
  }

  y += 14;
  doc.setDrawColor(228, 228, 231);
  doc.line(36, y, 559, y);
  y += 26;

  doc.setFontSize(12);
  doc.setTextColor(24, 24, 27);
  doc.text('2. Study Seat, Shift & Fee Selection', 36, y);
  y += 24;

  doc.setFontSize(10);
  const seatRows: Array<[string, string]> = [
    ['Shift Selected', `${data.shiftName} (${data.shiftHours})`],
    ['Membership Plan', data.planName],
    ['Preferred Desk', data.seatLabel || 'Any available desk'],
    ['Preferred Start Date', formatDateDisplay(data.startDate)],
    ['Estimated Fee Quote', formatINR(data.quotedTotalPaise)],
  ];
  for (const [label, value] of seatRows) {
    doc.setTextColor(82, 82, 91);
    doc.text(`${label}:`, 36, y);
    doc.setTextColor(24, 24, 27);
    doc.text(value, 175, y);
    y += 20;
  }

  y += 18;
  doc.setFillColor(244, 244, 245);
  doc.rect(36, y, 523, 86, 'F');
  doc.setFontSize(9);
  doc.setTextColor(63, 63, 70);
  doc.text('LIBRARY SILENCE & CONDUCT DECLARATION', 48, y + 20);
  const decl =
    'I agree to maintain strict silence inside the reading hall, keep my mobile phone on silent mode, attend calls outside the glass entrance doors, preserve desk property, and renew membership within the 3-day grace window to keep my reserved desk.';
  doc.text(doc.splitTextToSize(decl, 498), 48, y + 38);

  y += 130;
  doc.setDrawColor(161, 161, 170);
  doc.line(36, y, 220, y);
  doc.line(375, y, 559, y);
  doc.setFontSize(9);
  doc.text('Applicant Signature & Date', 36, y + 14);
  doc.text('Reception Verification Signature', 375, y + 14);

  doc.save(`${data.referenceCode}-Admission-Form.pdf`);
}

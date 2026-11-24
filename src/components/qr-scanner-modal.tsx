'use client';

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Keyboard, Upload, X } from 'lucide-react';

interface QrScannerModalProps {
  open: boolean;
  title: string;
  subtitle: string;
  placeholder?: string;
  onDetected: (payload: string) => Promise<void> | void;
  onClose: () => void;
}

export function QrScannerModal({
  open,
  title,
  subtitle,
  placeholder = 'Paste QR token or Student ID (e.g. GV-2026-001)',
  onDetected,
  onClose,
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let stopped = false;

    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API unavailable here. Upload a QR photo or enter the code manually below.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scanTick = () => {
          if (stopped) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height);
              if (code?.data) {
                stopped = true;
                onDetected(code.data);
                return;
              }
            }
          }
          rafId = requestAnimationFrame(scanTick);
        };
        rafId = requestAnimationFrame(scanTick);
      } catch {
        setCameraError(
          'Camera access was denied or unavailable. Use image upload or manual code entry below.'
        );
      }
    };

    startCamera();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(data.data, data.width, data.height);
      if (decoded?.data) {
        onDetected(decoded.data);
      } else {
        setCameraError('Could not read a QR code from that image. Enter the code manually below.');
      }
    };
    img.src = URL.createObjectURL(file);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="font-display text-sm font-semibold">{title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!cameraError ? (
            <div className="relative aspect-square max-h-64 w-full rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-emerald-400/70" />
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <Camera className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-2.5 px-3 text-xs font-medium cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <Upload className="h-4 w-4 text-emerald-500" />
            Scan QR from Photo / Screenshot
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!manualValue.trim()) return;
              setBusy(true);
              await onDetected(manualValue.trim());
              setBusy(false);
            }}
            className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800"
          >
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <Keyboard className="h-3.5 w-3.5" />
              Fallback Code Entry
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={placeholder}
                className="flex-1 h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-xs font-mono"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 px-4 text-xs font-semibold text-white whitespace-nowrap"
              >
                {busy ? 'Checking...' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

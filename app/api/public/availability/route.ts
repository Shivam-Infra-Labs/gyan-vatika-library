import { NextRequest, NextResponse } from 'next/server';
import { ensureSeeded } from '@/src/db/seed.ts';
import { computeSeatAvailability } from '@/src/lib/domain.ts';
import { todayIST } from '@/src/lib/format.ts';

export async function GET(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const sp = req.nextUrl.searchParams;
    const shiftId = Number(sp.get('shiftId'));
    const roomId = sp.get('roomId') ? Number(sp.get('roomId')) : undefined;
    const startDate = sp.get('startDate') || todayIST();
    const durationMonths = Math.max(1, Math.min(12, Number(sp.get('durationMonths') || '1')));
    const customStartMinute = sp.get('customStartMinute')
      ? Number(sp.get('customStartMinute'))
      : null;
    const customEndMinute = sp.get('customEndMinute') ? Number(sp.get('customEndMinute')) : null;

    if (!shiftId || Number.isNaN(shiftId)) {
      return NextResponse.json({ error: 'Valid shiftId is required.' }, { status: 400 });
    }

    const result = await computeSeatAvailability({
      centerId,
      roomId,
      shiftId,
      startDate,
      durationMonths,
      customStartMinute,
      customEndMinute,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to compute seat availability.';
    const isClientError =
      message.includes('Selected shift not found') ||
      message.includes('Flexible Short Pass window');
    console.error('GET /api/public/availability error:', err);
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}

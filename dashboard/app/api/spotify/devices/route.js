import { requireAuth } from '@/lib/auth-helper';
import { getDevices, isVehicleDevice } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const { devices } = await getDevices();
    return Response.json({
      devices: devices.map(d => ({ ...d, isVehicle: isVehicleDevice(d) })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

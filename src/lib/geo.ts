/**
 * Tiny geo helpers for the classroom geo-fence (QR attendance).
 *
 * COST GUARD: pure math, zero dependencies, no network calls.
 * The teacher's position is captured once when the QR window opens;
 * each student scan sends its coords and the server compares them here.
 */

export interface Coords {
  lat: number;
  lng: number;
}

/** Distance between two points in METERS (haversine — good to ~0.5%). */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000; // Earth radius (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  // Clamp: floating-point drift can push h a hair above 1 → NaN via asin.
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Validate client-supplied coords (reject NaN / out-of-range). */
export function isSaneCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // (0,0) is the GPS-failure sentinel ("null island") — browsers emit
    // it when geolocation times out or is denied; treat it as no fix.
    !(lat === 0 && lng === 0)
  );
}

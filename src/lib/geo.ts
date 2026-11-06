import * as THREE from 'three';

const DEG = Math.PI / 180;

/**
 * Equirectangular texture → sphere mapping used by three.js SphereGeometry.
 * longitude is degrees east of the prime meridian (-180…180).
 */
export function latLonToVector3(lat: number, lon: number, radius = 1, target = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return target.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Inverse of the mapping above — used to place experimental objects by raycast. */
export function vector3ToLatLon(v: THREE.Vector3) {
  const r = v.length();
  const lat = 90 - Math.acos(v.y / r) / DEG;
  let lon = Math.atan2(v.z, -v.x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

export function formatLatLon(lat: number, lon: number, digits = 4) {
  const latHemisphere = lat >= 0 ? 'N' : 'S';
  const lonHemisphere = lon >= 0 ? 'E' : 'W';
  const latText = `${Math.abs(lat).toFixed(digits)}° ${latHemisphere}`;
  const lonText = `${Math.abs(lon).toFixed(digits)}° ${lonHemisphere}`;
  return `${latText}, ${lonText}`;
}

export function formatLatLon360(lat: number, lon: number, digits = 4) {
  const east = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${east.toFixed(digits)}° E`;
}

export function formatDate(iso: string) {
  if (/^\d{4}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function yearOf(iso: string) {
  return Number(iso.slice(0, 4));
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('en-US', { maximumFractionDigits: 0 })} km`;
}

/** Sentence splitter used both for narration and for synchronised highlighting. */
export function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

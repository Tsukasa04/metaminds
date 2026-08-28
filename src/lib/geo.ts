// Geolocation utility functions and Haversine distance calculations

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface LiveLocationResult {
  coords: GeoCoordinates;
  locationName: string;
  isFallback?: boolean;
}

// Known coordinates for reference locations in demo dataset
export const LOCATION_COORDINATES: Record<string, GeoCoordinates> = {
  'indiranagar, bangalore': { lat: 12.9784, lng: 77.6408 },
  'koramangala, bangalore': { lat: 12.9352, lng: 77.6245 },
  'hsr layout, bangalore': { lat: 12.9121, lng: 77.6446 },
  'whitefield, bangalore': { lat: 12.9698, lng: 77.7500 },
  'jayanagar, bangalore': { lat: 12.9308, lng: 77.5838 },
  'malleshwaram, bangalore': { lat: 13.0031, lng: 77.5643 },
  'electronic city, bangalore': { lat: 12.8452, lng: 77.6602 },
  'bandra west, mumbai': { lat: 19.0596, lng: 72.8295 },
  'andheri east, mumbai': { lat: 19.1136, lng: 72.8697 },
  'r/s ward, mumbai suburban district': { lat: 19.2062, lng: 72.8523 },
  'mumbai suburban district': { lat: 19.1136, lng: 72.8697 },
  'hauz khas, new delhi': { lat: 28.5494, lng: 77.2001 },
  'connaught place, new delhi': { lat: 28.6315, lng: 77.2167 },
  'gachibowli, hyderabad': { lat: 17.4401, lng: 78.3489 },
  't nagar, chennai': { lat: 13.0418, lng: 80.2341 },
};

// Default fallback coordinate (R/S Ward, Mumbai Suburban District)
export const DEFAULT_COORDINATES: GeoCoordinates = { lat: 19.2062, lng: 72.8523 };
export const DEFAULT_LOCATION_NAME = 'R/S Ward, Mumbai Suburban District';

/**
 * Calculates great-circle distance between two points in kilometers using Haversine formula
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;

  return Math.round(d * 10) / 10; // Round to 1 decimal place
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Extracts or approximates coordinates from a worker's location string
 */
export function getCoordinatesFromLocation(locationString: string | null | undefined): GeoCoordinates {
  if (!locationString) return DEFAULT_COORDINATES;

  const key = locationString.toLowerCase().trim();
  if (LOCATION_COORDINATES[key]) {
    return LOCATION_COORDINATES[key];
  }

  // Partial match
  for (const [locKey, coords] of Object.entries(LOCATION_COORDINATES)) {
    if (key.includes(locKey) || locKey.includes(key)) {
      return coords;
    }
  }

  // Deterministic hash pseudo-coords around default location
  let hash = 0;
  for (let i = 0; i < locationString.length; i++) {
    hash = (hash << 5) - hash + locationString.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((hash % 100) / 1000) * 0.5;
  const lngOffset = (((hash >> 2) % 100) / 1000) * 0.5;

  return {
    lat: DEFAULT_COORDINATES.lat + latOffset,
    lng: DEFAULT_COORDINATES.lng + lngOffset,
  };
}

/**
 * Calculates estimated reach time in minutes
 */
export function calculateReachTimeMinutes(distanceKm: number): number {
  // Urban transit avg speed ~20km/h => 3 mins per km + 2 min prep buffer
  const minutes = Math.round(distanceKm * 3.2 + 2);
  return Math.max(3, minutes);
}

/**
 * Prompt browser geolocation API with fallback
 */
export function getUserLiveCoordinates(): Promise<GeoCoordinates> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_COORDINATES);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        resolve(DEFAULT_COORDINATES);
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 30000 }
    );
  });
}

/**
 * Reverse-geocodes coordinate pair into human-readable city/district string
 */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    // Quick proximity check against known hubs first
    let closestHub = DEFAULT_LOCATION_NAME;
    let minDistance = Infinity;

    for (const [name, coords] of Object.entries(LOCATION_COORDINATES)) {
      const dist = calculateHaversineDistance(lat, lng, coords.lat, coords.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestHub = name.split(',').map((w) => w.trim().replace(/\b\w/g, (c) => c.toUpperCase())).join(', ');
      }
    }

    if (minDistance <= 15) {
      return closestHub;
    }

    // Try OpenStreetMap Nominatim with strict timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { signal: controller.signal, headers: { 'Accept-Language': 'en' } }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const sub = addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || '';
        const city = addr.city || addr.town || addr.county || addr.state_district || 'Mumbai';
        if (sub && city) return `${sub}, ${city}`;
        if (city) return `${city}, India`;
      }
      if (data && data.display_name) {
        const parts = data.display_name.split(',');
        return parts.slice(0, 2).join(',').trim();
      }
    }
    return closestHub || DEFAULT_LOCATION_NAME;
  } catch {
    return DEFAULT_LOCATION_NAME;
  }
}

/**
 * Complete GPS fetcher with coordinates and reverse-geocoded location tag
 */
export function getUserLiveCoordinatesAndLocation(): Promise<LiveLocationResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        coords: DEFAULT_COORDINATES,
        locationName: DEFAULT_LOCATION_NAME,
        isFallback: true,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords: GeoCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const locationName = await reverseGeocodeCoords(coords.lat, coords.lng);
        resolve({
          coords,
          locationName,
          isFallback: false,
        });
      },
      () => {
        resolve({
          coords: DEFAULT_COORDINATES,
          locationName: DEFAULT_LOCATION_NAME,
          isFallback: true,
        });
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 30000 }
    );
  });
}

import type { City } from './cities';
import { straightLineKm, type LatLng } from './pricing';

/**
 * „Într-o rază de N km de X", in one place.
 *
 * Both boards offer it and the saved-search matcher applies it in SQL, so
 * the numbers that define it live here rather than in either board — and
 * the distance itself is `straightLineKm`, which is already documented as
 * the same formula as the database's `distance_km()`. Two definitions of
 * „how far is that" is how a board and an alert e-mail end up disagreeing
 * about the same request.
 */

/**
 * The radii the forms offer, in kilometres.
 *
 * Steps rather than a free number because the coordinates on a listing
 * are a locality's centroid, not an address — `cities.ts` is what stamps
 * them. „Într-o rază de 37 km" would promise a precision the data does
 * not have. A shared link may still carry any value up to `MAX_RADIUS_KM`;
 * the form is what is opinionated.
 */
export const RADIUS_STEPS_KM = [25, 50, 100, 200] as const;
export const DEFAULT_RADIUS_KM = 50;
export const MAX_RADIUS_KM = 500;

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Kilometres per degree of latitude. Constant; longitude is not. */
const KM_PER_DEG_LAT = 111.32;

/**
 * The smallest latitude/longitude rectangle that contains the circle.
 *
 * This is what goes into the query, because PostgREST filters columns and
 * a great-circle distance is not a column. The box is a **superset** — it
 * has corners the circle does not reach — so the exact distance still has
 * to be applied to the rows that come back. Getting that order wrong
 * would show a carrier a request 20 km further away than they asked for.
 *
 * Near the poles a degree of longitude collapses to nothing and the box
 * would explode; this marketplace runs between Sicily and Scandinavia, so
 * the latitude is clamped rather than special-cased.
 */
export function boundingBox(centre: LatLng, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  const clamped = Math.min(85, Math.max(-85, centre.lat));
  const lngDelta = radiusKm / (KM_PER_DEG_LAT * Math.cos((clamped * Math.PI) / 180));
  return {
    minLat: centre.lat - latDelta,
    maxLat: centre.lat + latDelta,
    minLng: centre.lng - lngDelta,
    maxLng: centre.lng + lngDelta,
  };
}

/**
 * Whether a point is inside the circle.
 *
 * A listing with no coordinates is not inside it. The gazetteer only
 * knows county seats and a few European cities, so a car collected from
 * a village has nothing to measure — and answering „yes" for those would
 * make the filter meaningless the moment it mattered.
 */
export function withinRadius(
  centre: City | LatLng,
  point: { lat: number | null; lng: number | null },
  radiusKm: number,
): boolean {
  if (point.lat === null || point.lng === null) return false;
  return straightLineKm(centre, { lat: point.lat, lng: point.lng }) <= radiusKm;
}

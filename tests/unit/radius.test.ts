import { describe, expect, it } from 'vitest';
import { CITIES, findCity } from '@/lib/cities';
import { straightLineKm } from '@/lib/pricing';
import { DEFAULT_RADIUS_KM, boundingBox, withinRadius } from '@/lib/radius';

/**
 * The radius filter, on both boards and in the alert matcher.
 *
 * The distance itself is `straightLineKm`, which the database mirrors in
 * `distance_km()`. What is pinned here is the part that is only in
 * TypeScript: the bounding box that goes into the query, and the rule
 * about what happens to a listing with no coordinates.
 */

const cluj = findCity('Cluj-Napoca', 'RO');
const turda = { lat: 46.5667, lng: 23.7833 };
const bucuresti = findCity('București', 'RO');

describe('the bounding box', () => {
  it('contains the whole circle', () => {
    // Every point exactly `r` away, in sixteen directions, has to be
    // inside the box — otherwise the query drops rows the circle would
    // have kept, and the filter quietly under-reports.
    const centre = { lat: 46.7712, lng: 23.6236 };
    const radius = 100;
    const box = boundingBox(centre, radius);
    const R = 6371;

    for (let i = 0; i < 16; i += 1) {
      const bearing = (i * 2 * Math.PI) / 16;
      const lat1 = (centre.lat * Math.PI) / 180;
      const lng1 = (centre.lng * Math.PI) / 180;
      const d = radius / R;
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
      );
      const lng2 =
        lng1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
          Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
        );
      const point = { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };

      expect(point.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(point.lat).toBeLessThanOrEqual(box.maxLat);
      expect(point.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(point.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it('has corners the circle does not reach, which is why the circle is applied too', () => {
    const centre = { lat: 46.7712, lng: 23.6236 };
    const box = boundingBox(centre, 100);
    const corner = { lat: box.maxLat, lng: box.maxLng };
    expect(straightLineKm(centre, corner)).toBeGreaterThan(100);
  });

  it('grows with the radius', () => {
    const centre = { lat: 46.7712, lng: 23.6236 };
    const small = boundingBox(centre, 25);
    const large = boundingBox(centre, 200);
    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat);
    expect(large.maxLng - large.minLng).toBeGreaterThan(small.maxLng - small.minLng);
  });
});

describe('withinRadius', () => {
  it('keeps a town inside the circle', () => {
    expect(cluj).not.toBeNull();
    // Turda is about 30 km from Cluj-Napoca.
    expect(withinRadius(cluj!, turda, DEFAULT_RADIUS_KM)).toBe(true);
    expect(withinRadius(cluj!, turda, 25)).toBe(false);
  });

  it('drops a city on the other side of the country', () => {
    expect(bucuresti).not.toBeNull();
    expect(withinRadius(cluj!, bucuresti!, 200)).toBe(false);
  });

  /**
   * The gazetteer knows county seats and a handful of European cities.
   * A car collected from a village has nothing to measure, and saying
   * „yes" for those would empty the filter of meaning exactly when it
   * matters. The screen says so under the field.
   */
  it('says no when there is nothing to measure', () => {
    expect(withinRadius(cluj!, { lat: null, lng: null }, 500)).toBe(false);
    expect(withinRadius(cluj!, { lat: 46.5, lng: null }, 500)).toBe(false);
  });

  it('is inclusive at the edge', () => {
    const km = straightLineKm(cluj!, turda);
    expect(withinRadius(cluj!, turda, km)).toBe(true);
  });
});

describe('the gazetteer', () => {
  it('has a coordinate for every city a picker offers', () => {
    for (const city of CITIES) {
      expect(Number.isFinite(city.lat)).toBe(true);
      expect(Number.isFinite(city.lng)).toBe(true);
    }
  });
});

/**
 * geo.js
 * ------
 * Geospatial utility helpers for centroid calculation and GeoJSON features.
 */

export function getFeatureCentroid(feature) {
  if (!feature || !feature.geometry) return null;
  const { type, coordinates } = feature.geometry;

  if (type === 'Point' && coordinates && coordinates.length >= 2) {
    return [coordinates[0], coordinates[1]];
  }

  if (type === 'Polygon' && coordinates && coordinates.length > 0) {
    const ring = coordinates[0];
    let sumLon = 0, sumLat = 0;
    const count = ring.length;
    for (let i = 0; i < count; i++) {
      sumLon += ring[i][0];
      sumLat += ring[i][1];
    }
    return [sumLon / count, sumLat / count];
  }

  if (type === 'MultiPolygon' && coordinates && coordinates.length > 0) {
    const ring = coordinates[0][0];
    let sumLon = 0, sumLat = 0;
    const count = ring.length;
    for (let i = 0; i < count; i++) {
      sumLon += ring[i][0];
      sumLat += ring[i][1];
    }
    return [sumLon / count, sumLat / count];
  }

  if (type === 'LineString' && coordinates && coordinates.length > 0) {
    const mid = coordinates[Math.floor(coordinates.length / 2)];
    return [mid[0], mid[1]];
  }

  return null;
}

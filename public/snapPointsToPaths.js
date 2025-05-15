
export function snapToNearestPath(pt, pathFeatures, maxDistanceMeters = 100) {
  const [px, py] = pt.geometry.coordinates;
  let nearest = null;
  let minDist = Infinity;

  const DEGREE_PER_METER_LAT = 1 / 111320;
  const DEGREE_PER_METER_LON = 1 / (40075000 * Math.cos(py * Math.PI / 180) / 360);

  for (const feature of pathFeatures) {
    try {
      const coords = feature.geometry?.coordinates;
      if (!coords || feature.geometry.type !== 'LineString') continue;

      const [x, y] = coords[0]; // Use start of line for filtering

      const dx = (x - px);
      const dy = (y - py);
      const distLat = dy / DEGREE_PER_METER_LAT;
      const distLon = dx / DEGREE_PER_METER_LON;
      const roughDist = Math.sqrt(distLat * distLat + distLon * distLon);

      if (roughDist > maxDistanceMeters) continue;

      const snapped = turf.nearestPointOnLine(feature, pt);
      const dist = snapped?.properties?.dist;

      if (dist !== undefined && dist < minDist) {
        minDist = dist;
        nearest = snapped;
      }
    } catch (e) {
      continue;
    }
  }

  if (!nearest) {
    console.warn("⛔ No nearby path found for point", pt.geometry.coordinates);
  }

  return nearest;
}

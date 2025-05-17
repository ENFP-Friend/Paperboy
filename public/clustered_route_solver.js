// clustered_route_solver.js
// Accepts selected points for routing, includes 2-Opt TSP, detour detection, and improved arrows.

console.log("solveGreedyTSP:", typeof window.solveGreedyTSP);
console.log("getFlyerCoords:", typeof window.getFlyerCoords); // Will be fallback if no points passed
console.log("solve2Opt:", typeof window.solve2Opt);

console.log("🧪 clustered_route_solver.js loaded (Accepts Selected Points, 2-Opt)");

let osrmHost = 'http://127.0.0.1:5000';

const DETOUR_TOLERANCE_FACTOR = 3.0;
const MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK = 50;
const TWO_OPT_PASSES = 5; // More passes can improve 2-Opt quality but take longer

function isValidCoordinate(coord) {
    return Array.isArray(coord) && coord.length === 2 &&
           typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
           isFinite(coord[0]) && isFinite(coord[1]);
}

function normalizeSegmentDirection(osrmLine, pointA, pointB) {
  if (!isValidCoordinate(pointA) || !isValidCoordinate(pointB)) {
    return osrmLine || [];
  }
  if (!Array.isArray(osrmLine) || osrmLine.length < 1 || !osrmLine.every(isValidCoordinate)) {
    return [pointA, pointB];
  }
   if (osrmLine.length === 1) { return [pointA, pointB]; }
  const dist = ([lon1, lat1], [lon2, lat2]) => Math.sqrt((lon1 - lon2) ** 2 + (lat1 - lat2) ** 2);
  const start = osrmLine[0]; const end = osrmLine[osrmLine.length - 1];
  const d1 = dist(start, pointA) + dist(end, pointB);
  const d2 = dist(start, pointB) + dist(end, pointA);
  return d1 <= d2 ? osrmLine : osrmLine.slice().reverse();
}

function getCentroid(coords) {
  const validCoords = coords.filter(isValidCoordinate);
  const n = validCoords.length;
  if (n === 0) return null;
  const sum = validCoords.reduce((acc, [lon, lat]) => { acc[0] += lon; acc[1] += lat; return acc; }, [0, 0]);
  return [sum[0] / n, sum[1] / n];
}

function getBearing([lon1, lat1], [lon2, lat2]) {
  const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

function clusterByGrid(coords, cellSize = 0.002) {
  const clusters = new Map();
  const validCoords = coords.filter(isValidCoordinate);
  for (const pt of validCoords) {
    const key = [Math.floor(pt[0] / cellSize), Math.floor(pt[1] / cellSize)].join(',');
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(pt);
  }
  return Array.from(clusters.values());
}

async function solveClusterTSP(clusterOriginalPoints, clusterIndex = '?') {
  const validPointsInCluster = clusterOriginalPoints.filter(isValidCoordinate);
  if (validPointsInCluster.length < 2) return validPointsInCluster.map((_, i) => i);

  const uniqueCoordsForOSRM = Array.from(new Set(validPointsInCluster.map(c => `${c[0]},${c[1]}`)))
    .map(str => str.split(',').map(Number));
  if (uniqueCoordsForOSRM.length < 2) return validPointsInCluster.map((_, i) => i);

  const coordStr = uniqueCoordsForOSRM.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `${osrmHost}/table/v1/foot/${coordStr}?annotations=duration`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM table request failed for cluster ${clusterIndex}: ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.durations)) throw new Error("Invalid OSRM matrix response");
    
    if (typeof window.solveGreedyTSP !== 'function') {
        console.error("window.solveGreedyTSP is not defined! Fallback for cluster", clusterIndex);
        return validPointsInCluster.map((_, i) => i);
    }
    const initialOrderIndices = window.solveGreedyTSP(data.durations);
    let finalOrderIndices = initialOrderIndices;

    if (typeof window.solve2Opt === 'function' && uniqueCoordsForOSRM.length > 2) {
      // console.log(`Refining TSP for cluster ${clusterIndex} with 2-Opt...`);
      try {
        const refinedOrderFrom2Opt = await window.solve2Opt(uniqueCoordsForOSRM, initialOrderIndices, TWO_OPT_PASSES);
        if (Array.isArray(refinedOrderFrom2Opt) && refinedOrderFrom2Opt.length === initialOrderIndices.length) {
          finalOrderIndices = refinedOrderFrom2Opt;
        } else { /* console.warn(`2-Opt for cluster ${clusterIndex} did not return valid order.`); */ }
      } catch (e2opt) { console.error(`Error during 2-Opt for cluster ${clusterIndex}:`, e2opt); }
    }

    const orderedUniqueActualPoints = finalOrderIndices.map(i => uniqueCoordsForOSRM[i]);
    const finalIndicesForValidClusterPoints = orderedUniqueActualPoints.map(uniquePoint => {
        return validPointsInCluster.findIndex(p => p[0] === uniquePoint[0] && p[1] === uniquePoint[1]);
    }).filter(index => index !== -1);

    if (finalIndicesForValidClusterPoints.length !== orderedUniqueActualPoints.length) {
        console.warn(`Cluster ${clusterIndex}: Index mapping discrepancy. Fallback to sequential.`);
        return validPointsInCluster.map((_,i) => i);
    }
    return finalIndicesForValidClusterPoints;
  } catch (err) {
    console.error(`❌ Cluster ${clusterIndex} TSP processing failed:`, err);
    return validPointsInCluster.map((_, i) => i);
  }
}

async function fetchRouteGeometry(pairOfPoints) {
  if (!Array.isArray(pairOfPoints) || pairOfPoints.length !== 2 || !pairOfPoints.every(isValidCoordinate)) {
      return null;
  }
  const coordStr = pairOfPoints.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `${osrmHost}/route/v1/foot/${coordStr}?overview=full&geometries=geojson&annotations=distance`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.routes && data.routes.length > 0 && data.routes[0].geometry && Array.isArray(data.routes[0].geometry.coordinates)) {
      const validOsrmCoords = data.routes[0].geometry.coordinates.filter(isValidCoordinate);
      if (validOsrmCoords.length < 2) return null;
      return { geometryCoords: validOsrmCoords, distance: data.routes[0].distance };
    }
    return null;
  } catch (err) { return null; }
}

async function planFullRouteFromUnsnapped(map, pointsToProcess) { // Changed parameter name
  // Layer Cleanup
  if (map.getSource('full-tsp-route')) { map.removeLayer('full-tsp-route-layer'); map.removeSource('full-tsp-route'); }
  if (map.getSource('original-flyers')) { map.removeLayer('original-flyers-layer'); map.removeSource('original-flyers'); } // Will be re-added with current points
  if (map.getSource('route-arrows')) { map.removeLayer('route-arrows-layer'); map.removeSource('route-arrows'); }

  // The `pointsToProcess` are already filtered for validity by solveRouteToggle
  if (pointsToProcess.length < 1) {
      console.error("No points provided to planFullRouteFromUnsnapped.");
      return;
  }
   if (pointsToProcess.length === 1) { // Draw just the single point
      map.addSource('original-flyers', { type: 'geojson', data: { type: 'FeatureCollection', features: pointsToProcess.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) } });
      map.addLayer({ id: 'original-flyers-layer', type: 'circle', source: 'original-flyers', paint: { 'circle-color': '#008000', 'circle-radius': 5 } });
      return;
  }


  const clustersRaw = clusterByGrid(pointsToProcess, 0.0015);
  const clusters = clustersRaw.filter(c => Array.isArray(c) && c.length > 0);
  const centroids = clusters.map(getCentroid).filter(isValidCoordinate);
  let clusterOrder = [...Array(clusters.length).keys()];

  if (centroids.length >= 2) {
      const centroidCoordStr = centroids.map(c => `${c[0]},${c[1]}`).join(';');
      const centroidTSPUrl = `${osrmHost}/table/v1/foot/${centroidCoordStr}?annotations=duration`;
      try {
        const res = await fetch(centroidTSPUrl);
        if (!res.ok) throw new Error(`Centroid TSP OSRM request failed: ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data.durations) && data.durations.length === centroids.length && typeof window.solveGreedyTSP === 'function') {
          const initialCentroidOrder = window.solveGreedyTSP(data.durations);
          clusterOrder = initialCentroidOrder;
          if (typeof window.solve2Opt === 'function' && centroids.length > 2) {
            // console.log("Refining centroid TSP order with 2-Opt...");
            const refinedCentroidOrder = await window.solve2Opt(centroids, initialCentroidOrder, TWO_OPT_PASSES);
            if(Array.isArray(refinedCentroidOrder) && refinedCentroidOrder.length === initialCentroidOrder.length) {
                clusterOrder = refinedCentroidOrder;
            }
          }
        }
      } catch (err) { console.warn("Failed centroid TSP:", err); }
  }

  const orderedAllCoords = [];
  let lastConnectingPoint = null;

  for (let i = 0; i < clusterOrder.length; i++) {
    const clusterActualIdx = clusterOrder[i];
    const currentClusterOriginalPoints = clusters[clusterActualIdx];
    const validPointsInCurrentCluster = currentClusterOriginalPoints.filter(isValidCoordinate);
    if (validPointsInCurrentCluster.length === 0) continue;

    const tspOrder = await solveClusterTSP(validPointsInCurrentCluster, `cluster_${clusterActualIdx}`);
    const orderedPointsInThisCluster = tspOrder.map(idx => validPointsInCurrentCluster[idx]).filter(isValidCoordinate);
    if (orderedPointsInThisCluster.length === 0) continue;
    
    const firstPointOfThisCluster = orderedPointsInThisCluster[0];
    if (lastConnectingPoint && isValidCoordinate(firstPointOfThisCluster)) {
      orderedAllCoords.push([lastConnectingPoint, firstPointOfThisCluster]);
    }
    for (let j = 0; j < orderedPointsInThisCluster.length - 1; j++) {
      orderedAllCoords.push([orderedPointsInThisCluster[j], orderedPointsInThisCluster[j + 1]]);
    }
    if (orderedPointsInThisCluster.length > 0) {
        lastConnectingPoint = orderedPointsInThisCluster[orderedPointsInThisCluster.length - 1];
        if (!isValidCoordinate(lastConnectingPoint)) lastConnectingPoint = null;
    }
  }

  const allSnapped = [];
  for (const pair of orderedAllCoords) {
    const pointA = pair[0]; const pointB = pair[1];
    if (!isValidCoordinate(pointA) || !isValidCoordinate(pointB)) {
        allSnapped.push(normalizeSegmentDirection([pointA, pointB], pointA, pointB));
        continue;
    }
    const osrmResult = await fetchRouteGeometry(pair);
    let pathDataForSegment = [pointA, pointB];
    if (osrmResult && osrmResult.geometryCoords && osrmResult.geometryCoords.length >= 2) {
      pathDataForSegment = osrmResult.geometryCoords;
      if (typeof turf !== 'undefined' && typeof turf.distance === 'function') {
        const directDist = turf.distance(pointA, pointB, {units: 'meters'});
        if (directDist > MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK && osrmResult.distance > directDist * DETOUR_TOLERANCE_FACTOR) {
          pathDataForSegment = [pointA, pointB];
        }
      }
    }
    allSnapped.push(normalizeSegmentDirection(pathDataForSegment, pointA, pointB));
  }
  // Note: The second `seenPairs` loop from user's original code for populating allSnapped is omitted for simplicity.
  // If specific segment duplication logic is needed, that loop would need to be re-evaluated and integrated.

  const finalLineStringCoords = [];
  for (const segmentPath of allSnapped) {
      if (Array.isArray(segmentPath) && segmentPath.length >= 2 && segmentPath.every(isValidCoordinate)) {
          finalLineStringCoords.push(...segmentPath);
      }
  }

  if (finalLineStringCoords.length >= 2) {
    map.addSource('full-tsp-route', {
      type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: finalLineStringCoords } }
    });
    map.addLayer({
      id: 'full-tsp-route-layer', type: 'line', source: 'full-tsp-route',
      paint: { 'line-color': '#ff4d4d', 'line-width': 3, 'line-opacity': 0.8 }
    });
  } else {
    console.error("❌ Not enough valid coordinates to draw 'full-tsp-route'.");
  }

  // Re-add original-flyers source with currently processed points for consistent display
  map.addSource('original-flyers', {
    type: 'geojson', data: { type: 'FeatureCollection', features: pointsToProcess.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) }
  });
  map.addLayer({
    id: 'original-flyers-layer', type: 'circle', source: 'original-flyers',
    // Ensure this layer uses feature-state for selection if map.js relies on it
    paint: {
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#ff8c00', // Selected color
          '#008000'  // Default color
        ],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          8, 5
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
  });
  if (map.getLayer('full-tsp-route-layer')) {
      map.moveLayer('original-flyers-layer', 'full-tsp-route-layer');
  }

  const arrowPoints = [];
  for (const detailedOsrmPath of allSnapped) {
    if (!Array.isArray(detailedOsrmPath) || detailedOsrmPath.length < 2) continue;
    for (let i = 0; i < detailedOsrmPath.length - 1; i++) {
      const point1 = detailedOsrmPath[i]; const point2 = detailedOsrmPath[i+1];
      if (!isValidCoordinate(point1) || !isValidCoordinate(point2)) continue;
      const dLon = point2[0] - point1[0]; const dLat = point2[1] - point1[1];
      if (Math.sqrt(dLon * dLon + dLat * dLat) < 0.000001) continue;
      const bearing = getBearing(point1, point2);
      const midPoint = [ (point1[0] + point2[0]) / 2, (point1[1] + point2[1]) / 2 ];
      arrowPoints.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: midPoint },
        properties: { rotation: bearing }
      });
    }
  }

  if (arrowPoints.length > 0) {
    map.addSource('route-arrows', {
      type: 'geojson', data: { type: 'FeatureCollection', features: arrowPoints }
    });
    map.addLayer({
      id: 'route-arrows-layer', type: 'symbol', source: 'route-arrows',
      layout: {
        'icon-image': 'arrow', 'icon-size': 0.06, 'icon-rotate': ['get', 'rotation'],
        'icon-rotation-alignment': 'map', 'icon-allow-overlap': false, 'icon-pitch-alignment':'map'
      }
    });
    if (map.getLayer('original-flyers-layer')) {
        map.moveLayer('route-arrows-layer', 'original-flyers-layer');
    }
  }
  console.log("✅ planFullRouteFromUnsnapped processing completed.");
}


// drawClusteredRoutes is not the primary focus, but if used, it should also accept pointsToProcess
async function drawClusteredRoutes(map, pointsToProcess) {
    console.warn("drawClusteredRoutes called. Ensure it's adapted for selected points if used.");
    // ... (implementation would need similar changes to accept pointsToProcess) ...
}


async function solveRouteToggle(map, method = 'greedy', selectedPoints = null) { // Added selectedPoints parameter
  let pointsToProcess;

  if (selectedPoints && selectedPoints.length > 0) {
    console.log(`Using ${selectedPoints.length} user-selected points for routing.`);
    pointsToProcess = selectedPoints.filter(isValidCoordinate);
  } else {
    console.log("No points selected by user, or selection is empty. Using all flyer points from getFlyerCoords.");
    const flyerPointsRaw = typeof window.getFlyerCoords === 'function' ? window.getFlyerCoords(map) : [];
    pointsToProcess = flyerPointsRaw.filter(isValidCoordinate);
  }

  if (!pointsToProcess || pointsToProcess.length === 0) {
    alert("No points available to calculate a route. Please select points or ensure points are loaded.");
    console.warn("No valid points to process in solveRouteToggle.");
    return;
  }
  console.log(`🧪 Processing ${pointsToProcess.length} points. TSP Method (if applicable): ${method}`);

  // Layer Cleanup
  const layersToRemove = ['full-tsp-route-layer', 'original-flyers-layer', 'route-arrows-layer', 'dcr-route-arrows-layer'];
  const sourcesToRemove = ['full-tsp-route', 'original-flyers', 'route-arrows', 'dcr-route-arrows'];
  layersToRemove.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch(e){/*ignore*/} });
  sourcesToRemove.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch(e){/*ignore*/} });
  for (let i = 0; i < 500; i++) {
      const layerId = `cluster-route-${i}`;
      try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch(e){/*ignore*/}
      try { if (map.getSource(layerId)) map.removeSource(layerId); } catch(e){/*ignore*/}
  }

  await planFullRouteFromUnsnapped(map, pointsToProcess); // Pass the determined pointsToProcess
  console.log("✅ solveRouteToggle completed.");
}

window.solveRouteToggle = solveRouteToggle;
console.log("✅ solveRouteToggle attached to window.");

if (typeof solveGreedyTSP === 'function' && typeof window.solveGreedyTSP === 'undefined') window.solveGreedyTSP = solveGreedyTSP;
if (typeof getFlyerCoords === 'function' && typeof window.getFlyerCoords === 'undefined') window.getFlyerCoords = getFlyerCoords;
if (typeof solve2Opt === 'function' && typeof window.solve2Opt === 'undefined') window.solve2Opt = solve2Opt;

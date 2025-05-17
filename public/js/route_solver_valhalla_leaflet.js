// route_solver_valhalla_leaflet.js
// Handles route calculation using Valhalla and draws results on a Leaflet map.
// VALHALLA_HOST and other settings are initialized here on window.APP_CONFIG.
// Includes Global 2-Opt Refinement (conditional), Configurable Detour Fallback, and Costing Options.

// --- Global settings ---
if (typeof window.APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {};
    console.log("route_solver_valhalla_leaflet.js: Initialized window.APP_CONFIG");
}
// Define configuration properties on window.APP_CONFIG, with defaults
window.APP_CONFIG.VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST || 'http://localhost:8888';
window.APP_CONFIG.VALHALLA_ROUTING_PROFILE = window.APP_CONFIG.VALHALLA_ROUTING_PROFILE || 'pedestrian';
window.APP_CONFIG.TSP_2OPT_PASSES = typeof window.APP_CONFIG.TSP_2OPT_PASSES === 'number' ? window.APP_CONFIG.TSP_2OPT_PASSES : 5;
window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR = typeof window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR === 'number' ? window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR : 3.0;
window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK = typeof window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK === 'number' ? window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK : 50;
window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE = typeof window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE === 'number' ? window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE : 0.0015;

// Configuration for UI-controlled settings
window.APP_CONFIG.USE_DETOUR_FALLBACK = typeof window.APP_CONFIG.USE_DETOUR_FALLBACK === 'boolean' ? window.APP_CONFIG.USE_DETOUR_FALLBACK : true;
window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS = window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS || {
    footway_factor: 1.0
};
// New configuration for global 2-Opt threshold
window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT = typeof window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT === 'number' ? window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT : 75;


console.log("route_solver_valhalla_leaflet.js: Configurations set on window.APP_CONFIG:", JSON.parse(JSON.stringify(window.APP_CONFIG)));

// --- Helper Functions (isValidCoordinate, toLeafletLatLng, decodeValhallaPolyline6, getBearing, getCentroid, clusterByGrid) ---
function isValidCoordinate(coord) {
    return Array.isArray(coord) && coord.length === 2 &&
           typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
           isFinite(coord[0]) && isFinite(coord[1]);
}
function toLeafletLatLng(geojsonCoord) {
    if (isValidCoordinate(geojsonCoord)) { return [geojsonCoord[1], geojsonCoord[0]]; } return null;
}
function decodeValhallaPolyline6(encoded) {
    let index = 0, len = encoded.length; let lat = 0, lng = 0; let coordinates = []; let factor = 1e6;
    while (index < len) {
        let shift = 0, result = 0, byte;
        do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += dlat;
        shift = 0; result = 0;
        do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += dlng;
        coordinates.push([lng / factor, lat / factor]);
    } return coordinates.filter(isValidCoordinate);
}
function getBearing(p1GeoJSON, p2GeoJSON) {
  if (!isValidCoordinate(p1GeoJSON) || !isValidCoordinate(p2GeoJSON)) { return 0; }
  const [lon1, lat1] = p1GeoJSON; const [lon2, lat2] = p2GeoJSON; const φ1 = lat1*Math.PI/180; const φ2 = lat2*Math.PI/180; const Δλ = (lon2-lon1)*Math.PI/180;
  const y = Math.sin(Δλ)*Math.cos(φ2); const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const θ = Math.atan2(y, x); return (θ*180/Math.PI+360)%360;
}
function getCentroid(coords) {
  const vc = coords.filter(isValidCoordinate); const n = vc.length; if(n===0)return null; const s = vc.reduce((a, [ln,lt])=>{a[0]+=ln;a[1]+=lt;return a;},[0,0]); return [s[0]/n,s[1]/n];
}
function clusterByGrid(coords, cs) {
  const cellSize = cs || window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE;
  const cl=new Map(); const vc=coords.filter(isValidCoordinate); for(const p of vc){const k=[Math.floor(p[0]/cellSize),Math.floor(p[1]/cellSize)].join(','); if(!cl.has(k))cl.set(k,[]);cl.get(k).push(p);} return Array.from(cl.values()).filter(c=>c.length>0);
}
// --- End Helper Functions ---

async function fetchValhallaCostMatrix(points, profileOverride) {
    if (typeof window.APP_CONFIG === 'undefined' || typeof window.APP_CONFIG.VALHALLA_HOST === 'undefined') {
        console.error("fetchValhallaCostMatrix: VALHALLA_HOST is not configured on window.APP_CONFIG.");
        return null;
    }
    const VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST;
    const profile = profileOverride || window.APP_CONFIG.VALHALLA_ROUTING_PROFILE;
    if (!Array.isArray(points) || points.length < 2) { return null; }
    const locations = points.map(p => ({ lon: p[0], lat: p[1] }));
    const requestPayload = {
        sources: locations,
        targets: locations,
        costing: profile
    };
    if (profile === 'pedestrian' && window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS && Object.keys(window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS).length > 0) {
        requestPayload.costing_options = { pedestrian: { ...window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS } };
    }

    try {
        const response = await fetch(`${VALHALLA_HOST}/sources_to_targets`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error JSON" }));
            console.error(`Valhalla matrix request error ${response.status}:`, errorData);
            throw new Error(`Valhalla matrix request error ${response.status}: ${errorData.error || response.statusText}`);
        }
        const data = await response.json();
        if (data.sources_to_targets) return data.sources_to_targets.map(row => row.map(t => t.time));
        console.error("Valhalla matrix response format error:", data); return null;
    } catch (error) { console.error("Error in fetchValhallaCostMatrix:", error.message); return null; }
}

async function solveClusterTSPWithValhalla(validPointsInCluster, clusterIndex = '?', tspMethodName = 'greedy') {
  const costMatrix = await fetchValhallaCostMatrix(validPointsInCluster);
  if (!costMatrix || costMatrix.length !== validPointsInCluster.length) {
    console.warn(`Failed to get valid cost matrix for cluster ${clusterIndex}. Using sequential order.`);
    return validPointsInCluster.map((_, i) => i);
  }
  if (typeof window.solveGreedyTSP !== 'function') {
    console.error(`CRITICAL: window.solveGreedyTSP not available for cluster ${clusterIndex}. Using sequential order.`);
    return validPointsInCluster.map((_, i) => i);
  }
  let tspOrderIndices;
  try { tspOrderIndices = window.solveGreedyTSP(costMatrix); }
  catch (e) { console.error(`CRITICAL: Error in window.solveGreedyTSP for cluster ${clusterIndex}:`, e); return validPointsInCluster.map((_, i) => i); }

  if (tspMethodName === '2opt' && validPointsInCluster.length > 2) {
    if (typeof window.solve2Opt !== 'function') { console.warn(`window.solve2Opt not available for cluster ${clusterIndex}. Using Greedy.`); }
    else {
      try {
        const TSP_PASSES = window.APP_CONFIG.TSP_2OPT_PASSES;
        const refinedOrder = await window.solve2Opt(validPointsInCluster, tspOrderIndices, costMatrix, TSP_PASSES);
        if (Array.isArray(refinedOrder) && refinedOrder.length === tspOrderIndices.length) tspOrderIndices = refinedOrder;
        else console.warn(`2-Opt for cluster ${clusterIndex} invalid. Using Greedy.`);
      } catch (e) { console.error(`Error during 2-Opt for cluster ${clusterIndex}:`, e); }
    }
  }
  return tspOrderIndices;
}

async function fetchValhallaRoute(pointsSequence, profileOverride) {
    if (typeof window.APP_CONFIG === 'undefined' || typeof window.APP_CONFIG.VALHALLA_HOST === 'undefined') { return null; }
    const VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST;
    const profile = profileOverride || window.APP_CONFIG.VALHALLA_ROUTING_PROFILE;
    if (!Array.isArray(pointsSequence) || pointsSequence.length < 2 || !pointsSequence.every(isValidCoordinate)) return null;
    const requestPayload = {
        locations: pointsSequence.map(p => ({ lon: p[0], lat: p[1] })),
        costing: profile,
        directions_options: { units: "kilometers" }
    };
    if (profile === 'pedestrian' && window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS && Object.keys(window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS).length > 0) {
        requestPayload.costing_options = { pedestrian: { ...window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS } };
    }

    try {
        const response = await fetch(`${VALHALLA_HOST}/route`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload)
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.trip && data.trip.legs && data.trip.summary) {
            let allCoordsGeoJSON = [];
            data.trip.legs.forEach(leg => { if (leg.shape) allCoordsGeoJSON.push(...decodeValhallaPolyline6(leg.shape)); });
            if (allCoordsGeoJSON.length >= 2) return { geometryCoords: allCoordsGeoJSON, distance: data.trip.summary.length * 1000, time: data.trip.summary.time };
        }
        return null;
    } catch (error) { console.error("Error fetching Valhalla route:", error); return null; }
}

async function planRouteWithValhalla(map, pointsToProcess, layerGroups, tspMethodName = 'greedy') {
  console.log(`Starting planRouteWithValhalla for ${pointsToProcess.length} points. TSP: ${tspMethodName}`);
  const { routeLinesLayerGroup, routeArrowsLayerGroup } = layerGroups;
  routeLinesLayerGroup.clearLayers(); routeArrowsLayerGroup.clearLayers();
  if (pointsToProcess.length < 2) { console.warn("Not enough points for routing."); return; }

  const clustersRaw = clusterByGrid(pointsToProcess);
  const clusters = clustersRaw.filter(c => Array.isArray(c) && c.length > 0);
  const centroids = clusters.map(getCentroid).filter(isValidCoordinate);
  let clusterOrderIndices = [...Array(clusters.length).keys()];

  if (centroids.length >= 2) {
    const centroidCostMatrix = await fetchValhallaCostMatrix(centroids);
    if (centroidCostMatrix && typeof window.solveGreedyTSP === 'function') {
      try {
        let initialCentroidOrder = window.solveGreedyTSP(centroidCostMatrix);
        clusterOrderIndices = initialCentroidOrder;
        if (tspMethodName === '2opt' && typeof window.solve2Opt === 'function' && centroids.length > 2) {
          const TSP_PASSES = window.APP_CONFIG.TSP_2OPT_PASSES;
          const refined = await window.solve2Opt(centroids, initialCentroidOrder, centroidCostMatrix, TSP_PASSES);
          if (Array.isArray(refined) && refined.length === initialCentroidOrder.length) clusterOrderIndices = refined;
        }
      } catch (e) { console.error("Error in centroid TSP:", e); }
    } else { console.warn("Centroid TSP skipped (no matrix or Greedy func)."); }
  }

  let hierarchicallyOrderedFlyerPoints = [];
  for (const clusterIdx of clusterOrderIndices) {
    const currentClusterPoints = clusters[clusterIdx];
    if (!currentClusterPoints || currentClusterPoints.length === 0) continue;
    const validPointsInCurrentCluster = currentClusterPoints.filter(isValidCoordinate);
    if (validPointsInCurrentCluster.length === 0) continue;
    let orderedActualPointsInCluster = (validPointsInCurrentCluster.length === 1)
      ? validPointsInCurrentCluster
      : (await solveClusterTSPWithValhalla(validPointsInCurrentCluster, `c_${clusterIdx}`, tspMethodName))
          .map(i => validPointsInCurrentCluster[i]).filter(isValidCoordinate);
    if (orderedActualPointsInCluster.length === 0) continue;
    hierarchicallyOrderedFlyerPoints.push(...orderedActualPointsInCluster);
  }

  let uniqueOrderedFlyerPoints = [];
  const addedPointsSet = new Set();
  for (const point of hierarchicallyOrderedFlyerPoints) {
      const pointStr = JSON.stringify(point);
      if (!addedPointsSet.has(pointStr)) {
          uniqueOrderedFlyerPoints.push(point);
          addedPointsSet.add(pointStr);
      }
  }

  let finalPointsToRouteInOrder = uniqueOrderedFlyerPoints;
  const MAX_POINTS_GLOBAL_OPT = window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT;

  if (finalPointsToRouteInOrder.length >= 3 &&
      finalPointsToRouteInOrder.length <= MAX_POINTS_GLOBAL_OPT &&
      tspMethodName === '2opt' &&
      typeof window.solve2Opt === 'function') {
    console.log(`Attempting Global 2-Opt refinement on ${finalPointsToRouteInOrder.length} unique points (Threshold: ${MAX_POINTS_GLOBAL_OPT}).`);
    const globalCostMatrix = await fetchValhallaCostMatrix(finalPointsToRouteInOrder);
    if (globalCostMatrix) {
      let initialGlobalOrderIndices = finalPointsToRouteInOrder.map((_, index) => index);
      try {
        const TSP_PASSES_GLOBAL = window.APP_CONFIG.TSP_2OPT_PASSES + 2;
        const globallyRefinedOrderIndices = await window.solve2Opt(finalPointsToRouteInOrder, initialGlobalOrderIndices, globalCostMatrix, TSP_PASSES_GLOBAL);
        finalPointsToRouteInOrder = globallyRefinedOrderIndices.map(index => finalPointsToRouteInOrder[index]);
        console.log(`Global 2-Opt refinement applied. New point order count: ${finalPointsToRouteInOrder.length}`);
      } catch (e) { console.error("Error during global 2-Opt refinement:", e); }
    } else { console.warn("Global 2-Opt refinement skipped: Could not build global cost matrix."); }
  } else if (finalPointsToRouteInOrder.length > MAX_POINTS_GLOBAL_OPT && tspMethodName === '2opt') {
    console.warn(`Global 2-Opt refinement skipped: Number of points (${finalPointsToRouteInOrder.length}) exceeds threshold (${MAX_POINTS_GLOBAL_OPT}).`);
  }


  const pointPairsToRoute = [];
  for (let j = 0; j < finalPointsToRouteInOrder.length - 1; j++) {
    pointPairsToRoute.push([finalPointsToRouteInOrder[j], finalPointsToRouteInOrder[j + 1]]);
  }
  console.log(`Generated ${pointPairsToRoute.length} final point pairs for Valhalla routing.`);

  const USE_DETOUR_FALLBACK = window.APP_CONFIG.USE_DETOUR_FALLBACK;
  const DETOUR_FACTOR = window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR;
  const MIN_DIST_DETOUR_CHECK = window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK;

  for (let i = 0; i < pointPairsToRoute.length; i++) {
    const pair = pointPairsToRoute[i];
    const [pointA_geo, pointB_geo] = pair;
    let segmentPathCoordsGeoJSON = [pointA_geo, pointB_geo];
    const valhallaResult = await fetchValhallaRoute(pair);

    if (valhallaResult && valhallaResult.geometryCoords && valhallaResult.geometryCoords.length >= 2) {
      segmentPathCoordsGeoJSON = valhallaResult.geometryCoords;
      if (USE_DETOUR_FALLBACK && typeof turf !== 'undefined' && typeof turf.distance === 'function') {
        const directDistMeters = turf.distance(pointA_geo, pointB_geo, {units: 'meters'});
        if (directDistMeters > MIN_DIST_DETOUR_CHECK && valhallaResult.distance > directDistMeters * DETOUR_FACTOR) {
          console.log(`Detour on segment ${i}. Valhalla: ${valhallaResult.distance.toFixed(0)}m, Direct: ${directDistMeters.toFixed(0)}m. Using straight line as fallback.`);
          segmentPathCoordsGeoJSON = [pointA_geo, pointB_geo];
        }
      }
    }

    // << NEW: Intersection check with building footprints >>
    let intersectsBuilding = false;
    if (segmentPathCoordsGeoJSON.length >= 2 && window.buildingFootprintsGeoJSON && window.buildingFootprintsGeoJSON.features && typeof turf !== 'undefined' && typeof turf.lineString === 'function' && typeof turf.lineIntersect === 'function') {
        const routeSegmentLineString = turf.lineString(segmentPathCoordsGeoJSON);
        for (const buildingFeature of window.buildingFootprintsGeoJSON.features) {
            if (buildingFeature.geometry && (buildingFeature.geometry.type === 'Polygon' || buildingFeature.geometry.type === 'MultiPolygon')) {
                try {
                    // turf.lineIntersect returns a FeatureCollection of points.
                    // If it's not empty, then there's an intersection.
                    const intersectionPoints = turf.lineIntersect(routeSegmentLineString, buildingFeature);
                    if (intersectionPoints && intersectionPoints.features && intersectionPoints.features.length > 0) {
                        intersectsBuilding = true;
                        console.warn(`Route segment from [${pointA_geo}] to [${pointB_geo}] intersects a building. This segment will not be drawn.`);
                        break; // Stop checking other buildings for this segment
                    }
                } catch (e) {
                    console.error("Error during Turf.js line/building intersection check:", e, "Segment:", routeSegmentLineString, "Building:", buildingFeature);
                }
            }
        }
    }
    // << END NEW: Intersection check >>

    if (!intersectsBuilding) { // << MODIFIED: Only draw if no intersection
        const leafletLatLngs = segmentPathCoordsGeoJSON.map(toLeafletLatLng).filter(c => c !== null);
        if (leafletLatLngs.length >= 2) {
          L.polyline(leafletLatLngs, { color: 'red', weight: 3, opacity: 0.8 }).addTo(routeLinesLayerGroup);
          if (segmentPathCoordsGeoJSON.length > 1) {
              const midIdx = Math.floor((segmentPathCoordsGeoJSON.length - 1) / 2);
              const p1_geo_arrow = segmentPathCoordsGeoJSON[midIdx];
              // Ensure there's a next point for bearing calculation
              const p2_geo_arrow = segmentPathCoordsGeoJSON.length > midIdx + 1 ? segmentPathCoordsGeoJSON[midIdx + 1] : segmentPathCoordsGeoJSON[segmentPathCoordsGeoJSON.length -1] ;
              if (isValidCoordinate(p1_geo_arrow) && isValidCoordinate(p2_geo_arrow) && !(p1_geo_arrow[0] === p2_geo_arrow[0] && p1_geo_arrow[1] === p2_geo_arrow[1])) { // also check points are not identical
                const bearing = getBearing(p1_geo_arrow, p2_geo_arrow);
                const midPoint_for_arrow_geo = [(p1_geo_arrow[0] + p2_geo_arrow[0]) / 2, (p1_geo_arrow[1] + p2_geo_arrow[1]) / 2];
                const midPoint_for_arrow_leaf = toLeafletLatLng(midPoint_for_arrow_geo);
                if (midPoint_for_arrow_leaf) {
                    L.marker(midPoint_for_arrow_leaf, {
                        icon: L.divIcon({ className: 'route-arrow-icon', html: `<div style="font-size:16px; transform: rotate(${bearing - 90}deg); color:red;">➤</div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
                    }).addTo(routeArrowsLayerGroup);
                }
              }
          }
        }
    } // << END MODIFIED
  }
  console.log("✅ Valhalla route planning and drawing completed.");
}

async function solveRouteToggle(map, tspMethodName, selectedPoints, layerGroups) {
  let pointsToProcess;
  if (selectedPoints && selectedPoints.length > 0) {
      pointsToProcess = selectedPoints.filter(isValidCoordinate);
  } else {
    if (typeof window.getFlyerCoords === 'function') {
        const allFlyerPoints = window.getFlyerCoords();
        pointsToProcess = Array.isArray(allFlyerPoints) ? allFlyerPoints.filter(isValidCoordinate) : [];
    } else { pointsToProcess = []; }
    if (pointsToProcess.length === 0) { alert("No points selected or available."); return; }
  }
  if (pointsToProcess.length < 2) { alert("Please provide at least two points."); return; }
  console.log(`🧪 Processing ${pointsToProcess.length} points for Valhalla. TSP: ${tspMethodName}`);
  if (!layerGroups || !layerGroups.routeLinesLayerGroup || !layerGroups.routeArrowsLayerGroup) {
      console.error("Layer groups not provided."); alert("Error: Layers missing."); return;
  }
  try {
    await planRouteWithValhalla(map, pointsToProcess, layerGroups, tspMethodName);
  } catch (error) {
    console.error("Error during solveRouteToggle:", error);
    alert(`Route planning error: ${error.message}`);
  } finally {
    console.log("✅ solveRouteToggle (Valhalla) completed.");
  }
}

if (typeof window.solveRouteToggle === 'undefined') {
    window.solveRouteToggle = solveRouteToggle;
}
console.log("✅ route_solver_valhalla_leaflet.js (uses window.APP_CONFIG, with global 2-Opt, configurable detours & costing) loaded.");
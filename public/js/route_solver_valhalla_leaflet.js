// route_solver_valhalla_leaflet.js
// Handles route calculation using Valhalla and draws results on a Leaflet map.

// --- Global settings ---
if (typeof window.APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {};
    console.log("route_solver_valhalla_leaflet.js: Initialized window.APP_CONFIG");
}
window.APP_CONFIG.VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST || 'http://localhost:8888';
window.APP_CONFIG.VALHALLA_ROUTING_PROFILE = window.APP_CONFIG.VALHALLA_ROUTING_PROFILE || 'pedestrian';
window.APP_CONFIG.TSP_2OPT_PASSES = typeof window.APP_CONFIG.TSP_2OPT_PASSES === 'number' ? window.APP_CONFIG.TSP_2OPT_PASSES : 5;
window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR = typeof window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR === 'number' ? window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR : 5.0;
window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK = typeof window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK === 'number' ? window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK : 50;
// Adjusted CLUSTER_GRID_CELL_SIZE for potentially smoother red line pathing
window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE = typeof window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE === 'number' ? window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE : 0.00225; // Original was 0.0015
window.APP_CONFIG.USE_DETOUR_FALLBACK = typeof window.APP_CONFIG.USE_DETOUR_FALLBACK === 'boolean' ? window.APP_CONFIG.USE_DETOUR_FALLBACK : true;
window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS = window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS || { footway_factor: 1.0 };
window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT = typeof window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT === 'number' ? window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT : 75;

console.log("route_solver_valhalla_leaflet.js: Configurations set on window.APP_CONFIG:", JSON.parse(JSON.stringify(window.APP_CONFIG)));

// --- Helper Functions ---
function isValidCoordinate(coord) { return Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number' && isFinite(coord[0]) && isFinite(coord[1]); }
function toLeafletLatLng(geojsonCoord) { if (isValidCoordinate(geojsonCoord)) { return [geojsonCoord[1], geojsonCoord[0]]; } return null; }
function decodeValhallaPolyline6(encoded) { let index = 0, len = encoded.length; let lat = 0, lng = 0; let coordinates = []; let factor = 1e6; while (index < len) { let shift = 0, result = 0, byte; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += dlat; shift = 0; result = 0; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += dlng; coordinates.push([lng / factor, lat / factor]); } return coordinates.filter(isValidCoordinate); }
function getBearing(p1GeoJSON, p2GeoJSON) { if (!isValidCoordinate(p1GeoJSON) || !isValidCoordinate(p2GeoJSON)) { return 0; } const [lon1, lat1] = p1GeoJSON; const [lon2, lat2] = p2GeoJSON; const φ1 = lat1*Math.PI/180; const φ2 = lat2*Math.PI/180; const Δλ = (lon2-lon1)*Math.PI/180; const y = Math.sin(Δλ)*Math.cos(φ2); const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ); const θ = Math.atan2(y, x); return (θ*180/Math.PI+360)%360; }
function getCentroid(coords) { const vc = coords.filter(isValidCoordinate); const n = vc.length; if(n===0)return null; const s = vc.reduce((a, [ln,lt])=>{a[0]+=ln;a[1]+=lt;return a;},[0,0]); return [s[0]/n,s[1]/n]; }
function clusterByGrid(coords, cs) { const cellSize = cs || window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE; const cl=new Map(); const vc=coords.filter(isValidCoordinate); for(const p of vc){const k=[Math.floor(p[0]/cellSize),Math.floor(p[1]/cellSize)].join(','); if(!cl.has(k))cl.set(k,[]);cl.get(k).push(p);} return Array.from(cl.values()).filter(c=>c.length>0); }
// --- End Helper Functions ---

async function fetchValhallaCostMatrix(points, profileOverride) { if (typeof window.APP_CONFIG === 'undefined' || typeof window.APP_CONFIG.VALHALLA_HOST === 'undefined') { console.error("fetchValhallaCostMatrix: VALHALLA_HOST is not configured."); return null; } const VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST; const profile = profileOverride || window.APP_CONFIG.VALHALLA_ROUTING_PROFILE; if (!Array.isArray(points) || points.length < 2) { return null; } const locations = points.map(p => ({ lon: p[0], lat: p[1] })); const requestPayload = { sources: locations, targets: locations, costing: profile }; if (profile === 'pedestrian' && window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS && Object.keys(window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS).length > 0) { requestPayload.costing_options = { pedestrian: { ...window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS } }; } try { const response = await fetch(`${VALHALLA_HOST}/sources_to_targets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) }); if (!response.ok) { const errorData = await response.json().catch(() => ({ error: "Failed to parse error JSON from Valhalla matrix request" , status: response.status, statusText: response.statusText})); console.error(`Valhalla matrix request error ${response.status}:`, errorData); throw new Error(`Valhalla matrix request error ${response.status}: ${errorData.error || response.statusText}`); } const data = await response.json(); if (data.sources_to_targets) return data.sources_to_targets.map(row => row.map(t => t.time)); console.error("Valhalla matrix response format error:", data); return null; } catch (error) { console.error("Error in fetchValhallaCostMatrix:", error.message); return null; } }
async function solveClusterTSPWithValhalla(validPointsInCluster, clusterIndex = '?', tspMethodName = 'greedy') { const costMatrix = await fetchValhallaCostMatrix(validPointsInCluster); if (!costMatrix || costMatrix.length !== validPointsInCluster.length) { console.warn(`Failed to get valid cost matrix for cluster ${clusterIndex}. Using sequential order.`); return validPointsInCluster.map((_, i) => i); } if (typeof window.solveGreedyTSP !== 'function') { console.error(`CRITICAL: window.solveGreedyTSP not available for cluster ${clusterIndex}. Using sequential order.`); return validPointsInCluster.map((_, i) => i); } let tspOrderIndices; try { tspOrderIndices = window.solveGreedyTSP(costMatrix); } catch (e) { console.error(`CRITICAL: Error in window.solveGreedyTSP for cluster ${clusterIndex}:`, e); return validPointsInCluster.map((_, i) => i); } if (tspMethodName === '2opt' && validPointsInCluster.length > 2) { if (typeof window.solve2Opt !== 'function') { console.warn(`window.solve2Opt not available for cluster ${clusterIndex}. Using Greedy.`); } else { try { const TSP_PASSES = window.APP_CONFIG.TSP_2OPT_PASSES; const refinedOrder = await window.solve2Opt(validPointsInCluster, tspOrderIndices, costMatrix, TSP_PASSES); if (Array.isArray(refinedOrder) && refinedOrder.length === tspOrderIndices.length) tspOrderIndices = refinedOrder; else console.warn(`2-Opt for cluster ${clusterIndex} invalid. Using Greedy.`); } catch (e) { console.error(`Error during 2-Opt for cluster ${clusterIndex}:`, e); } } } return tspOrderIndices; }
async function fetchValhallaRoute(pointsSequence, profileOverride) { if (typeof window.APP_CONFIG === 'undefined' || typeof window.APP_CONFIG.VALHALLA_HOST === 'undefined') { return null; } const VALHALLA_HOST = window.APP_CONFIG.VALHALLA_HOST; const profile = profileOverride || window.APP_CONFIG.VALHALLA_ROUTING_PROFILE; if (!Array.isArray(pointsSequence) || pointsSequence.length < 2 || !pointsSequence.every(isValidCoordinate)) return null; const requestPayload = { locations: pointsSequence.map(p => ({ lon: p[0], lat: p[1] })), costing: profile, directions_options: { units: "kilometers" } }; if (profile === 'pedestrian' && window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS && Object.keys(window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS).length > 0) { requestPayload.costing_options = { pedestrian: { ...window.APP_CONFIG.VALHALLA_PEDESTRIAN_COSTING_OPTIONS } }; } try { const response = await fetch(`${VALHALLA_HOST}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) }); if (!response.ok) { console.warn(`Valhalla route request failed for sequence: ${JSON.stringify(pointsSequence)} with status ${response.status}`); return null; } const data = await response.json(); if (data.trip && data.trip.legs && data.trip.summary) { let allCoordsGeoJSON = []; data.trip.legs.forEach(leg => { if (leg.shape) allCoordsGeoJSON.push(...decodeValhallaPolyline6(leg.shape)); }); if (allCoordsGeoJSON.length >= 2) return { geometryCoords: allCoordsGeoJSON, distance: data.trip.summary.length * 1000, time: data.trip.summary.time }; } console.warn(`Valhalla route response format error or empty trip for sequence: ${JSON.stringify(pointsSequence)}`, data); return null; } catch (error) { console.error("Error fetching Valhalla route:", error); return null; } }

async function planRouteWithValhalla(map, pointsToProcess, layerGroups, tspMethodName = 'greedy') {
    console.log(`Dual-line: Starting planRouteWithValhalla for ${pointsToProcess.length} points. TSP: ${tspMethodName}. CLUSTER_GRID_CELL_SIZE: ${window.APP_CONFIG.CLUSTER_GRID_CELL_SIZE}`);
    const { routeLinesLayerGroup, routeArrowsLayerGroup, detailedOrderLineLayerGroup, helperIconsLayerGroup } = layerGroups;

    // Clear previous route layers
    routeLinesLayerGroup.clearLayers();
    routeArrowsLayerGroup.clearLayers();
    if (detailedOrderLineLayerGroup) detailedOrderLineLayerGroup.clearLayers();
    if (helperIconsLayerGroup) helperIconsLayerGroup.clearLayers();

    if (pointsToProcess.length < 2) {
        console.warn("Not enough points for routing.");
        alert("Please select at least two flyer points for routing.");
        return;
    }

    // --- 1. Determine the FULL DETAILED TSP order of ALL individual flyer points (for BLUE Line) ---
    console.log("Dual-line: Clustering points...");
    const clustersRaw = clusterByGrid(pointsToProcess); // Uses the updated CLUSTER_GRID_CELL_SIZE
    const clusters = clustersRaw.filter(c => Array.isArray(c) && c.length > 0);
    console.log(`Dual-line: Found ${clusters.length} raw clusters.`);

    const centroids = clusters.map(getCentroid).filter(isValidCoordinate);
    let clusterOrderIndices = [...Array(clusters.length).keys()];

    if (centroids.length >= 2) {
        console.log("Dual-line: Calculating TSP for cluster centroids...");
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
                console.log("Dual-line: Cluster centroid TSP complete.");
            } catch (e) { console.error("Error in centroid TSP:", e); }
        } else { console.warn("Centroid TSP skipped (no matrix or Greedy func)."); }
    } else if (centroids.length === 1) {
        console.log("Dual-line: Only one cluster centroid, no inter-cluster TSP needed.");
    } else {
        console.warn("Dual-line: Not enough centroids for inter-cluster TSP.");
    }


    let hierarchicallyOrderedFlyerPoints = [];
    for (const clusterIdx of clusterOrderIndices) {
        const currentClusterPoints = clusters[clusterIdx];
        if (!currentClusterPoints || currentClusterPoints.length === 0) continue;
        const validPointsInCurrentCluster = currentClusterPoints.filter(isValidCoordinate);
        if (validPointsInCurrentCluster.length === 0) continue;

        let orderedActualPointsInCluster;
        if (validPointsInCurrentCluster.length === 1) {
            orderedActualPointsInCluster = validPointsInCurrentCluster;
        } else {
            console.log(`Dual-line: Solving TSP for points within cluster index ${clusterIdx} (original index) which has ${validPointsInCurrentCluster.length} points.`);
            const intraClusterOrderIndices = await solveClusterTSPWithValhalla(validPointsInCurrentCluster, `c_${clusterIdx}`, tspMethodName);
            orderedActualPointsInCluster = intraClusterOrderIndices.map(i => validPointsInCurrentCluster[i]).filter(isValidCoordinate);
        }
        if (orderedActualPointsInCluster.length > 0) {
            hierarchicallyOrderedFlyerPoints.push(...orderedActualPointsInCluster);
        }
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
    console.log(`Dual-line: Hierarchical ordering resulted in ${uniqueOrderedFlyerPoints.length} unique points.`);

    let fullDetailedTSPOrderPoints = [...uniqueOrderedFlyerPoints];

    const MAX_POINTS_GLOBAL_OPT = window.APP_CONFIG.MAX_POINTS_FOR_GLOBAL_2OPT;
    if (fullDetailedTSPOrderPoints.length >= 3 &&
        fullDetailedTSPOrderPoints.length <= MAX_POINTS_GLOBAL_OPT &&
        tspMethodName === '2opt' &&
        typeof window.solve2Opt === 'function') {
        console.log(`Dual-line: Attempting Global 2-Opt on FULL DETAILED order (${fullDetailedTSPOrderPoints.length} points).`);
        const globalCostMatrixFull = await fetchValhallaCostMatrix(fullDetailedTSPOrderPoints);
        if (globalCostMatrixFull) {
            let initialGlobalOrderIndices = fullDetailedTSPOrderPoints.map((_, index) => index);
            try {
                const TSP_PASSES_GLOBAL = window.APP_CONFIG.TSP_2OPT_PASSES + 2;
                const globallyRefinedOrderIndices = await window.solve2Opt(fullDetailedTSPOrderPoints, initialGlobalOrderIndices, globalCostMatrixFull, TSP_PASSES_GLOBAL);
                fullDetailedTSPOrderPoints = globallyRefinedOrderIndices.map(index => fullDetailedTSPOrderPoints[index]);
                console.log(`Dual-line: Global 2-Opt on FULL DETAILED order applied. New point order count: ${fullDetailedTSPOrderPoints.length}`);
            } catch (e) { console.error("Error during global 2-Opt on full detailed order:", e); }
        } else { console.warn("Global 2-Opt on FULL DETAILED order skipped: Could not build cost matrix."); }
    } else if (fullDetailedTSPOrderPoints.length > MAX_POINTS_GLOBAL_OPT && tspMethodName === '2opt') {
        console.warn(`Dual-line: Global 2-Opt on FULL DETAILED order skipped: Point count (${fullDetailedTSPOrderPoints.length}) exceeds threshold (${MAX_POINTS_GLOBAL_OPT}).`);
    }


    // --- 2. Draw the BLUE "Delivery Order" Line (straight lines, zig-zag) ---
    if (detailedOrderLineLayerGroup && fullDetailedTSPOrderPoints.length >= 2) {
        const blueLineLatLngs = fullDetailedTSPOrderPoints.map(toLeafletLatLng).filter(c => c !== null);
        if (blueLineLatLngs.length >= 2) {
            L.polyline(blueLineLatLngs, {
                color: 'rgba(0, 0, 255, 0.7)',
                weight: 2.5,
                opacity: 0.6,
                dashArray: '6, 6'
            }).addTo(detailedOrderLineLayerGroup);
            console.log("Dual-line: BLUE delivery order line drawn.");
        }
    }

    // --- 3. Determine REPRESENTATIVE POINTS for the RED "Street Traversal" Line ---
    let streetLevelWaypoints = [];
    if (clusters.length > 0 && clusterOrderIndices.length > 0) {
         streetLevelWaypoints = clusterOrderIndices
            .map(idx => clusters[idx])
            .map(clusterPoints => getCentroid(clusterPoints.filter(isValidCoordinate)))
            .filter(isValidCoordinate);
         console.log(`Dual-line: Generated ${streetLevelWaypoints.length} street-level waypoints (centroids) for RED line.`);
    }


    // --- 4. Draw the RED "Street Traversal" Line (Valhalla-routed, road-snapped) ---
    const pointPairsForRedLine = [];
    for (let j = 0; j < streetLevelWaypoints.length - 1; j++) {
        pointPairsForRedLine.push([streetLevelWaypoints[j], streetLevelWaypoints[j + 1]]);
    }
    console.log(`Dual-line: Generated ${pointPairsForRedLine.length} point pairs for RED street traversal line.`);

    const USE_DETOUR_FALLBACK = window.APP_CONFIG.USE_DETOUR_FALLBACK;
    const DETOUR_FACTOR = window.APP_CONFIG.DETOUR_TOLERANCE_FACTOR;
    const MIN_DIST_DETOUR_CHECK = window.APP_CONFIG.MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK;

    for (let i = 0; i < pointPairsForRedLine.length; i++) {
        const pair = pointPairsForRedLine[i];
        const [pointA_geo, pointB_geo] = pair;
        let segmentPathCoordsGeoJSON = [pointA_geo, pointB_geo];

        const valhallaResultRedLine = await fetchValhallaRoute(pair);

        if (valhallaResultRedLine && valhallaResultRedLine.geometryCoords && valhallaResultRedLine.geometryCoords.length >= 2) {
            segmentPathCoordsGeoJSON = valhallaResultRedLine.geometryCoords;
            if (USE_DETOUR_FALLBACK && typeof turf !== 'undefined' && typeof turf.distance === 'function') {
                const directDistMeters = turf.distance(pointA_geo, pointB_geo, {units: 'meters'});
                if (directDistMeters > MIN_DIST_DETOUR_CHECK && valhallaResultRedLine.distance > directDistMeters * DETOUR_FACTOR) {
                    console.log(`RED LINE Detour on segment ${i}. Valhalla: ${valhallaResultRedLine.distance.toFixed(0)}m, Direct: ${directDistMeters.toFixed(0)}m. Using straight line fallback FOR RED LINE.`);
                    segmentPathCoordsGeoJSON = [pointA_geo, pointB_geo];
                }
            }
        } else {
             console.warn(`RED LINE Valhalla route result for segment ${i} (between centroids ${JSON.stringify(pointA_geo)} and ${JSON.stringify(pointB_geo)}) was not valid or empty. Using straight line FOR RED LINE.`);
             segmentPathCoordsGeoJSON = [pointA_geo, pointB_geo];
        }

        let intersectsBuilding = false;
        if (segmentPathCoordsGeoJSON.length >= 2 && window.buildingFootprintsGeoJSON && window.buildingFootprintsGeoJSON.features && typeof turf !== 'undefined' && typeof turf.lineString === 'function' && typeof turf.lineIntersect === 'function') {
            const routeSegmentLineString = turf.lineString(segmentPathCoordsGeoJSON);
            for (const buildingFeature of window.buildingFootprintsGeoJSON.features) {
                if (buildingFeature.geometry && (buildingFeature.geometry.type === 'Polygon' || buildingFeature.geometry.type === 'MultiPolygon')) {
                    try {
                        const intersectionPoints = turf.lineIntersect(routeSegmentLineString, buildingFeature);
                        if (intersectionPoints && intersectionPoints.features && intersectionPoints.features.length > 0) {
                            intersectsBuilding = true;
                            console.warn(`RED LINE Route segment from [${pointA_geo}] to [${pointB_geo}] intersects a building. This RED segment will not be drawn.`);
                            break;
                        }
                    } catch (e) { console.error("Error during Turf.js line/building intersection check for RED LINE:", e); }
                }
            }
        }

        if (!intersectsBuilding) {
            const leafletLatLngsRed = segmentPathCoordsGeoJSON.map(toLeafletLatLng).filter(c => c !== null);
            if (leafletLatLngsRed.length >= 2) {
                L.polyline(leafletLatLngsRed, { color: 'rgba(220, 50, 50, 0.9)', weight: 4.5, opacity: 0.85 }).addTo(routeLinesLayerGroup);

                if (segmentPathCoordsGeoJSON.length > 1) {
                    const midIdx = Math.floor((segmentPathCoordsGeoJSON.length - 1) / 2);
                    const p1_arrow = segmentPathCoordsGeoJSON[midIdx];
                    const p2_arrow = segmentPathCoordsGeoJSON.length > midIdx + 1 ? segmentPathCoordsGeoJSON[midIdx + 1] : segmentPathCoordsGeoJSON[segmentPathCoordsGeoJSON.length -1] ;
                    if (isValidCoordinate(p1_arrow) && isValidCoordinate(p2_arrow) && !(p1_arrow[0] === p2_arrow[0] && p1_arrow[1] === p2_arrow[1])) {
                        const bearing = getBearing(p1_arrow, p2_arrow);
                        const midPoint_arrow_geo = [(p1_arrow[0] + p2_arrow[0]) / 2, (p1_arrow[1] + p2_arrow[1]) / 2];
                        const midPoint_arrow_leaf = toLeafletLatLng(midPoint_arrow_geo);
                        if (midPoint_arrow_leaf) {
                            L.marker(midPoint_arrow_leaf, {
                                icon: L.divIcon({ className: 'route-arrow-icon', html: `<div style="font-size:18px; transform: rotate(${bearing - 90}deg); color:rgba(150,0,0,0.9);">➤</div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
                            }).addTo(routeArrowsLayerGroup);
                        }
                    }
                }
            }
        }
    }

    // --- 5. Add U-turn detection and helper icons (based on the RED line's waypoints) ---
    if (helperIconsLayerGroup && streetLevelWaypoints.length > 2) {
        console.log("Dual-line: Detecting U-turns for helper icons based on street-level waypoints...");
        for (let j = 1; j < streetLevelWaypoints.length - 1; j++) {
            const prevPoint = streetLevelWaypoints[j-1];
            const currentTurnPoint = streetLevelWaypoints[j];
            const nextPointAfterTurn = streetLevelWaypoints[j+1];

            if (!isValidCoordinate(prevPoint) || !isValidCoordinate(currentTurnPoint) || !isValidCoordinate(nextPointAfterTurn)) continue;

            const bearingIn = getBearing(prevPoint, currentTurnPoint);
            const bearingOut = getBearing(currentTurnPoint, nextPointAfterTurn);
            let angleDiff = Math.abs(bearingIn - bearingOut);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            const uTurnThresholdMin = 150; const uTurnThresholdMax = 210;

            if (angleDiff > uTurnThresholdMin && angleDiff < uTurnThresholdMax) {
                console.log(`U-turn heuristic: Sharp turn (${angleDiff.toFixed(1)}°) detected at street-level waypoint index ${j}:`, currentTurnPoint);
                const uTurnIcon = L.divIcon({
                    className: 'custom-helper-icon uturn-icon',
                    html: '<span style="font-size: 20px; color: #007bff; background: rgba(255,255,255,0.8); padding: 1px 4px; border-radius: 50%; border: 1px solid #007bff;">U</span>',
                    iconSize: [24, 24], iconAnchor: [12, 12]
                });
                const leafletLatLng = toLeafletLatLng(currentTurnPoint);
                if (leafletLatLng) {
                    L.marker(leafletLatLng, { icon: uTurnIcon, zIndexOffset: 1000 })
                     .bindPopup("Consider U-turn / End of Segment")
                     .addTo(helperIconsLayerGroup);
                }
            }
        }
    }

    console.log("✅ Dual-line: Valhalla route planning and drawing completed.");
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
    if (pointsToProcess.length === 0) { alert("No points selected or available to route."); return; }
  }

  if (pointsToProcess.length < 2) { alert("Please provide at least two points for routing."); return; }
  console.log(`🧪 Processing ${pointsToProcess.length} points for Valhalla. TSP: ${tspMethodName}`);

  if (!layerGroups || !layerGroups.routeLinesLayerGroup || !layerGroups.routeArrowsLayerGroup || !layerGroups.detailedOrderLineLayerGroup || !layerGroups.helperIconsLayerGroup) {
      console.error("Critical Error: Not all required layer groups were provided to solveRouteToggle.", layerGroups);
      alert("Error: Essential map layers for routing are missing. Please check console.");
      return;
  }

  try {
    await planRouteWithValhalla(map, pointsToProcess, layerGroups, tspMethodName);
  } catch (error) {
    console.error("Error during solveRouteToggle:", error);
    alert(`Route planning error: ${error.message}. Check console for details.`);
  } finally {
    console.log("✅ solveRouteToggle (Valhalla) completed.");
  }
}

if (typeof window.solveRouteToggle === 'undefined') {
    window.solveRouteToggle = solveRouteToggle;
}
console.log("✅ route_solver_valhalla_leaflet.js (Dual Line Version, Adjusted Clustering) loaded.");


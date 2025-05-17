// loadPoints_leaflet.js
// Loads flyer drop points and adds them to a Leaflet map.
// Ensures unique IDs in feature.properties for tracking.

/**
 * Checks if a variable is a valid coordinate array [lon, lat] (GeoJSON order).
 * Note: Leaflet uses [lat, lon] order for coordinates.
 */
function isValidCoordinate(coord) {
    return Array.isArray(coord) &&
           coord.length === 2 &&
           typeof coord[0] === 'number' && // longitude
           typeof coord[1] === 'number' && // latitude
           isFinite(coord[0]) &&
           isFinite(coord[1]);
}

/**
 * Converts GeoJSON [lon, lat] to Leaflet [lat, lon].
 */
function toLeafletLatLng(geojsonCoord) {
    if (isValidCoordinate(geojsonCoord)) {
        return [geojsonCoord[1], geojsonCoord[0]]; // Leaflet: [lat, lon]
    }
    return null;
}

/**
 * Loads flyer points from a GeoJSON file and adds them to the Leaflet map.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {Map} allFlyerFeaturesMap - A Map object to store all loaded features, keyed by unique_flyer_id.
 * @param {L.FeatureGroup} flyerPointsLayerGroup - A Leaflet FeatureGroup to add the point markers to.
 */
async function loadFlyerPoints(map, allFlyerFeaturesMap, flyerPointsLayerGroup) {
  console.log("loadFlyerPoints (Leaflet version) called...");
  try {
    const res = await fetch('../data/address_points.geojson'); // Ensure this path is correct
    if (!res.ok) {
        throw new Error(`Failed to fetch address_points.geojson: ${res.status} ${res.statusText}`);
    }
    const geojson = await res.json();

    if (!geojson || !Array.isArray(geojson.features)) {
        console.error('❌ Loaded GeoJSON is not valid or has no features:', geojson);
        return;
    }

    let validFeatureCount = 0;
    allFlyerFeaturesMap.clear(); // Clear the map passed from map_leaflet.js
    flyerPointsLayerGroup.clearLayers(); // Clear existing points from the layer group

    geojson.features.forEach((feature, index) => {
      if (!feature.properties) { // Ensure properties object exists
          feature.properties = {};
      }
      // Assign a unique ID to feature.properties.unique_flyer_id for reliable tracking
      if (feature.properties.unique_flyer_id == null) { // Check for null or undefined
          feature.properties.unique_flyer_id = `flyer-point-${index}`;
      } else {
          // Ensure it's a string if it already exists from source data
          feature.properties.unique_flyer_id = String(feature.properties.unique_flyer_id);
      }

      // Check if the feature has valid point geometry
      if (feature.geometry && feature.geometry.type === 'Point' && isValidCoordinate(feature.geometry.coordinates)) {
          validFeatureCount++;
          const leafletLatLng = toLeafletLatLng(feature.geometry.coordinates);
          
          if (leafletLatLng) {
            // Create a Leaflet circle marker for each point
            const marker = L.circleMarker(leafletLatLng, {
                radius: 6,
                fillColor: "#008000", // Default green color
                color: "#ffffff",     // White border
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7
            });
            // Store the original GeoJSON feature data on the marker for later access (e.g., in click events)
            marker.featureData = feature; 
            marker.addTo(flyerPointsLayerGroup);

            // Populate the allFlyerFeaturesMap for quick lookup by unique_flyer_id
            allFlyerFeaturesMap.set(feature.properties.unique_flyer_id, feature);
          }
      } else {
          console.warn(`Feature (properties.unique_flyer_id: ${feature.properties.unique_flyer_id}) has invalid geometry or is not a Point.`, feature.geometry);
      }
    });

    console.log(`Processed ${geojson.features.length} features; ${validFeatureCount} valid points added to map.`);
    console.log(`✅ Loaded flyer points into Leaflet layer group and populated allFlyerFeaturesMap.`);

  } catch (err) {
    console.error('❌❌❌ CRITICAL ERROR in loadFlyerPoints (Leaflet):', err.message, err.stack);
    // Optionally, display an error to the user on the page
  }
}

// Make it globally available if map_leaflet.js calls it via window
if (typeof window.loadFlyerPoints === 'undefined') {
    window.loadFlyerPoints = loadFlyerPoints;
}

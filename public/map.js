// loadPoints.js
// 🏠 Loads and displays flyer drop points from address_points.geojson
// Uses MINIMAL styling to ensure the layer can be added without style errors.

/**
 * Checks if a variable is a valid coordinate array [lon, lat].
 */
function isValidCoordinate(coord) {
    return Array.isArray(coord) &&
           coord.length === 2 &&
           typeof coord[0] === 'number' &&
           typeof coord[1] === 'number' &&
           isFinite(coord[0]) &&
           isFinite(coord[1]);
}

async function loadFlyerPoints(map) {
  console.log("loadFlyerPoints called (minimal styling version)...");
  try {
    const res = await fetch('../data/address_points.geojson'); // Ensure this path is correct
    if (!res.ok) {
        // Log the error and re-throw to be caught by the caller or a global handler
        const errorMsg = `Failed to fetch address_points.geojson: ${res.status} ${res.statusText}`;
        console.error('❌', errorMsg);
        throw new Error(errorMsg);
    }
    const geojson = await res.json();

    if (!geojson || !Array.isArray(geojson.features)) {
        const errorMsg = 'Loaded GeoJSON is not valid or has no features.';
        console.error('❌', errorMsg, geojson);
        throw new Error(errorMsg); // Stop execution if GeoJSON is bad
    }

    // Ensure each feature has a unique ID for feature state (still needed for selection logic later)
    let validFeatureCount = 0;
    geojson.features.forEach((feature, index) => {
      if (!feature.properties) {
          feature.properties = {};
      }
      if (feature.id == null) {
        feature.id = `flyer-point-${index}`;
      }
      if (feature.geometry && isValidCoordinate(feature.geometry.coordinates)) {
          validFeatureCount++;
      } else {
          console.warn(`Feature at index ${index} (ID: ${feature.id}) has invalid geometry.`, feature.geometry);
      }
    });
    console.log(`Processed ${geojson.features.length} features, ${validFeatureCount} have valid geometry.`);

    const SOURCE_ID = 'original-flyers';
    const LAYER_ID = 'original-flyers-layer';

    if (map.getSource(SOURCE_ID)) {
        console.log(`Source '${SOURCE_ID}' already exists. Updating data.`);
        map.getSource(SOURCE_ID).setData(geojson);
    } else {
        console.log(`Adding source '${SOURCE_ID}' with promoteId: 'id'`);
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: geojson,
            promoteId: 'id' // Still important for selection logic in map.js
        });
    }

    // Remove layer if it exists, to ensure it's re-added with the new (simple) style
    if (map.getLayer(LAYER_ID)) {
        console.log(`Layer '${LAYER_ID}' exists. Removing before re-adding with simple style.`);
        map.removeLayer(LAYER_ID);
    }

    console.log(`Adding layer '${LAYER_ID}' with MINIMAL styling.`);
    map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
            // --- MINIMAL STYLING ---
            'circle-radius': 5,       // Simple fixed radius
            'circle-color': '#008000', // Simple fixed green color
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.8
            // No feature-state, no complex interpolations for now
            // --- END MINIMAL STYLING ---
        }
    });
    console.log(`✅ Layer '${LAYER_ID}' added with minimal styling.`);
    console.log(`✅ Loaded and processed ${geojson.features.length} flyer points. Source and layer should be configured.`);

  } catch (err) {
    // Log the error more visibly and avoid alert if it's causing issues
    console.error('❌❌❌ CRITICAL ERROR in loadFlyerPoints:', err.message, err.stack);
    // Optionally, display a user-friendly message on the page itself instead of an alert
    const errorDisplay = document.getElementById('map-error-display'); // Assuming you add such an element
    if (errorDisplay) {
        errorDisplay.textContent = `Failed to load map points: ${err.message}. Please check console.`;
        errorDisplay.style.display = 'block';
    }
    // Re-throwing the error might be useful if map.js has a try-catch around calling this.
    // throw err; 
  }
}

window.loadFlyerPoints = loadFlyerPoints;

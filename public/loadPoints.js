// map.js
// Handles map initialization, point selection with a dedicated "select mode", and UI interactions.
// Refined timing for populating feature map and robust ID handling.

const baseLayers = {
  osm: { id: 'osm-layer', sourceId: 'osm', source: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' }, layer: { id: 'osm-layer', type: 'raster', source: 'osm' } },
  esri: { id: 'esri-satellite', sourceId: 'esri', source: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' }, layer: { id: 'esri-satellite', type: 'raster', source: 'esri' } }
};
let currentBase = 'esri';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: { [baseLayers.esri.sourceId]: baseLayers.esri.source },
    layers: [baseLayers.esri.layer]
  },
  center: [149.128998, -35.282001], // Canberra center
  zoom: 13
});

// Variables for point selection
let selectedFlyerPointIds = new Set(); // Stores the ID used for feature state (should be the promoted unique_flyer_id)
let allFlyerFeaturesMap = new Map(); // Stores [unique_flyer_id_from_properties, feature_object_from_query]
let selectModeActive = false;
const TARGET_LAYER_ID = 'original-flyers-layer';
const TARGET_SOURCE_ID = 'original-flyers';

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

/**
 * Populates the allFlyerFeaturesMap from the source.
 * Uses feature.properties.unique_flyer_id as the key.
 * Returns true if any features were successfully mapped.
 */
function populateAllFlyerFeaturesMap() {
    if (!map.getSource(TARGET_SOURCE_ID) || !map.isSourceLoaded(TARGET_SOURCE_ID)) {
        // console.log(`populateAllFlyerFeaturesMap: Source '${TARGET_SOURCE_ID}' not ready.`);
        return false;
    }
    try {
        const features = map.querySourceFeatures(TARGET_SOURCE_ID);
        // It's important to clear only if we are sure we are about to repopulate with new/correct data.
        // If features array is empty, clearing might remove valid data from a previous successful population.
        if (features.length > 0) {
            allFlyerFeaturesMap.clear(); // Clear before repopulating if we have new features
        } else if (allFlyerFeaturesMap.size === 0) { // Only log if map is already empty and query is empty
            console.log(`populateAllFlyerFeaturesMap: querySourceFeatures returned no features for '${TARGET_SOURCE_ID}'. Map is currently empty.`);
            return false;
        } else { // Query is empty, but map has items - don't clear, data might be transiently unavailable from query
            console.log(`populateAllFlyerFeaturesMap: querySourceFeatures returned 0, but allFlyerFeaturesMap already has ${allFlyerFeaturesMap.size} items. Not clearing.`);
            return true; // Indicate map is already populated
        }

        let populatedCount = 0;
        let featuresMissingUniqueIdInProps = 0;

        features.forEach((feature, idx) => {
            const idFromProperties = feature.properties ? feature.properties.unique_flyer_id : null;

            if (idFromProperties != null) {
                allFlyerFeaturesMap.set(String(idFromProperties), feature); // Ensure key is string
                populatedCount++;
            } else {
                featuresMissingUniqueIdInProps++;
                // Log only a few examples
                if (idx === 0 && features.length > 0) { // Log details for the first feature if it's missing the property
                    console.warn(`populateAllFlyerFeaturesMap: First queried feature is missing 'unique_flyer_id' in properties. Feature:`, feature);
                }
            }
        });

        if (populatedCount > 0) {
            console.log(`SUCCESS: Populated/Refreshed allFlyerFeaturesMap with ${allFlyerFeaturesMap.size} features using 'properties.unique_flyer_id'.`);
        }
        if (featuresMissingUniqueIdInProps > 0) {
            console.warn(`WARNING: ${featuresMissingUniqueIdInProps} features from querySourceFeatures were missing 'unique_flyer_id' in properties.`);
        }
        return populatedCount > 0;
    } catch (e) {
        console.error(`Error querying source features for '${TARGET_SOURCE_ID}':`, e);
        return false;
    }
}


map.on('load', async () => {
  console.log('✅ Map loaded event fired.');

  map.loadImage('img/arrow.png', (error, image) => {
    if (error) { console.warn('⚠️ Error loading arrow.png:', error.message); return; }
    if (image && !map.hasImage('arrow')) map.addImage('arrow', image);
  });

  if (typeof window.loadFlyerPoints === 'function') {
    console.log("Attempting to call window.loadFlyerPoints(map)...");
    try {
        await window.loadFlyerPoints(map); // loadPoints.js should set promoteId: 'unique_flyer_id'
        console.log("window.loadFlyerPoints(map) call likely completed.");
        
        // Attempt to populate after a short delay to give MapLibre time to process the source
        setTimeout(() => {
            console.log("Attempting initial population of allFlyerFeaturesMap (after delay)...");
            populateAllFlyerFeaturesMap();
        }, 250); // 250ms delay

    } catch (error) {
        console.error("❌❌❌ CRITICAL ERROR during window.loadFlyerPoints call in map.js:", error.message, error.stack);
        alert("A critical error occurred while loading flyer points. Map may not function correctly. Check console.");
        return; // Stop further map setup if points loading fails critically
    }

    // More targeted 'sourcedata' listener
    map.on('sourcedata', function sourceDataListener(e) {
        if (e.sourceId === TARGET_SOURCE_ID && e.isSourceLoaded && e.sourceDataType !== 'metadata' && e.type === 'data') {
            // This event can fire frequently. Only repopulate if necessary or if data truly changed.
            // For simplicity now, we'll just repopulate. Could be optimized.
            // console.log(`'sourcedata' (type: data) event for '${TARGET_SOURCE_ID}'. Re-populating allFlyerFeaturesMap.`);
            populateAllFlyerFeaturesMap();
        }
    });

    const checkForLayerInterval = setInterval(() => {
      if (map.getLayer(TARGET_LAYER_ID)) {
        clearInterval(checkForLayerInterval);
        console.log(`Layer '${TARGET_LAYER_ID}' is now available. Attaching click listener.`);

        map.on('click', TARGET_LAYER_ID, (e) => {
          if (e.features && e.features.length > 0) {
            const clickedFeature = e.features[0];
            // `clickedFeature.id` SHOULD be the value of `properties.unique_flyer_id` due to `promoteId`.
            // This is the ID MapLibre uses for feature state.
            const stateId = clickedFeature.id; 

            if (stateId == null) {
              console.warn("Clicked feature missing 'id' (stateId), which is needed for setFeatureState. Feature properties:", clickedFeature.properties);
              // If stateId is null, but unique_flyer_id is in properties, it means promoteId isn't working as expected for click events.
              // This would be a problem for setFeatureState.
              return;
            }
            
            const stateIdStr = String(stateId); // Ensure it's a string for Set operations
            console.log(`Clicked feature. Event feature.id (stateId): ${stateIdStr}`);

            if (selectedFlyerPointIds.has(stateIdStr)) {
              selectedFlyerPointIds.delete(stateIdStr);
              map.setFeatureState(
                { source: TARGET_SOURCE_ID, id: stateId }, // Use the ID from the event for setFeatureState
                { selected: false }
              );
            } else {
              selectedFlyerPointIds.add(stateIdStr);
              map.setFeatureState(
                { source: TARGET_SOURCE_ID, id: stateId }, // Use the ID from the event
                { selected: true }
              );
            }
            console.log("Selected state IDs:", Array.from(selectedFlyerPointIds));
          }
        });
      } else {
        // console.log(`Waiting for layer '${TARGET_LAYER_ID}'...`);
      }
    }, 500);

  } else {
    console.error('❌ window.loadFlyerPoints is not defined.');
  }

  // "Solve Route" button listener
  const solveBtn = document.getElementById('solveRouteBtn');
  if (solveBtn) {
    solveBtn.addEventListener('click', () => {
      const methodSelect = document.getElementById('tspSolver');
      const method = methodSelect ? methodSelect.value : 'greedy';
      console.log('🟠 Solve Route button clicked. Method:', method);

      const pointsToRoute = [];
      if (selectedFlyerPointIds.size > 0 && allFlyerFeaturesMap.size === 0) {
          console.warn("allFlyerFeaturesMap is empty but points are selected. Attempting to populate now for routing.");
          populateAllFlyerFeaturesMap(); // Try to populate it again
      }
      if (selectedFlyerPointIds.size > 0 && allFlyerFeaturesMap.size === 0 && !populateAllFlyerFeaturesMap()) { // Try one last time
          console.error("Still unable to populate allFlyerFeaturesMap. Cannot get coordinates for selected points.");
          alert("Error: Could not retrieve details for selected points. Please try clearing selection and re-selecting, or check console.");
          return;
      }

      selectedFlyerPointIds.forEach(selectedIdForState => { // This ID is from the click event (feature.id)
        // We assume selectedIdForState (from click event feature.id) IS the unique_flyer_id
        // because loadPoints.js set promoteId: 'unique_flyer_id'
        const feature = allFlyerFeaturesMap.get(selectedIdForState); 

        if (feature && feature.geometry && feature.geometry.type === 'Point' && isValidCoordinate(feature.geometry.coordinates)) {
          pointsToRoute.push(feature.geometry.coordinates);
        } else {
            console.warn(`Could not find valid feature or coordinates for selected state ID [${selectedIdForState}] using allFlyerFeaturesMap. Feature found in map:`, feature);
        }
      });

      if (pointsToRoute.length < 2) {
        alert("Please select at least two flyer points to calculate a route (or selected points could not be resolved).");
        return;
      }
      if (typeof window.solveRouteToggle === 'function') {
        window.solveRouteToggle(map, method, pointsToRoute);
      } else {
        console.error('❌ solveRouteToggle is not defined (button click).');
      }
    });
  } else { console.warn('⚠️ Button "solveRouteBtn" not found.'); }

  // "Clear Selection" button listener
  const clearBtn = document.getElementById('clearSelectionBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedFlyerPointIds.forEach(id => { // id here is the stateId
        if (map.getSource(TARGET_SOURCE_ID)) {
            try {
                map.setFeatureState(
                  { source: TARGET_SOURCE_ID, id: id }, // Use stateId
                  { selected: false }
                );
            } catch (e) { console.warn(`Error setting feature state for ID ${id} on clear:`, e.message); }
        }
      });
      selectedFlyerPointIds.clear();
      console.log("Selection cleared.");
      // Clear routes
      if (map.getLayer('full-tsp-route-layer')) map.removeLayer('full-tsp-route-layer');
      if (map.getSource('full-tsp-route')) map.removeSource('full-tsp-route');
      if (map.getLayer('route-arrows-layer')) map.removeLayer('route-arrows-layer');
      if (map.getSource('route-arrows')) map.removeSource('route-arrows');
    });
  } else { console.warn('⚠️ Button "clearSelectionBtn" not found.'); }

  // "Toggle Select Mode" button listener
  const toggleSelectModeBtn = document.getElementById('toggleSelectModeBtn');
  if (toggleSelectModeBtn) {
    toggleSelectModeBtn.addEventListener('click', () => {
      selectModeActive = !selectModeActive;
      if (selectModeActive) {
        map.dragPan.disable(); map.dragRotate.disable(); map.touchZoomRotate.disableRotation();
        toggleSelectModeBtn.textContent = 'Exit Select Mode (Enable Pan)';
        toggleSelectModeBtn.style.backgroundColor = '#ff8c00'; map.getCanvas().style.cursor = 'pointer';
        console.log("Select Mode Activated.");
      } else {
        map.dragPan.enable(); map.dragRotate.enable(); map.touchZoomRotate.enableRotation();
        toggleSelectModeBtn.textContent = 'Enter Select Mode (Disable Pan)';
        toggleSelectModeBtn.style.backgroundColor = ''; map.getCanvas().style.cursor = '';
        console.log("Select Mode Deactivated.");
      }
    });
  } else { console.warn("⚠️ Button 'toggleSelectModeBtn' not found."); }

  const toggleBaseLayerBtn = document.getElementById('toggleBaseLayer');
  if (toggleBaseLayerBtn) { /* ... your base layer toggle logic ... */ }
});

map.on('error', (e) => { console.error('❌ MapLibre error event:', e.error ? e.error.message : e.error ? e.error : e); });

console.log("map.js executed with robust ID handling for selection mode (v2).");

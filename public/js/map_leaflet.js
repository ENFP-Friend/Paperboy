// map_leaflet.js
// Main map logic using Leaflet for display and interactions.
// Assumes window.APP_CONFIG is populated by route_solver_valhalla_leaflet.js.

// --- Global-like variables ---
if (typeof selectedPointsUniqueIdsGlobal === 'undefined') {
  var selectedPointsUniqueIdsGlobal = new Set();
}
if (typeof allFlyerFeaturesMapGlobal === 'undefined') {
  var allFlyerFeaturesMapGlobal = new Map();
}
var map;
var flyerPointsLayerGroup, selectedPointsLayerGroup, routeLinesLayerGroup, routeArrowsLayerGroup, detailedOrderLineLayerGroup, drawnItems;
var buildingFootprintsLayerGroup;
var helperIconsLayerGroup;

// --- End Global-like variables ---

/**
 * Initializes the Leaflet map and related functionalities.
 */
function initializeApp() {
    console.log("map_leaflet.js: Initializing Leaflet map...");

    try {
        const defaultLat = (window.APP_CONFIG && typeof window.APP_CONFIG.MAP_DEFAULT_LAT === 'number') ? window.APP_CONFIG.MAP_DEFAULT_LAT : -35.282001;
        const defaultLon = (window.APP_CONFIG && typeof window.APP_CONFIG.MAP_DEFAULT_LON === 'number') ? window.APP_CONFIG.MAP_DEFAULT_LON : 149.128998;
        const defaultZoom = (window.APP_CONFIG && typeof window.APP_CONFIG.MAP_DEFAULT_ZOOM === 'number') ? window.APP_CONFIG.MAP_DEFAULT_ZOOM : 13;

        // Define Base Layers
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });

        const googleSatLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
            maxZoom: 20,
            subdomains:['mt0','mt1','mt2','mt3'],
            attribution: '© <a href="https://maps.google.com">Google Maps</a>'
        });

        // Ensure the map div exists
        if (!document.getElementById('map')) {
            console.error("FATAL: Map container div with id 'map' not found in the DOM.");
            alert("Map container not found. Cannot initialize map.");
            return;
        }

        map = L.map('map', {
            scrollWheelZoom: 'center',
            layers: [osmLayer] // Default layer to load
        }).setView([defaultLat, defaultLon], defaultZoom);

        console.log("Leaflet map object initialized.");

        // Layer Control
        const baseLayers = {
            "OpenStreetMap": osmLayer,
            "Google Satellite": googleSatLayer
        };

        // --- Layer Groups for overlays ---
        flyerPointsLayerGroup = L.featureGroup().addTo(map);
        selectedPointsLayerGroup = L.featureGroup().addTo(map);
        routeLinesLayerGroup = L.featureGroup().addTo(map);
        routeArrowsLayerGroup = L.featureGroup().addTo(map);
        detailedOrderLineLayerGroup = L.featureGroup().addTo(map);
        drawnItems = new L.FeatureGroup().addTo(map);
        buildingFootprintsLayerGroup = L.featureGroup().addTo(map);
        helperIconsLayerGroup = L.featureGroup().addTo(map);


        const overlayLayers = {
            "Flyer Drop Points": flyerPointsLayerGroup,
            "Selected Points": selectedPointsLayerGroup,
            "Street Route (Red)": routeLinesLayerGroup,
            "Route Arrows (Red Line)": routeArrowsLayerGroup,
            "Delivery Order (Blue)": detailedOrderLineLayerGroup,
            "Selection Area": drawnItems,
            "Building Footprints": buildingFootprintsLayerGroup,
            "Helper Icons": helperIconsLayerGroup
        };

        L.control.layers(baseLayers, overlayLayers, { collapsed: true }).addTo(map);
        console.log("Layer control added to map.");

    } catch (e) {
        console.error("FATAL ERROR during basic map initialization:", e);
        alert("A critical error occurred while setting up the map. Please check the console.");
        return; // Stop further execution if basic map setup fails
    }

    // --- Load Building Footprints (with try-catch) ---
    try {
        fetch('../data/hackett_building_footPrints.geojson')
            .then(response => {
                if (!response.ok) {
                    // Throw an error to be caught by the outer .catch or the main try-catch
                    throw new Error(`HTTP error! status: ${response.status} trying to fetch ${response.url}`);
                }
                return response.json();
            })
            .then(geojson => {
                window.buildingFootprintsGeoJSON = geojson;
                L.geoJSON(geojson, {
                    style: function (feature) {
                        return { color: "#708090", weight: 1, opacity: 0.65, fillColor: "#778899", fillOpacity: 0.3 };
                    },
                    onEachFeature: function (feature, layer) {
                        if (feature.properties) {
                            let popupContent = '';
                            for (const key in feature.properties) {
                                popupContent += `<b>${key}:</b> ${feature.properties[key]}<br>`;
                            }
                            if (popupContent) layer.bindPopup(popupContent);
                        }
                    }
                }).addTo(buildingFootprintsLayerGroup);
                console.log("Building footprints loaded successfully.");
            })
            .catch(error => { // Catch for the fetch promise chain
                console.error('Error loading building footprints (within fetch chain):', error);
                alert('Could not load building footprints. Routing features related to buildings may be affected. Check console for details. Path: ../data/hackett_building_footPrints.geojson');
            });
    } catch (e) {
        console.error("ERROR during building footprints loading section:", e);
        alert("An error occurred while attempting to load building footprints data.");
    }
    // --- End Load Building Footprints ---

    // --- Load Flyer Points (with try-catch) ---
    try {
        if (typeof window.loadFlyerPoints === 'function') {
            window.loadFlyerPoints(map, allFlyerFeaturesMapGlobal, flyerPointsLayerGroup);
            populateAllFlyerFeaturesMap();
            console.log("Flyer points loaded and populated.");
        } else {
            console.error('❌ window.loadFlyerPoints function is not defined. Flyer points cannot be loaded.');
            alert("Flyer points loading function is missing. Points will not be displayed.");
        }
    } catch (e) {
        console.error("ERROR during flyer points loading section:", e);
        alert("An error occurred while loading flyer points.");
    }
    // --- End Load Flyer Points ---

    // --- Initialize Draw Controls and Event Listeners (with try-catch) ---
    try {
        const drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems, remove: true },
            draw: { polygon: { allowIntersection: false, shapeOptions: { color: '#007bff', fillOpacity: 0.2, weight: 2 }, showArea: true, metric: true },
                polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false }
        });
        map.addControl(drawControl);

        map.on(L.Draw.Event.CREATED, function (e) { if (e.layerType === 'polygon') { drawnItems.clearLayers(); drawnItems.addLayer(e.layer); selectPointsInPolygon(e.layer.toGeoJSON()); }});
        map.on(L.Draw.Event.EDITED, function (e) { e.layers.eachLayer(function (l) { if (l instanceof L.Polygon) selectPointsInPolygon(l.toGeoJSON()); });});
        map.on(L.Draw.Event.DELETED, function () {
            selectedPointsUniqueIdsGlobal.clear();
            updateSelectedPointsVisuals();
            routeLinesLayerGroup.clearLayers();
            routeArrowsLayerGroup.clearLayers();
            if (detailedOrderLineLayerGroup) detailedOrderLineLayerGroup.clearLayers();
            if (helperIconsLayerGroup) helperIconsLayerGroup.clearLayers();
        });

        document.getElementById('solveRouteBtn')?.addEventListener('click', () => {
            const tspMethodName = document.getElementById('tspSolver')?.value || 'greedy';
            const pointsToRoute = Array.from(selectedPointsUniqueIdsGlobal)
                .map(id => allFlyerFeaturesMapGlobal.get(id))
                .filter(f => f && f.geometry && f.geometry.type === 'Point' && isValidCoordinate(f.geometry.coordinates))
                .map(f => f.geometry.coordinates);
            if (pointsToRoute.length < 2) { alert("Please select at least two flyer points."); return; }
            if (typeof window.solveRouteToggle === 'function') {
              window.solveRouteToggle(map, tspMethodName, pointsToRoute, {
                  routeLinesLayerGroup,
                  routeArrowsLayerGroup,
                  detailedOrderLineLayerGroup,
                  helperIconsLayerGroup
                });
            } else { console.error('❌ solveRouteToggle is not defined.'); }
        });

        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            selectedPointsUniqueIdsGlobal.clear();
            updateSelectedPointsVisuals();
            drawnItems.clearLayers();
            routeLinesLayerGroup.clearLayers();
            routeArrowsLayerGroup.clearLayers();
            if (detailedOrderLineLayerGroup) detailedOrderLineLayerGroup.clearLayers();
            if (helperIconsLayerGroup) helperIconsLayerGroup.clearLayers();
        });

        console.log("map_leaflet.js: UI event listeners and draw controls attached.");
    } catch (e) {
        console.error("ERROR setting up draw controls or UI event listeners:", e);
        alert("An error occurred while setting up map interaction tools.");
    }
} // End of initializeApp

function isValidCoordinate(coord) {
    return Array.isArray(coord) && coord.length === 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number' && isFinite(coord[0]) && isFinite(coord[1]);
}
function toLeafletLatLng(geojsonCoord) {
    if (isValidCoordinate(geojsonCoord)) { return [geojsonCoord[1], geojsonCoord[0]]; } return null;
}
function populateAllFlyerFeaturesMap() {
    if (!map || !flyerPointsLayerGroup || !map.hasLayer(flyerPointsLayerGroup)) { return false; }
    allFlyerFeaturesMapGlobal.clear();
    flyerPointsLayerGroup.eachLayer(marker => {
        if (marker.featureData && marker.featureData.properties && marker.featureData.properties.unique_flyer_id != null) {
            allFlyerFeaturesMapGlobal.set(String(marker.featureData.properties.unique_flyer_id), marker.featureData);
        }
    });
    return allFlyerFeaturesMapGlobal.size > 0;
}
function updateSelectedPointsVisuals() {
    if (!selectedPointsLayerGroup) return;
    selectedPointsLayerGroup.clearLayers();
    selectedPointsUniqueIdsGlobal.forEach(uniqueId => {
        const feature = allFlyerFeaturesMapGlobal.get(uniqueId);
        if (feature && feature.geometry && feature.geometry.type === 'Point') {
            const latLng = toLeafletLatLng(feature.geometry.coordinates);
            if (latLng) L.circleMarker(latLng, { radius: 8, fillColor: '#ff8c00', color: '#ffffff', weight: 2, opacity: 1, fillOpacity: 0.9 }).addTo(selectedPointsLayerGroup);
        }
    });
}
function selectPointsInPolygon(polygonGeoJSON) {
    if (typeof turf === 'undefined' || typeof turf.pointsWithinPolygon === 'undefined') { console.error("Turf.js not available."); return; }
    if (allFlyerFeaturesMapGlobal.size === 0) populateAllFlyerFeaturesMap();
    if (allFlyerFeaturesMapGlobal.size === 0) { console.error("No flyer points loaded."); return; }
    const allPointsForTurf = { type: "FeatureCollection", features: Array.from(allFlyerFeaturesMapGlobal.values()) };
    selectedPointsUniqueIdsGlobal.clear();
    try {
        const pointsInside = turf.pointsWithinPolygon(allPointsForTurf, polygonGeoJSON);
        pointsInside.features.forEach(f => { if (f.properties && f.properties.unique_flyer_id != null) selectedPointsUniqueIdsGlobal.add(String(f.properties.unique_flyer_id)); });
    } catch (e) { console.error("Error during turf.pointsWithinPolygon:", e); }
    updateSelectedPointsVisuals();
}

// Ensure initializeApp is called after the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOMContentLoaded has already fired
    initializeApp();
}
console.log("map_leaflet.js loaded. initializeApp scheduled or called.");


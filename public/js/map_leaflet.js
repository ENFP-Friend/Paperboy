// map_leaflet.js
// Main map logic using Leaflet for display and interactions.
// Assumes window.APP_CONFIG is populated by route_solver_valhalla_leaflet.js.
// Added Google Satellite layer and layer control.

// --- Global-like variables ---
if (typeof selectedPointsUniqueIdsGlobal === 'undefined') {
  var selectedPointsUniqueIdsGlobal = new Set();
}
if (typeof allFlyerFeaturesMapGlobal === 'undefined') {
  var allFlyerFeaturesMapGlobal = new Map();
}
var map;
var flyerPointsLayerGroup, selectedPointsLayerGroup, routeLinesLayerGroup, routeArrowsLayerGroup, drawnItems;
var buildingFootprintsLayerGroup; // << NEW: For building footprints
// --- End Global-like variables ---

/**
 * Initializes the Leaflet map and related functionalities.
 */
function initializeApp() {
    console.log("map_leaflet.js: Initializing Leaflet map...");

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

    map = L.map('map', {
        scrollWheelZoom: 'center',
        layers: [osmLayer] // Default layer to load
    }).setView([defaultLat, defaultLon], defaultZoom);

    console.log("Leaflet map initialized.");

    // Layer Control
    const baseLayers = {
        "OpenStreetMap": osmLayer,
        "Google Satellite": googleSatLayer
    };

    // --- Layer Groups for overlays ---
    flyerPointsLayerGroup = L.featureGroup().addTo(map);
    selectedPointsLayerGroup = L.featureGroup().addTo(map); // For selected points (orange)
    routeLinesLayerGroup = L.featureGroup().addTo(map);     // For route polylines
    routeArrowsLayerGroup = L.featureGroup().addTo(map);    // For route directional arrows
    drawnItems = new L.FeatureGroup().addTo(map);           // For Leaflet.draw polygons
    buildingFootprintsLayerGroup = L.featureGroup().addTo(map); // << NEW: Initialize building footprints layer group

    const overlayLayers = {
        "Flyer Drop Points": flyerPointsLayerGroup,
        "Selected Points": selectedPointsLayerGroup,
        "Calculated Route": routeLinesLayerGroup,
        "Route Arrows": routeArrowsLayerGroup,
        "Selection Area": drawnItems,
        "Building Footprints": buildingFootprintsLayerGroup // << NEW: Add to overlay control
    };

    L.control.layers(baseLayers, overlayLayers, { collapsed: true }).addTo(map);
    console.log("Layer control added to map.");

   // map_leaflet.js - inside initializeApp() function

    // --- Load Building Footprints ---
    fetch('../data/hackett_building_footPrints.geojson') // << CORRECTED PATH
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} trying to fetch ${response.url}`); // Added URL for easier debugging
            }
            return response.json();
        })
        .then(geojson => {
            window.buildingFootprintsGeoJSON = geojson; // Store globally for route_solver
            L.geoJSON(geojson, {
                style: function (feature) {
                    return {
                        color: "#708090", // Slate gray
                        weight: 1,
                        opacity: 0.65,
                        fillColor: "#778899", // Light slate gray
                        fillOpacity: 0.3
                    };
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties) {
                        let popupContent = '';
                        // Example: Display all properties in a generic way
                        for (const key in feature.properties) {
                            popupContent += `<b>${key}:</b> ${feature.properties[key]}<br>`;
                        }
                        if (popupContent) layer.bindPopup(popupContent);
                    }
                }
            }).addTo(buildingFootprintsLayerGroup);
            console.log("Building footprints loaded from ../data/hackett_building_footPrints.geojson and added to layer group.");
        })
        .catch(error => {
            console.error('Error loading building footprints:', error);
            alert('Could not load building footprints. Please check the file path (`../data/hackett_building_footPrints.geojson`), ensure the file exists, is valid GeoJSON, and the web server can access this path relative to your HTML file. Check the console for more details.');
        });
    // --- End Load Building Footprints ---

    if (typeof window.loadFlyerPoints === 'function') {
        window.loadFlyerPoints(map, allFlyerFeaturesMapGlobal, flyerPointsLayerGroup);
        populateAllFlyerFeaturesMap();
    } else { console.error('❌ window.loadFlyerPoints is not defined.'); }

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: { polygon: { allowIntersection: false, shapeOptions: { color: '#007bff', fillOpacity: 0.2, weight: 2 }, showArea: true, metric: true },
            polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) { if (e.layerType === 'polygon') { drawnItems.clearLayers(); drawnItems.addLayer(e.layer); selectPointsInPolygon(e.layer.toGeoJSON()); }});
    map.on(L.Draw.Event.EDITED, function (e) { e.layers.eachLayer(function (l) { if (l instanceof L.Polygon) selectPointsInPolygon(l.toGeoJSON()); });});
    map.on(L.Draw.Event.DELETED, function () { selectedPointsUniqueIdsGlobal.clear(); updateSelectedPointsVisuals(); routeLinesLayerGroup.clearLayers(); routeArrowsLayerGroup.clearLayers(); });

    document.getElementById('solveRouteBtn')?.addEventListener('click', () => {
        const tspMethodName = document.getElementById('tspSolver')?.value || 'greedy';
        const pointsToRoute = Array.from(selectedPointsUniqueIdsGlobal)
            .map(id => allFlyerFeaturesMapGlobal.get(id))
            .filter(f => f && f.geometry && f.geometry.type === 'Point' && isValidCoordinate(f.geometry.coordinates))
            .map(f => f.geometry.coordinates);
        if (pointsToRoute.length < 2) { alert("Please select at least two flyer points."); return; }
        if (typeof window.solveRouteToggle === 'function') {
          window.solveRouteToggle(map, tspMethodName, pointsToRoute, { routeLinesLayerGroup, routeArrowsLayerGroup });
        } else { console.error('❌ solveRouteToggle is not defined.'); }
    });
    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
        selectedPointsUniqueIdsGlobal.clear(); updateSelectedPointsVisuals(); drawnItems.clearLayers();
        routeLinesLayerGroup.clearLayers(); routeArrowsLayerGroup.clearLayers();
    });

    console.log("map_leaflet.js: UI event listeners attached.");
}

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

document.addEventListener('DOMContentLoaded', initializeApp);
console.log("map_leaflet.js loaded. Waiting for DOMContentLoaded to call initializeApp.");
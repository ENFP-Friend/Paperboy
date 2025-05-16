// loadLayers.js
window.loadBaseLayers = async function(map) {
  map.addSource('osm-tiles', {
    type: 'raster',
    tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256
  });

  map.addLayer({
    id: 'osm-tiles-layer',
    type: 'raster',
    source: 'osm-tiles'
  });

  console.log("🧭 Loaded OSM base tiles.");
};


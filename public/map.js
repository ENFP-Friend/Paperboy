const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Tiles © Esri',
        maxzoom: 19  
      }
    },
    layers: [
      {
        id: 'esri-base',
        type: 'raster',
        source: 'esri',
        minzoom: 0,
        maxzoom: 22  
      }
    ]
  },
  center: [149.166, -35.247],
  zoom: 16,
  maxZoom: 20  // Let user zoom in to z20 — even though tiles stop at z19
});

// Smooths stretched tiles — optional aesthetic tweak
map.on('load', () => {
  map.getCanvas().style.imageRendering = 'auto'; // or 'pixelated' if you want crisp zoom
  map.getCanvas().style.filter = 'contrast(105%) brightness(1.05)';
});

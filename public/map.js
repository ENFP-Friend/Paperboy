// 🗺️ Initalizes MapLibre map with ESRI World Imagery (raster) as the base layer
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
        attribution:
          'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
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
  center: [149.166, -35.247], // Hackett, Canberra
  zoom: 16,
  pitch: 0,
  bearing: 0
});

// Optional: expose map globally for debugging
window.map = map;

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256
      }
    },
    layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
  },
  center: [149.163, -35.254],
  zoom: 16
});

map.on('load', async () => {
  console.log('✅ Map loaded');
  window.loadBaseLayers(map);
  window.loadFlyerPoints(map);

  // map.loadImage('img/arrow2.png', (error, image) => {
  //   if (error) {
  //     console.error('❌ Failed to load arrow image:', error);
  //     return;
  //   }
  //   if (!map.hasImage('arrow')) {
  //     map.addImage('arrow', image);
  //   }
  // });

  const btn = document.getElementById('solveRouteBtn');
  if (!btn) return console.error('❌ Button missing');

  btn.addEventListener('click', () => {
    const method = document.getElementById('tspSolver').value;
    console.log('🟠 Solve Route with', method);

    if (typeof window.solveRouteToggle === 'function') {
      window.solveRouteToggle(map, method);
    } else {
      console.error('❌ solveRouteToggle is not yet defined on window.');
    }
  });
});


map.loadImage('img/arrow.png', (error, image) => {
  if (error) throw error;
  if (!map.hasImage('arrow')) {
    map.addImage('arrow', image);
  }
});



// Make this callable from your cluster route logic
window.drawArrowLayer = function (map) {
  if (!map.hasImage('arrow')) {
    console.warn('⚠️ Arrow image not loaded yet');
    return;
  }

  if (map.getLayer('full-tsp-route-arrows')) {
    map.removeLayer('full-tsp-route-arrows');
  }


// map.addLayer({
//   id: 'full-tsp-route-arrows',
//   type: 'symbol',
//   source: 'full-tsp-route',
//   layout: {
//     'symbol-placement': 'line',
//     'icon-image': 'arrow',
//     'icon-rotation-alignment': 'map',
//     'icon-allow-overlap': true,
//     'icon-ignore-placement': true,
//     'icon-size': [
//       'interpolate',
//       ['linear'],
//       ['zoom'],
//       10, 0.01,   // 👈 Smaller when zoomed out
//       18, 0.02    // 👈 Moderate size when zoomed in
//     ],
//     'symbol-spacing': [
//       'interpolate',
//       ['linear'],
//       ['zoom'],
//       10, 10,     // 👈 More arrows when zoomed out
//       18, 20      // 👈 Less spacing when zoomed in
//     ]
//   }
// });





  console.log('🧭 Direction arrows added');
};

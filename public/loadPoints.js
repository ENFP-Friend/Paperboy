// 🏠 Loads and displays flyer drop points from address_points.geojson

export async function loadFlyerPoints(map) {
  try {
    const res = await fetch('../data/address_points.geojson');
    const geojson = await res.json();

    map.addSource('flyer-points', {
      type: 'geojson',
      data: geojson
    });

map.addLayer({
  id: 'flyer-points-layer',
  type: 'circle',
  source: 'flyer-points',
  paint: {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 2,   // 🧭 At zoom 12 → radius 4
      16, 3,   // 🔍 At zoom 16 → radius 5
      20, 8    // 🔬 At zoom 20 → radius 6
    ],
    'circle-color': '#FFCC33',
    'circle-stroke-width': 1.2,
    'circle-stroke-color': '#222222'
  }
});



    console.log(`✅ Loaded ${geojson.features.length} flyer points`);
  } catch (err) {
    console.error('❌ Failed to load flyer drop points:', err);
  }
}

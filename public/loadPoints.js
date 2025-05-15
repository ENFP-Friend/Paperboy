// loadPoints.js
// 🏠 Loads and displays flyer drop points from address_points.geojson

export async function loadFlyerPoints(map) {
  try {
    const res = await fetch('../data/address_points.geojson');
    const geojson = await res.json();

    if (!map.getSource('flyer-points')) {
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
            'interpolate', ['linear'], ['zoom'],
            12, 1.5,
            14, 3,
            18, 6
          ],
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            12, 0.3,
            14, 1,
            18, 1.5
          ],
          'circle-color': '#00ff83',
          'circle-stroke-color': '#c1ffe0',
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            12, 0.6,
            20, 1
          ]
        }
      });
    } else {
      map.getSource('flyer-points').setData(geojson);
    }

    console.log(`✅ Loaded ${geojson.features.length} flyer points`);
  } catch (err) {
    console.error('❌ Failed to load flyer drop points:', err);
  }
}

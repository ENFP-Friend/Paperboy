// loadLayers.js
// 📍 Loads supporting static layers: footpaths, kerbs, buildings

let footpathLines = []; // or const

// Later: you fill it with data

export { footpathLines };


export async function loadBaseLayers(map) {
  const sources = [
    // { id: 'footways', file: '../data/act_footways.geojson', color: '#00cc88' },
    { id: 'paths', file: '../data/single_string.geojson', color: 'red' },
    // { id: 'pedestrian', file: '../data/act_pedestrian.geojson', color: '#33ddff' },
    // { id: 'steps', file: '../data/act_steps.geojson', color: '#ffaa00' },
    // { id: 'walkable_misc', file: '../data/act_walkable_misc.geojson', color: '#9999ff' }
  ];


  for (const src of sources) {
    const res = await fetch(src.file); // ✅ await now allowed
    const data = await res.json();


    

if (!map.getSource(src.id)) {
  map.addSource(src.id, {
    type: 'geojson',
    data: data
  });


    map.addLayer({
      id: `${src.id}-layer`,
      type: 'line',
      source: src.id,
      paint: {
        'line-color': src.color,
        'line-width': 1.4,
        'line-opacity': 0.2
      }
  });
} else {
  map.getSource(src.id).setData(data);
}

if (!map.getSource(src.id)) {
  map.addSource(src.id, {
    type: 'geojson',
    data: data
  });

  map.addLayer({
    id: `${src.id}-layer`,
    type: 'line',
    source: src.id,
    paint: {
      'line-color': src.color,
      'line-width': 1.4,
      'line-opacity': 0.6
    }
  });
} else {
  // If already exists, just update the data
  map.getSource(src.id).setData(data);
}


    // Collect all path geometries
    if (data.features) {
      footpathLines.push(...data.features.filter(f => f.geometry.type === 'LineString'));
    }
  }

console.log(`🧭 Cached ${footpathLines.length} total walkable segments`);
  window.footpathLines = footpathLines;
window.footpathLines = footpathLines;
}





//   // Microsoft Building Footprints
//   map.addSource('buildings', {
//     type: 'geojson',
//     data: '../data/buildings/canberraBuildings.geojson'
//   });

//   map.addLayer({
//     id: 'buildings-layer',
//     type: 'fill',
//     source: 'buildings',
//     paint: {
//       'fill-color': '#ccc',
//       'fill-opacity': 0.2
//     }
//   });

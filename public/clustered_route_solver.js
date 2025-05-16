// clustered_route_solver.js
// ✅ Uses only OSRM's own routing engine and returned geometry

console.log("solveGreedyTSP:", typeof window.solveGreedyTSP);
console.log("getFlyerCoords:", typeof window.getFlyerCoords);

console.log("🧪 clustered_route_solver.js loaded");
console.log("🧪 window.solveGreedyTSP =", typeof window.solveGreedyTSP);
console.log("🧪 window.getFlyerCoords =", typeof window.getFlyerCoords);


let osrmHost = 'http://127.0.0.1:5000';



function clusterByGrid(coords, cellSize = 0.002) {
  const clusters = new Map();

  for (const pt of coords) {
    const key = [
      Math.floor(pt[0] / cellSize),
      Math.floor(pt[1] / cellSize)
    ].join(',');

    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(pt);
  }

  return Array.from(clusters.values());
}


async function solveClusterTSP(coords, clusterIndex = '?') {
  const uniqueCoords = Array.from(new Set(coords.map(c => `${c[0]},${c[1]}`)))
    .map(str => str.split(',').map(Number));
  if (uniqueCoords.length < 2) {
    console.warn(`⚠️ Skipping cluster ${clusterIndex} — not enough coords.`);
    return coords.map((_, i) => i);
  }

  const coordStr = uniqueCoords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `${osrmHost}/table/v1/foot/${coordStr}?annotations=duration`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !Array.isArray(data.durations)) throw new Error("Invalid matrix");
return window.solveGreedyTSP(data.durations);

  } catch (err) {
    console.error(`❌ Cluster ${clusterIndex} failed:`, err);
    return coords.map((_, i) => i);
  }
}

async function fetchRouteGeometry(coords) {
  const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `${osrmHost}/route/v1/foot/${coordStr}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.routes[0].geometry;
  } catch {
    return null;
  }
}
async function planFullRouteFromClusters(map, clusteredCoords) {
  if (map.getSource('full-tsp-route')) {
    map.removeLayer('full-tsp-route-layer');
    map.removeSource('full-tsp-route');
  }

  
  const allLines = [];
  let lastPoint = null;

  for (let i = 0; i < clusteredCoords.length; i++) {
    const cluster = clusteredCoords[i];
    const tspOrder = await solveClusterTSP(cluster, i);
    const ordered = tspOrder.map(idx => cluster[idx]);

    if (ordered.length < 2) {
      console.warn(`⚠️ Not enough points in cluster ${i} after TSP. Skipping route.`);
      continue;
    }

    if (lastPoint) {
      const bridge = await fetchRouteGeometry([lastPoint, ordered[0]]);
if (bridge?.coordinates?.length > 1) {
  allLines.push(bridge.coordinates);
}
    }

    const route = await fetchRouteGeometry(ordered);
    if (route?.coordinates?.length > 1) {
      allLines.push(route.coordinates);
      lastPoint = ordered[ordered.length - 1];
      console.log(`✅ Cluster ${i}: ${ordered.length} points, route length: ${route.coordinates.length}`);
    } else {
      console.warn(`⚠️ Failed to fetch valid route for cluster ${i}`);
    }
  }

  if (allLines.length === 0) {
    console.warn("⚠️ No valid route segments found. Nothing to draw.");
    return;
  }

for (let i = 0; i < allLines.length; i++) {
  const id = `cluster-route-${i}`;
  map.addSource(id, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: allLines[i]
      }
    }
  });

  map.addLayer({
    id,
    type: 'line',
    source: id,
    paint: {
      'line-color': `hsl(${(i * 37) % 360}, 100%, 50%)`,
      'line-width': 2
    }
  });
}

// 🔰 Generate midpoint arrows per segment
const arrowPoints = [];

for (let i = 0; i < allLines.length; i++) {
  const line = allLines[i];
  for (let j = 0; j < line.length - 1; j++) {
    const [lon1, lat1] = line[j];
    const [lon2, lat2] = line[j + 1];

    const bearing = Math.atan2(
      Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180),
      Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180)
    ) * 180 / Math.PI;

    const midPoint = [
      (lon1 + lon2) / 2,
      (lat1 + lat2) / 2
    ];

    arrowPoints.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: midPoint
      },
      properties: {
        rotation: bearing
      }
    });
  }
}

// 🧠 Add the arrows as a layer
map.addSource('route-arrows', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: arrowPoints
  }
});

map.addLayer({
  id: 'route-arrows-layer',
  type: 'symbol',
  source: 'route-arrows',
  layout: {
    'icon-image': 'arrow',
    'icon-size': 0.05,
    'icon-rotate': ['get', 'rotation'],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': false
  }
});



  console.log('✅ Route drawn via OSRM.');
}

 async function solveRouteToggle(map, method = 'osrm') {
const coords = window.getFlyerCoords(map);

const clusters = clusterByGrid(coords, 0.0015); // ~80–100 pts per cluster
console.log(`🧪 Created ${clusters.length} clusters`);

  console.log("🔍 Cluster sizes:", clusters.map(c => c.length));
  await planFullRouteFromClusters(map, clusters);
}

window.solveGreedyTSP = solveGreedyTSP;
window.getFlyerCoords = getFlyerCoords;


window.solveRouteToggle = solveRouteToggle;
console.log("✅ solveRouteToggle attached to window.");

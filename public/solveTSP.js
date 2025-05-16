
// import { footpathLines } from './loadLayers.js';
// import { snapToNearestPath } from './snapPointsToPaths.js';

 function getFlyerCoords(map) {
  const source = map.getSource('flyer-points');
  const features = (source?._data?.features || []).slice(0, 100000); // 🔧 Limit to 10 points for now

  console.time("SnapLoop");

  const result = features.map((f, i) => {
    const coords = f.geometry?.coordinates;

    if (
      !Array.isArray(coords) ||
      coords.length !== 2 ||
      typeof coords[0] !== 'number' ||
      typeof coords[1] !== 'number' ||
      isNaN(coords[0]) ||
      isNaN(coords[1])
    ) {
      console.warn(`⚠️ Invalid flyer coordinate at index ${i}:`, coords);
      return null;
    }

return coords; // skipping snapping logic — already snapped via Python

  }).filter(coord =>
    Array.isArray(coord) &&
    coord.length === 2 &&
    isFinite(coord[0]) &&
    isFinite(coord[1])
  );

  console.timeEnd("SnapLoop");
  return result;
}


window.debugFlyerStats = function () {
  const points = getFlyerCoords(window.map);
  console.log("📍 Total snapped flyer points:", points.length);
  return points;
}

function euclideanDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

async function buildDistanceMatrixOSRM(coords) {
  const maxPoints = 100;
  if (coords.length > maxPoints) {
    console.warn(`⚠️ OSRM can only handle ${maxPoints} points. You passed ${coords.length}. Consider clustering.`);
    return buildDistanceMatrix(coords); // fallback to Euclidean
  }

  const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `http://127.0.0.1:5000/table/v1/foot/${coordStr}?annotations=duration`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.durations) throw new Error('Missing durations in OSRM response');

    return data.durations;
  } catch (err) {
    console.error('❌ OSRM fallback – using Euclidean:', err);
    return buildDistanceMatrix(coords); // fallback
  }
}


function buildDistanceMatrix(coords) {
  return coords.map(a => coords.map(b => euclideanDistance(a, b)));
}

 function solveGreedyTSP(matrix) {
  const n = matrix.length;
  const visited = new Array(n).fill(false);
  const path = [0];
  visited[0] = true;

  for (let step = 1; step < n; step++) {
    const last = path[path.length - 1];
    let next = -1;
    let minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[last][j] < minDist) {
        next = j;
        minDist = matrix[last][j];
      }
    }
    path.push(next);
    visited[next] = true;
  }

  return path;
}


function solveBruteForce(matrix) {
  const permute = (arr) => {
    if (arr.length === 1) return [arr];
    const perms = [];
    arr.forEach((v, i) => {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permute(rest)) {
        perms.push([v, ...p]);
      }
    });
    return perms;
  };

  const n = matrix.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  const allPaths = permute(indices);
  let minLength = Infinity;
  let bestPath = [];

  for (const path of allPaths) {
    let len = 0;
    for (let i = 0; i < n - 1; i++) {
      len += matrix[path[i]][path[i + 1]];
    }
    len += matrix[path[n - 1]][path[0]];
    if (len < minLength) {
      minLength = len;
      bestPath = path;
    }
  }

  return bestPath;
}

async function solve2Opt(coords, initialOrder, maxPasses = 3) {
  let order = [...initialOrder];
  const matrix = await buildDistanceMatrixOSRM(coords);
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    for (let i = 1; i < order.length - 2; i++) {
      for (let j = i + 1; j < order.length - 1; j++) {
        const a = order[i - 1], b = order[i];
        const c = order[j], d = order[j + 1];
        const delta = matrix[a][c] + matrix[b][d] - matrix[a][b] - matrix[c][d];
        if (delta < 0) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
    passes++;
  }

  return order;
}

function drawRoute(map, coords, order) {
  const orderedCoords = order.map(i => coords[i]);
  orderedCoords.push(orderedCoords[0]);

  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: orderedCoords
    }
  };

  if (map.getSource('flyer-route')) {
    map.getSource('flyer-route').setData(geojson);
  } else {
    map.addSource('flyer-route', {
      type: 'geojson',
      data: geojson
    });

    map.addLayer({
      id: 'flyer-route-glow',
      type: 'line',
      source: 'flyer-route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#00ccff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 9],
        'line-opacity': 0.1,
        'line-blur': 2
      }
    });

    map.addLayer({
      id: 'flyer-route-layer',
      type: 'line',
      source: 'flyer-route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#21b849',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2],
        'line-opacity': 0.5
      }
    });
  }
}

 async function solveTSP(map, solver = 'greedy') {
  console.log(`Solver selected: ${solver}`);
  console.time('TSP Solve Time');

  const coords = getFlyerCoords(map);
  console.log("✅ Snapped flyer coords:", coords);

  if (!coords || coords.length < 2) {
    console.warn('Insufficient points to solve TSP.');
    return;
  }

  if (coords.length > 1500) {
    alert("❌ Too many flyer points to compute TSP in browser.");
    return;
  }

  let order;
  const matrix = await buildDistanceMatrixOSRM(coords);

  try {
    setTimeout(() => {
      switch (solver) {
        case 'greedy':
          order = solveGreedyTSP(matrix);
          break;
        case '2opt':
          order = solve2Opt(coords, solveGreedyTSP(matrix));
          break;
        case 'brute':
          if (coords.length > 9) {
            alert("❌ Brute-force TSP only supports <10 points.");
            return;
          }
          order = solveBruteForce(matrix);
          break;
        default:
          console.warn('Unknown solver, defaulting to greedy');
          order = solveGreedyTSP(matrix);
      }

      drawRoute(map, coords, order);
      console.timeEnd('TSP Solve Time');
      console.log('✅ TSP Order:', order);
    }, 0);
  } catch (err) {
    console.error('❌ TSP Solver crashed:', err);
    alert('Failed to solve route. Check console for errors.');
  }
}



// Debug

window.debugFlyerCount = function () {
  try {
    const source = window.map.getSource('flyer-points');

    if (!source) {
      console.warn("⚠️ flyer-points source not yet available.");
      return;
    }

    const data = source._data;

    if (!data || !data.features || !Array.isArray(data.features)) {
      console.warn("⚠️ flyer-points data not in expected format:", data);
      return;
    }

    console.log("✅ flyer-points loaded. Feature count:", data.features.length);
    return data.features;
  } catch (e) {
    console.error("❌ Error in debugFlyerCount:", e);
  }
};



window.solveGreedyTSP = solveGreedyTSP;
window.getFlyerCoords = getFlyerCoords;
window.solveTSP = solveTSP;

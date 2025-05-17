// solveTSP.js
// Contains TSP algorithms.
// VALHALLA_HOST and other configs are expected to be on window.APP_CONFIG.

/**
 * Builds a distance/duration matrix using Valhalla via Nginx proxy.
 * Relies on window.APP_CONFIG.VALHALLA_HOST for the server URL.
 * @param {Array<Array<number>>} coords - Array of [lon, lat] coordinates.
 * @param {string} [costing='pedestrian'] - The costing model for Valhalla.
 * @returns {Promise<Array<Array<number>>>} The cost matrix (e.g., durations or distances).
 */
async function buildDistanceMatrixValhalla(coords, costing) {
  // Ensure APP_CONFIG and VALHALLA_HOST are available
  if (typeof window.APP_CONFIG === 'undefined' || typeof window.APP_CONFIG.VALHALLA_HOST === 'undefined') {
    console.error("buildDistanceMatrixValhalla: window.APP_CONFIG.VALHALLA_HOST is not defined. Cannot fetch matrix.");
    throw new Error("Valhalla host configuration is missing.");
  }
  const valhallaProxyHost = window.APP_CONFIG.VALHALLA_HOST;
  const actualCosting = costing || (window.APP_CONFIG && window.APP_CONFIG.VALHALLA_ROUTING_PROFILE) || 'pedestrian';


  console.log(`solveTSP.js: buildDistanceMatrixValhalla called for ${coords.length} coordinates, host: ${valhallaProxyHost}, costing: ${actualCosting}.`);
  if (!Array.isArray(coords) || coords.length < 2) {
    console.warn("buildDistanceMatrixValhalla: Not enough coordinates for matrix. Needs at least 2.");
    return [[]];
  }

  const body = {
    sources: coords.map(([lon, lat]) => ({ lon, lat })),
    targets: coords.map(([lon, lat]) => ({ lon, lat })),
    costing: actualCosting,
  };

  try {
    const response = await fetch(`${valhallaProxyHost}/sources_to_targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Valhalla matrix request failed: ${response.status} - ${errorText}`);
      throw new Error(`Valhalla server error: ${response.status} ${response.statusText}. Details: ${errorText}`);
    }

    const data = await response.json();

    if (data && data.sources_to_targets && Array.isArray(data.sources_to_targets)) {
      const matrix = data.sources_to_targets.map(row =>
        row.map(entry => entry.time) // Or entry.distance
      );
      console.log("solveTSP.js: Successfully built Valhalla distance matrix.");
      return matrix;
    } else {
      console.error("Valhalla matrix response format not recognized or empty:", data);
      throw new Error("Invalid data format from Valhalla matrix API.");
    }
  } catch (err) {
    console.error('Error in buildDistanceMatrixValhalla:', err);
    throw err;
  }
}

/*
// OSRM function commented out.
// async function buildDistanceMatrixOSRM(coords, osrmHost = 'http://127.0.0.1:5000') { ... }
*/

/**
 * Solves TSP using a greedy approach.
 * @param {Array<Array<number>>} matrix - The cost matrix.
 * @returns {Array<number>} The order of indices.
 */
function solveGreedyTSP(matrix) {
  if (!matrix || matrix.length === 0 || !matrix[0] || matrix.length !== matrix[0].length) {
    console.error("solveGreedyTSP: Invalid or empty matrix provided.", matrix);
    const n = matrix ? matrix.length : 0;
    return Array.from({ length: n }, (_, i) => i); // Return sequential order for invalid matrix
  }
  const n = matrix.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const visited = new Array(n).fill(false);
  const path = [0]; // Start at the first point
  visited[0] = true;
  let numVisited = 1;

  while (numVisited < n) {
    const lastNode = path[path.length - 1];
    let nextNode = -1;
    let minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[lastNode] && typeof matrix[lastNode][j] === 'number' && matrix[lastNode][j] < minDist) {
        minDist = matrix[lastNode][j];
        nextNode = j;
      }
    }
    if (nextNode === -1) {
      console.error("solveGreedyTSP: Stuck! Could not find next unvisited node. Path so far:", path, "Matrix for lastNode:", matrix[lastNode]);
      for(let k=0; k<n; ++k) {
        if(!visited[k]) {
            path.push(k);
            visited[k] = true; 
        }
      }
      numVisited = n; 
      break; 
    }
    path.push(nextNode);
    visited[nextNode] = true;
    numVisited++;
  }
  return path;
}

/**
 * Solves TSP using 2-Opt refinement.
 * @param {Array<Array<number>>} coords - Array of [lon, lat] coordinates (used for count validation).
 * @param {Array<number>} initialOrder - Initial order of indices.
 * @param {Array<Array<number>>} matrix - REQUIRED: A pre-computed cost matrix.
 * @param {number} [maxPassesOverride] - Optional override for maximum 2-Opt passes.
 * @returns {Promise<Array<number>>} The refined order of indices.
 */
async function solve2Opt(coords, initialOrder, matrix, maxPassesOverride) {
  const actualMaxPasses = maxPassesOverride || (window.APP_CONFIG && typeof window.APP_CONFIG.TSP_2OPT_PASSES === 'number') 
                        ? window.APP_CONFIG.TSP_2OPT_PASSES 
                        : 3; // Default if not in config and not overridden

  if (!initialOrder || initialOrder.length < 3) { 
    return initialOrder;
  }
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    console.error("solve2Opt: A valid pre-computed cost matrix MUST be provided. Cannot perform 2-Opt.");
    return initialOrder; 
  }
  if (matrix.length !== coords.length || (matrix[0] && matrix[0].length !== coords.length)) {
      console.error(
          `solve2Opt: Matrix dimensions (${matrix.length}x${matrix[0] ? matrix[0].length : '?'}) ` +
          `do not match coordinate count (${coords.length}). Cannot perform 2-Opt.`
      );
      return initialOrder;
  }

  let bestOrder = [...initialOrder];
  let bestLength = calculateRouteLength(bestOrder, matrix);
  let improved = true;
  let passes = 0;

  while (improved && passes < actualMaxPasses) {
    improved = false;
    for (let i = 0; i < bestOrder.length - 1; i++) { 
      for (let j = i + 1; j < bestOrder.length; j++) {
        const newOrder = try2OptSwap(bestOrder, i, j);
        const newLength = calculateRouteLength(newOrder, matrix);
        if (newLength < bestLength) {
          bestOrder = newOrder;
          bestLength = newLength;
          improved = true;
        }
      }
    }
    passes++;
  }
  return bestOrder;
}

function try2OptSwap(order, i, k) {
  const part1 = order.slice(0, i + 1);
  const part2Reversed = order.slice(i + 1, k + 1).reverse();
  const part3 = order.slice(k + 1);
  return [...part1, ...part2Reversed, ...part3];
}

function calculateRouteLength(order, matrix) {
  let length = 0;
  if (!matrix || order.length < 2) return Infinity; 

  for (let i = 0; i < order.length - 1; i++) {
    const u = order[i]; 
    const v = order[i+1]; 
    if (matrix[u] !== undefined && matrix[u][v] !== undefined && typeof matrix[u][v] === 'number' && isFinite(matrix[u][v])) {
        length += matrix[u][v];
    } else {
        console.warn(`calculateRouteLength: Invalid or missing matrix entry for order indices: ${u} -> ${v}.`);
        return Infinity; 
    }
  }
  return length;
}

// Ensure functions are available on the window object
if (typeof window.solveGreedyTSP === 'undefined') {
    window.solveGreedyTSP = solveGreedyTSP;
}
if (typeof window.solve2Opt === 'undefined') {
    window.solve2Opt = solve2Opt;
}
if (typeof window.buildDistanceMatrixValhalla === 'undefined') {
    window.buildDistanceMatrixValhalla = buildDistanceMatrixValhalla;
}

console.log("solveTSP.js loaded. TSP functions and buildDistanceMatrixValhalla (using window.APP_CONFIG.VALHALLA_HOST) attached to window.");

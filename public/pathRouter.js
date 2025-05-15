export async function routePathAware(map, pointOrder, pointSource = 'flyer-points', pathSource = 'act-paths') {
  // 1. Load footpath GeoJSON
  // 2. Build graph (nodes + edges)
  // 3. Find nearest node for each flyer point
  // 4. Route in order, build route geometry
  // 5. Draw the final route
}
// 📍 pathRouter.js
// Snaps flyer points to nearest walkable path nodes and routes with Dijkstra

import { featureCollection, point as turfPoint } from 'https://cdn.skypack.dev/@turf/helpers';
import distance from 'https://cdn.skypack.dev/@turf/distance';

// Simple graph class for pathfinding
class Graph {
  constructor() {
    this.nodes = new Map(); // id -> { coord, edges: [{ to, weight }] }
  }

  addNode(id, coord) {
    if (!this.nodes.has(id)) this.nodes.set(id, { coord, edges: [] });
  }

  addEdge(from, to, weight) {
    this.nodes.get(from).edges.push({ to, weight });
    this.nodes.get(to).edges.push({ to: from, weight }); // Undirected
  }

  dijkstra(startId, endId) {
    const dist = new Map();
    const prev = new Map();
    const queue = new Set(this.nodes.keys());

    for (const id of queue) dist.set(id, Infinity);
    dist.set(startId, 0);

    while (queue.size > 0) {
      const u = [...queue].reduce((a, b) => (dist.get(a) < dist.get(b) ? a : b));
      queue.delete(u);

      if (u === endId) break;

      for (const { to, weight } of this.nodes.get(u).edges) {
        if (!queue.has(to)) continue;
        const alt = dist.get(u) + weight;
        if (alt < dist.get(to)) {
          dist.set(to, alt);
          prev.set(to, u);
        }
      }
    }

    // Reconstruct path
    const path = [];
    let u = endId;
    while (prev.has(u)) {
      path.unshift(this.nodes.get(u).coord);
      u = prev.get(u);
    }
    path.unshift(this.nodes.get(startId).coord);
    return path;
  }
}

export async function loadPathGraph(pathGeoJSONUrl) {
  const res = await fetch(pathGeoJSONUrl);
  const geo = await res.json();

  const graph = new Graph();
  const coordToId = new Map();
  let idCounter = 0;

  function getId(coord) {
    const key = coord.join(',');
    if (!coordToId.has(key)) {
      coordToId.set(key, idCounter.toString());
      graph.addNode(idCounter.toString(), coord);
      idCounter++;
    }
    return coordToId.get(key);
  }

  for (const feat of geo.features) {
    const coords = feat.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = getId(coords[i]);
      const b = getId(coords[i + 1]);
      const distAB = distance(turfPoint(coords[i]), turfPoint(coords[i + 1]));
      graph.addEdge(a, b, distAB);
    }
  }

  return graph;
}

export function snapToGraph(coord, graph) {
  let nearest = null;
  let minDist = Infinity;
  for (const [id, { coord: nodeCoord }] of graph.nodes.entries()) {
    const d = distance(turfPoint(coord), turfPoint(nodeCoord));
    if (d < minDist) {
      minDist = d;
      nearest = id;
    }
  }
  return nearest;
}

export function routePathAware(graph, flyerCoords) {
  const snapped = flyerCoords.map(coord => snapToGraph(coord, graph));
  const paths = [];

  for (let i = 0; i < snapped.length - 1; i++) {
    const pathSegment = graph.dijkstra(snapped[i], snapped[i + 1]);
    paths.push(...pathSegment);
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: paths
    }
  };
}

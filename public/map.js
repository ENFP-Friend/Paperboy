import { loadFlyerPoints } from './loadPoints.js';
import { solveTSP } from './solveTSP.js';
import { loadBaseLayers } from './loadLayers.js';




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
  maxZoom: 20
});

// Expose map to console
window.map = map; 

map.on('load', async () => {
  map.getCanvas().style.imageRendering = 'auto';
  map.getCanvas().style.filter = 'contrast(105%) brightness(1.05)';
  await loadBaseLayers(map); 
  loadFlyerPoints(map);

  const size = 100;
  const pulsingDot = {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4),
    onAdd: function () {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      this.context = canvas.getContext('2d');
    },
    render: function () {
      const duration = 1000;
      const t = (performance.now() % duration) / duration;
      const radius = (size / 2) * 0.3;
      const outerRadius = (size / 2) * 0.4 * t + radius;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);

      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,255,255,${1 - t})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(0, 255, 13)';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 + 2 * (1 - t);
      ctx.fill();
      ctx.stroke();

      this.data.set(ctx.getImageData(0, 0, this.width, this.height).data);
      map.triggerRepaint();
      return true;
    }
  };

  map.addImage('pulsing-dot', pulsingDot, { pixelRatio: 2 });
  loadFlyerPoints(map);
  loadBaseLayers(map);
});

document.getElementById('solveRoute').addEventListener('click', () => {
  const method = document.getElementById('tspSolver').value;
  solveTSP(map, method);
});

console.log("✅ solveTSP.js loaded");
window.testFlag = true;

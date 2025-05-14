# 📬 Paperboy

**Paperboy** is a modular, map-based flyer delivery route visualizer.  
It starts as a browser-based MVP that solves naive delivery routes using geometric distance, and is structured for my **own future extension** — including path-aware routing, kerb-snapping, and backend support via OSRM.

---

## ✅ MVP Features

- Render flyer drop points on an ESRI satellite map
- Solve Traveling Salesman Problem (TSP) using in-browser greedy or 2-opt heuristics
- Display the ordered route visually
- Load map layers: roads, walkable paths, and toggleable building outlines
- Runs fully client-side (no backend needed for MVP)

---

## 🔁 Upgrade Path

The structure is designed for **my own future development**, including:

- Switching from Euclidean distance to real walking paths using OSRM
- Server-side TSP solving via Flask (OR-Tools or custom heuristics)
- Snapping to kerb lines and paths using cleaned OSM/GeoJSON
- Integrating multi-zone clustering or batching for high-volume delivery

---

## 🗂 Project Structure (MVP Core)

paperboy:
  public:                     # 🌐 Frontend code (client-only MVP)
    - index.html              # 🌍 Main HTML entry
    - map.js                  # 🗺️ MapLibre init with ESRI
    - loadLayers.js           # 📍 Load OSM/path/building layers
    - loadPoints.js           # 🏠 Load flyer drop locations
    - solveTSP.js             # 🧠 Client-side TSP solver
    - drawRoute.js            # ✏️ Render the calculated route
    - utils.js                # 🔧 Utility functions
    - debug.js                # 🐞 Dev overlay toggles
    - style.css               # 🎨 Basic UI styling

  api:                        # 🧠 Flask backend (future use)
    - app.py
    - endpoints/
    - engine/
    - config/
    - utils/

  data:                      # 📦 Geo inputs & outputs
    - rawAccessPoints.json   # 🏠 Flyer drop targets
    - act_paths.geojson      # 🚶 ACT community paths
    - kerbsCleanWGS.geojson  # 📏 Clean kerb lines
    - suburb_polygon.geojson # 🗺️ Suburb clipping shape
    - osm/                   # 🛣 OSM road data
    - buildings/             # 🏢 Microsoft footprints

  scripts:                    # 🧰 GeoJSON/OSM preprocess tools
    - preprocess_osm.py
    - fetch_osrm_tiles.py
    - clean_geojson.py

  .env:                       # 🔐 Environment variables
  .gitignore:                 # 🚫 Ignored files list
  README.md:                  # 📘 Project overview
  requirements.txt:           # 📦 Python dependencies (post-MVP)

  ## ⚙️ Running the MVP

  It's still in development but will look like:

1. Start a simple HTTP server:
   ```bash
   cd public
   python -m http.server 8000

   
2. Open your browser to:
    http://localhost:8000

    🔐 Notes

    Sensitive data like API URLs or debug flags live in .env (excluded from Git)

    Large files like .pbf, building footprints, and matrix outputs are .gitignored

    Backend files exist for future use but are not needed to run the MVP

 ## 📛 Why "Paperboy"?

A nod to the classic flyer-delivery job, only now, optimized with maps and code.
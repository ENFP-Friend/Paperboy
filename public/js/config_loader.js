// js/config_loader.js
console.log("config_loader.js: Script execution started.");

/**
 * Fetches the application configuration from config.json and stores it on window.APP_CONFIG.
 * @returns {Promise<object>} A promise that resolves with the configuration object.
 */
async function loadAppConfig() {
  console.log("loadAppConfig: Function called.");
  if (window.APP_CONFIG) {
    console.log("loadAppConfig: Configuration already loaded.", window.APP_CONFIG);
    return window.APP_CONFIG;
  }

  try {
    console.log("loadAppConfig: Attempting to fetch js/config.json...");
    const response = await fetch('js/config.json'); // Path relative to index.html
    if (!response.ok) {
      console.error(`loadAppConfig: HTTP error loading config.json! Status: ${response.status}, StatusText: ${response.statusText}`);
      throw new Error(`HTTP error loading config.json! status: ${response.status}`);
    }
    const config = await response.json();
    window.APP_CONFIG = config;
    console.log("loadAppConfig: Application configuration loaded successfully:", window.APP_CONFIG);
    return window.APP_CONFIG;
  } catch (error) {
    console.error("CRITICAL: Failed to load application configuration (js/config.json):", error);
    // Fallback configuration if config.json fails to load
    window.APP_CONFIG = {
      VALHALLA_HOST: "http://localhost:8888", // Default fallback
      MAP_DEFAULT_LAT: -35.282001,
      MAP_DEFAULT_LON: 149.128998,
      MAP_DEFAULT_ZOOM: 13,
      TSP_2OPT_PASSES: 3,
      DETOUR_TOLERANCE_FACTOR: 3.0,
      "MIN_DIRECT_DISTANCE_FOR_DETOUR_CHECK": 50
    };
    console.warn("loadAppConfig: Using fallback configuration:", window.APP_CONFIG);
    alert("Error loading application configuration. Using default settings. Please check js/config.json and the browser console (Network tab) for errors loading this file.");
    return window.APP_CONFIG;
  }
}

// Expose the loader if needed, or rely on it being called by an initializing script.
// For this setup, map_leaflet.js will call it.
if (typeof window.loadAppConfig === 'undefined') {
    window.loadAppConfig = loadAppConfig;
    console.log("config_loader.js: window.loadAppConfig has been DEFINED.");
} else {
    console.warn("config_loader.js: window.loadAppConfig was ALREADY defined. This might indicate multiple loads or a naming conflict.");
}

console.log("config_loader.js: Script execution finished. window.loadAppConfig should be:", typeof window.loadAppConfig, window.loadAppConfig);

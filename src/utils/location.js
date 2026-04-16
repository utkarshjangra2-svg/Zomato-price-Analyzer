const LOCATION_STORAGE_KEY = "smartDealExactLocation";
const MANUAL_LOCATION_STORAGE_KEY = "smartDealManualLocation";
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_LOCATION = "Delhi";

const readCachedLocation = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed?.query || !parsed?.savedAt) {
      return null;
    }

    if (Date.now() - parsed.savedAt > LOCATION_CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const saveCachedLocation = (location) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCATION_STORAGE_KEY,
    JSON.stringify({
      ...location,
      savedAt: Date.now()
    })
  );
};

const getLocationTitle = (address = {}) =>
  [
    address.suburb || address.neighbourhood || address.city_district || address.road,
    address.city || address.town || address.village
  ]
    .filter(Boolean)
    .join(", ");

const getLocationQuery = (address = {}, fallback = "") =>
  [
    address.house_number && address.road
      ? `${address.house_number} ${address.road}`
      : address.road,
    address.suburb || address.neighbourhood || address.city_district,
    address.city || address.town || address.village,
    address.postcode,
    address.state_district,
    address.state
  ]
    .filter(Boolean)
    .join(", ") || fallback;

export const getCachedExactLocation = () => readCachedLocation();

export const getManualLocationOverride = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(MANUAL_LOCATION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed?.query) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const getPreferredLocation = () => {
  const manual = getManualLocationOverride();
  if (manual?.query) {
    return manual;
  }
  return readCachedLocation();
};

export const saveManualLocationOverride = async (location = "") => {
  if (typeof window === "undefined") {
    return;
  }

  const query = location.toString().trim();

  if (!query) {
    window.localStorage.removeItem(MANUAL_LOCATION_STORAGE_KEY);
    return;
  }

  try {
    // Try to geocode the location to get coordinates
    const geocoded = await forwardGeocode(query);
    const latitude = parseFloat(geocoded.lat);
    const longitude = parseFloat(geocoded.lon);
    const manualEntry = {
      query,
      title: query,
      fullAddress: geocoded.display_name || query,
      latitude,
      longitude,
      source: "manual-geocoded",
      savedAt: Date.now()
    };

    window.localStorage.setItem(MANUAL_LOCATION_STORAGE_KEY, JSON.stringify(manualEntry));
    saveCachedLocation(manualEntry);
  } catch (error) {
    // If geocoding fails, save as-is
    console.log("Geocoding failed for manual location:", error.message);
    const manualEntry = {
      query,
      title: query,
      fullAddress: query,
      source: "manual",
      savedAt: Date.now()
    };
    window.localStorage.setItem(MANUAL_LOCATION_STORAGE_KEY, JSON.stringify(manualEntry));
    saveCachedLocation(manualEntry);
  }
};

export const clearManualLocationOverride = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(MANUAL_LOCATION_STORAGE_KEY);
};

const getCoordinateFallback = ({ latitude, longitude, accuracy } = {}) => ({
  query: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
  title: "Current coordinates",
  fullAddress: `GPS fix: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy ? ` (accuracy ${Math.round(accuracy)}m)` : ""}`,
  latitude,
  longitude,
  accuracy: accuracy ?? null,
  source: "geolocation"
});

const reverseGeocode = async ({ latitude, longitude }) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`
  );

  if (!response.ok) {
    throw new Error("Unable to reverse geocode your live location.");
  }

  return response.json();
};

const forwardGeocode = async (locationQuery) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(locationQuery)}`
  );

  if (!response.ok) {
    throw new Error("Unable to geocode location.");
  }

  const results = await response.json();
  if (!results.length) {
    throw new Error("Location not found.");
  }

  return results[0];
};

export const resolveExactLocation = async ({ preferFresh = true } = {}) => {
  const manualOverride = getManualLocationOverride();
  if (manualOverride?.query) {
    return manualOverride;
  }

  const cached = readCachedLocation();

  if (cached && !preferFresh) {
    return cached;
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    if (cached) {
      return cached;
    }

    return {
      query: DEFAULT_LOCATION,
      title: "Location unavailable",
      fullAddress: "Browser geolocation is not supported on this device.",
      source: "fallback"
    };
  }

  let position;

  try {
    position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
    });
  } catch {
    if (cached) {
      return cached;
    }

    return {
      query: DEFAULT_LOCATION,
      title: "Location access unavailable",
      fullAddress: "Using default location because precise GPS access was denied or timed out.",
      source: "fallback"
    };
  }

  const { latitude, longitude, accuracy } = position.coords;

  try {
    const data = await reverseGeocode({ latitude, longitude });
    const address = data.address || {};
    const fullAddress = data.display_name || "Current location";
    const query = getLocationQuery(address, fullAddress) || fullAddress || DEFAULT_LOCATION;
    const resolved = {
      query,
      title: getLocationTitle(address) || address.state_district || address.state || "Current location",
      fullAddress,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      source: "geolocation"
    };

    saveCachedLocation(resolved);
    return resolved;
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        latitude,
        longitude,
        accuracy: accuracy ?? cached.accuracy ?? null,
        source: "cache-with-fresh-gps"
      };
    }

    const coordinateFallback = getCoordinateFallback({ latitude, longitude, accuracy });
    saveCachedLocation(coordinateFallback);
    return coordinateFallback;
  }
};

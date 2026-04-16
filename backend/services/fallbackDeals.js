import { getImageForCuisine } from "./zomatoSources.js";
import { resolveDishQuery } from "./searchIntent.js";

const cuisineCatalog = {
  biryani: [
    "Biryani Blues",
    "Behrouz Biryani",
    "Bikkgane Biryani",
    "The Biryani Life",
    "Lucky Dum Biryani"
  ],
  pizza: [
    "La Pino'z Pizza",
    "MOJO Pizza",
    "Pizza Wings",
    "Oven Story Pizza",
    "Chicago Slice Hub"
  ],
  chinese: [
    "Wow! China",
    "Wok Express",
    "China Bowl",
    "Mainland Boxes",
    "Dragon Wok"
  ],
  "fast food": [
    "Burger Farm",
    "Wrap House",
    "Snack Street",
    "Loaded Fries Co",
    "Hot Bite Express"
  ],
  rolls: [
    "Rolls Mania",
    "Kathi Junction",
    "Roll Nation",
    "Wrap Factory",
    "Tandoori Roll House"
  ],
  "south indian": [
    "Dosa Plaza",
    "Idli Junction",
    "Filter Coffee House",
    "Anna Tiffins",
    "Madras Bowl"
  ],
  default: [
    "Urban Spice Kitchen",
    "City Lunch Box",
    "Daily Cravings",
    "Quick Plate Co",
    "Chef's Table Express"
  ]
};

const locationSeeds = ["Sector", "Market", "Main Road", "Food Court", "Central"];

const hashString = (value = "") => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const pickCatalog = (cuisine = "") => {
  const resolvedCuisine = resolveDishQuery(cuisine || "");
  const supportedCuisines = Object.keys(cuisineCatalog);
  
  if (!supportedCuisines.includes(resolvedCuisine)) {
    return { resolvedCuisine: null, names: [] };
  }
  
  return {
    resolvedCuisine,
    names: cuisineCatalog[resolvedCuisine] || cuisineCatalog.default
  };
};

const buildLocationTag = (location = "", seed = 0) => {
  const trimmed = location.trim();

  if (!trimmed) {
    return "Nearby";
  }

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  const anchor = parts[0] || trimmed;
  const suffix = locationSeeds[seed % locationSeeds.length];
  return `${anchor} ${suffix}`;
};

export const buildSmartFallbackDeals = ({ location = "", cuisine = "", limit = 8 }) => {
  const requestedLimit = Math.max(1, Number(limit) || 8);
  const { resolvedCuisine, names } = pickCatalog(cuisine);
  const seed = hashString(`${location}|${resolvedCuisine}`);
  const locationLabel = location.trim() || "Delhi";

  return names.slice(0, requestedLimit).map((name, index) => {
    const rowSeed = seed + index * 17;
    const basePrice = 180 + (rowSeed % 190);
    const discount = 10 + (rowSeed % 21);
    const rating = Number((3.9 + ((rowSeed % 10) * 0.1)).toFixed(1));
    const trendingScore = 52 + (rowSeed % 44);

    return {
      name,
      dishName: resolvedCuisine ? `${resolvedCuisine} special` : "popular combo",
      cuisine: resolvedCuisine || "Multiple",
      location: buildLocationTag(locationLabel, rowSeed),
      basePrice,
      rating,
      discount,
      trendingScore,
      imageUrl: getImageForCuisine(resolvedCuisine),
      orderUrl: "",
      eta: `${22 + (rowSeed % 18)} mins`,
      offerText: `${discount}% savings estimated from recent platform pricing patterns.`,
      isLive: false,
      isOrderableNow: false
    };
  });
};

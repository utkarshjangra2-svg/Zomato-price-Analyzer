import mongoose from "mongoose";
import { resolveDishQuery } from "./searchIntent.js";
import { getImageForCuisine } from "./zomatoSources.js";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDealFromDb = (doc = {}, { location, cuisine }) => {
  const name = doc.name || doc.restaurant || doc.title || "";
  const dishName = doc.dishName || doc.dish || doc.itemName || "";
  const resolvedCuisine = doc.cuisine || cuisine || "Multiple";
  const basePrice = toNumber(doc.basePrice ?? doc.originalPrice ?? doc.price ?? doc.avgPrice, 240);
  const discount = toNumber(doc.discount ?? doc.discountPercentage, 0);
  const orderLink = doc.orderUrl || doc.url || "";
  const orderableFlag = doc.isOrderableNow ?? doc.isServiceable ?? Boolean(orderLink);

  return {
    name,
    dishName,
    cuisine: resolvedCuisine,
    location: doc.location || location || "Unknown",
    basePrice,
    rating: toNumber(doc.rating, 4),
    discount,
    trendingScore: toNumber(doc.trendingScore ?? doc.orders ?? doc.rankScore, 0),
    imageUrl: doc.imageUrl || doc.photo || getImageForCuisine(resolvedCuisine),
    orderUrl: orderLink,
    eta: doc.eta || doc.deliveryTime || "",
    offerText: doc.offerText || doc.offer || "",
    isLive: Boolean(doc.isLive ?? doc.isActive ?? true),
    isOrderableNow: Boolean(orderableFlag)
  };
};

const filterByLocation = (deals, location) => {
  const normalizedLocation = location?.trim()?.toLowerCase();

  if (!normalizedLocation || normalizedLocation === "delhi" || normalizedLocation === "unknown") {
    return deals;
  }

  return deals.filter((deal) => {
    const dealLocation = (deal.location || "").toLowerCase().trim();
    if (!dealLocation || dealLocation === "unknown") {
      return false; // Don't include deals without location when searching specific location
    }
    return dealLocation.includes(normalizedLocation) || normalizedLocation.includes(dealLocation);
  });
};

const buildDealKey = (deal) =>
  [
    (deal.orderUrl || "").trim().toLowerCase(),
    (deal.name || "").trim().toLowerCase(),
    (deal.location || "").trim().toLowerCase(),
    (deal.dishName || "").trim().toLowerCase()
  ].join("|");

const dedupeDeals = (deals) => {
  const seen = new Set();

  return deals.filter((deal) => {
    const key = buildDealKey(deal);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const fetchDealsFromMongo = async ({ location = "", cuisine = "", limit = 8 }) => {
  if (mongoose.connection.readyState !== 1) {
    return [];
  }

  const envCollections = (process.env.DB_DEALS_COLLECTIONS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const collections = [...new Set([...envCollections, "deals", "live_deals", "orderhistories", "saveditems", "coupons", "offers"])];
  const requestedLimit = Math.max(1, Number(limit) || 8);
  const scanLimit = Math.max(requestedLimit * 12, 60);

  for (const collectionName of collections) {
    try {
      const collection = mongoose.connection.db.collection(collectionName);
      let docs = await collection
        .find({})
        .sort({ createdAt: -1, updatedAt: -1, discountPercentage: -1, discount: -1 })
        .limit(scanLimit)
        .toArray();

      if (!docs.length) {
        continue;
      }

      const activeDocs = docs.filter((doc) =>
        doc?.isActive === true ||
        doc?.isLive === true ||
        doc?.isOrderableNow === true ||
        doc?.status === "active"
      );

      if (activeDocs.length) {
        docs = activeDocs;
      }

      const normalized = docs
        .map((doc) => normalizeDealFromDb(doc, { location, cuisine }))
        .filter((deal) => deal.name);

      const cuisineFiltered = filterByCuisine(normalized, cuisine);
      const locationFiltered = filterByLocation(cuisineFiltered.length ? cuisineFiltered : normalized, location);
      const uniqueDeals = dedupeDeals(locationFiltered.length ? locationFiltered : (cuisineFiltered.length ? cuisineFiltered : normalized));
      const shortlist = uniqueDeals.slice(0, requestedLimit);

      if (shortlist.length) {
        return shortlist;
      }
    } catch {
      continue;
    }
  }

  return [];
};

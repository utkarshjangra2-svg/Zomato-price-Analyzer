import { optimizePrice, summarizeDeals } from "../services/priceOptimizer.js";
import { resolveDishQuery } from "../services/searchIntent.js";
import { buildComboDeals } from "../services/couponOptimizer.js";
import { fetchUserZomatoCoupons } from "../services/couponOptimizer.js";
import { fetchZomatoDeals } from "../services/zomatoService.js";
import OrderHistory from "../models/OrderHistory.js";
import mongoose from "mongoose";

const normalizeAuthUser = (user = null) =>
  user
    ? {
        id: user._id,
        name: user.name,
        email: user.email,
        zomato: user.zomato || {}
      }
    : null;

const extractUserContext = (payload = {}) => ({
  id: payload.userId || payload.id || "",
  name: payload.userName || payload.name || "",
  email: payload.userEmail || payload.email || "",
  orderCount: payload.orderCount,
  zomato: payload.zomato || {}
});

const buildMeta = ({ source, location, cuisine = "", resolvedCuisine = "", requestedLimit = 0, deals = [] }) => ({
  source,
  location,
  cuisine,
  resolvedCuisine,
  requestedLimit: Number(requestedLimit) || 0,
  totalDeals: deals.length,
  liveNowCount: deals.filter((deal) => deal.isOrderableNow).length,
  fetchedAt: new Date().toISOString()
});

const buildRecentDeals = (deals) =>
  deals.slice(0, 5).map((deal) => ({
    restaurant: deal.restaurant,
    imageUrl: deal.imageUrl,
    finalPrice: deal.finalPrice,
    couponAdjustedPrice: deal.couponAdjustedPrice,
    discount: deal.discount,
    isOrderableNow: deal.isOrderableNow,
    bestCouponCombo: deal.bestCouponCombo
  }));

const buildDealKey = (deal) =>
  [
    (deal.orderUrl || "").trim().toLowerCase(),
    (deal.restaurant || "").trim().toLowerCase(),
    (deal.location || "").trim().toLowerCase(),
    (deal.dishName || "").trim().toLowerCase()
  ].join("|");

const dedupeOptimizedDeals = (deals) => {
  const bestByKey = new Map();

  for (const deal of deals) {
    const key = buildDealKey(deal);

    if (!key) {
      continue;
    }

    const existing = bestByKey.get(key);

    if (
      !existing ||
      deal.couponAdjustedPrice < existing.couponAdjustedPrice ||
      (deal.couponAdjustedPrice === existing.couponAdjustedPrice && deal.confidence > existing.confidence)
    ) {
      bestByKey.set(key, deal);
    }
  }

  return [...bestByKey.values()];
};

const getRecommendationScore = (deal) => {
  const normalizedRating = Math.min(Math.max(Number(deal.rating) || 0, 0), 5) / 5;
  const normalizedConfidence = Math.min(Math.max(Number(deal.confidence) || 0, 0), 100) / 100;
  const normalizedDiscount = Math.min(Math.max(Number(deal.discount) || 0, 0), 40) / 40;
  const normalizedTrend = Math.min(Math.max(Number(deal.trendingScore) || 0, 0), 100) / 100;
  const normalizedPriceValue = 1 - Math.min(Math.max(Number(deal.couponAdjustedPrice || deal.finalPrice) || 0, 100), 1200) / 1200;
  const liveBoost = deal.isOrderableNow ? 0.12 : 0;
  const couponBoost = Math.min((Number(deal.couponSavings) || 0) / 150, 0.15);

  return (
    normalizedRating * 0.3 +
    normalizedConfidence * 0.22 +
    normalizedDiscount * 0.18 +
    normalizedTrend * 0.18 +
    normalizedPriceValue * 0.12 +
    couponBoost +
    liveBoost
  );
};

// Safely fetch live user coupons — returns [] if not possible/linked
const safeGetLiveCoupons = async (userContext) => {
  if (!userContext?.id || !userContext?.zomato?.linked) return [];
  try {
    return await fetchUserZomatoCoupons(String(userContext.id));
  } catch {
    return [];
  }
};

export const searchDeals = async (req, res) => {
  try {
    const { cuisine = "", budget = 0, location = "", user = {} } = req.body;
    const resolvedCuisine = resolveDishQuery(cuisine);
    const authUser = normalizeAuthUser(req.user);
    const userContext = extractUserContext(authUser || user);

    if (!cuisine.trim() || !location.trim()) {
      return res.status(400).json({ msg: "Location and dish are required" });
    }

    // Fetch live coupons for signed-in linked user (else empty array)
    const liveCoupons = await safeGetLiveCoupons(userContext);

    const { deals: liveDeals, source, diagnostics } = await fetchZomatoDeals({
      cuisine: resolvedCuisine,
      location,
      user: userContext,
      limit: 10
    });

    const optimizedDeals = dedupeOptimizedDeals(
      liveDeals
      .map((restaurant) => optimizePrice(restaurant, budget, { cuisine: resolvedCuisine, location, user: userContext }, liveCoupons))
      .filter(Boolean)
      .sort((a, b) => a.couponAdjustedPrice - b.couponAdjustedPrice || b.couponSavings - a.couponSavings || b.confidence - a.confidence)
    );

    const meta = buildMeta({
      source,
      location,
      cuisine,
      resolvedCuisine,
      requestedLimit: 10,
      deals: optimizedDeals
    });

    res.json({
      meta,
      source,
      diagnostics: diagnostics || null,
      deals: optimizedDeals,
      stats: summarizeDeals(optimizedDeals),
      recentDeals: buildRecentDeals(optimizedDeals),
      insights: optimizedDeals.length
        ? [
            `Best current option is ${optimizedDeals[0].restaurant} at Rs${optimizedDeals[0].finalPrice}.`,
            optimizedDeals[0].couponSavings
              ? `Best coupon-adjusted checkout is Rs${optimizedDeals[0].couponAdjustedPrice} using ${optimizedDeals[0].bestCouponCombo.map((coupon) => coupon.code).join(" + ")}.`
              : "No additional user coupon improved the best current option.",
            resolvedCuisine !== cuisine.trim().toLowerCase()
              ? `Search was normalized to "${resolvedCuisine}" for better live matching.`
              : `Search matched dish intent "${resolvedCuisine}".`,
            optimizedDeals.some((deal) => deal.isOrderableNow)
              ? `${optimizedDeals.filter((deal) => deal.isOrderableNow).length} deals are available to order right now.`
              : "No verified order-now links came back from the live source for this search.",
            "Analysis combines live source data, demand weighting, ratings, and discount estimation.",
            source === "unavailable"
              ? "No verified live Zomato deals were available for this search, so no synthetic data was returned."
              : `Data source: ${source}.`
          ]
        : ["No deals matched the current cuisine and budget filters."]
    });
  } catch (error) {
    console.log("searchDeals error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch deals" });
  }
};

export const getLiveDeals = async (req, res) => {
  try {
    const { location = "Delhi", cuisine = "", limit = 8 } = req.query;
    const resolvedCuisine = resolveDishQuery(cuisine);
    const userContext = req.user ? extractUserContext(normalizeAuthUser(req.user)) : extractUserContext(req.query);
    const liveCoupons = await safeGetLiveCoupons(userContext);

    const { deals, source, diagnostics } = await fetchZomatoDeals({
      location,
      cuisine: resolvedCuisine,
      user: userContext,
      limit: Number(limit)
    });

    const normalizedDeals = dedupeOptimizedDeals(
      deals
      .map((restaurant) => optimizePrice(restaurant, 0, { cuisine: resolvedCuisine, location, user: userContext }, liveCoupons))
      .filter(Boolean)
      .sort((a, b) => a.couponAdjustedPrice - b.couponAdjustedPrice || b.couponSavings - a.couponSavings)
    );

    const meta = buildMeta({
      source,
      location,
      cuisine,
      resolvedCuisine,
      requestedLimit: Number(limit),
      deals: normalizedDeals
    });

    res.json({
      meta,
      source,
      diagnostics: diagnostics || null,
      deals: normalizedDeals
    });
  } catch (error) {
    console.log("getLiveDeals error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch live deals" });
  }
};

export const getRecommendations = async (req, res) => {
  try {
    const { location = "Delhi", limit = 12 } = req.query;
    const userContext = req.user ? extractUserContext(normalizeAuthUser(req.user)) : extractUserContext(req.query);
    const liveCoupons = await safeGetLiveCoupons(userContext);

    const { deals, source, diagnostics } = await fetchZomatoDeals({
      location,
      cuisine: "",
      user: userContext,
      limit: Number(limit) * 3
    });

    const optimizedDeals = dedupeOptimizedDeals(
      deals
      .map((restaurant) => optimizePrice(restaurant, 0, { location, cuisine: "", user: userContext }, liveCoupons))
      .filter(Boolean)
    );

    const recommendedDeals = optimizedDeals
      .slice()
      .sort((a, b) => {
        const scoreDiff = getRecommendationScore(b) - getRecommendationScore(a);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        if (a.isOrderableNow !== b.isOrderableNow) {
          return a.isOrderableNow ? -1 : 1;
        }

        if (b.rating !== a.rating) {
          return b.rating - a.rating;
        }

        if (b.discount !== a.discount) {
          return b.discount - a.discount;
        }

        return a.finalPrice - b.finalPrice;
      })
      .slice(0, Number(limit));

    const comboDeals = buildComboDeals(optimizedDeals, userContext, { location }, { maxPairs: 6 });
    const mergedDeals = dedupeOptimizedDeals([...recommendedDeals, ...comboDeals]).slice(0, Number(limit));

    // Mark trending low-price deals (bottom 25%)
    if (mergedDeals.length >= 4) {
      const pricesSorted = mergedDeals
        .map((d) => d.couponAdjustedPrice || d.finalPrice)
        .sort((a, b) => a - b);
      const cutoffPrice = pricesSorted[Math.ceil(pricesSorted.length * 0.25) - 1] || 0;
      for (const deal of mergedDeals) {
        const effectivePrice = deal.couponAdjustedPrice || deal.finalPrice;
        deal.isTrendingLow = effectivePrice <= cutoffPrice;
      }
    }

    const meta = buildMeta({
      source,
      location,
      cuisine: "",
      requestedLimit: Number(limit),
      deals: mergedDeals
    });

    res.json({
      meta,
      source,
      diagnostics: diagnostics || null,
      deals: mergedDeals
    });
  } catch (error) {
    console.log("getRecommendations error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch recommendations" });
  }
};

// GET /api/deals/price-history?cuisine=biryani&location=Delhi
export const getPriceHistory = async (req, res) => {
  try {
    const { cuisine = "", location = "Delhi" } = req.query;

    if (!cuisine.trim()) {
      return res.status(400).json({ msg: "Cuisine parameter is required" });
    }

    const resolvedCuisine = resolveDishQuery(cuisine);

    // Pull real history from OrderHistory — last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const historyDocs = await OrderHistory.find({
      $and: [
        { orderedAt: { $gte: thirtyDaysAgo } },
        {
          $or: [
            { cuisine: { $regex: resolvedCuisine, $options: "i" } },
            { dishName: { $regex: resolvedCuisine, $options: "i" } }
          ]
        },
        location ? { location: { $regex: location.split(",")[0].trim(), $options: "i" } } : {}
      ]
    })
      .sort({ orderedAt: 1 })
      .limit(200)
      .lean();

    // Build daily price buckets from real data
    const dayBuckets = {};
    for (const doc of historyDocs) {
      const day = new Date(doc.orderedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      const price = doc.couponAdjustedPrice || doc.finalPrice || 0;
      if (!price) continue;
      if (!dayBuckets[day]) {
        dayBuckets[day] = { sum: 0, count: 0, min: price, restaurant: doc.restaurant };
      }
      dayBuckets[day].sum += price;
      dayBuckets[day].count += 1;
      dayBuckets[day].min = Math.min(dayBuckets[day].min, price);
    }

    let priceHistory = Object.entries(dayBuckets).map(([label, data]) => ({
      label,
      price: Math.round(data.sum / data.count),
      minPrice: data.min,
      restaurant: data.restaurant,
      source: "order-history"
    }));

    // If no real data, generate a simulated trend based on live fetch
    const hasRealData = priceHistory.length >= 2;
    if (!hasRealData) {
      // Fetch current live price as the base
      let basePrice = 320;
      try {
        const { deals: liveDeals } = await fetchZomatoDeals({
          cuisine: resolvedCuisine,
          location,
          user: {},
          limit: 5
        });
        if (liveDeals.length) {
          const optimized = liveDeals
            .map((r) => optimizePrice(r, 0, { cuisine: resolvedCuisine, location, user: {} }))
            .filter(Boolean);
          if (optimized.length) {
            basePrice = Math.round(
              optimized.reduce((sum, d) => sum + (d.finalPrice || 0), 0) / optimized.length
            );
          }
        }
      } catch {}

      const pointCount = 7;
      priceHistory = Array.from({ length: pointCount }, (_, idx) => {
        const date = new Date();
        date.setDate(date.getDate() - (pointCount - 1 - idx));
        const variance = Math.round(Math.sin((idx / pointCount) * Math.PI * 2) * 12 + idx * 4);
        return {
          label: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
          price: Math.max(basePrice + variance, 50),
          minPrice: Math.max(basePrice + variance - 20, 40),
          source: "simulated"
        };
      });
    }

    res.json({
      cuisine: resolvedCuisine,
      location,
      priceHistory,
      hasRealData,
      dataPoints: priceHistory.length
    });
  } catch (error) {
    console.log("getPriceHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch price history" });
  }
};

export const getDealsDebug = async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Mongo connection is not ready" });
    }

    const collections = await mongoose.connection.db.listCollections().toArray();
    const names = collections.map((item) => item.name);
    const preview = {};

    for (const name of names.slice(0, 8)) {
      try {
        const sample = await mongoose.connection.db.collection(name).find({}).limit(1).toArray();
        preview[name] = sample[0] || null;
      } catch {
        preview[name] = null;
      }
    }

    res.json({
      connected: true,
      collections: names,
      preview
    });
  } catch (error) {
    res.status(500).json({ msg: error.message || "Unable to inspect collections" });
  }
};

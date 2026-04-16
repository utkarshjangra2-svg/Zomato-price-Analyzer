import express from "express";
import { optimizePrice, summarizeDeals } from "../services/priceOptimizer.js";
import { resolveDishQuery } from "../services/searchIntent.js";
import { fetchZomatoDeals } from "../services/zomatoService.js";
import { optionalProtect } from "../middleware/optionalAuthMiddleware.js";

const router = express.Router();

const extractUserContext = (payload = {}) => ({
  id: payload.userId || payload.id || "",
  name: payload.userName || payload.name || "",
  email: payload.userEmail || payload.email || "",
  orderCount: payload.orderCount,
  zomato: payload.zomato || {}
});

const buildDealKey = (deal) => {
  // 'restaurant' is always set by optimizePrice (= restaurant.name)
  const restaurantName = (deal.restaurant || deal.name || "").trim().toLowerCase();
  const dishName = (deal.dishName || "").trim().toLowerCase();
  // res_id passed through to distinguish same-name chain branches
  const resId = String(deal.res_id || "");
  return [restaurantName, dishName, resId].join("|");
};


const dedupeDeals = (deals) => {
  const bestByKey = new Map();

  for (const deal of deals) {
    const key = buildDealKey(deal);
    if (!key) continue;

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

// POST /api/dish-search
router.post("/", optionalProtect, async (req, res) => {
  try {
    const {
      dish = "",
      budget = 0,
      location = "Delhi",
      locationData = null,
      user = {}
    } = req.body;

    if (!dish.trim()) {
      return res.status(400).json({ success: false, msg: "Dish name is required" });
    }

    const resolvedDish = resolveDishQuery(dish);
    const authUser = req.user
      ? {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          zomato: req.user.zomato || {}
        }
      : null;
    const userContext = extractUserContext(authUser || user);
    const numericBudget = Number(budget) || 0;

    const getSearchLocation = (rawLocation, locationDataObj) => {
      if (!rawLocation?.trim() && locationDataObj?.title) {
        return locationDataObj.title;
      }
      if (locationDataObj?.title && locationDataObj.title !== rawLocation) {
        return locationDataObj.title;
      }
      return rawLocation.trim() || "Delhi";
    };

    const searchLocation = getSearchLocation(location, locationData);

    // Fetch more results to give user more options and a broader local range
    const { deals: rawDeals, source, diagnostics } = await fetchZomatoDeals({
      cuisine: resolvedDish,
      location: searchLocation,
      locationData,
      user: userContext,
      limit: 50
    });

    // Optimize each deal (applies coupon stacking internally)
    const optimized = rawDeals
      .map((restaurant) =>
        optimizePrice(restaurant, numericBudget, {
          cuisine: resolvedDish,
          location,
          user: userContext
        })
      )
      .filter(Boolean)
      .filter((deal) => deal.isOrderableNow && deal.orderUrl && !/\/search\?query=/.test(deal.orderUrl));

    // Deduplicate and sort by coupon-adjusted price (cheapest first)
    const sortedDeals = dedupeDeals(optimized)
      .sort((a, b) => {
        const priceA = a.couponAdjustedPrice || a.finalPrice;
        const priceB = b.couponAdjustedPrice || b.finalPrice;
        if (priceA !== priceB) return priceA - priceB;
        if (b.couponSavings !== a.couponSavings) return b.couponSavings - a.couponSavings;
        return b.confidence - a.confidence;
      })
      .slice(0, 40);

    // Mark trending deals (bottom 25% price = trending low)
    if (sortedDeals.length >= 4) {
      const cutoffIndex = Math.ceil(sortedDeals.length * 0.25);
      const cutoffPrice = sortedDeals[cutoffIndex - 1]?.couponAdjustedPrice || sortedDeals[cutoffIndex - 1]?.finalPrice || 0;
      for (const deal of sortedDeals) {
        const effectivePrice = deal.couponAdjustedPrice || deal.finalPrice;
        deal.isTrendingLow = effectivePrice <= cutoffPrice;
      }
    }

    const stats = summarizeDeals(sortedDeals);
    const liveCount = sortedDeals.filter((d) => d.isOrderableNow).length;

    res.json({
      success: true,
      dish: dish.trim(),
      resolvedDish,
      location: location.trim() || "Delhi",
      budget: numericBudget,
      source,
      diagnostics: diagnostics || null,
      deals: sortedDeals,
      stats,
      meta: {
        totalDeals: sortedDeals.length,
        liveNowCount: liveCount,
        fetchedAt: new Date().toISOString(),
        bestPrice: sortedDeals[0]
          ? sortedDeals[0].couponAdjustedPrice || sortedDeals[0].finalPrice
          : null,
        bestCoupon: sortedDeals[0]?.bestCouponCombo?.length
          ? sortedDeals[0].bestCouponCombo.map((c) => c.code).join(" + ")
          : null
      }
    });
  } catch (error) {
    console.error("[dish-search] Error:", error);
    res.status(500).json({
      success: false,
      msg: error.message || "Unable to search for dish"
    });
  }
});

export default router;

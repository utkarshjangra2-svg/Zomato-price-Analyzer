const couponCatalog = [
  {
    code: "WELCOME40",
    label: "New user boost",
    kind: "percent",
    value: 40,
    cap: 140,
    minOrder: 199,
    category: "platform",
    stackable: true,
    description: "Large first-order coupon for fresh accounts.",
    eligibility: (profile) => profile.isNewUser
  },
  {
    code: "SMARTSAVE25",
    label: "SmartDeal AI saver",
    kind: "percent",
    value: 25,
    cap: 120,
    minOrder: 249,
    category: "platform",
    stackable: true,
    description: "General savings coupon surfaced by the ranking engine.",
    eligibility: () => true
  },
  {
    code: "MEAL50",
    label: "Meal-time flat deal",
    kind: "flat",
    value: 50,
    cap: 50,
    minOrder: 299,
    category: "platform",
    stackable: true,
    description: "Flat discount on medium-sized orders during active meal windows.",
    eligibility: (profile) => profile.isMealTime
  },
  {
    code: "BIRYANI25",
    label: "Cuisine booster",
    kind: "percent",
    value: 25,
    cap: 90,
    minOrder: 229,
    category: "platform",
    stackable: true,
    description: "Extra discount on cuisines the user orders frequently.",
    eligibility: (profile, deal) => {
      const cuisine = `${deal.cuisine || ""} ${deal.dishName || ""}`.toLowerCase();
      return profile.favoriteCuisineTokens.some((token) => cuisine.includes(token));
    }
  },
  {
    code: "LOYAL15",
    label: "Loyalty reward",
    kind: "percent",
    value: 15,
    cap: 70,
    minOrder: 199,
    category: "loyalty",
    stackable: true,
    description: "Reward unlocked for returning users.",
    eligibility: (profile) => !profile.isNewUser
  },
  {
    code: "UPI25",
    label: "UPI payment offer",
    kind: "flat",
    value: 25,
    cap: 25,
    minOrder: 149,
    category: "payment",
    stackable: true,
    description: "Flat off on eligible UPI checkout flow.",
    eligibility: () => true
  },
  {
    code: "PRO60",
    label: "High-value basket coupon",
    kind: "flat",
    value: 60,
    cap: 60,
    minOrder: 399,
    category: "basket",
    stackable: true,
    description: "Best for higher-ticket carts and premium picks.",
    eligibility: (profile, deal, effectivePrice) => effectivePrice >= 399 || deal.rating >= 4.4
  }
];

const safeHash = (value = "") =>
  value
    .split("")
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 1000003, 7);

const getCurrentHour = () => new Date().getHours();

const getProfileCuisineTokens = (profile = {}, context = {}) => {
  const values = [
    profile.favoriteCuisine,
    context.cuisine,
    context.requestedCuisine,
    "biryani",
    "pizza",
    "chinese"
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [...new Set(values.split(/[^a-z]+/).filter((token) => token.length > 2))];
};

export const buildUserCouponProfile = (user = {}, context = {}) => {
  const seedSource = `${user.id || ""}-${user.email || ""}-${user.name || ""}`.toLowerCase();
  const seed = safeHash(seedSource || "guest");
  const email = `${user.email || ""}`.toLowerCase();
  const hour = getCurrentHour();
  const zomatoExistingUser = Boolean(user?.zomato?.isExistingUser || user?.zomatoExistingUser);
  const inferredOrderCount = Number.isFinite(Number(user.orderCount))
    ? Number(user.orderCount)
    : seed % 6;

  return {
    id: user.id || "",
    name: user.name || "Guest",
    email,
    seed,
    inferredOrderCount,
    isNewUser: zomatoExistingUser ? false : inferredOrderCount <= 1,
    isMealTime: (hour >= 12 && hour <= 15) || (hour >= 19 && hour <= 22),
    walletAffinity: seed % 100,
    favoriteCuisineTokens: getProfileCuisineTokens(user, context),
    hasCorporateEmail: email.endsWith(".edu") || email.endsWith(".org") || email.includes("team"),
    isGuest: !user?.id && !user?.email,
    zomatoExistingUser
  };
};

const scoreCouponFit = ({ coupon, deal, profile, adjustedPrice, savings }) => {
  const basePrice = Number(deal.finalPrice || 0);
  const normalizedSavings = Math.min(savings / Math.max(basePrice || 1, 1), 0.5) / 0.5;
  const normalizedPrice = 1 - Math.min(adjustedPrice, 1200) / 1200;
  const cuisineBoost = profile.favoriteCuisineTokens.some((token) =>
    `${deal.cuisine || ""} ${deal.dishName || ""}`.toLowerCase().includes(token)
  )
    ? 0.12
    : 0;
  const premiumBoost = Number(deal.rating || 0) >= 4.4 ? 0.08 : 0;

  return Math.round(
    Math.min(
      99,
      54 +
        normalizedSavings * 24 +
        normalizedPrice * 12 +
        (profile.isNewUser && coupon.code === "WELCOME40" ? 8 : 0) +
        cuisineBoost * 100 +
        premiumBoost * 100
    )
  );
};

const calculateCouponDiscount = (coupon, price) => {
  if (price < coupon.minOrder) {
    return 0;
  }

  if (coupon.kind === "flat") {
    return Math.min(coupon.value, coupon.cap || coupon.value, price);
  }

  const rawDiscount = (price * coupon.value) / 100;
  return Math.min(Math.round(rawDiscount), coupon.cap || rawDiscount, price);
};

const buildCouponApplication = ({ coupon, runningPrice, deal, profile }) => {
  if (!coupon.eligibility(profile, deal, runningPrice)) {
    return null;
  }

  const discount = calculateCouponDiscount(coupon, runningPrice);

  if (!discount) {
    return null;
  }

  const nextPrice = Math.max(0, Math.round(runningPrice - discount));

  return {
    code: coupon.code,
    label: coupon.label,
    description: coupon.description,
    category: coupon.category,
    savings: discount,
    adjustedPrice: nextPrice,
    mlScore: scoreCouponFit({
      coupon,
      deal,
      profile,
      adjustedPrice: nextPrice,
      savings: discount
    })
  };
};

const buildCouponPaths = ({ deal, profile }) => {
  const singlePaths = couponCatalog
    .map((coupon) => {
      const first = buildCouponApplication({
        coupon,
        runningPrice: deal.finalPrice,
        deal,
        profile
      });

      if (!first) {
        return null;
      }

      return {
        coupons: [first],
        finalPrice: first.adjustedPrice,
        totalSavings: first.savings,
        mlScore: first.mlScore
      };
    })
    .filter(Boolean);

  const comboPaths = [];

  for (const firstCoupon of couponCatalog) {
    const first = buildCouponApplication({
      coupon: firstCoupon,
      runningPrice: deal.finalPrice,
      deal,
      profile
    });

    if (!first) {
      continue;
    }

    for (const secondCoupon of couponCatalog) {
      if (firstCoupon.code === secondCoupon.code || firstCoupon.category === secondCoupon.category) {
        continue;
      }

      const second = buildCouponApplication({
        coupon: secondCoupon,
        runningPrice: first.adjustedPrice,
        deal,
        profile
      });

      if (!second) {
        continue;
      }

      comboPaths.push({
        coupons: [first, second],
        finalPrice: second.adjustedPrice,
        totalSavings: first.savings + second.savings,
        mlScore: Math.round((first.mlScore + second.mlScore) / 2)
      });
    }
  }

  return [...singlePaths, ...comboPaths].sort(
    (a, b) => a.finalPrice - b.finalPrice || b.totalSavings - a.totalSavings || b.mlScore - a.mlScore
  );
};

// Catalog-aware version: accepts an explicit catalog array (for live coupons)
const buildCouponPathsFromCatalog = ({ deal, profile, catalog = couponCatalog }) => {
  const singlePaths = catalog
    .map((coupon) => {
      const first = buildCouponApplication({
        coupon,
        runningPrice: deal.finalPrice,
        deal,
        profile
      });
      if (!first) return null;
      return {
        coupons: [first],
        finalPrice: first.adjustedPrice,
        totalSavings: first.savings,
        mlScore: first.mlScore
      };
    })
    .filter(Boolean);

  const comboPaths = [];
  for (const firstCoupon of catalog) {
    const first = buildCouponApplication({
      coupon: firstCoupon,
      runningPrice: deal.finalPrice,
      deal,
      profile
    });
    if (!first) continue;

    for (const secondCoupon of catalog) {
      if (firstCoupon.code === secondCoupon.code || firstCoupon.category === secondCoupon.category) continue;
      const second = buildCouponApplication({
        coupon: secondCoupon,
        runningPrice: first.adjustedPrice,
        deal,
        profile
      });
      if (!second) continue;
      comboPaths.push({
        coupons: [first, second],
        finalPrice: second.adjustedPrice,
        totalSavings: first.savings + second.savings,
        mlScore: Math.round((first.mlScore + second.mlScore) / 2)
      });
    }
  }

  return [...singlePaths, ...comboPaths].sort(
    (a, b) => a.finalPrice - b.finalPrice || b.totalSavings - a.totalSavings || b.mlScore - a.mlScore
  );
};

export const buildComboBasket = (dealA, dealB) => {
  const basketName = `${dealA.dishName || dealA.cuisine || dealA.restaurant} + ${dealB.dishName || dealB.cuisine || dealB.restaurant}`;
  const basketCuisine = dealA.cuisine || dealB.cuisine || "Multiple";
  const basketLocation = dealA.location || dealB.location || "Unknown";

  return {
    restaurant: dealA.restaurant,
    res_id: dealA.res_id || dealB.res_id || "",
    catalogueId: dealA.catalogueId || dealB.catalogueId || "",
    dishName: basketName,
    cuisine: basketCuisine,
    location: basketLocation,
    imageUrl: dealA.imageUrl || dealB.imageUrl || "",
    orderUrl: dealA.orderUrl || dealB.orderUrl || "",
    basePrice: (Number(dealA.originalPrice || dealA.finalPrice || 0) + Number(dealB.originalPrice || dealB.finalPrice || 0)),
    originalPrice: (Number(dealA.originalPrice || dealA.finalPrice || 0) + Number(dealB.originalPrice || dealB.finalPrice || 0)),
    finalPrice: (Number(dealA.finalPrice || 0) + Number(dealB.finalPrice || 0)),
    rating: Math.max(Number(dealA.rating || 0), Number(dealB.rating || 0)),
    discount: Math.max(Number(dealA.discount || 0), Number(dealB.discount || 0)),
    ratingCount: (Number(dealA.rating || 0) + Number(dealB.rating || 0)) / 2,
    isLive: Boolean(dealA.isLive && dealB.isLive),
    isOrderableNow: Boolean(dealA.isOrderableNow && dealB.isOrderableNow),
    offerText: `Combo purchase: ${dealA.dishName || dealA.cuisine} + ${dealB.dishName || dealB.cuisine}`
  };
};

export const buildComboDeals = (deals = [], user = {}, context = {}, options = {}) => {
  const maxPairs = Number(options.maxPairs) || 6;
  const combos = [];
  const candidates = deals.slice(0, Math.min(deals.length, 12));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const dealA = candidates[i];
      const dealB = candidates[j];

      if (!dealA.restaurant || dealA.restaurant !== dealB.restaurant) {
        continue;
      }

      if (!dealA.dishName || !dealB.dishName) {
        continue;
      }

      const basket = buildComboBasket(dealA, dealB);
      const basketResult = applyBestCoupons(basket, user, context);
      const soloTotal = (Number(dealA.couponAdjustedPrice || dealA.finalPrice || 0) + Number(dealB.couponAdjustedPrice || dealB.finalPrice || 0));

      if (basketResult.couponAdjustedPrice < soloTotal) {
        combos.push({
          ...basket,
          isComboDeal: true,
          comboItems: [
            { name: dealA.dishName || dealA.cuisine, price: dealA.finalPrice },
            { name: dealB.dishName || dealB.cuisine, price: dealB.finalPrice }
          ],
          couponAdjustedPrice: basketResult.couponAdjustedPrice,
          couponSavings: basketResult.couponSavings,
          bestCouponCombo: basketResult.bestCouponCombo,
          couponConfidence: basketResult.couponConfidence,
          couponInsight: basketResult.couponInsight,
          availableCoupons: basketResult.availableCoupons,
          finalPrice: basket.finalPrice,
          originalPrice: basket.originalPrice,
          discount: Math.round(((basket.originalPrice - basketResult.couponAdjustedPrice) / Math.max(basket.originalPrice, 1)) * 100)
        });
      }
    }
  }

  return combos
    .sort((a, b) => a.couponAdjustedPrice - b.couponAdjustedPrice || b.couponSavings - a.couponSavings)
    .slice(0, maxPairs);
};

// Fetch real Zomato coupons from MCP for signed-in user
// Returns an array of coupon objects in the same shape as couponCatalog
export const fetchUserZomatoCoupons = async (userId) => {
  if (!userId) return [];
  try {
    const { callUserZomatoTool } = await import("./zomatoUserSessionService.js");
    // Zomato MCP exposes 'get_cart_offers' for coupon/offer listings
    const result = await callUserZomatoTool(String(userId), "get_cart_offers", {});
    if (!result?.success || !result?.result) return [];

    // Normalize result — MCP returns text or JSON
    let raw = result.result;
    if (Array.isArray(raw) && raw[0]?.text) {
      try { raw = JSON.parse(raw[0].text); } catch { raw = raw[0].text; }
    }
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { return []; }
    }

    // get_cart_offers may return an 'offers' array, 'coupons', or a flat list
    const coupons = raw?.offers || raw?.coupons || raw?.data?.offers || raw?.data?.coupons || (Array.isArray(raw) ? raw : []);
    if (!Array.isArray(coupons) || !coupons.length) return [];

    return coupons
      .filter((c) => c?.code || c?.coupon_code || c?.promo_code)
      .map((c) => {
        const code = (c.code || c.coupon_code || c.promo_code || "").toUpperCase().trim();
        const discountType = c.discount_type || c.type || "percent";
        const discountValue = Number(c.discount_value || c.discount || c.value || 0);
        return {
          code,
          label: c.title || c.description || c.offer_title || `Zomato offer: ${code}`,
          kind: discountType === "flat" || discountType === "FLAT" ? "flat" : "percent",
          value: discountValue,
          cap: Number(c.max_discount || c.cap || c.max_savings || discountValue || 999),
          minOrder: Number(c.min_order_value || c.minimum_order || c.min_cart_value || 0),
          category: c.category || "zomato-live",
          stackable: Boolean(c.stackable !== false),
          description: c.description || c.offer_description || c.title || `Live Zomato offer: ${code}`,
          source: "zomato-live",
          eligibility: () => true
        };
      });
  } catch (err) {
    console.log("[couponOptimizer] fetchUserZomatoCoupons failed:", err.message);
    return [];
  }
};

// Build a merged coupon catalog — live Zomato coupons take priority, then static ones
// liveCoupons: array from fetchUserZomatoCoupons
const buildMergedCatalog = (liveCoupons = []) => {
  if (!liveCoupons.length) return couponCatalog;
  const liveCodes = new Set(liveCoupons.map((c) => c.code));
  // Keep static coupons that don't clash with live ones
  const filtered = couponCatalog.filter((c) => !liveCodes.has(c.code));
  return [...liveCoupons, ...filtered];
};

export const applyBestCoupons = (deal, user = {}, context = {}, liveCoupons = []) => {
  const profile = buildUserCouponProfile(user, context);
  const mergedCatalog = buildMergedCatalog(liveCoupons);

  // buildCouponPaths uses module-level couponCatalog — we override temporarily via closure
  const rankedPaths = buildCouponPathsFromCatalog({ deal, profile, catalog: mergedCatalog });
  const topPaths = rankedPaths.slice(0, 4);
  const bestPath = topPaths[0];

  if (!bestPath) {
    return {
      userProfile: {
        isNewUser: profile.isNewUser,
        inferredOrderCount: profile.inferredOrderCount
      },
      availableCoupons: [],
      bestCouponCombo: [],
      couponAdjustedPrice: deal.finalPrice,
      couponSavings: 0,
      couponInsight: "No eligible coupon improved the current price.",
      couponConfidence: 58
    };
  }

  return {
    userProfile: {
      isNewUser: profile.isNewUser,
      inferredOrderCount: profile.inferredOrderCount
    },
    availableCoupons: topPaths.map((path) => ({
      finalPrice: path.finalPrice,
      totalSavings: path.totalSavings,
      mlScore: path.mlScore,
      codes: path.coupons.map((coupon) => coupon.code),
      coupons: path.coupons
    })),
    bestCouponCombo: bestPath.coupons,
    couponAdjustedPrice: bestPath.finalPrice,
    couponSavings: bestPath.totalSavings,
    couponConfidence: Math.max(64, Math.min(98, bestPath.mlScore)),
    couponInsight:
      bestPath.coupons.length > 1
        ? `${bestPath.coupons.map((coupon) => coupon.code).join(" + ")} produces the lowest estimated checkout price for this user.`
        : `${bestPath.coupons[0].code} is the strongest coupon for this user on the current basket.`
  };
};

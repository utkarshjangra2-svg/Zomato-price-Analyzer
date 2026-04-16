import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Recommendations.css";
import { saveOrderToHistory } from "../utils/orderHistory";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "../utils/userProfile";
import { getSourceStatus } from "../utils/sourceStatus";
import { DEFAULT_LOCATION, getCachedExactLocation, getManualLocationOverride, resolveExactLocation } from "../utils/location";

const formatCurrency = (value) => `Rs${Math.round(value ?? 0)}`;

const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "--";

const getOfferHeadline = (deal = {}, index = 0) => {
  if (deal.isComboDeal) {
    return "Combo Basket Deal";
  }

  if (deal.bestCouponCombo?.length) {
    return "Coupon Stack Special";
  }

  if ((deal.discount || 0) >= 35) {
    return "Flash Deal";
  }

  if ((deal.discount || 0) >= 20) {
    return "Today's Savings";
  }

  const fallbackTitles = ["Chef Spotlight", "Weekend Treat", "Limited Drop", "Combo Offer"];
  return fallbackTitles[index % fallbackTitles.length];
};

const getOfferSubline = (deal = {}) => {
  if (deal.isComboDeal) {
    return deal.comboItems?.length
      ? `Bundle: ${deal.comboItems.map((item) => item.name).join(" + ")}`
      : deal.offerText || "Combo basket available";
  }

  if (deal.bestCouponCombo?.length) {
    return `${deal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")} applied at checkout`;
  }

  if (deal.couponSavings) {
    return `Extra savings up to ${formatCurrency(deal.couponSavings)}`;
  }

  if (deal.isTrendingLow) {
    return "Trending low price in your area";
  }

  return deal.offerText || "Restaurant special available right now";
};

const buildOccasionTags = (recommendations = []) => {
  const tags = [];
  const liveCount = recommendations.filter((deal) => deal.isOrderableNow).length;
  const couponCount = recommendations.filter((deal) => deal.bestCouponCombo?.length).length;
  const highDiscountCount = recommendations.filter((deal) => (deal.discount || 0) >= 25).length;

  if (liveCount) tags.push({ id: "live-now", label: "Live Specials", value: liveCount });
  if (couponCount) tags.push({ id: "coupon-events", label: "Coupon Events", value: couponCount });
  if (highDiscountCount) tags.push({ id: "discount-drops", label: "Big Discount Drops", value: highDiscountCount });

  return tags.slice(0, 3);
};

const buildCampaigns = (recommendations = [], location = DEFAULT_LOCATION) => {
  const campaignDefs = [
    {
      id: "live-specials",
      tag: "Live Specials",
      title: "Ready-to-order deals are live",
      subtitle: `Fresh restaurant offers currently available in ${location}.`,
      cta: "View live deals",
      filter: (deal) => Boolean(deal.isOrderableNow),
      accent: "cricket"
    },
    {
      id: "coupon-specials",
      tag: "Coupon Specials",
      title: "Extra code stacks unlocked",
      subtitle: "Restaurants with special coupons, stacked checkout savings, and promo combinations.",
      cta: "Open coupon deals",
      filter: (deal) => Boolean(deal.bestCouponCombo?.length || deal.couponSavings),
      accent: "coupons"
    },
    {
      id: "flash-discounts",
      tag: "Flash Discounts",
      title: "Big percentage cuts right now",
      subtitle: "Short-window restaurant offers with strong discounts and fast-moving availability.",
      cta: "See flash deals",
      filter: (deal) => (deal.discount || 0) >= 25,
      accent: "flash"
    },
    {
      id: "trending-lows",
      tag: "Trending Lows",
      title: "Low-price picks people are watching",
      subtitle: "Deals tagged as trending low so you can catch value before it moves.",
      cta: "See trending deals",
      filter: (deal) => Boolean(deal.isTrendingLow),
      accent: "cricket"
    },
    {
      id: "fast-delivery",
      tag: "Fast Delivery",
      title: "Quick-arrival offers",
      subtitle: "Special deals from places with faster estimated delivery windows.",
      cta: "Open quick deals",
      filter: (deal) => {
        const etaValue = Number.parseInt((deal.eta || "").toString(), 10);
        return Number.isFinite(etaValue) && etaValue <= 30;
      },
      accent: "flash"
    },
    {
      id: "combo-nights",
      tag: "Combo Nights",
      title: "Party snacks and combo cravings",
      subtitle: "Combo-style offers for pizza, burgers, rolls, biryani, and bucket specials.",
      cta: "Show combo offers",
      filter: (deal) =>
        /pizza|burger|roll|biryani|combo|bucket|shawarma|momos/i.test(
          `${deal.dishName || ""} ${deal.cuisine || ""} ${deal.offerText || ""}`
        ),
      accent: "coupons"
    }
  ];

  return campaignDefs
    .map((campaign) => ({
      ...campaign,
      count: recommendations.filter(campaign.filter).length
    }))
    .filter((campaign) => campaign.count > 0);
};

const buildCouponBars = (recommendations = []) => {
  const map = new Map();

  recommendations.forEach((deal) => {
    deal.bestCouponCombo?.forEach((coupon) => {
      const existing = map.get(coupon.code) || { code: coupon.code, count: 0, savings: 0 };
      existing.count += 1;
      existing.savings = Math.max(existing.savings, Number(coupon.savings) || 0);
      map.set(coupon.code, existing);
    });
  });

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.savings - a.savings)
    .slice(0, 8);
};

const occasionTagMatchesDeal = (tagId, deal = {}) => {
  if (tagId === "live-now") {
    return Boolean(deal.isOrderableNow);
  }

  if (tagId === "coupon-events") {
    return Boolean(deal.bestCouponCombo?.length);
  }

  if (tagId === "discount-drops") {
    return (deal.discount || 0) >= 25;
  }

  return true;
};

export default function Recommendations() {
  const navigate = useNavigate();
  const dealsSectionRef = useRef(null);
  const [recommendations, setRecommendations] = useState([]);
  const [source, setSource] = useState("unavailable");
  const [meta, setMeta] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [activeLocation, setActiveLocation] = useState(() => getManualLocationOverride()?.query || getCachedExactLocation()?.query || DEFAULT_LOCATION);
  const [sortBy, setSortBy] = useState("score");
  const [activeCampaign, setActiveCampaign] = useState("all");
  const [activeCouponCode, setActiveCouponCode] = useState("");
  const [activeOccasionTag, setActiveOccasionTag] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [cartStatus, setCartStatus] = useState({});
  const sourceStatus = getSourceStatus(source, diagnostics);
  const campaigns = useMemo(
    () => buildCampaigns(recommendations, meta?.location || activeLocation || DEFAULT_LOCATION),
    [recommendations, meta?.location, activeLocation]
  );
  const couponBars = useMemo(() => buildCouponBars(recommendations), [recommendations]);
  const activeCampaignConfig = campaigns.find((campaign) => campaign.id === activeCampaign) || null;
  const filteredRecommendations = recommendations.filter((deal) => {
    const campaignMatch = activeCampaignConfig ? activeCampaignConfig.filter(deal) : true;
    const couponMatch = activeCouponCode
      ? deal.bestCouponCombo?.some((coupon) => coupon.code === activeCouponCode)
      : true;
    const occasionMatch = activeOccasionTag ? occasionTagMatchesDeal(activeOccasionTag, deal) : true;
    return campaignMatch && couponMatch && occasionMatch;
  });
  const sortedRecommendations = [...filteredRecommendations].sort((a, b) => {
    if (sortBy === "price") {
      const pa = a.couponAdjustedPrice || a.finalPrice;
      const pb = b.couponAdjustedPrice || b.finalPrice;
      return pa - pb;
    }

    const discountDiff = (b.discount || 0) - (a.discount || 0);
    if (discountDiff !== 0) return discountDiff;
    return (b.couponSavings || 0) - (a.couponSavings || 0);
  });
  const featuredDeal = sortedRecommendations[0];
  const comboDeals = useMemo(() => recommendations.filter((deal) => deal.isComboDeal), [recommendations]);
  const occasionTags = buildOccasionTags(sortedRecommendations);
  const scrollToDeals = () => {
    dealsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAddToCart = async (deal, event) => {
    if (event) event.stopPropagation();
    if (!deal?.res_id || !deal?.catalogueId) {
      if (deal?.orderUrl) {
        window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
        return;
      }
      alert("This deal cannot be added to cart directly.");
      return;
    }
    const key = `${deal.restaurant}-${deal.dishName}`;
    setCartStatus((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch(buildApiUrl("/api/orders/add-to-cart"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deal })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || "Cart failed");
      setCartStatus((prev) => ({ ...prev, [key]: "done" }));
      const couponMsg = data.appliedCoupon ? ` (${data.appliedCoupon} applied!)` : "";
      alert(`Added to cart!${couponMsg}`);
      setTimeout(() => setCartStatus((prev) => ({ ...prev, [key]: null })), 3000);
    } catch (err) {
      setCartStatus((prev) => ({ ...prev, [key]: "error" }));
      alert(`Cart failed: ${err.message}`);
      setTimeout(() => setCartStatus((prev) => ({ ...prev, [key]: null })), 3000);
    }
  };

  useEffect(() => {
    if (!campaigns.length) {
      return undefined;
    }

    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % campaigns.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [campaigns]);

  useEffect(() => {
    if (!campaigns.length) {
      setActiveCampaign("all");
      return;
    }

    const currentCampaign = campaigns[activeSlide];
    if (currentCampaign) {
      setActiveCampaign(currentCampaign.id);
    }
  }, [activeSlide, campaigns]);

  const fetchRecommendations = async (locationOverride = activeLocation) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const locationQuery = encodeURIComponent(locationOverride || DEFAULT_LOCATION);
      const response = await fetch(buildApiUrl(`/api/deals/recommendations?location=${locationQuery}&limit=12${buildUserQueryParams()}`), {
        headers: buildAuthHeaders({ "Content-Type": "application/json" })
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.msg || "Unable to fetch recommendations");
      }

      setRecommendations(Array.isArray(data.deals) ? data.deals : []);
      setSource(data.source || "unavailable");
      setMeta(data.meta || null);
      setDiagnostics(data.diagnostics || null);
      setError("");
    } catch (e) {
      setRecommendations([]);
      setSource("unavailable");
      setMeta(null);
      setDiagnostics(null);
      setError(e.message || "Unable to load recommendations.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapLocation = async () => {
      try {
        const exactLocation = await resolveExactLocation();

        if (cancelled) {
          return;
        }

        setActiveLocation(exactLocation.query || DEFAULT_LOCATION);
        fetchRecommendations(exactLocation.query || DEFAULT_LOCATION);
      } catch {
        if (cancelled) {
          return;
        }

        setActiveLocation(DEFAULT_LOCATION);
        fetchRecommendations(DEFAULT_LOCATION);
      }
    };

    bootstrapLocation();

  }, []);

  useEffect(() => {
    const interval = setInterval(() => fetchRecommendations(activeLocation), 30000);

    return () => clearInterval(interval);
  }, [activeLocation]);

  return (
    <div className="recommend-page">
      <div className="recommend-shell">
        <nav className="recommend-nav">
          <div>
            <p className="recommend-eyebrow">Smart picks</p>
            <h1>Best Picks</h1>
          </div>
          <div className="recommend-nav-actions">
            <button
              className={`recommend-sort-btn${sortBy === "price" ? " active" : ""}`}
              onClick={() => setSortBy(sortBy === "price" ? "score" : "price")}
            >
              {sortBy === "price" ? "Score Sort" : "Lowest Price First"}
            </button>
            <button className="recommend-refresh-btn" onClick={() => fetchRecommendations(activeLocation)}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={() => navigate("/")}>Home</button>
          </div>
        </nav>

        {error ? (
          <div className="recommend-error">{error}</div>
        ) : null}

        {recommendations.length ? (
          <>
            {comboDeals.length ? (
              <section className="combo-highlights">
                <div className="combo-highlight-header">
                  <div>
                    <p className="recommend-eyebrow">Combo savings</p>
                    <h2>Bundle deals with extra savings</h2>
                    <p className="combo-highlight-description">
                      These paired basket offers are cheaper together than ordering each item separately.
                    </p>
                  </div>
                </div>
                <div className="combo-highlight-grid">
                  {comboDeals.slice(0, 3).map((deal, index) => (
                    <article key={`${deal.restaurant}-${deal.dishName}-${index}`} className="combo-highlight-card">
                      <div>
                        <strong>{deal.restaurant}</strong>
                        <p>{deal.comboItems?.map((item) => item.name).join(" + ")}</p>
                      </div>
                      <div>
                        <span>{formatCurrency(deal.couponAdjustedPrice || deal.finalPrice)}</span>
                        <small>{deal.bestCouponCombo?.map((coupon) => coupon.code).join(" + ")}</small>
                      </div>
                      <button type="button" className="recommend-action-btn" onClick={scrollToDeals}>
                        View bundle
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="seasonal-slider">
              <div
                className={`seasonal-slider-track accent-${campaigns[activeSlide]?.accent || "cricket"}`}
                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
              >
                {campaigns.map((campaign, index) => (
                  <article
                    key={campaign.id}
                    className="seasonal-slide"
                    onClick={() => {
                      setActiveSlide(index);
                      setActiveCampaign(campaign.id);
                      setActiveCouponCode("");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                  >
                    <div className="seasonal-slide-copy">
                      <span>{campaign.tag}</span>
                      <h3>{campaign.title}</h3>
                      <p>{campaign.subtitle}</p>
                    </div>
                    <div className="seasonal-slide-meta">
                      <strong>{campaign.count}</strong>
                      <small>matching offers</small>
                      <button type="button">{campaign.cta}</button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="seasonal-slider-dots">
                {campaigns.map((campaign, index) => (
                  <button
                    key={campaign.id}
                    type="button"
                    className={index === activeSlide ? "active" : ""}
                    onClick={() => {
                      setActiveSlide(index);
                      setActiveCampaign(campaign.id);
                      setActiveCouponCode("");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                    aria-label={`Show ${campaign.tag}`}
                  />
                ))}
              </div>
            </section>

            <section className="coupon-scroll-section">
              <div className="coupon-scroll-header">
                <div>
                  <p className="recommend-eyebrow">Special bars</p>
                  <h3>Coupons and seasonal rails</h3>
                </div>
                {(activeCampaign !== "all" || activeCouponCode) ? (
                  <button
                    type="button"
                    className="coupon-clear-btn"
                    onClick={() => {
                      setActiveCampaign("all");
                      setActiveCouponCode("");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>

              <div className="coupon-scroll-row">
                <button
                  type="button"
                  className={`coupon-bar-card ${activeCampaign === "all" && !activeCouponCode ? "active" : ""}`}
                    onClick={() => {
                      setActiveCampaign("all");
                      setActiveCouponCode("");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                  >
                    <span>All Specials</span>
                  <strong>{recommendations.length}</strong>
                </button>
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    className={`coupon-bar-card accent ${activeCampaign === campaign.id ? "active" : ""}`}
                    onClick={() => {
                      setActiveCampaign(campaign.id);
                      setActiveCouponCode("");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                  >
                    <span>{campaign.tag}</span>
                    <strong>{campaign.count}</strong>
                  </button>
                ))}
                {couponBars.map((coupon) => (
                  <button
                    key={coupon.code}
                    type="button"
                    className={`coupon-bar-card code ${activeCouponCode === coupon.code ? "active" : ""}`}
                    onClick={() => {
                      setActiveCouponCode(coupon.code);
                      setActiveCampaign("all");
                      setActiveOccasionTag("");
                      scrollToDeals();
                    }}
                  >
                    <span>{coupon.code}</span>
                    <strong>{coupon.count} deals</strong>
                    <small>save up to {formatCurrency(coupon.savings)}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="offers-marquee">
              <article className="offers-feature-card">
                <div className="offers-feature-copy">
                  <span className="offers-feature-badge">Best Promo Pick</span>
                  <h3>{featuredDeal?.restaurant || "Waiting for deal feed"}</h3>
                  <p>{featuredDeal ? getOfferHeadline(featuredDeal, 0) : "Fresh restaurant campaigns and timed discounts appear here."}</p>
                  {featuredDeal ? (
                    <div className="offers-feature-pricing">
                      <strong>{formatCurrency(featuredDeal.couponAdjustedPrice || featuredDeal.finalPrice)}</strong>
                      <span>{featuredDeal.discount}% off</span>
                      {featuredDeal.originalPrice ? <em>was {formatCurrency(featuredDeal.originalPrice)}</em> : null}
                    </div>
                  ) : null}
                  {featuredDeal?.bestCouponCombo?.length ? (
                    <div className="offers-feature-codes">
                      {featuredDeal.bestCouponCombo.map((coupon) => (
                        <span key={`${featuredDeal.restaurant}-${coupon.code}`}>{coupon.code}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {featuredDeal?.imageUrl ? (
                  <div className="offers-feature-media">
                    <img src={featuredDeal.imageUrl} alt={featuredDeal.restaurant} />
                  </div>
                ) : null}
              </article>

              <div className="offers-occasion-row">
                {occasionTags.map((tag) => (
                  <button
                    type="button"
                    key={tag.id}
                    className={`offers-occasion-chip${activeOccasionTag === tag.id ? " active" : ""}`}
                    onClick={() => {
                      setActiveOccasionTag(activeOccasionTag === tag.id ? "" : tag.id);
                      setActiveCampaign("all");
                      setActiveCouponCode("");
                      scrollToDeals();
                    }}
                  >
                    <span>{tag.label}</span>
                    <strong>{tag.value}</strong>
                  </button>
                ))}
              </div>
            </section>

            <div ref={dealsSectionRef} className="recommend-grid offers-grid">
              {sortedRecommendations.map((deal, index) => (
              <article
                key={`${deal.restaurant}-${deal.finalPrice}`}
                className="recommend-card offers-card"
                onClick={() => {
                  if (deal.isOrderableNow && deal.orderUrl) {
                    saveOrderToHistory(deal, source);
                    window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
                    return;
                  }

                  navigate("/PriceTrack");
                }}
              >
                <div className="offers-card-visual">
                  <img src={deal.imageUrl} alt={deal.restaurant} className="recommend-image" />
                  <div className="offers-card-overlay">
                    <span className="offers-card-headline">{getOfferHeadline(deal, index)}</span>
                    <strong>{deal.restaurant}</strong>
                    <p>{getOfferSubline(deal)}</p>
                  </div>
                </div>
                <div className="recommend-body offers-card-body">
                  <div className="offers-tag-row">
                    <span className="offers-pill">{deal.isOrderableNow ? "Live Offer" : "Special Deal"}</span>
                    {deal.isTrendingLow ? <span className="offers-pill warm">Trending Low</span> : null}
                    <span className="offers-pill subtle">{deal.confidence}% confidence</span>
                  </div>

                  <div className="recommend-row">
                    <div>
                      <h3>{deal.dishName || deal.cuisine || "Restaurant special"}</h3>
                      {deal.isComboDeal && deal.comboItems?.length ? (
                        <p className="combo-item-line">
                          Bundle includes: {deal.comboItems.map((item) => item.name).join(" + ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="recommend-price">{formatCurrency(deal.couponAdjustedPrice || deal.finalPrice)}</span>
                  </div>

                  <p className="offers-location-line">{deal.location || activeLocation}</p>

                  <div className="offers-meta-grid">
                    <div>
                      <span>Discount</span>
                      <strong>{deal.discount}% off</strong>
                    </div>
                    <div>
                      <span>Rating</span>
                      <strong>{deal.rating}</strong>
                    </div>
                    <div>
                      <span>ETA</span>
                      <strong>{deal.eta || "--"}</strong>
                    </div>
                    <div>
                      <span>Savings</span>
                      <strong>{formatCurrency(deal.couponSavings || 0)}</strong>
                    </div>
                  </div>

                  {deal.bestCouponCombo?.length ? (
                    <div className="offers-coupon-strip">
                      <strong>Special codes</strong>
                      <p>{deal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")}</p>
                    </div>
                  ) : (
                    <div className="offers-coupon-strip muted">
                      <strong>Special offer</strong>
                      <p>{deal.offerText || "Restaurant discount currently active"}</p>
                    </div>
                  )}

                  <div className="recommend-actions">
                    <button
                      type="button"
                      className="recommend-action-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveOrderToHistory(deal, "recommendations");
                      }}
                    >
                      Save
                    </button>

                    {deal.orderUrl ? (
                      <>
                        <button
                          type="button"
                          className="recommend-action-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
                            saveOrderToHistory(deal, "recommendations");
                          }}
                        >
                          Order Now
                        </button>
                        {deal.res_id && deal.catalogueId ? (
                          <button
                            type="button"
                            className={`recommend-action-btn recommend-cart-btn${
                              cartStatus[`${deal.restaurant}-${deal.dishName}`] === "done" ? " cart-done" :
                              cartStatus[`${deal.restaurant}-${deal.dishName}`] === "error" ? " cart-error" : ""
                            }`}
                            disabled={cartStatus[`${deal.restaurant}-${deal.dishName}`] === "loading"}
                            onClick={(event) => handleAddToCart(deal, event)}
                          >
                            {cartStatus[`${deal.restaurant}-${deal.dishName}`] === "loading" ? "Adding..." :
                             cartStatus[`${deal.restaurant}-${deal.dishName}`] === "done" ? "✓ Added!" :
                             "Add to Cart"}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="recommend-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate("/PriceTrack");
                        }}
                      >
                        Explore
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            </div>
          </>
        ) : (
          <div className="recommend-empty">
            No recommendation data is available right now. Try again in a moment.
          </div>
        )}
      </div>
    </div>
  );
}

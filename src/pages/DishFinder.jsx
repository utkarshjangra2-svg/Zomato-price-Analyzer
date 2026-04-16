import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "../utils/userProfile";
import {
  DEFAULT_LOCATION,
  getCachedExactLocation,
  getManualLocationOverride,
  resolveExactLocation,
  saveManualLocationOverride
} from "../utils/location";
import "./DishFinder.css";

const POPULAR_DISHES = [
  "Biryani", "Butter Chicken", "Pizza", "Burger", "Paneer Butter Masala",
  "Chicken Tikka", "Momos", "Noodles", "Pasta", "Shawarma",
  "Dosa", "Chole Bhature", "Dal Makhani", "Fried Rice", "Thali",
  "Kebab", "Rolls", "Samosa", "Pav Bhaji", "Paratha",
  "Ice Cream", "Cake", "Tandoori Chicken", "Fish Curry"
];

const formatCurrency = (v) => `Rs${Math.round(v ?? 0)}`;

export default function DishFinder() {
  const navigate = useNavigate();
  const [dish, setDish] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [locationStatus, setLocationStatus] = useState("detecting");
  const [locationLabel, setLocationLabel] = useState("Detecting location...");
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [locationData, setLocationData] = useState(null);
  const [locationWarning, setLocationWarning] = useState("");
  const [detectedLocation, setDetectedLocation] = useState("");
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [expandedCoupons, setExpandedCoupons] = useState(new Set());
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [cartStatus, setCartStatus] = useState({}); // { [dealKey]: 'loading'|'done'|'error' }
  const acRef = useRef(null);
  const manualLocationRef = useRef(false);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e) => {
      if (acRef.current && !acRef.current.contains(e.target)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-detect / restore location
  useEffect(() => {
    const detect = async () => {
      try {
        const manual = getManualLocationOverride();
        if (manual?.query) {
          manualLocationRef.current = true;
          setLocation(manual.query);
          setLocationData(manual);
          setLocationLabel(manual.title || manual.query);
          setLocationStatus("manual");
          setDetectedLocation(manual.title || manual.query);
          return;
        }

        try {
          const cached = getCachedExactLocation();
          if (cached?.query) {
            if (manualLocationRef.current) return;
            setLocation(cached.query);
            setLocationData(cached);
            setLocationLabel(cached.title || cached.query);
            setLocationStatus("ok");
            return;
          }

          const exact = await resolveExactLocation();
          if (manualLocationRef.current) return;
          setLocation(exact.query || DEFAULT_LOCATION);
          setLocationData(exact);
          setLocationLabel(exact.title || exact.query || DEFAULT_LOCATION);
          setLocationStatus("ok");
          setDetectedLocation(exact.title || exact.query || DEFAULT_LOCATION);
        } catch (locationError) {
          console.error("Location detection failed:", locationError);
          if (manualLocationRef.current) return;
          setLocation(DEFAULT_LOCATION);
          setLocationData({ query: DEFAULT_LOCATION, title: DEFAULT_LOCATION });
          setLocationLabel(DEFAULT_LOCATION);
          setLocationStatus("fallback");
        }
      } catch (error) {
        console.error("Location setup failed:", error);
        setLocation(DEFAULT_LOCATION);
        setLocationData({ query: DEFAULT_LOCATION, title: DEFAULT_LOCATION });
        setLocationLabel(DEFAULT_LOCATION);
        setLocationStatus("fallback");
      }
    };
    detect();
  }, []);

  const filteredDishes = dish.trim()
    ? POPULAR_DISHES.filter((d) =>
        d.toLowerCase().includes(dish.toLowerCase())
      ).slice(0, 8)
    : POPULAR_DISHES.slice(0, 8);

  const handleSearch = useCallback(async () => {
    if (!dish.trim() || loading) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setMeta(null);
    setSelectedDeal(null);
    setLocationWarning("");

    try {
      const userRaw = localStorage.getItem("user");
      let user = {};
      try { user = userRaw ? JSON.parse(userRaw) : {}; } catch {}

      // Use manual locationData when available for accurate MCP address matching
      const effectiveLocation = locationData?.query || location || DEFAULT_LOCATION;

      const res = await fetch(buildApiUrl("/api/dish-search"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          dish: dish.trim(),
          budget: Number(budget) || 0,
          location: effectiveLocation,
          locationData,
          user
        })
      });

      const data = await parseJsonResponse(res);

      if (data.success && data.deals?.length) {
        setResults(data.deals);
        setMeta(data.meta || null);

        const liveCount = data.deals.filter((deal) => deal.isOrderableNow).length;
        if (liveCount === 0) {
          if (manualLocationRef.current && detectedLocation && detectedLocation !== effectiveLocation) {
            setLocationWarning(
              `No live offers found for location "${effectiveLocation}". Showing tracking-only results.`
            );
          } else {
            setLocationWarning("No deals orderable right now for this location. Showing tracking results.");
          }
        }
      } else {
        setResults([]);
        setMeta(null);
        setLocationWarning("No deals found. Try a different dish, budget, or location.");
      }
    } catch {
      setResults([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [dish, budget, location, locationData, loading]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      setShowAutocomplete(false);
      handleSearch();
    }
  };

  const toggleCouponExpand = (idx) => {
    setExpandedCoupons((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectDeal = (deal) => {
    setSelectedDeal(deal);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getDealKey = (deal) => `${deal.restaurant}-${deal.dishName}-${deal.res_id || ""}`;

  const handleAddToCart = async (deal, e) => {
    if (e) e.stopPropagation();

    if (!deal?.res_id || !deal?.catalogueId) {
      if (deal?.orderUrl) {
        window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
        return;
      }
      alert("This deal cannot be added to cart directly. It may not be orderable.");
      return;
    }

    const key = getDealKey(deal);
    setCartStatus((prev) => ({ ...prev, [key]: "loading" }));

    try {
      const res = await fetch(buildApiUrl("/api/orders/add-to-cart"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deal })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || "Unable to add to cart");

      setCartStatus((prev) => ({ ...prev, [key]: "done" }));
      const couponMsg = data.appliedCoupon ? ` (Coupon ${data.appliedCoupon} applied!)` : "";
      alert(`Added to cart successfully!${couponMsg}`);
      setTimeout(() => setCartStatus((prev) => ({ ...prev, [key]: null })), 3000);
    } catch (error) {
      setCartStatus((prev) => ({ ...prev, [key]: "error" }));
      alert(`Failed to add to cart: ${error.message}`);
      setTimeout(() => setCartStatus((prev) => ({ ...prev, [key]: null })), 3000);
    }
  };

  const handleLocationSave = async () => {
    if (locationInput.trim()) {
      const nextLocation = locationInput.trim();
      manualLocationRef.current = true;
      await saveManualLocationOverride(nextLocation);
      const updatedManual = getManualLocationOverride();
      setLocation(nextLocation);
      setLocationData(updatedManual || { query: nextLocation, title: nextLocation });
      setLocationLabel(nextLocation);
      setLocationStatus("manual");
    }
    setEditingLocation(false);
  };

  const liveDeals = results.filter((deal) => deal.isOrderableNow);
  const trackingDeals = results.filter((deal) => !deal.isOrderableNow);

  const renderDealCard = (deal, idx, isTracking = false) => {
    const effectivePrice = deal.couponAdjustedPrice || deal.finalPrice;
    const hasCoupons = deal.bestCouponCombo?.length > 0;
    const couponCodes = hasCoupons
      ? deal.bestCouponCombo.map((c) => c.code).join(" + ")
      : null;
    const isExpanded = expandedCoupons.has(`${isTracking ? "t" : "l"}-${idx}`);
    const key = getDealKey(deal);
    const cartState = cartStatus[key];
    const canCart = Boolean(deal.res_id && deal.catalogueId);

    return (
      <article
        key={key}
        className={`df-card${selectedDeal === deal ? " selected" : ""}${isTracking ? " df-card-tracking" : ""}`}
        onClick={() => handleSelectDeal(deal)}
        style={{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s`, cursor: "pointer" }}
      >
        {/* Top line */}
        <div className="df-card-topline">
          <div className="df-card-badges">
            <span className="df-badge rank">#{idx + 1}</span>
            {deal.isOrderableNow ? (
              <span className="df-badge live">Live</span>
            ) : (
              <span className="df-badge offline">Tracking</span>
            )}
            {deal.isTrendingLow && <span className="df-badge trend">Trending Low</span>}
          </div>
          <div className="df-card-price">
            <span className="df-price-current">{formatCurrency(effectivePrice)}</span>
            {deal.basePrice > effectivePrice && (
              <span className="df-price-original">{formatCurrency(deal.basePrice)}</span>
            )}
          </div>
        </div>

        {/* Restaurant & dish */}
        <h3 className="df-card-title">{deal.restaurant}</h3>
        <p className="df-card-dish">{deal.dishName}</p>

        {/* Meta */}
        <div className="df-card-meta">
          <span className="df-meta-rating">⭐ {deal.rating}</span>
          <span className="df-meta-distance">{deal.eta}</span>
          {deal.location && <span className="df-meta-location">{deal.location}</span>}
        </div>

        {/* Coupons */}
        {hasCoupons && (
          <div className="df-card-coupons">
            <button
              className="df-coupon-toggle"
              onClick={(event) => {
                event.stopPropagation();
                toggleCouponExpand(`${isTracking ? "t" : "l"}-${idx}`);
              }}
            >
              <span className="df-coupon-code">{couponCodes}</span>
              <span className="df-coupon-arrow">{isExpanded ? "▲" : "▼"}</span>
            </button>
            {isExpanded && (
              <div className="df-coupon-details">
                {deal.bestCouponCombo.map((coupon, cidx) => (
                  <div key={cidx} className="df-coupon-item">
                    <strong>{coupon.code}</strong>
                    {coupon.source === "zomato-live" && <span className="df-coupon-live-tag"> ✓ Your Zomato coupon</span>}
                    : {coupon.description} — saves {formatCurrency(coupon.savings)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="df-card-actions">
          <button
            type="button"
            className="df-order-btn"
            onClick={(e) => { e.stopPropagation(); handleSelectDeal(deal); }}
          >
            View details
          </button>
          {canCart ? (
            <button
              type="button"
              className={`df-order-btn${cartState === "done" ? " df-btn-success" : cartState === "error" ? " df-btn-error" : ""}`}
              disabled={cartState === "loading"}
              onClick={(e) => handleAddToCart(deal, e)}
            >
              {cartState === "loading" ? "Adding..." : cartState === "done" ? "✓ Added!" : cartState === "error" ? "Retry" : "Add to Cart"}
            </button>
          ) : deal.orderUrl ? (
            <button
              type="button"
              className="df-copy-btn"
              onClick={(event) => {
                event.stopPropagation();
                window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Order Now →
            </button>
          ) : (
            <span className="df-order-unavailable">Ordering unavailable</span>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="dish-finder-page">
      <div className="dish-finder-shell">
        {/* Nav */}
        <nav className="df-nav">
          <div>
            <p className="df-nav-eyebrow">Price finder</p>
            <h1>Dish Finder</h1>
          </div>
          <button onClick={() => navigate("/")}>Home</button>
        </nav>

        {/* Hero */}
        <section className="df-hero">
          <h2>Find the Cheapest Dish Near You</h2>
          <p>
            Enter a dish name and budget. We search across Zomato restaurants,
            apply your available coupons automatically, and show the lowest price first.
          </p>
        </section>

        {/* Search Card */}
        <div className="df-search-card">
          <div className="df-form">
            <div className="df-input-row">
              <div className="df-input-group df-autocomplete-wrapper" ref={acRef}>
                <label>Dish Name</label>
                <input
                  type="text"
                  placeholder="e.g. Biryani, Pizza, Momos..."
                  value={dish}
                  onChange={(e) => {
                    setDish(e.target.value);
                    setShowAutocomplete(true);
                  }}
                  onFocus={() => setShowAutocomplete(true)}
                  onKeyDown={handleKeyDown}
                  id="dish-finder-input"
                />
                {showAutocomplete && filteredDishes.length > 0 && (
                  <div className="df-autocomplete-list">
                    {filteredDishes.map((d) => (
                      <div
                        key={d}
                        className="df-autocomplete-item"
                        onClick={() => {
                          setDish(d);
                          setShowAutocomplete(false);
                        }}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="df-input-group">
                <label>Budget (optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 300"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="0"
                  id="dish-finder-budget"
                />
              </div>
            </div>

            {/* Location */}
            <div
              className={`df-location-row${
                editingLocation ? " is-editing" : ""
              }${locationStatus === "manual" ? " is-manual" : ""}`}
            >
              <span
                className={`df-gps-dot ${
                  locationStatus === "detecting" ? "detecting" :
                  locationStatus === "fallback" ? "error" : ""
                }`}
              />
              {editingLocation ? (
                <>
                  <input
                    type="text"
                    className="df-location-input"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLocationSave()}
                    placeholder="Enter city, neighbourhood..."
                    autoFocus
                  />
                  <button className="df-location-edit-btn" onClick={handleLocationSave}>
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span className="df-location-text">
                    {locationStatus === "manual" && <span className="df-manual-tag">Manual · </span>}
                    <strong>{locationLabel}</strong>
                  </span>
                  <button
                    className="df-location-edit-btn"
                    onClick={() => {
                      setLocationInput(location);
                      setEditingLocation(true);
                    }}
                  >
                    Change
                  </button>
                </>
              )}
            </div>

            <button
              className="df-search-btn"
              onClick={() => { setShowAutocomplete(false); handleSearch(); }}
              disabled={!dish.trim() || loading}
              id="dish-finder-search-btn"
            >
              {loading ? "Searching..." : "Search Lowest Prices"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="df-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="df-skeleton-card" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && searched && results.length > 0 && (
          <>
            <div className="df-results-header">
              <h3>{results.length} restaurants found</h3>
              <div className="df-results-meta">
                {meta?.bestPrice != null && (
                  <span>Best price: <strong>{formatCurrency(meta.bestPrice)}</strong></span>
                )}
                {meta?.bestCoupon && (
                  <span>Best coupon: <strong>{meta.bestCoupon}</strong></span>
                )}
                <span>Live: <strong>{meta?.liveNowCount ?? 0}</strong></span>
                <span>Location: <strong>{locationLabel}</strong></span>
              </div>
            </div>

            {selectedDeal ? (
              <section className="df-detail-panel">
                <div className="df-detail-header">
                  <div>
                    <span className="df-detail-tag">{selectedDeal.isOrderableNow ? "Live offer detail" : "Tracking deal"}</span>
                    <h3>{selectedDeal.dishName || selectedDeal.cuisine || "Selected offer"}</h3>
                    <p className="df-detail-subtitle">
                      {selectedDeal.restaurant} · {selectedDeal.location || location}
                    </p>
                  </div>
                  <div className="df-detail-price-block">
                    <span className="df-price-current">
                      {formatCurrency(selectedDeal.couponAdjustedPrice || selectedDeal.finalPrice)}
                    </span>
                    {selectedDeal.basePrice > (selectedDeal.couponAdjustedPrice || selectedDeal.finalPrice) && (
                      <span className="df-price-original">
                        {formatCurrency(selectedDeal.basePrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="df-detail-meta">
                  <span>Rating: <strong>{selectedDeal.rating || "--"}</strong></span>
                  <span>ETA: <strong>{selectedDeal.eta || "--"}</strong></span>
                  <span style={{ color: selectedDeal.isOrderableNow ? "#22c55e" : "#94a3b8" }}>
                    {selectedDeal.isOrderableNow ? "Orderable now" : "Tracking only"}
                  </span>
                </div>

                <div className="df-detail-body">
                  {selectedDeal.offerText ? (
                    <p className="df-detail-description">{selectedDeal.offerText}</p>
                  ) : (
                    <p className="df-detail-description">
                      {selectedDeal.isOrderableNow
                        ? "Live Zomato deal, checked for current availability and coupons."
                        : "This deal is currently being tracked. Price shown is live market estimate."}
                    </p>
                  )}

                  {selectedDeal.bestCouponCombo?.length ? (
                    <div className="df-detail-coupons">
                      <h4>Best coupon combo</h4>
                      <p>{selectedDeal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")}</p>
                      <ul>
                        {selectedDeal.bestCouponCombo.map((coupon, cidx) => (
                          <li key={cidx}>
                            {coupon.code}
                            {coupon.source === "zomato-live" && " ✓ Your Zomato coupon"}
                            : {coupon.description} — saves {formatCurrency(coupon.savings)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="df-detail-coupons muted">
                      No coupon matched this deal for your account.
                    </div>
                  )}

                  {/* Cross-deal combo tip: not applicable for a single dish — only surfaced in Best Picks */}
                </div>

                <div className="df-detail-actions">
                  {selectedDeal.isOrderableNow ? (
                    <>
                      {selectedDeal.orderUrl && (
                        <button
                          className="df-order-btn"
                          onClick={() => window.open(selectedDeal.orderUrl, "_blank", "noopener,noreferrer")}
                        >
                          Open in Zomato
                        </button>
                      )}
                      {selectedDeal.res_id && selectedDeal.catalogueId ? (
                        <button
                          className="df-order-btn"
                          disabled={cartStatus[getDealKey(selectedDeal)] === "loading"}
                          onClick={(e) => handleAddToCart(selectedDeal, e)}
                        >
                          {cartStatus[getDealKey(selectedDeal)] === "loading"
                            ? "Adding..."
                            : cartStatus[getDealKey(selectedDeal)] === "done"
                            ? "✓ Added to Cart!"
                            : "Add to Cart (Auto-coupon)"}
                        </button>
                      ) : !selectedDeal.orderUrl ? (
                        <span className="df-order-unavailable">
                          Search &ldquo;{selectedDeal.restaurant}&rdquo; on Zomato app
                        </span>
                      ) : (
                        <span className="df-order-unavailable">
                          Direct cart unavailable — use Open in Zomato above
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="df-order-unavailable">
                      This deal is tracking only — not orderable right now.
                    </span>
                  )}
                </div>
              </section>
            ) : null}

            {locationWarning ? (
              <div className="df-location-warning">{locationWarning}</div>
            ) : null}

            {/* Live / Orderable Deals */}
            {liveDeals.length > 0 && (
              <>
                <div className="df-section-label">
                  <span className="df-badge live">🟢 Live & Orderable Now</span>
                  <small>{liveDeals.length} deals ready to order</small>
                </div>
                <div className="df-results-grid">
                  {liveDeals.map((deal, idx) => renderDealCard(deal, idx, false))}
                </div>
              </>
            )}

            {/* Tracking-only deals */}
            {trackingDeals.length > 0 && (
              <>
                <div className="df-section-label df-section-label-muted">
                  <span className="df-badge offline">⚪ Also Tracking</span>
                  <small>{trackingDeals.length} deals being monitored</small>
                </div>
                <div className="df-results-grid">
                  {trackingDeals.map((deal, idx) => renderDealCard(deal, idx, true))}
                </div>
              </>
            )}
          </>
        )}

        {/* No Results */}
        {!loading && searched && results.length === 0 && (
          <div className="df-empty">
            <h3>No results found</h3>
            <p>
              Try a different dish name, increase your budget, or change the location.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

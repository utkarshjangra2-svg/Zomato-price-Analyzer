import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./Price.css";
import { saveOrderToHistory } from "./utils/orderHistory";
import { buildApiUrl, parseJsonResponse } from "./utils/api";
import { buildAuthHeaders, buildUserPayload } from "./utils/userProfile";
import { getSourceStatus } from "./utils/sourceStatus";
import { getManualLocationOverride, saveManualLocationOverride } from "./utils/location";

const sourceLabels = {
  mcp: "Zomato MCP Live",
  "mcp-simulated": "MCP Simulated Live",
  "mcp-fallback": "MCP Connected, Fallback Data",
  "zomato-web": "Zomato Web Live",
  "mongo-cache": "Mongo Deals Cache",
  "recent-cache": "Recently Verified Deals",
  "smart-fallback": "Smart Fallback Picks",
  fallback: "Smart Fallback",
  unavailable: "No Verified Live Deals"
};

const formatCurrency = (value) => `Rs${Math.round(value ?? 0)}`;
const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "--";

export default function PriceTrack() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [budget, setBudget] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState([]);
  const [deals, setDeals] = useState([]);
  const [selectedFocus, setSelectedFocus] = useState(null);
  const [locationTitle, setLocationTitle] = useState("Locating your address");
  const [source, setSource] = useState("fallback");

  const handleSelectFocus = (deal) => {
    const value = deal.dishName || deal.cuisine || deal.restaurant;
    const type = deal.dishName ? "dish" : "cuisine";

    setSelectedFocus({
      type,
      value,
      label: deal.dishName ? `Dish: ${deal.dishName}` : `Cuisine: ${deal.cuisine}`,
      basePrice: deal.finalPrice
    });
  };

  const handleAddToCart = async (deal) => {
    if (deal.res_id && deal.catalogueId) {
      // Native cart addition
      try {
        const res = await fetch(buildApiUrl("/api/orders/add-to-cart"), {
          method: "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ deal })
        });

        const data = await res.json();

        if (res.ok) {
          alert("Added to cart successfully!");
        } else {
          alert(`Failed to add to cart: ${data.msg}`);
        }
      } catch (error) {
        alert(`Error adding to cart: ${error.message}`);
      }
    } else if (deal.orderUrl) {
      // Fallback: open in Zomato
      window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("This deal cannot be added to cart or opened.");
    }
  };
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const sourceStatus = getSourceStatus(source, diagnostics);
  const activeLocationLabel = lastQuery?.location || location || locationTitle;

  useEffect(() => {
    const manualLocation = getManualLocationOverride();
    if (manualLocation?.query) {
      setLocation(manualLocation.query);
      setLocationTitle(manualLocation.title || manualLocation.query);
    }

    const saved = localStorage.getItem("priceTrackPreferences");
    if (saved) {
      try {
        const { location: savedLoc, cuisine: savedCuisine, budget: savedBudget } = JSON.parse(saved);
        if (savedLoc) setLocation(savedLoc);
        if (savedCuisine) setCuisine(savedCuisine);
        if (savedBudget) setBudget(savedBudget);
        if (savedLoc && savedCuisine && savedBudget) {
          runSearch({ location: savedLoc, cuisine: savedCuisine, budget: savedBudget }, { silent: true });
        }
      } catch (e) {
        console.warn("Invalid saved pricing preferences", e);
      }
    }

    if (!navigator.geolocation) {
      setLocationTitle("Location unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationTitle("Location unavailable");
      }
    );
  }, []);

  const fetchLocation = async (lat, lon) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await parseJsonResponse(res);
      const address = data.address || {};

      const compactTitle = [
        address.suburb || address.neighbourhood || address.road,
        address.city || address.town || address.village
      ]
        .filter(Boolean)
        .join(", ");

      const resolvedLocation = compactTitle || data.display_name || "Unknown";
      setLocationTitle(compactTitle || address.state_district || address.state || "Current location");
      setLocation((prev) => prev ? prev : resolvedLocation);
    } catch {
      setLocationTitle("Location unavailable");
    }
  };

  const runSearch = async ({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget }, options = {}) => {
    const { silent = false } = options;

    if (!queryCuisine || !queryBudget || !queryLocation) {
      setError("Please fill location, dish, and budget.");
      return;
    }

    const budgetValue = Number(queryBudget);
    if (Number.isNaN(budgetValue) || budgetValue <= 0) {
      setError("Budget must be a valid number above 0.");
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const res = await fetch(buildApiUrl("/api/deals/search"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          location: queryLocation,
          cuisine: queryCuisine,
          budget: queryBudget,
          user: buildUserPayload()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.msg || "Unable to fetch deals");
      }

      setResults(data.deals || []);
      setStats(data.stats || []);
      setDeals(data.recentDeals || []);
      setInsights(data.insights || []);
      setSource(data.source || "fallback");
      setMeta(data.meta || null);
      setDiagnostics(data.diagnostics || null);
      setLastQuery({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget });
      saveManualLocationOverride(queryLocation);
      localStorage.setItem(
        "priceTrackPreferences",
        JSON.stringify({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget })
      );
    } catch (requestError) {
      setResults([]);
      setStats([]);
      setDeals([]);
      setInsights([]);
      setSource("fallback");
      setMeta(null);
      setDiagnostics(null);
      setError(requestError.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await runSearch({ location, cuisine, budget });
  };

  useEffect(() => {
    if (!lastQuery) {
      return undefined;
    }

    const interval = setInterval(() => {
      runSearch(lastQuery, { silent: true });
    }, 30000);

    return () => clearInterval(interval);
  }, [lastQuery]);

  const filteredResults = useMemo(() => {
    if (!selectedFocus) return results;
    return results.filter((deal) => {
      const targetValue = selectedFocus.type === "dish" ? deal.dishName : deal.cuisine;
      return targetValue === selectedFocus.value;
    });
  }, [results, selectedFocus]);

  const selectedTrendData = useMemo(() => {
    if (!selectedFocus) return null;
    const basePrice = Number(selectedFocus.basePrice) || 320;
    const pointCount = 7;

    return Array.from({ length: pointCount }, (_, idx) => {
      const date = new Date();
      date.setDate(date.getDate() - (pointCount - 1 - idx));
      const variance = Math.round(Math.sin((idx / pointCount) * Math.PI * 2) * 12 + idx * 4);
      const price = Math.max(basePrice + variance, 50);

      return {
        label: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        price
      };
    });
  }, [selectedFocus]);

  const chartData = useMemo(() => {
    if (selectedTrendData) return selectedTrendData;
    return filteredResults.map((deal) => ({
      restaurant: deal.restaurant.length > 14 ? `${deal.restaurant.slice(0, 14)}...` : deal.restaurant,
      finalPrice: deal.finalPrice,
      predictedPrice: deal.predictedPrice
    }));
  }, [filteredResults, selectedTrendData]);

  const chartDataKey = selectedTrendData ? "price" : "finalPrice";

  return (
    <div className="price-page">
      {/* MASSIVE AESTHETIC TOP HERO OVERLAY */}
      <div className="price-header-banner">
        <div className="price-header-container">
          <nav className="price-nav-glass">
            <div>
              <p className="eyebrow">SmartDeal Intelligence</p>
              <h2>Price Optimizer Pro</h2>
            </div>
            <div className="nav-actions">
              <span className="status-chip">{sourceLabels[source] || "Live Feed"}</span>
              <span className="status-chip subtle">Updated {formatLiveTimestamp(meta?.fetchedAt)}</span>
              {lastQuery ? (
                <button type="button" className="refresh-btn-glass" onClick={() => runSearch(lastQuery)}>
                  Refresh
                </button>
              ) : null}
              <button className="home-btn-glass" onClick={() => navigate("/")}>Home</button>
            </div>
          </nav>

          <div className="price-hero-content">
            <h1>Find your perfect food deal,<br />elegantly.</h1>
            <p className="hero-subtext">
              Real-time location-aware intelligence tracking precise Zomato prices.
            </p>

            <form className="aesthetic-search-panel" onSubmit={handleSearch}>
              <div className="aesthetic-input-group">
                <label>Target Dish / Cuisine</label>
                <input
                  type="text"
                  placeholder="e.g. Veg Biryani, Pizza..."
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                />
              </div>
              <div className="aesthetic-input-group">
                <label>Budget (Rs)</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="aesthetic-input-group">
                <label>Location</label>
                <input
                  type="text"
                  placeholder={locationTitle}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <button className="elegant-search-btn" type="submit">
                {loading ? "Searching..." : "Track Deals"}
              </button>
            </form>

            {error && <p className="error-banner">{error}</p>}
          </div>
        </div>
      </div>

      <div className="price-shell-main">
        {/* SPLIT LAYOUT ORIENTATION */}
        <section className="price-split-grid">
          {/* MAIN COLUMN (LEFT): DEALS */}
          <div className="main-column-grid">
            <div className="section-header-row">
              <div className="header-titles">
                <p className="eyebrow-accent">Ranked live results</p>
                <h2>{filteredResults.length ? `Verified offers near ${activeLocationLabel}` : "MCP and direct live fetch are currently unavailable, so no fresh deals could be loaded."}</h2>
                {selectedFocus ? (
                  <div className="selected-focus-banner">
                    Showing deals for <strong>{selectedFocus.label}</strong>. <button type="button" className="clear-selection-btn" onClick={() => setSelectedFocus(null)}>Clear filter</button>
                  </div>
                ) : (
                  <p className="selected-focus-hint">Click any deal card to focus the chart on that dish or cuisine.</p>
                )}
              </div>
              <div className="source-tone-badge">
                <span className={`status-dot ${sourceStatus.tone}`}></span>
                <span className="tone-label">{sourceStatus.message}</span>
              </div>
            </div>

            <div className="elegant-results-list">
              {filteredResults.map((deal, index) => (
                <article key={`${deal.restaurant}-${index}`} className="elegant-deal-card" onClick={() => handleSelectFocus(deal)}>
                  <div className="elegant-deal-image-wrap">
                    <img src={deal.imageUrl} alt={deal.restaurant} className="elegant-deal-image" />
                    <span className="deal-rank-glass">#{index + 1}</span>
                    <span className="deal-rating-glass">{deal.rating} ⭐</span>
                  </div>

                  <div className="elegant-deal-body">
                    <div className="elegant-title-row">
                      <div className="deal-title-main">
                        <h3>{deal.restaurant}</h3>
                        {deal.dishName ? (
                          <strong className="elegant-dish-name">{deal.dishName}</strong>
                        ) : deal.cuisine ? (
                          <strong className="elegant-dish-name">{deal.cuisine}</strong>
                        ) : null}
                      </div>
                      <span className="elegant-confidence-chip">{deal.confidence}% Machine Confidence</span>
                    </div>

                    <div className="elegant-price-banner">
                      <div className="price-stack">
                        <span className="elegant-old-price">{formatCurrency(deal.originalPrice)}</span>
                        <span className="elegant-new-price">{formatCurrency(deal.finalPrice)}</span>
                      </div>
                      {deal.couponAdjustedPrice < deal.finalPrice ? (
                        <div className="coupon-price-badge">
                          Drops to {formatCurrency(deal.couponAdjustedPrice)} at checkout
                        </div>
                      ) : null}
                    </div>

                    <div className="elegant-deal-tags">
                      <span>{deal.discount}% Store Discount</span>
                      <span>Market Avg: {formatCurrency(deal.predictedPrice)}</span>
                      {deal.eta ? <span>Delivers ~{deal.eta}</span> : null}
                    </div>

                    <p className="elegant-deal-analysis">{deal.analysis}</p>
                    
                    {deal.bestCouponCombo?.length ? (
                      <div className="elegant-coupon-card">
                        <p className="coupon-card-title">Secret Weapon Detected</p>
                        <div className="coupon-pill-group">
                          {deal.bestCouponCombo.map((coupon) => (
                            <span key={`${deal.restaurant}-${coupon.code}`} className="elegant-coupon-pill">
                              <span className="code">{coupon.code}</span> (Save {formatCurrency(coupon.savings)})
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="elegant-deal-footer">
                      <span className={deal.isOrderableNow ? "elegant-live-badge success" : "elegant-live-badge muted"}>
                        {deal.isOrderableNow ? "Ready to Order" : "Analysis Benchmark"}
                      </span>
                      {deal.isOrderableNow && deal.orderUrl ? (
                         <button
                         className="elegant-order-btn"
                         onClick={(e) => {
                           e.stopPropagation();
                           handleAddToCart(deal);
                         }}
                       >
                         {deal.res_id && deal.catalogueId ? "Add to Cart" : "Order Now"}
                       </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* SIDEBAR COLUMN (RIGHT): PRICE HISTORY CURVE */}
          <aside className="right-sidebar">
            <section className="elegant-sidebar-panel">
              <p className="eyebrow-accent">Price History</p>
              <h3 className="sidebar-panel-title">
                {selectedFocus ? `Trend for ${selectedFocus.label}` : "Current deals price curve"}
              </h3>
              <div className="elegant-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorCurve" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey={selectedTrendData ? "label" : "restaurant"} stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{fontSize: 10}} />
                    <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{fontSize: 10}} />
                    <Tooltip cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-md)' }} />
                    <Area type="monotone" dataKey={chartDataKey} stroke="var(--primary)" fill="url(#colorCurve)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </aside>
        </section>
      </div>

      {loading && (
        <div className="elegant-loading-overlay">
          <div className="elegant-loading-card">
            <div className="elegant-spinner"></div>
            <p>Interfacing with Zomato systems...</p>
          </div>
        </div>
      )}
    </div>
  );
}

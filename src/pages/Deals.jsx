import { useEffect, useState } from "react";
import axios from "axios";
import "./Deals.css";
import { buildApiUrl } from "../utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "../utils/userProfile";
import { getSourceStatus } from "../utils/sourceStatus";
import { DEFAULT_LOCATION, getCachedExactLocation, getManualLocationOverride, resolveExactLocation } from "../utils/location";

const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "--";

const sourceLabels = {
  mcp: "Zomato MCP Live",
  "mcp-simulated": "MCP Simulated Live",
  "mcp-fallback": "MCP Connected, Fallback Data",
  "zomato-web": "Zomato Web Live",
  "mongo-cache": "Mongo History Cache",
  "recent-cache": "Recently Verified Deals",
  "smart-fallback": "Smart Fallback Picks",
  unavailable: "No Verified Live Deals"
};

const getEmptyStateCopy = ({ error, diagnostics }) => {
  if (error) {
    return error;
  }

  if (diagnostics?.mode === "empty") {
    return diagnostics.message || "All live sources responded, but no fresh realtime deals are available right now. The page will refresh automatically.";
  }

  if (diagnostics?.code === "EACCES") {
    return "Realtime deal fetching is currently blocked by the runtime environment. The page will keep retrying automatically.";
  }

  return "No verified live Zomato deals are available right now. The page will refresh automatically.";
};

const formatLastVerified = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : null;

export default function Deals() {
  const [deals, setDeals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [diagnostics, setDiagnostics] = useState(null);
  const [activeLocation, setActiveLocation] = useState(() => getManualLocationOverride()?.query || getCachedExactLocation()?.query || DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(() => getManualLocationOverride()?.title || getCachedExactLocation()?.title || "Detecting your area");
  const [locationHint, setLocationHint] = useState(() => getManualLocationOverride()?.fullAddress || getCachedExactLocation()?.fullAddress || "Allow location access for near-exact local deals.");
  const [manualInput, setManualInput] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [cartStatus, setCartStatus] = useState({});
  const sourceStatus = getSourceStatus(meta?.source || "unavailable", diagnostics);
  const emptyStateCopy = getEmptyStateCopy({ error, diagnostics });

  const fetchDeals = async (locationOverride = activeLocation) => {
    try {
      setRefreshing(true);
      const locationQuery = encodeURIComponent(locationOverride || DEFAULT_LOCATION);
      const res = await axios.get(buildApiUrl(`/api/deals?location=${locationQuery}&limit=24${buildUserQueryParams()}`), {
        headers: buildAuthHeaders()
      });
      setDeals(res.data.deals || []);
      setMeta(res.data.meta || null);
      setDiagnostics(res.data.diagnostics || null);
      setError("");
    } catch (requestError) {
      setDeals([]);
      setMeta(null);
      setDiagnostics(null);
      setError(requestError.response?.data?.msg || requestError.message);
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
        setLocationLabel(exactLocation.title || "Current location");
        setLocationHint(exactLocation.fullAddress || exactLocation.query || DEFAULT_LOCATION);
        fetchDeals(exactLocation.query || DEFAULT_LOCATION);
      } catch (error) {
        console.error("Location resolution failed:", error);
        if (cancelled) {
          return;
        }

        setActiveLocation(DEFAULT_LOCATION);
        setLocationLabel("Location access unavailable");
        setLocationHint("Using Delhi until live location permission is available.");
        fetchDeals(DEFAULT_LOCATION);
      }
    };

    bootstrapLocation();

  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDeals(activeLocation);
    }, 10000);

    return () => clearInterval(interval);
  }, [activeLocation]);

  useEffect(() => {
    setVisibleCount(12);
  }, [deals.length]);

  const handleAddToCart = async (deal, e) => {
    if (e) e.stopPropagation();
    if (!deal?.res_id || !deal?.catalogueId) {
      if (deal?.orderUrl) {
        window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
        return;
      }
      alert("This deal cannot be added to cart directly.");
      return;
    }
    const key = `${deal.restaurant}-${deal.dishName}-${deal.res_id}`;
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
      alert(`Failed: ${err.message}`);
      setTimeout(() => setCartStatus((prev) => ({ ...prev, [key]: null })), 3000);
    }
  };

  const handleLocationSave = async () => {
    if (!manualInput.trim()) return;
    const loc = manualInput.trim();
    const { saveManualLocationOverride: saveLoc } = await import("../utils/location");
    await saveLoc(loc);
    setActiveLocation(loc);
    setLocationLabel(loc);
    setLocationHint(`Manual: ${loc}`);
    setEditingLocation(false);
    fetchDeals(loc);
  };

  return (
    <div className="deals-page">
      <div className="deals-shell">
        <section className="deals-hero">
          <div className="deals-header">
            <div>
              <p className="deals-eyebrow">Realtime feed</p>
              <h1>Live Deal Stream</h1>
              <p>Fresh restaurant picks ranked by current pricing intelligence, discount strength, and delivery-ready signals.</p>
              <div className="deals-location-chip">
                  <strong>{locationLabel}</strong>
                  <span>{locationHint}</span>
                  {editingLocation ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLocationSave()}
                        placeholder="Enter city or area..."
                        style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" }}
                        autoFocus
                      />
                      <button type="button" onClick={handleLocationSave} style={{ padding: "6px 12px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
                      <button type="button" onClick={() => setEditingLocation(false)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--surface-secondary)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setManualInput(activeLocation); setEditingLocation(true); }} style={{ marginTop: 4, padding: "4px 10px", fontSize: "0.72rem", borderRadius: 6, background: "rgba(123,110,246,0.12)", border: "1px solid rgba(123,110,246,0.22)", color: "#7b6ef6", cursor: "pointer" }}>Change location</button>
                  )}
                </div>
            </div>
            <div className="deals-actions">
              <button type="button" className="refresh-btn" onClick={() => fetchDeals(activeLocation)}>
                {refreshing ? "Refreshing..." : "Refresh Now"}
              </button>
              <span className="live-pill">Refreshes every 10s</span>
            </div>
          </div>

          <div className="deals-stats">
            <article className="deals-stat-card">
              <span>Live now</span>
              <strong>{meta?.liveNowCount ?? 0}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Total tracked</span>
              <strong>{meta?.totalDeals ?? 0}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Location</span>
              <strong>{meta?.location || activeLocation || DEFAULT_LOCATION}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Last sync</span>
              <strong>{formatLiveTimestamp(meta?.fetchedAt)}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Source</span>
              <strong>{sourceLabels[meta?.source || "unavailable"] || meta?.source || "Unknown"}</strong>
            </article>
          </div>
        </section>

        <section className={`source-banner ${sourceStatus.tone}`}>
          <strong>{sourceStatus.title}</strong>
          <p>{sourceStatus.message}</p>
        </section>

        {diagnostics?.mode === "stale-cache" || diagnostics?.mode === "empty" ? (
          <section className="source-detail-card">
            <strong>
              {diagnostics?.mode === "stale-cache"
                ? "Live fetch was empty, so recently verified results are being shown."
                : "Live fetch completed, but no deals could be verified this time."}
            </strong>
            <p>{diagnostics?.message}</p>
            {diagnostics?.lastVerifiedAt ? (
              <span>
                Last verified {formatLastVerified(diagnostics.lastVerifiedAt)}
                {diagnostics?.upstreamSource ? ` via ${diagnostics.upstreamSource}` : ""}
              </span>
            ) : (
              <span>This usually means the current fetch pipeline could not match or verify listings, not that the food app has zero offers.</span>
            )}
          </section>
        ) : null}

        {diagnostics?.mode === "smart-fallback" ? (
          <section className="source-detail-card">
            <strong>Estimated picks are being shown because the current live fetch returned nothing usable.</strong>
            <p>{diagnostics?.message}</p>
            <span>These are not claimed as live Zomato deals. They are a free fallback so the page never goes blank.</span>
          </section>
        ) : null}

        {deals.length ? (
          <div className="deals-grid">
            {deals.slice(0, visibleCount).map((deal, i) => (
              <article className="deal-card" key={i}>
                <div className="deal-visual">
                  <img
                    src={deal.imageUrl}
                    alt={deal.restaurant}
                    className="deal-thumb"
                  />
                  <span className="discount">{deal.discount}% OFF</span>
                </div>
                <div className="deal-content">
                  <div className="deal-topline">
                    <span>{deal.isOrderableNow ? "Live order" : "Tracking only"}</span>
                    <span>{deal.confidence}% confidence</span>
                  </div>
                  <h3>{deal.restaurant}</h3>
                  <p className="deal-meta">Rating: {deal.rating} • {deal.location}</p>
                  <p className="deal-copy">{deal.analysis || "Live price opportunity available now."}</p>
                  <div className="deal-price">
                    <span className="new">Rs{deal.couponAdjustedPrice || deal.finalPrice}</span>
                    {deal.originalPrice ? <span className="old">Rs{deal.originalPrice}</span> : null}
                  </div>
                  <div className="deal-tags">
                    {deal.bestCouponCombo?.length ? <span>{deal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")}</span> : null}
                    <span>{deal.eta || "Fast delivery"}</span>
                    <span>{deal.isOrderableNow ? "Order-ready" : "Monitor"}</span>
                  </div>
                  {deal.isOrderableNow && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      {deal.orderUrl && (
                        <button
                          type="button"
                          className="refresh-btn"
                          style={{ flex: 1, padding: "8px 12px", fontSize: "0.8rem" }}
                          onClick={() => window.open(deal.orderUrl, "_blank", "noopener,noreferrer")}
                        >
                          Order Now
                        </button>
                      )}
                      <button
                        type="button"
                        className="refresh-btn"
                        style={{
                          flex: 1, padding: "8px 12px", fontSize: "0.8rem",
                          background: cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "done" ? "#22c55e" :
                           cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "error" ? "#ef4444" : undefined
                        }}
                        disabled={cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "loading"}
                        onClick={(e) => handleAddToCart(deal, e)}
                      >
                        {cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "loading" ? "Adding..." :
                         cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "done" ? "✓ Added!" :
                         "Add to Cart"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">{emptyStateCopy}</div>
        )}

        {deals.length > visibleCount ? (
          <div className="deals-more-wrap">
            <button type="button" className="refresh-btn deals-more-btn" onClick={() => setVisibleCount((count) => count + 12)}>
              Show More Deals
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

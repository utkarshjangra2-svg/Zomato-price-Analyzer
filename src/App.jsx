import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { FaMoon, FaSun } from "react-icons/fa";
import "./App.css";
import SignIn from "./SignIn/SignIn";
import ResetPassword from "./SignIn/ResetPassword";
import PriceTrack from "./PriceTrack";
import AboutUs from "./pages/AboutUs";
import Recommendations from "./pages/Recommendations";
import OrderHistory from "./pages/OrderHistory";
import DishFinder from "./pages/DishFinder";
import { saveOrderToHistory } from "./utils/orderHistory";
import { buildApiUrl, parseJsonResponse } from "./utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "./utils/userProfile";
import { DEFAULT_LOCATION, getCachedExactLocation, getManualLocationOverride, resolveExactLocation } from "./utils/location";

const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "Waiting for live sync";

function App() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? "app dark" : "app"}>
      <Routes>
        <Route path="/" element={<HomePage dark={dark} setDark={setDark} />} />
        <Route path="/signin" element={<SignIn dark={dark} />} />
        <Route path="/reset/:token" element={<ResetPassword dark={dark} />} />
        <Route path="/PriceTrack" element={<PriceTrack />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/history" element={<OrderHistory />} />
        <Route path="/dish-finder" element={<DishFinder />} />
      </Routes>
    </div>
  );
}

function HomePage({ dark, setDark }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMeta, setRecommendationMeta] = useState(null);
  const [activeLocation, setActiveLocation] = useState(() => getManualLocationOverride()?.query || getCachedExactLocation()?.query || DEFAULT_LOCATION);
  const [locationStatus, setLocationStatus] = useState(() => getManualLocationOverride()?.title || getCachedExactLocation()?.title || `Tracking ${DEFAULT_LOCATION} now`);
  const storedUser = localStorage.getItem("user");
  const user = useMemo(() => {
    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch {
      return null;
    }
  }, [storedUser]);
  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase();
  const heroDeal = recommendations[0];
  const platformStats = [
    {
      label: "Live order links",
      value: `${recommendationMeta?.liveNowCount ?? 0}+`,
      detail: "Verified in the latest backend sync"
    },
    {
      label: "Data refresh",
      value: "30s",
      detail: `Last update ${formatLiveTimestamp(recommendationMeta?.fetchedAt)}`
    },
    {
      label: "Decision engine",
      value: "AI",
      detail: "Ranks by price, confidence, ratings, and readiness"
    }
  ];
  const featureCards = [
    {
      eyebrow: "PriceTrack",
      title: "Watch price movement before you order",
      copy: "Search a cuisine, compare live offers, and see which restaurant is actually the best deal right now.",
      action: "Open PriceTrack",
      onClick: () => navigate("/PriceTrack")
    },
    {
      eyebrow: "Live Feed",
      title: "See a realtime pulse of market offers",
      copy: "Monitor active discounts, delivery readiness, and confidence-rich picks without manually checking every listing.",
      action: "Learn About Us",
      onClick: () => navigate("/about")
    },
    {
      eyebrow: "Best Picks",
      title: "Get curated recommendations, not noise",
      copy: "Surface a smaller set of high-signal options ranked for value, quality, and ordering confidence.",
      action: "Explore Picks",
      onClick: () => navigate("/recommendations")
    }
  ];

  useEffect(() => {
    const fetchRecommendations = async (locationOverride = activeLocation) => {
      try {
        const locationQuery = encodeURIComponent(locationOverride || DEFAULT_LOCATION);
        const res = await fetch(buildApiUrl(`/api/deals/recommendations?location=${locationQuery}&limit=12${buildUserQueryParams()}`), {
          headers: buildAuthHeaders()
        });
        const data = await parseJsonResponse(res);
        setRecommendations(data.deals || []);
        setRecommendationMeta(data.meta || null);
      } catch {
        setRecommendations([]);
        setRecommendationMeta(null);
      }
    };

    let cancelled = false;

    const bootstrapLocation = async () => {
      try {
        const exactLocation = await resolveExactLocation();

        if (cancelled) {
          return;
        }

        setActiveLocation(exactLocation.query || DEFAULT_LOCATION);
        setLocationStatus(exactLocation.title || "Current location");
        fetchRecommendations(exactLocation.query || DEFAULT_LOCATION);
      } catch {
        if (cancelled) {
          return;
        }

        setActiveLocation(DEFAULT_LOCATION);
        setLocationStatus(`Tracking ${DEFAULT_LOCATION} now`);
        fetchRecommendations(DEFAULT_LOCATION);
      }
    };

    bootstrapLocation();

  }, []);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const locationQuery = encodeURIComponent(activeLocation || DEFAULT_LOCATION);
        const res = await fetch(buildApiUrl(`/api/deals/recommendations?location=${locationQuery}&limit=12${buildUserQueryParams()}`), {
          headers: buildAuthHeaders()
        });
        const data = await parseJsonResponse(res);
        setRecommendations(data.deals || []);
        setRecommendationMeta(data.meta || null);
      } catch {
        setRecommendations([]);
        setRecommendationMeta(null);
      }
    };

    const interval = setInterval(fetchRecommendations, 30000);

    return () => clearInterval(interval);
  }, [activeLocation]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setMenuOpen(false);
    navigate("/signin");
  };

  const handleSwitchAccount = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setMenuOpen(false);
    navigate("/signin");
  };

  return (
    <>
      <header className="header">
        <div className="brand-lockup">
          <span className="brand-badge">SD</span>
          <div>
            <h1 className="logo">SmartDeal</h1>
            <p className="brand-subtitle">Food deals, live and simple</p>
          </div>
        </div>
        <nav className="header-nav">
          <button onClick={() => navigate("/dish-finder")}>Dish Finder</button>
          <button onClick={() => navigate("/PriceTrack")}>PriceTrack</button>
          <button onClick={() => navigate("/about")}>About Us</button>
          <button onClick={() => navigate("/recommendations")}>Best Picks</button>
        </nav>
        <div className="header-right">
          <button className="toggle-btn" onClick={() => setDark(!dark)}>
            {dark ? <FaSun /> : <FaMoon />}
          </button>
          {userInitial ? (
            <div className="user-menu">
              <button
                className="google-btn user-badge"
                onClick={() => setMenuOpen((open) => !open)}
                title={user.name}
              >
                {userInitial}
              </button>

              {menuOpen ? (
                <div className="user-menu-panel">
                  <p className="user-menu-name">{user.name}</p>
                  <button className="user-menu-action" onClick={handleSwitchAccount}>
                    Switch Account
                  </button>
                  <button className="user-menu-action" onClick={() => { setMenuOpen(false); navigate("/history"); }}>
                    Order History
                  </button>
                  <button className="user-menu-action user-menu-danger" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              className="google-btn"
              onClick={() => navigate("/signin")}
              title="Sign In"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <section className="elegant-home-hero">
        <div className="elegant-hero-content">
          <div className="elegant-hero-badge">
            <span className="live-dot"></span> LIVE DEAL INTELLIGENCE
          </div>
          <h1>Find the <span className="hero-highlight">smartest</span><br />food deals in {activeLocation === 'ALL' ? 'your city' : locationStatus.split(',')[0]}</h1>
          <p>
            AI-powered real-time price comparison across top platforms. 
            Compare discounts, track prices, and never overpay again.
          </p>
          <div className="elegant-hero-actions">
            <button className="primary-hero-btn" onClick={() => navigate("/PriceTrack")}>
              Explore Deals
            </button>
            <button className="secondary-hero-btn" onClick={() => navigate("/signin")}>
              {user ? "View Account" : "Create Account"}
            </button>
          </div>
          <div className="elegant-hero-stats">
            <div className="hero-stat-block">
              <strong>{recommendationMeta?.liveNowCount || "12+"}</strong>
              <span>LIVE DEALS</span>
            </div>
            <div className="hero-stat-block">
              <strong>5+</strong>
              <span>PLATFORMS</span>
            </div>
            <div className="hero-stat-block">
              <strong>15+</strong>
              <span>CITIES</span>
            </div>
          </div>
        </div>
        
        <div className="elegant-hero-image-pane"></div>
      </section>

      <section className="story-band">
        <div className="story-intro">
          <p className="section-tag">Why it feels premium</p>
          <h3>The homepage should sell clarity, speed, and confidence in the first screen.</h3>
        </div>
        <div className="story-rail">
          {featureCards.map((card) => (
            <article key={card.title} className="story-card" onClick={card.onClick}>
              <span>{card.eyebrow}</span>
              <h4>{card.title}</h4>
              <p>{card.copy}</p>
              <button>{card.action}</button>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing recommendations-section">
        <div className="recommendation-section-head">
          <div>
            <p className="section-tag">Live showcase</p>
            <h2>Recommended live deals worth opening right now</h2>
            <p>
              Fresh ranking pulled from the backend with live availability, price confidence, and value scoring.
            </p>
          </div>
          <div className="recommendation-pulse-panel">
            <span className="pulse-dot"></span>
            <strong>{recommendationMeta?.liveNowCount ?? 0} live now</strong>
            <span>Updated {formatLiveTimestamp(recommendationMeta?.fetchedAt)}</span>
          </div>
        </div>
        <div className="recommendation-grid">
          {recommendations.length ? recommendations.map((deal) => (
            <article
              key={`${deal.restaurant}-${deal.finalPrice}`}
              className="recommendation-card"
              onClick={() => {
                if (deal.isOrderableNow && deal.orderUrl) {
                  saveOrderToHistory(deal, "recommendations");
                  window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
                  return;
                }

                navigate("/PriceTrack");
              }}
              style={{ cursor: "pointer" }}
            >
              <img src={deal.imageUrl} alt={deal.restaurant} className="recommendation-image" />
              <div className="recommendation-content">
                <div className="recommendation-topline">
                  <span>{deal.isOrderableNow ? "Live order" : "Watchlist"}</span>
                  {deal.isTrendingLow && <span className="rec-trending-badge">Trending Low</span>}
                  <span>{deal.confidence}% confidence</span>
                </div>
                <div className="recommendation-row">
                  <h3>{deal.restaurant}</h3>
                  <span className="recommendation-price">Rs{deal.couponAdjustedPrice || deal.finalPrice}</span>
                </div>
                <p>{deal.dishName || `${deal.cuisine} in ${deal.location}`}</p>
                <div className="recommendation-meta">
                  <span>{deal.discount}% OFF</span>
                  {deal.couponSavings ? <span className="rec-coupon-save">Save Rs{deal.couponSavings}</span> : null}
                  {deal.bestCouponCombo?.length ? (
                    <span className="rec-coupon-code">{deal.bestCouponCombo.map((c) => c.code).join(" + ")}</span>
                  ) : null}
                  <span>{deal.rating} rating</span>
                  {deal.eta ? <span>{deal.eta}</span> : null}
                </div>
              </div>
            </article>
          )) : (
            <p className="recommendation-empty">Recommended live deals will appear here when fresh listings are available.</p>
          )}
        </div>
      </section>

      <section className="workflow-section">
        <div className="workflow-head">
          <div>
            <p className="section-tag">How it works</p>
            <h2>From raw restaurant listings to a clean final decision.</h2>
          </div>
          <p>
            The experience is built to feel operational: search, compare, rank, verify, then jump directly into the best order path.
          </p>
        </div>
        <div className="workflow-grid">
          <article className="workflow-card">
            <strong>01</strong>
            <h3>Fetch</h3>
            <p>Pull live source data, offers, ratings, and orderability signals from the backend pipeline.</p>
          </article>
          <article className="workflow-card">
            <strong>02</strong>
            <h3>Rank</h3>
            <p>Score every option by price, discount strength, confidence, and real order readiness.</p>
          </article>
          <article className="workflow-card">
            <strong>03</strong>
            <h3>Act</h3>
            <p>Move into PriceTrack, Live Deals, or Best Picks depending on whether you want depth or speed.</p>
          </article>
        </div>
      </section>

      <section className="pricing cta-section">
        <div className="cta-copy">
          <p className="section-tag">Ready to order smarter?</p>
          <h2>Turn food ordering into a faster, more informed decision.</h2>
          <p>
            Use the live dashboard for deep analysis or jump straight into ranked recommendations when you just want the best option now.
          </p>
        </div>
        <div className="pricing-cards">
          <div className="price-card" style={{ cursor: "pointer" }} onClick={() => navigate("/PriceTrack")}>
            <h3>Explorer</h3><h4>Rs0</h4><p>Live comparison, search, and deal intelligence for everyday use.</p>
          </div>
          <div className="price-card highlight" style={{ cursor: "pointer" }} onClick={() => navigate("/recommendations")}>
            <h3>SmartFlow</h3><h4>Rs199</h4><p>Premium-feeling recommendation path with faster discovery and smarter ranking.</p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-brand">
          <h3>SmartDeal</h3>
          <p>Live price intelligence for faster, smarter food ordering.</p>
        </div>
        <div className="footer-links">
          <button onClick={() => navigate("/PriceTrack")}>PriceTrack</button>
          <button onClick={() => navigate("/about")}>About Us</button>
          <button onClick={() => navigate("/history")}>History</button>
          <button onClick={() => navigate("/signin")}>{user ? "Account" : "Sign In"}</button>
        </div>
        <p className="footer-copy">2026 SmartDeal. Built for better food decisions.</p>
      </footer>
    </>
  );
}

export default App;

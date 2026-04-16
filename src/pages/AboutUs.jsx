import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <div className="brand-lockup cursor-pointer" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-badge">SD</span>
          <div>
            <h1 className="logo">SmartDeal</h1>
            <p className="brand-subtitle">Food deals, live and simple</p>
          </div>
        </div>
        <nav className="header-nav">
          <button onClick={() => navigate("/dish-finder")}>Dish Finder</button>
          <button onClick={() => navigate("/PriceTrack")}>PriceTrack</button>
          <button className="active-nav">About Us</button>
          <button onClick={() => navigate("/recommendations")}>Best Picks</button>
        </nav>
      </header>

      <section className="about-hero" style={{ padding: '80px 32px', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.02em' }}>
          The Engine Behind the <span style={{ color: 'var(--primary)' }}>Smartest Prices</span>.
        </h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '40px' }}>
          Food delivery pricing is opaque, scattered, and constantly shifting. SmartDeal was built as an algorithmic intelligence layer to tear down the complexity and deliver raw, un-inflated, and beautifully ranked data straight to your fingertips.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', textAlign: 'left' }}>
          <div style={{ padding: '24px', background: 'var(--surface-soft)', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: 'var(--primary)' }}>Machine Learning</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              Our models don't just find discounts; they predict the true market value of an item and flag when a "deal" is just an inflated menu price.
            </p>
          </div>
          <div style={{ padding: '24px', background: 'var(--surface-soft)', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: 'var(--warning)' }}>Live Coupon Stacking</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              We simulate hundreds of coupon permutations against your cart before you ever click order, ensuring you get the absolute lowest checkout value.
            </p>
          </div>
          <div style={{ padding: '24px', background: 'var(--surface-soft)', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', color: 'var(--success)' }}>Realtime Market Sync</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              By hooking directly into dynamic MCP streams, our local radar ensures the deal you click is the deal you get. No stale caches. No guessing.
            </p>
          </div>
        </div>

        <button 
          onClick={() => navigate('/PriceTrack')}
          style={{ marginTop: '48px', background: 'var(--primary)', color: 'white', border: 'none', padding: '16px 32px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--shadow-md)' }}
        >
          Explore Live Intelligence
        </button>
      </section>
    </div>
  );
}

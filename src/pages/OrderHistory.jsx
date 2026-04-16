import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./OrderHistory.css";
import { buildApiUrl, parseJsonResponse } from "../utils/api";

const formatCurrency = (value) => `Rs${value ?? 0}`;
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "";

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/signin");
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/orders/me"), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await parseJsonResponse(res);

        if (!res.ok) {
          throw new Error(data.msg || "Unable to fetch order history");
        }

        setOrders(data.orders || []);
      } catch (requestError) {
        setError(requestError.message);
      }
    };

    fetchOrders();
  }, [navigate]);

  return (
    <div className="history-page">
      <div className="history-shell">
        <nav className="history-nav">
          <div>
            <p className="history-eyebrow">User history</p>
            <h1>My Order History</h1>
          </div>
          <button onClick={() => navigate("/")}>Home</button>
        </nav>

        {error ? <p className="history-error">{error}</p> : null}

        {orders.length ? (
          <div className="history-list">
            {orders.map((order) => (
              <article key={order._id} className="history-card">
                <img src={order.imageUrl} alt={order.restaurant} className="history-image" />
                <div className="history-content">
                  <div className="history-row">
                    <div>
                      <h3>{order.restaurant}</h3>
                      <p>{order.dishName || `${order.cuisine} | ${order.location}`}</p>
                    </div>
                    <strong>{formatCurrency(order.finalPrice)}</strong>
                  </div>
                  <div className="history-meta">
                    <span>{order.discount}% off</span>
                    <span>{order.rating} rating</span>
                    <span>{order.confidence}% confidence</span>
                    {order.eta ? <span>ETA {order.eta}</span> : null}
                  </div>
                  <div className="history-footer">
                    <span>{formatDate(order.orderedAt)}</span>
                    <a href={order.orderUrl} target="_blank" rel="noreferrer">
                      Open Order
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            No saved orders yet. Place an order from Best Picks, PriceTrack, or homepage recommendations while signed in.
          </div>
        )}
      </div>
    </div>
  );
}

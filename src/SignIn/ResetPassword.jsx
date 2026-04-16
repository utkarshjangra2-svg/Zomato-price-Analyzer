import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import "./auth.css";
import { buildApiUrl } from "../utils/api";

export default function ResetPassword({ dark }) {
  const navigate = useNavigate();
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      alert("Please enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await axios.post(buildApiUrl("/api/auth/reset"), {
        token,
        password
      });

      alert(res.data.msg || "Password updated successfully");
      navigate("/signin");
    } catch (err) {
      alert(err.response?.data?.msg || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`sign-page ${dark ? "dark" : ""}`}>
      <button className="back-btn" onClick={() => navigate("/signin")}>
        Back to Sign In
      </button>

      <div className="sign-container">
        <div className="sign-card">
          <div className="sign-header">
            <h1>Create New Password</h1>
            <p>Set a new password for your account and get back in securely.</p>
          </div>

          <form onSubmit={handleSubmit} className="sign-form">
            <div className="input-group">
              <label>New Password</label>
              <input
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div className="input-group">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button type="submit" className="sign-btn">
              {submitting ? "Updating..." : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './auth.css';
import axios from "axios";
import { buildApiUrl } from "../utils/api";

const SignIn = ({ dark }) => {
  const navigate = useNavigate();

  const [isSignIn, setIsSignIn] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isForgot, setIsForgot] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) {
      navigate("/");
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (isForgot) {
        const res = await axios.post(
          buildApiUrl("/api/auth/forgot"),
          { email }
        );

        alert(res.data.msg || "Reset link sent!");
        return;
      }

      if (isSignIn) {
        const res = await axios.post(
          buildApiUrl("/api/auth/signin"),
          { email, password }
        );

        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        alert("Login successful");
        navigate("/");
        return;
      }

      const res = await axios.post(
        buildApiUrl("/api/auth/signup"),
        { name, email, password }
      );

      alert(res.data.msg || "Account created!");
      setIsSignIn(true);
      setIsForgot(false);
      setPassword('');
    } catch (err) {
      console.log(err);
      alert(err.response?.data?.msg || err.message);
    }
  };

  return (
    <div className={`sign-page ${dark ? 'dark' : ''}`}>
      <button className="back-btn" onClick={() => navigate('/')}>
        Back
      </button>

      <div className="sign-container">
        <div className="sign-card">
          <div className="sign-header">
            <h1>{isForgot ? 'Reset Password' : isSignIn ? 'Welcome Back' : 'Create Account'}</h1>
            <p>
              {isForgot
                ? 'Enter your email to reset password'
                : isSignIn
                ? 'Sign in to your account'
                : 'Join us today'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="sign-form">
            {!isSignIn && !isForgot && (
              <div className="input-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            {!isForgot && (
              <div className="input-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            )}

            <button type="submit" className="sign-btn">
              {isForgot ? 'Send Reset Link' : isSignIn ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          {!isForgot && (
            <div className="sign-toggle">
              {isSignIn ? "Don't have an account?" : 'Already have an account?'}
              <button
                type="button"
                onClick={() => setIsSignIn(!isSignIn)}
                className="toggle-link"
              >
                {isSignIn ? ' Sign up' : ' Sign in'}
              </button>
            </div>
          )}

          <div className="forgot-wrapper">
            <button
              type="button"
              className="forgot-link"
              onClick={() => {
                setIsForgot(true);
                setIsSignIn(true);
              }}
            >
              Forgot Password?
            </button>
          </div>
        </div>
      </div>

      {isForgot && (
        <div className="sign-toggle">
          Remember your password?
          <button
            type="button"
            className="toggle-link"
            onClick={() => setIsForgot(false)}
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );
};

export default SignIn;

import React, { useRef, useState } from "react";

import "./OTP.css";
import { buildApiUrl } from "../utils/api";

const VerifyOTP = () => {

  const [otp, setOtp] = useState(new Array(6).fill(""));
  const [email, setEmail] = useState("");

  const inputRefs = useRef([]);

  const handleChange = (element, index) => {
    if (isNaN(element.value)) return false;

    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    if (element.nextSibling) {
      element.nextSibling.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const finalOtp = otp.join("");

    try {
     await fetch(buildApiUrl("/api/auth/verify-otp"), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email,
    otp: finalOtp,
  }),
});
      alert("OTP Verified");
    } catch (err) {
      alert("Invalid OTP");
    }
  };

  return (
    <div className="otp-page">

      <div className="otp-card">

        <h2>OTP Verification</h2>
        <p>Enter the 6 digit code sent to your email</p>

        <input
          type="email"
          placeholder="Enter Email"
          className="email-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="otp-container">
          {otp.map((data, index) => {
            return (
              <input
                type="text"
                maxLength="1"
                className="otp-input"
                key={index}
                value={data}
                ref={(el) => (inputRefs.current[index] = el)}
                onChange={(e) => handleChange(e.target, index)}
              />
            );
          })}
        </div>

        <button className="verify-btn" onClick={handleSubmit}>
          Verify OTP
        </button>

      </div>
    </div>
  );
};

export default VerifyOTP;

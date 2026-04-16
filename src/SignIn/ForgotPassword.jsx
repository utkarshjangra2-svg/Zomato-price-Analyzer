import React, { useState } from "react";
import "./auth.css";
import { buildApiUrl } from "../utils/api";

const ForgotPassword = () => {

  const [email,setEmail] = useState("");

  const handleSubmit = async(e)=>{
    e.preventDefault();

    try{
      await fetch(buildApiUrl("/api/auth/forgot"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
    }catch(err){
      alert("Error sending OTP");
    }
  };

  return (

    <div className="auth-container">

      <h2>Forgot Password</h2>

      <form onSubmit={handleSubmit}>

        <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e)=>setEmail(e.target.value)}
        required
        />

        <button type="submit">Send OTP</button>

      </form>

    </div>
  );
};

export default ForgotPassword;

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendResetEmail } from "../utils/sendEmails.js";
import {
  callUserZomatoTool,
  disconnectUserZomatoSession,
  getUserZomatoSessionStatus,
  startUserZomatoLink,
  verifyUserZomatoLink
} from "../services/zomatoUserSessionService.js";

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  zomato: {
    linked: Boolean(user.zomato?.linked),
    phoneNumber: user.zomato?.phoneNumber || "",
    isExistingUser: Boolean(user.zomato?.isExistingUser),
    linkedAt: user.zomato?.linkedAt || null
  }
});

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const trimmedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password) {
      return res.status(400).json({ msg: "All fields required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters long" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({ msg: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword
    });

    await user.save();

    res.status(201).json({ msg: "User created successfully" });
  } catch (err) {
    console.log("Signup error:", err);
    res.status(500).json({ msg: err.message || "Unable to create user" });
  }
};

export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ msg: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ msg: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: buildUserResponse(user)
    });
  } catch (err) {
    console.log("Signin error:", err);
    res.status(500).json({ msg: err.message || "Unable to sign in" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const resetLink = `${frontendUrl}/reset/${resetToken}`;

    await sendResetEmail({
      email: user.email,
      resetLink,
      name: user.name || "there"
    });

    res.json({
      msg: "Reset link sent to your email"
    });
  } catch (err) {
    console.log("Forgot password error:", err);
    res.status(500).json({
      msg: err.message || "Unable to generate reset link",
      hint: "If you use Gmail, create an App Password and set it as EMAIL_PASS in backend/.env."
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters long" });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({ msg: "Password updated successfully" });
  } catch (err) {
    console.log("Reset password error:", err);
    res.status(500).json({ msg: err.message || "Unable to reset password" });
  }
};

export const getZomatoLinkStatus = async (req, res) => {
  const freshUser = await User.findById(req.user._id).select("_id name email zomato");

  res.json({
    user: buildUserResponse(freshUser),
    session: getUserZomatoSessionStatus(String(req.user._id))
  });
};

export const startZomatoLink = async (req, res) => {
  try {
    const phoneNumber = `${req.body.phoneNumber || ""}`.trim();

    if (!phoneNumber) {
      return res.status(400).json({ msg: "Phone number is required" });
    }

    const authPacket = await startUserZomatoLink({
      userId: String(req.user._id),
      phoneNumber
    });

    const freshUser = await User.findById(req.user._id);
    freshUser.zomato = {
      ...(freshUser.zomato || {}),
      linked: false,
      phoneNumber,
      isExistingUser: Boolean(authPacket?.user?.is_zoman),
      pendingAuthPacket: authPacket
    };
    await freshUser.save();

    res.json({
      msg: "OTP sent to your Zomato number",
      authPacket,
      user: buildUserResponse(freshUser)
    });
  } catch (error) {
    res.status(500).json({ msg: error.message || "Unable to start Zomato linking" });
  }
};

export const verifyZomatoLink = async (req, res) => {
  try {
    const code = `${req.body.code || ""}`.trim();

    if (!code) {
      return res.status(400).json({ msg: "OTP code is required" });
    }

    const freshUser = await User.findById(req.user._id);
    const authPacket = freshUser?.zomato?.pendingAuthPacket;

    if (!authPacket) {
      return res.status(400).json({ msg: "No pending Zomato OTP request found" });
    }

    const verification = await verifyUserZomatoLink({
      userId: String(req.user._id),
      authPacket,
      code
    });

    if (verification !== true) {
      return res.status(400).json({
        msg: typeof verification === "string" ? verification : "Unable to verify Zomato OTP"
      });
    }

    const addressesResponse = await callUserZomatoTool(String(req.user._id), "get_saved_addresses_for_user", {});
    let addressCount = 0;
    try {
      const rawText = addressesResponse?.result?.[0]?.text || "";
      const parsed = rawText ? JSON.parse(rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/)?.[0] || rawText) : {};
      addressCount = Array.isArray(parsed?.addresses)
        ? parsed.addresses.length
        : Array.isArray(parsed?.data?.addresses)
          ? parsed.data.addresses.length
          : 0;
    } catch {}

    freshUser.zomato = {
      ...(freshUser.zomato || {}),
      linked: true,
      lastVerifiedAt: new Date(),
      linkedAt: freshUser.zomato?.linkedAt || new Date(),
      uuid: authPacket?.user?.uuid || freshUser.zomato?.uuid || "",
      name: authPacket?.user?.name || freshUser.zomato?.name || "",
      email: authPacket?.user?.email || freshUser.zomato?.email || "",
      phoneNumber: authPacket?.user?.phone_number || freshUser.zomato?.phoneNumber || "",
      isExistingUser: Boolean(authPacket?.user?.is_zoman),
      pendingAuthPacket: null
    };
    await freshUser.save();

    res.json({
      msg: "Zomato account linked successfully",
      user: buildUserResponse(freshUser),
      addressCount
    });
  } catch (error) {
    res.status(500).json({ msg: error.message || "Unable to verify Zomato OTP" });
  }
};

export const unlinkZomatoAccount = async (req, res) => {
  try {
    const freshUser = await User.findById(req.user._id);
    freshUser.zomato = {
      linked: false,
      phoneNumber: "",
      uuid: "",
      name: "",
      email: "",
      isExistingUser: false,
      linkedAt: null,
      lastVerifiedAt: null,
      pendingAuthPacket: null
    };
    await freshUser.save();
    await disconnectUserZomatoSession(String(req.user._id));

    res.json({
      msg: "Zomato account disconnected",
      user: buildUserResponse(freshUser)
    });
  } catch (error) {
    res.status(500).json({ msg: error.message || "Unable to unlink Zomato account" });
  }
};

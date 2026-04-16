import express from "express";
import {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  getZomatoLinkStatus,
  startZomatoLink,
  verifyZomatoLink,
  unlinkZomatoAccount
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup",signup);
router.post("/signin",signin);
router.post("/forgot",forgotPassword);
router.post("/reset",resetPassword);
router.get("/zomato/status", protect, getZomatoLinkStatus);
router.post("/zomato/link/start", protect, startZomatoLink);
router.post("/zomato/link/verify", protect, verifyZomatoLink);
router.post("/zomato/unlink", protect, unlinkZomatoAccount);

export default router;

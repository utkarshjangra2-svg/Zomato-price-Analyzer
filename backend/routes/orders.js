import express from "express";
import { createOrderHistory, getMyOrderHistory, addToCart, syncZomatoOrderHistory } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyOrderHistory);
router.get("/sync", protect, syncZomatoOrderHistory);
router.post("/", protect, createOrderHistory);
router.post("/add-to-cart", protect, addToCart);

export default router;

import express from "express";
import { getDealsDebug, getLiveDeals, getPriceHistory, getRecommendations, searchDeals } from "../controllers/dealController.js";
import { optionalProtect } from "../middleware/optionalAuthMiddleware.js";

const router = express.Router();

router.get("/", optionalProtect, getLiveDeals);
router.get("/debug", getDealsDebug);
router.get("/price-history", optionalProtect, getPriceHistory);
router.get("/recommendations", optionalProtect, getRecommendations);
router.post("/search", optionalProtect, searchDeals);

export default router;

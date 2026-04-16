import OrderHistory from "../models/OrderHistory.js";
import { callUserZomatoTool } from "../services/zomatoUserSessionService.js";
import { fetchUserZomatoCoupons } from "../services/couponOptimizer.js";

export const createOrderHistory = async (req, res) => {
  try {
    const {
      restaurant,
      dishName = "",
      cuisine = "",
      location = "",
      imageUrl = "",
      orderUrl,
      finalPrice = 0,
      couponAdjustedPrice = 0,
      originalPrice = 0,
      discount = 0,
      rating = 0,
      confidence = 0,
      eta = "",
      source = ""
    } = req.body;

    if (!restaurant?.trim() || !orderUrl?.trim()) {
      return res.status(400).json({ msg: "Restaurant and order URL are required" });
    }

    const order = await OrderHistory.create({
      user: req.user._id,
      restaurant: restaurant.trim(),
      dishName: dishName.trim(),
      cuisine: cuisine.trim(),
      location: location.trim(),
      imageUrl: imageUrl.trim(),
      orderUrl: orderUrl.trim(),
      finalPrice: Number(finalPrice) || 0,
      couponAdjustedPrice: Number(couponAdjustedPrice) || Number(finalPrice) || 0,
      originalPrice: Number(originalPrice) || 0,
      discount: Number(discount) || 0,
      rating: Number(rating) || 0,
      confidence: Number(confidence) || 0,
      eta: eta.trim(),
      source: source.trim()
    });

    res.status(201).json({
      msg: "Order saved to history",
      order
    });
  } catch (error) {
    console.log("createOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to save order history" });
  }
};

// Parse addresses from Zomato MCP response
const parseAddresses = (rawText = "") => {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
    const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    return authData?.addresses || authData?.data?.addresses || [];
  } catch {
    return [];
  }
};

// Parse Zomato order history from MCP response
const parseZomatoOrders = (result) => {
  let raw = result;
  if (Array.isArray(raw) && raw[0]?.text) {
    try { raw = JSON.parse(raw[0].text); } catch { return []; }
  }
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  const orders = raw?.orders || raw?.data?.orders || raw?.order_history || [];
  return Array.isArray(orders) ? orders : [];
};

export const getMyOrderHistory = async (req, res) => {
  try {
    // Trigger background sync from Zomato if user linked — fire-and-forget
    if (req.user?.zomato?.linked) {
      syncFromZomato(req.user._id).catch(() => {});
    }

    const orders = await OrderHistory.find({ user: req.user._id })
      .sort({ orderedAt: -1, createdAt: -1 })
      .limit(50);

    res.json({ orders });
  } catch (error) {
    console.log("getMyOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch order history" });
  }
};

// Pull and upsert Zomato order history for the user
const syncFromZomato = async (userId) => {
  try {
    const result = await callUserZomatoTool(String(userId), "get_order_history", {});
    if (!result?.success || !result?.result) return;

    const zOrders = parseZomatoOrders(result.result);
    if (!zOrders.length) return;

    for (const zo of zOrders) {
      const orderId = String(zo.order_id || zo.id || "");
      if (!orderId) continue;

      const restaurant = zo.restaurant_name || zo.restaurant?.name || "";
      const dishName = zo.items?.[0]?.name || zo.item_name || "";
      const cuisine = zo.cuisine || "";
      const finalPrice = Number(zo.total_amount || zo.order_amount || zo.price || 0);
      const couponAdjustedPrice = Number(zo.paid_amount || zo.final_amount || finalPrice);
      const orderUrl = zo.order_url || zo.deep_link || "";
      const imageUrl = zo.restaurant_image || zo.image_url || "";

      const orderedAt = zo.ordered_at || zo.placed_at || zo.created_at
        ? new Date(zo.ordered_at || zo.placed_at || zo.created_at)
        : new Date();

      if (!restaurant) continue;

      // Upsert by zomatoOrderId to avoid duplicates
      await OrderHistory.updateOne(
        { user: userId, zomatoOrderId: orderId },
        {
          $setOnInsert: {
            user: userId,
            zomatoOrderId: orderId,
            restaurant,
            dishName,
            cuisine,
            location: zo.delivery_address?.city || "",
            imageUrl,
            orderUrl,
            finalPrice,
            couponAdjustedPrice,
            originalPrice: Number(zo.original_amount || finalPrice),
            discount: Number(zo.discount_percent || 0),
            rating: Number(zo.restaurant_rating || 0),
            confidence: 0,
            eta: "",
            source: "zomato-sync",
            orderedAt
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.log("[orderController] syncFromZomato failed:", err.message);
  }
};

// GET /api/orders/sync — explicit sync endpoint
export const syncZomatoOrderHistory = async (req, res) => {
  try {
    const result = await callUserZomatoTool(String(req.user._id), "get_order_history", {});
    if (!result?.success || !result?.result) {
      return res.json({ msg: "No Zomato order history available", synced: 0 });
    }

    const zOrders = parseZomatoOrders(result.result);
    let synced = 0;

    for (const zo of zOrders) {
      const orderId = String(zo.order_id || zo.id || "");
      const restaurant = zo.restaurant_name || zo.restaurant?.name || "";
      if (!orderId || !restaurant) continue;

      const finalPrice = Number(zo.total_amount || zo.order_amount || zo.price || 0);
      const couponAdjustedPrice = Number(zo.paid_amount || zo.final_amount || finalPrice);
      const orderedAt = zo.ordered_at || zo.placed_at || zo.created_at
        ? new Date(zo.ordered_at || zo.placed_at || zo.created_at)
        : new Date();

      const up = await OrderHistory.updateOne(
        { user: req.user._id, zomatoOrderId: orderId },
        {
          $setOnInsert: {
            user: req.user._id,
            zomatoOrderId: orderId,
            restaurant,
            dishName: zo.items?.[0]?.name || "",
            cuisine: zo.cuisine || "",
            location: zo.delivery_address?.city || "",
            imageUrl: zo.restaurant_image || "",
            orderUrl: zo.order_url || "",
            finalPrice,
            couponAdjustedPrice,
            originalPrice: Number(zo.original_amount || finalPrice),
            discount: Number(zo.discount_percent || 0),
            rating: Number(zo.restaurant_rating || 0),
            confidence: 0,
            eta: "",
            source: "zomato-sync",
            orderedAt
          }
        },
        { upsert: true }
      );
      if (up.upsertedCount > 0) synced++;
    }

    const orders = await OrderHistory.find({ user: req.user._id })
      .sort({ orderedAt: -1 })
      .limit(50);

    res.json({ msg: `Synced ${synced} new orders from Zomato`, synced, orders });
  } catch (error) {
    console.log("syncZomatoOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to sync order history" });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { deal } = req.body;

    if (!deal || !deal.res_id || !deal.catalogueId) {
      return res.status(400).json({ msg: "Invalid deal data — res_id and catalogueId are required for cart" });
    }

    // Get saved addresses
    const addressesResponse = await callUserZomatoTool(String(req.user._id), "get_saved_addresses_for_user", {});
    if (!addressesResponse?.success || !addressesResponse?.result?.length) {
      return res.status(400).json({ msg: "No saved addresses found in your Zomato account. Please add an address in the Zomato app first." });
    }

    const addresses = parseAddresses(
      Array.isArray(addressesResponse.result) ? addressesResponse.result[0]?.text || "" : String(addressesResponse.result)
    );

    if (!addresses.length) {
      return res.status(400).json({ msg: "No delivery addresses available in your Zomato account." });
    }

    const address = addresses[0];

    // Pick the best coupon — prefer live user coupons from get_cart_offers, then fallback to deal's bestCouponCombo
    let bestPromoCode = deal.bestCouponCombo?.[0]?.code || null;
    try {
      const liveCoupons = await fetchUserZomatoCoupons(String(req.user._id));
      if (liveCoupons.length) {
        // Find coupon giving max savings on this deal's price
        let bestSavings = 0;
        const price = deal.couponAdjustedPrice || deal.finalPrice || 0;
        for (const c of liveCoupons) {
          if (c.minOrder && price < c.minOrder) continue;
          const saving = c.kind === "flat"
            ? Math.min(c.value, c.cap || c.value, price)
            : Math.min(Math.round((price * c.value) / 100), c.cap || 999);
          if (saving > bestSavings) {
            bestSavings = saving;
            bestPromoCode = c.code;
          }
        }
      }
    } catch {}

    // Create cart on Zomato
    const cartData = {
      res_id: Number(deal.res_id),
      items: [{
        variant_id: deal.catalogueId,
        quantity: 1
      }],
      address_id: address.address_id || address.id,
      payment_type: "pay_later",
      ...(bestPromoCode ? { promo_code: bestPromoCode } : {})
    };

    const cartResponse = await callUserZomatoTool(String(req.user._id), "create_cart", cartData);

    if (cartResponse?.success) {
      // Save to order history
      await OrderHistory.create({
        user: req.user._id,
        restaurant: deal.restaurant || "",
        dishName: deal.dishName || "",
        cuisine: deal.cuisine || "",
        location: deal.location || "",
        imageUrl: deal.imageUrl || "",
        orderUrl: deal.orderUrl || "",
        finalPrice: deal.finalPrice || 0,
        couponAdjustedPrice: deal.couponAdjustedPrice || deal.finalPrice || 0,
        originalPrice: deal.originalPrice || deal.finalPrice || 0,
        discount: deal.discount || 0,
        rating: deal.rating || 0,
        confidence: deal.confidence || 0,
        eta: deal.eta || "",
        source: "cart-added",
        orderedAt: new Date()
      });

      res.json({
        msg: "Added to cart successfully",
        cart: cartResponse.result,
        appliedCoupon: bestPromoCode || null
      });
    } else {
      res.status(400).json({ msg: cartResponse?.error?.message || "Failed to add to cart on Zomato. Please try ordering directly from the app." });
    }
  } catch (error) {
    console.log("addToCart error:", error);
    res.status(500).json({ msg: error.message || "Unable to add to cart" });
  }
};

import { buildApiUrl } from "./api";

export const saveOrderToHistory = async (deal, source = "") => {
  const token = localStorage.getItem("token");

  if (!token || !deal?.orderUrl) {
    return;
  }

  try {
    await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        restaurant: deal.restaurant,
        dishName: deal.dishName || "",
        cuisine: deal.cuisine || "",
        location: deal.location || "",
        imageUrl: deal.imageUrl || "",
        orderUrl: deal.orderUrl,
        finalPrice: deal.finalPrice || 0,
        originalPrice: deal.originalPrice || 0,
        discount: deal.discount || 0,
        rating: deal.rating || 0,
        confidence: deal.confidence || 0,
        eta: deal.eta || "",
        source
      })
    });
  } catch (error) {
    console.log("Unable to save order history", error);
  }
};

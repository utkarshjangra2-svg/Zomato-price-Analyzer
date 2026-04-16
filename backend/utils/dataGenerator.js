const cuisines = ["Biryani", "Pizza", "Burger", "Chinese", "Italian", "Mexican", "Sushi", "Indian"];

const restaurantMap = {
  biryani: ["Biryani Blues", "Spice Paradise", "Royal Dum House", "Nawab Kitchen"],
  pizza: ["Pizza Planet", "Urban Slice", "Oven Story", "Cheese District"],
  burger: ["Burger Junction", "Stack House", "Urban Bites", "Patty Lab"],
  chinese: ["Wok Junction", "Dragon Bowl", "Noodle Bar", "Golden Wok"],
  italian: ["Pasta Palace", "The Bistro", "Bella Roma", "Trattoria Lane"],
  mexican: ["Taco Town", "Burrito Hub", "Casa Salsa", "Wrap Republic"],
  sushi: ["Sushi Station", "Tokyo Table", "Wasabi House", "Rice & Roll"],
  indian: ["The Curry House", "Tandoor Tales", "Masala Route", "Flavor Junction"],
  default: ["Street Kitchen", "Gourmet Express", "Flavor Junction", "The Food Hub"]
};

const cityAreas = {
  Delhi: ["Connaught Place", "Janpath", "Rajouri Garden", "Hauz Khas", "Lajpat Nagar"],
  Mumbai: ["Bandra", "Andheri", "Powai", "Lower Parel", "Juhu"],
  Bangalore: ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield", "Jayanagar"],
  Hyderabad: ["Jubilee Hills", "Gachibowli", "Madhapur", "Banjara Hills"],
  Pune: ["Koregaon Park", "Baner", "Kothrud", "Viman Nagar"],
  Chennai: ["T Nagar", "Velachery", "Anna Nagar", "Adyar"]
};

const fallbackImages = {
  biryani: "https://images.unsplash.com/photo-1701579231349-d7459c40919d?auto=format&fit=crop&w=1200&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  chinese: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1200&q=80",
  italian: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1200&q=80",
  mexican: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=1200&q=80",
  sushi: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80",
  indian: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80",
  default: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80"
};

const getSeededValue = (seedString = "") =>
  seedString.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 17);

const pickFrom = (items, seed) => items[Math.abs(seed) % items.length];

const normalizeCuisine = (value = "") => {
  const lowered = value.trim().toLowerCase();
  return cuisines.find((item) => item.toLowerCase() === lowered) || "";
};

const getAreas = (location = "") => {
  const trimmed = location.trim();
  if (!trimmed) {
    return cityAreas.Delhi;
  }

  const matchedCity = Object.keys(cityAreas).find((city) => trimmed.toLowerCase().includes(city.toLowerCase()));
  return cityAreas[matchedCity || "Delhi"];
};

const getCuisineList = (requestedCuisine = "") => {
  const normalized = normalizeCuisine(requestedCuisine);
  return normalized ? [normalized] : cuisines;
};

const getRestaurantNames = (cuisine = "", location = "") => {
  const key = cuisine.toLowerCase();
  const names = restaurantMap[key] || restaurantMap.default;
  const area = pickFrom(getAreas(location), getSeededValue(`${cuisine}-${location}`));
  return names.map((name) => `${name} ${area}`);
};

export function generateRealisticDeals({ count = 10, cuisine = "", location = "Delhi" } = {}) {
  const requestedCuisines = getCuisineList(cuisine);
  const deals = [];

  for (let index = 0; index < count; index += 1) {
    const cuisineChoice = requestedCuisines[index % requestedCuisines.length];
    const names = getRestaurantNames(cuisineChoice, location);
    const seed = getSeededValue(`${location}-${cuisineChoice}-${index}`);
    const originalPrice = 180 + (seed % 420);
    const discount = 12 + (seed % 48);
    const rating = 3.6 + ((seed % 14) / 10);
    const deliveryMinutes = 18 + (seed % 28);
    const area = pickFrom(getAreas(location), seed);
    const restaurant = pickFrom(names, seed);
    const dishName = `${cuisineChoice} Special`;

    deals.push({
      name: restaurant,
      dishName,
      cuisine: cuisineChoice,
      location: `${area}, ${location}`,
      basePrice: originalPrice,
      originalPrice,
      price: Math.round(originalPrice * (1 - discount / 100)),
      discount,
      rating: Number(rating.toFixed(1)),
      trendingScore: 60 + (seed % 40),
      eta: `${deliveryMinutes} mins`,
      imageUrl: fallbackImages[cuisineChoice.toLowerCase()] || fallbackImages.default,
      orderUrl: "",
      offerText: `Save ${discount}% on ${dishName}`,
      isLive: true,
      isOrderableNow: true
    });
  }

  return deals;
}

export function generatePriceTrend(days = 7, basePrice = 320) {
  const trend = [];
  const safeDays = Math.max(1, Number(days) || 7);

  for (let index = safeDays; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const variance = ((index * 13) % 45) - 22;
    const price = Math.max(basePrice + variance, 100);
    const discount = 10 + ((index * 7) % 35);

    trend.push({
      date,
      price: Math.round(price),
      discount,
      finalPrice: Math.round(price * (1 - discount / 100))
    });
  }

  return trend;
}

export function calculateOptimalOrderTime(priceHistory = []) {
  if (!priceHistory.length) {
    return {
      bestTime: "Evening (5-9 PM)",
      expectedSavings: "22%",
      confidence: "Medium"
    };
  }

  const timeSlots = {
    morning: { total: 0, count: 0 },
    afternoon: { total: 0, count: 0 },
    evening: { total: 0, count: 0 },
    night: { total: 0, count: 0 }
  };

  priceHistory.forEach((record) => {
    const hour = new Date(record.timestamp || record.date || Date.now()).getHours();
    let slot = "morning";

    if (hour >= 12 && hour < 17) slot = "afternoon";
    else if (hour >= 17 && hour < 21) slot = "evening";
    else if (hour >= 21 || hour < 6) slot = "night";

    timeSlots[slot].total += record.discount || 0;
    timeSlots[slot].count += 1;
  });

  let bestSlot = "evening";
  let maxAverage = 0;

  Object.entries(timeSlots).forEach(([slot, data]) => {
    const avg = data.count ? data.total / data.count : 0;
    if (avg > maxAverage) {
      maxAverage = avg;
      bestSlot = slot;
    }
  });

  const labels = {
    morning: "Morning (8-12 AM)",
    afternoon: "Afternoon (12-5 PM)",
    evening: "Evening (5-9 PM)",
    night: "Night (9 PM-2 AM)"
  };

  return {
    bestTime: labels[bestSlot],
    expectedSavings: `${Math.round(maxAverage || 18)}%`,
    confidence: maxAverage > 24 ? "High" : "Medium"
  };
}

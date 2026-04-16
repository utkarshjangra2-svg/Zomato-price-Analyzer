export const getStoredUser = () => {
  const rawUser = localStorage.getItem("user");

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
};

export const getStoredToken = () => localStorage.getItem("token") || "";

export const buildAuthHeaders = (headers = {}) => {
  const token = getStoredToken();

  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
};

export const buildUserQueryParams = () => {
  const user = getStoredUser();

  if (!user) {
    return "";
  }

  const params = new URLSearchParams();

  if (user.id) params.set("userId", user.id);
  if (user.name) params.set("userName", user.name);
  if (user.email) params.set("userEmail", user.email);

  const query = params.toString();
  return query ? `&${query}` : "";
};

export const buildUserPayload = () => {
  const user = getStoredUser();

  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    zomato: user.zomato || {}
  };
};

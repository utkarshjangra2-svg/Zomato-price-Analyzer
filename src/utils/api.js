const rawApiBase =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  import.meta.env.VITE_BACKEND_URL?.trim() ||
  "";

export const API_BASE_URL = rawApiBase.replace(/\/$/, "");

export const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
};

export const parseJsonResponse = async (response) => {
  const raw = await response.text();

  if (!raw || !raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { msg: raw };
  }
};

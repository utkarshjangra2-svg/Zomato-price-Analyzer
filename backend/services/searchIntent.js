const STOP_WORDS = new Set(["and", "&", "food", "foods", "cuisine", "style", "best", "near", "me"]);

const QUERY_ALIASES = new Map([
  ["briyani", "biryani"],
  ["biriyani", "biryani"],
  ["biryiani", "biryani"],
  ["chicken biriyani", "chicken biryani"],
  ["chicken briyani", "chicken biryani"],
  ["mutton biriyani", "mutton biryani"],
  ["paneer tikkaa", "paneer tikka"],
  ["panner tikka", "paneer tikka"],
  ["pannir tikka", "paneer tikka"],
  ["paneer butter masla", "paneer butter masala"],
  ["butter panner", "butter paneer"],
  ["chiken", "chicken"],
  ["chikn", "chicken"],
  ["chickn", "chicken"],
  ["paneerr", "paneer"],
  ["panner", "paneer"],
  ["pannir", "paneer"],
  ["shawarama", "shawarma"],
  ["schawarma", "shawarma"],
  ["manchurain", "manchurian"],
  ["momoss", "momos"],
  ["nudles", "noodles"],
  ["noodls", "noodles"],
  ["fride rice", "fried rice"],
  ["frid rice", "fried rice"],
  ["burgers", "burger"],
  ["pizzza", "pizza"],
  ["sandwhich", "sandwich"],
  ["sandwitch", "sandwich"],
  ["dosaa", "dosa"],
  ["masala dosa", "masala dosa"],
  ["idlii", "idli"]
]);

const CANONICAL_TERMS = [
  "biryani",
  "chicken biryani",
  "mutton biryani",
  "paneer tikka",
  "paneer butter masala",
  "butter paneer",
  "shawarma",
  "manchurian",
  "momos",
  "noodles",
  "fried rice",
  "burger",
  "pizza",
  "sandwich",
  "dosa",
  "masala dosa",
  "idli",
  "paneer",
  "chicken",
  "rolls",
  "south indian",
  "chinese",
  "fast food",
  "ladoo",
  "sweets"
];

const normalizeWhitespace = (value = "") => value.toLowerCase().trim().replace(/\s+/g, " ");

export const tokenizeSearchText = (value = "") =>
  normalizeWhitespace(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));

const getEditDistance = (a = "", b = "") => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    table[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    table[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      table[row][col] = Math.min(
        table[row - 1][col] + 1,
        table[row][col - 1] + 1,
        table[row - 1][col - 1] + cost
      );
    }
  }

  return table[a.length][b.length];
};

const resolveTokenAlias = (token = "") => {
  if (!token) {
    return "";
  }

  if (QUERY_ALIASES.has(token)) {
    return QUERY_ALIASES.get(token);
  }

  let bestMatch = token;
  let bestDistance = Infinity;

  for (const candidate of CANONICAL_TERMS) {
    if (candidate.includes(" ")) {
      continue;
    }

    const distance = getEditDistance(token, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestDistance <= 1 && token.length >= 5 ? bestMatch : token;
};

export const resolveDishQuery = (query = "") => {
  const normalizedQuery = normalizeWhitespace(query);

  if (!normalizedQuery) {
    return "";
  }

  if (QUERY_ALIASES.has(normalizedQuery)) {
    return QUERY_ALIASES.get(normalizedQuery);
  }

  const resolvedTokens = tokenizeSearchText(normalizedQuery).map(resolveTokenAlias);
  const resolvedQuery = resolvedTokens.join(" ").trim();

  if (QUERY_ALIASES.has(resolvedQuery)) {
    return QUERY_ALIASES.get(resolvedQuery);
  }

  let bestPhrase = resolvedQuery;
  let bestDistance = Infinity;

  for (const candidate of CANONICAL_TERMS) {
    const distance = getEditDistance(resolvedQuery, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPhrase = candidate;
    }
  }

  const maxAllowedDistance = resolvedQuery.length >= 8 ? 2 : 1;
  return bestDistance <= maxAllowedDistance && resolvedQuery.length >= 5 ? bestPhrase : resolvedQuery;
};

const getFuzzyTokenScore = (token, haystackTokens) => {
  if (haystackTokens.includes(token)) {
    return 1;
  }

  let bestScore = 0;

  for (const candidate of haystackTokens) {
    const distance = getEditDistance(token, candidate);

    if (distance === 1 && token.length >= 4) {
      bestScore = Math.max(bestScore, 0.88);
    } else if (distance === 2 && token.length >= 7) {
      bestScore = Math.max(bestScore, 0.72);
    }
  }

  return bestScore;
};

export const getDishMatchScore = (query = "", restaurant = {}) => {
  const resolvedQuery = resolveDishQuery(query);
  const queryTokens = tokenizeSearchText(resolvedQuery);

  if (!queryTokens.length) {
    return 1;
  }

  const haystackText = normalizeWhitespace(
    `${restaurant.name || ""} ${restaurant.cuisine || ""} ${restaurant.dishName || ""}`
  );
  const haystackTokens = tokenizeSearchText(haystackText);

  if (!haystackTokens.length) {
    return 0;
  }

  const tokenScore =
    queryTokens.reduce((sum, token) => sum + getFuzzyTokenScore(token, haystackTokens), 0) / queryTokens.length;
  const phraseBoost = haystackText.includes(resolvedQuery) ? 0.25 : 0;

  return Math.min(1.2, tokenScore + phraseBoost);
};

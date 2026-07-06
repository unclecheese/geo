// Persistence keys. Bump the version to invalidate a cache.
export const DATA_KEY = "geo.dataset.v2"; // 50m TopoJSON (more microstate geometry)
export const STATE_KEY = "geo.state.v2";
export const STATE_VERSION = 2;

// 50m resolution gives geometry to most small states (Singapore, Malta, Kosovo,
// Bahrain, Brunei, …) that the 110m file omits. The handful that still lack a
// polygon at 50m fall back to centroid markers, and map modes skip them.
export const TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// Country metadata: mledoze/countries — the upstream dataset REST Countries is
// built from. Served with CORS by jsdelivr and pinned to a tag. The
// restcountries.com v3.1 API is deprecated, so we read its source directly.
export const REST_URL =
  "https://cdn.jsdelivr.net/gh/mledoze/countries@5.1.0/countries.json";

// box 1..5 red → green, for the mastery heatmap and dashboard.
export const BOX_COLORS = ["#f87171", "#fb923c", "#fbbf24", "#a3e635", "#34d399"];

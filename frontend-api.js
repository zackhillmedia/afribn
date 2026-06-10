window.AFRIBN_API_BASE = window.AFRIBN_API_BASE || "";

window.AFRIBNApi = {
  token: localStorage.getItem("afribn_token") || "",

  async request(path, options = {}) {
    const response = await fetch(`${window.AFRIBN_API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.blob();
    if (!response.ok) throw new Error(payload?.error?.message || `AFRIBN API ${response.status}`);
    return payload;
  },

  async login(email, password) {
    const payload = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.token = payload.token;
    localStorage.setItem("afribn_token", payload.token);
    return payload;
  },

  logout() {
    this.token = "";
    localStorage.removeItem("afribn_token");
  },

  me: () => window.AFRIBNApi.request("/users/me"),
  feed: (query = "") => window.AFRIBNApi.request(`/feed${query}`),
  dashboard: () => window.AFRIBNApi.request("/dashboard"),
  country: (country) => window.AFRIBNApi.request(`/countries/${encodeURIComponent(country)}`),
  alerts: () => window.AFRIBNApi.request("/alerts"),
  watchlists: () => window.AFRIBNApi.request("/watchlists"),
  generateReport: (input = {}) => window.AFRIBNApi.request("/reports/generate", { method: "POST", body: JSON.stringify(input) }),
  runPipelineDemo: (input = {}) => window.AFRIBNApi.request("/pipeline/demo-run", { method: "POST", body: JSON.stringify(input) })
};

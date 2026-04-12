import { trimTrailingSlash } from "./path-utils.js";

export function getClient(baseUrl) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(apiPath, init = {}) {
    const response = await fetch(`${normalizedBaseUrl}${apiPath}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body || "No response body"}`);
    }

    return response.json();
  }

  return {
    async listModels() {
      const payload = await request("/models");
      return Array.isArray(payload.data) ? payload.data : [];
    },
    async chat({ model, messages, temperature }) {
      const payload = await request("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: false,
        }),
      });

      return payload?.choices?.[0]?.message?.content ?? "";
    },
  };
}

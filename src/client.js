import { trimTrailingSlash } from "./path-utils.js";
import { logger } from "./logger.js";
import { RESULT_TYPES, ERROR_CODES } from "./config.js";

export function getClient(baseUrl) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(apiPath, init = {}) {
    try {
      const response = await fetch(`${normalizedBaseUrl}${apiPath}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`HTTP error ${response.status} ${response.statusText}`, new Error(body));
        return {
          ok: false,
          type: apiPath.includes("chat") ? RESULT_TYPES.MODEL : "api",
          error: {
            code: ERROR_CODES.MODEL_NETWORK_ERROR,
            message: `HTTP ${response.status} ${response.statusText}: ${body || "No response body"}`,
          },
        };
      }

      const data = await response.json();
      return {
        ok: true,
        type: apiPath.includes("chat") ? RESULT_TYPES.MODEL : "api",
        data,
      };
    } catch (error) {
      logger.error(`Network error for ${apiPath}`, error);
      return {
        ok: false,
        type: apiPath.includes("chat") ? RESULT_TYPES.MODEL : "api",
        error: {
          code: ERROR_CODES.MODEL_NETWORK_ERROR,
          message: error.message,
        },
      };
    }
  }

  return {
    async listModels() {
      const result = await request("/models");
      if (!result.ok) {
        return [];
      }
      return Array.isArray(result.data?.data) ? result.data.data : [];
    },
    async chat({ model, messages, temperature }) {
      logger.debug(`Sending chat request to model: ${model}`);
      const result = await request("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: false,
        }),
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      const content = result.data?.choices?.[0]?.message?.content ?? "";
      return {
        ok: true,
        type: RESULT_TYPES.MODEL,
        data: content,
        meta: {
          model,
          usage: result.data?.usage,
        },
      };
    },
  };
}

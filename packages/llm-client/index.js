import { trimTrailingSlash } from "../shared/path-utils.js";
import { logger } from "../shared/logger.js";
import { RESULT_TYPES, ERROR_CODES } from "../shared/config.js";

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
    async loadModel(modelId) {
      logger.debug(`Requesting load for model: ${modelId}`);
      // Use the native /api/v1/models/load endpoint if possible, 
      // but the baseUrl is usually /v1 or /api/v1 already.
      // We'll try to adapt based on common LM Studio structures.
      const loadPath = normalizedBaseUrl.endsWith("/v1") 
        ? "/models/load" 
        : "/api/v1/models/load";
      
      const result = await request(loadPath, {
        method: "POST",
        body: JSON.stringify({
          model_key: modelId,
        }),
      });

      return result;
    },
    async unloadModel(modelId) {
      logger.debug(`Requesting unload for model: ${modelId}`);
      const unloadPath = normalizedBaseUrl.endsWith("/v1") 
        ? "/models/unload" 
        : "/api/v1/models/unload";
      
      const result = await request(unloadPath, {
        method: "POST",
        body: JSON.stringify(modelId ? { instance_id: modelId } : {}),
      });

      return result;
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
    async *chatStream({ model, messages, temperature, onUsage }) {
      logger.debug(`Starting chat stream for model: ${model}`);

      const createStreamResponse = (includeUsage) => fetch(`${normalizedBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: true,
          ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
        }),
      });

      let response = await createStreamResponse(true);
      let errorBody = "";

      if (!response.ok) {
        errorBody = await response.text();
        if (response.status === 400 && errorBody.includes("stream_options")) {
          logger.warn("Streaming usage metadata is not supported by this server; retrying without it.");
          response = await createStreamResponse(false);
          errorBody = "";
        }
      }

      if (!response.ok) {
        errorBody = errorBody || await response.text();
        logger.error(`Stream HTTP error ${response.status}`, new Error(errorBody));
        throw new Error(`HTTP ${response.status}: ${errorBody || "No response body"}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.usage && typeof onUsage === "function") {
                  onUsage(data.usage);
                }
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  yield content;
                }
              } catch (e) {
                logger.warn("Failed to parse stream chunk", e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

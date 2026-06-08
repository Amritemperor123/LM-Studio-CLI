import { trimTrailingSlash } from "../shared/path-utils.js";
import { logger } from "../shared/logger.js";
import { RESULT_TYPES, ERROR_CODES, RUNTIME_LIMITS } from "../shared/config.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init = {}, retries = RUNTIME_LIMITS.llmMaxRetries, delay = RUNTIME_LIMITS.llmRetryDelayMs) {
  let lastError;
  const timeoutMs = RUNTIME_LIMITS.llmRequestTimeoutMs;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        // Don't retry on 4xx errors unless it's 429
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`HTTP ${response.status}: ${body}`);
        }
        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (error.name === "AbortError") {
        logger.warn(`Request to ${url} timed out after ${timeoutMs}ms (Attempt ${i + 1}/${retries + 1})`);
      } else {
        logger.warn(`Request to ${url} failed: ${error.message} (Attempt ${i + 1}/${retries + 1})`);
      }

      if (i < retries) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }

  throw lastError;
}

export function getClient(baseUrl, provider = "openai") {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  const request = async (apiPath, init = {}) => {
    try {
      const response = await fetchWithRetry(`${normalizedBaseUrl}${apiPath}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      const data = await response.json();
      return {
        ok: true,
        type: apiPath.includes("chat") ? RESULT_TYPES.MODEL : "api",
        data,
      };
    } catch (error) {
      logger.error(`LLM Request failed after retries: ${apiPath}`, error);
      return {
        ok: false,
        type: apiPath.includes("chat") ? RESULT_TYPES.MODEL : "api",
        error: {
          code: error.name === "AbortError" ? ERROR_CODES.TIMEOUT : ERROR_CODES.MODEL_NETWORK_ERROR,
          message: error.message,
        },
      };
    }
  };

  const handlers = {
    openai: {
      async listModels() {
        if (normalizedBaseUrl.endsWith("/v1")) {
          const internalUrl = normalizedBaseUrl.replace(/\/v1$/, "/api/v1/models");
          try {
            const response = await fetch(internalUrl);
            if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data.data)) return data.data;
            }
          } catch (e) { /* ignore */ }
        }
        const result = await request("/models");
        return Array.isArray(result.data?.data) ? result.data.data : [];
      },
      async loadModel(modelId) {
        const path = normalizedBaseUrl.endsWith("/v1") ? "/models/load" : "/api/v1/models/load";
        return request(path, { method: "POST", body: JSON.stringify({ model_key: modelId }) });
      },
      async unloadModel(modelId) {
        const path = normalizedBaseUrl.endsWith("/v1") ? "/models/unload" : "/api/v1/models/unload";
        return request(path, { method: "POST", body: JSON.stringify(modelId ? { instance_id: modelId } : {}) });
      },
      async chat({ model, messages, temperature }) {
        const result = await request("/chat/completions", {
          method: "POST",
          body: JSON.stringify({ model, messages, temperature, stream: false }),
        });
        if (!result.ok) throw new Error(result.error.message);
        return {
          ok: true,
          type: RESULT_TYPES.MODEL,
          data: result.data?.choices?.[0]?.message?.content ?? "",
          meta: { model, usage: result.data?.usage },
        };
      },
      async *chatStream({ model, messages, temperature, onUsage }) {
        const url = `${normalizedBaseUrl}/chat/completions`;
        const body = {
          model,
          messages,
          temperature,
          stream: true,
          stream_options: { include_usage: true },
        };

        let response;
        try {
          response = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch (error) {
          if (error.message.includes("stream_options")) {
            delete body.stream_options;
            response = await fetchWithRetry(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          } else {
            throw error;
          }
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
                  if (data.usage && onUsage) onUsage(data.usage);
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) yield content;
                } catch (e) { /* ignore */ }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    },
    anthropic: {
      // Skeleton for future implementation
      async listModels() { return [{ id: "claude-3-5-sonnet-20240620" }]; },
      async chat() { throw new Error("Anthropic not fully implemented yet."); },
      async *chatStream() { throw new Error("Anthropic not fully implemented yet."); }
    }
  };

  return handlers[provider] || handlers.openai;
}

import { logger } from "./logger.js";

const DASHBOARD_URL = process.env.LMS_DASHBOARD_URL ?? "http://localhost:3001/telemetry";

export const telemetry = {
  async emit(event, data = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      // Fire and forget, don't await the fetch to avoid slowing down the agent
      fetch(DASHBOARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Silent catch: dashboard probably not running
      });
    } catch (error) {
      // Silent catch
    }
  },
};

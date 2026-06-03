import { logger } from "../shared/logger.js";
import { telemetry } from "../shared/telemetry.js";

/**
 * Estimates token count for a list of messages.
 * Simple approximation: 1 token ~= 4 characters.
 */
export function estimateTokens(messages) {
  let charCount = 0;
  for (const msg of messages) {
    charCount += msg.content.length;
    // Overhead for role/metadata
    charCount += 20; 
  }
  return Math.ceil(charCount / 4);
}

/**
 * Checks if the context exceeds a certain percentage of the limit and compresses if necessary.
 */
export async function compressContextIfNeeded(state, client) {
  const CONTEXT_LIMIT = state.contextLimit || 32000;
  const THRESHOLD_PERCENT = 0.7;
  const currentTokens = estimateTokens([
    { role: "system", content: state.systemPrompt },
    ...state.history
  ]);

  if (currentTokens > CONTEXT_LIMIT * THRESHOLD_PERCENT) {
    logger.info(`Context usage at ${Math.round((currentTokens / CONTEXT_LIMIT) * 100)}%, triggering compression...`);
    
    try {
      const summary = await summarizeHistory(state, client);
      
      // Keep some of the most recent history
      const recentMessages = state.history.slice(-4);
      
      state.history = [
        { 
          role: "system", 
          content: `This is a summary of the previous conversation to save context space:\n\n${summary}` 
        },
        ...recentMessages
      ];
      
      telemetry.emit("CONTEXT_COMPRESSION", {
        originalTokens: currentTokens,
        newTokens: estimateTokens(state.history),
        summaryLength: summary.length
      });
      
      return true;
    } catch (error) {
      logger.error("Failed to compress context", error);
      return false;
    }
  }
  
  return false;
}

/**
 * Calls the LLM to generate a summary of the conversation history.
 */
async function summarizeHistory(state, client) {
  const summaryPrompt = [
    "Summarize the preceding conversation history into a concise report.",
    "Focus on:",
    "1. The current status of the task.",
    "2. Key decisions made.",
    "3. Any technical details (paths, identifiers) that are still relevant.",
    "Keep it under 500 words. Be objective and factual."
  ].join("\n");

  const messages = [
    { role: "system", content: "You are a helpful assistant that summarizes conversation history." },
    ...state.history,
    { role: "user", content: summaryPrompt }
  ];

  const result = await client.chat({
    model: state.model,
    messages,
    temperature: 0.3,
  });

  if (!result.ok) {
    throw new Error(`Summarization failed: ${result.error.message}`);
  }

  return result.data;
}

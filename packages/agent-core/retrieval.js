import { logger } from "../shared/logger.js";
import { runToolRequest } from "../tool-runtime/index.js";

/**
 * Extracts potential search keywords from a user query.
 * Simplistic implementation: removes common words and keeps capitalized or snake_case/camelCase terms.
 */
function extractKeywords(query) {
  const commonWords = new Set(["the", "this", "that", "how", "what", "where", "find", "search", "show", "tell", "need", "help", "want", "please", "with", "from", "for"]);
  const words = query.split(/[^a-zA-Z0-9_$]+/).filter(w => w.length > 3);
  
  return Array.from(new Set(words.filter(w => !commonWords.has(w.toLowerCase()))));
}

/**
 * Automatically retrieves relevant context based on user input.
 */
export async function retrieveContext(query, state) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return "";

  logger.debug(`Retrieval: searching for keywords: ${keywords.join(", ")}`);

  const retrievedFiles = new Set();
  const contextSnippets = [];

  // Limit number of searches to avoid high latency
  const searchTerms = keywords.slice(0, 3);

  for (const term of searchTerms) {
    const result = await runToolRequest(state, {
      tool: "search_files",
      query: term,
    });

    if (result.ok && result.data && result.data !== "No matches found.") {
      // Parse the output which is in "path:line: content" format
      const lines = result.data.split("\n");
      for (const line of lines) {
        const match = line.match(/^([^:]+):/);
        if (match) {
          retrievedFiles.add(match[1]);
        }
        if (retrievedFiles.size >= 3) break;
      }
    }
    if (retrievedFiles.size >= 3) break;
  }

  // Read the content of the identified files
  for (const filePath of retrievedFiles) {
    const readResult = await runToolRequest(state, {
      tool: "read_file",
      path: filePath,
    });

    if (readResult.ok) {
      contextSnippets.push(`--- FILE: ${filePath} ---\n${readResult.data.slice(0, 5000)}`);
    }
  }

  if (contextSnippets.length === 0) return "";

  return [
    "\n[Retrieved Context (Automatically injected based on your request)]",
    ...contextSnippets,
    "[End of Retrieved Context]\n"
  ].join("\n");
}

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../shared/logger.js";

const MEMORY_DIR = ".gemini";
const MEMORY_FILE = "memory.json";

/**
 * Ensures the memory directory exists.
 */
async function ensureDir() {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      logger.error("Failed to create memory directory", error);
    }
  }
}

/**
 * Loads memory from the local workspace.
 */
export async function loadMemory() {
  await ensureDir();
  const filePath = path.join(MEMORY_DIR, MEMORY_FILE);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.error("Failed to load memory", error);
    }
    return {
      preferences: {},
      patterns: [],
      sessions: []
    };
  }
}

/**
 * Saves memory to the local workspace.
 */
export async function saveMemory(memory) {
  await ensureDir();
  const filePath = path.join(MEMORY_DIR, MEMORY_FILE);
  try {
    await fs.writeFile(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (error) {
    logger.error("Failed to save memory", error);
  }
}

/**
 * Updates project-specific patterns based on recent interaction.
 * This is a simple implementation that can be improved.
 */
export async function updateMemoryWithTurn(line, finalReply, memory) {
  // Logic to extract patterns or preferences could go here.
  // For now, we just track that a session happened.
  memory.sessions.push({
    timestamp: new Date().toISOString(),
    userRequest: line.slice(0, 100),
  });
  
  // Keep only last 50 sessions
  if (memory.sessions.length > 50) {
    memory.sessions.shift();
  }
  
  await saveMemory(memory);
}

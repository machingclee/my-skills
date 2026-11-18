/**
 * DeepSeek V4 Flash (`deepseek-v4-flash`) completion caps.
 * The API maximum output is 384K (393,216). Documented defaults are
 * 8,192 without thinking, 65,536 with thinking, and 131,072 at reasoning
 * effort max. The chat model thinks by default, and those thought tokens
 * count against the same max_tokens.
 */
export const MAX_TOKEN_LEVELS = [
  { id: "min", label: "Min", tokens: 8_192 },
  { id: "moderate", label: "Moderate", tokens: 65_536 },
  { id: "max", label: "Max", tokens: 131_072 },
  { id: "ultra", label: "Ultra", tokens: 393_216 },
] as const;

export type MaxTokenLevel = (typeof MAX_TOKEN_LEVELS)[number]["id"];

const LEVEL_IDS = new Set<string>(MAX_TOKEN_LEVELS.map((level) => level.id));

export function normalizeMaxTokenLevel(level: string | undefined): MaxTokenLevel {
  return level && LEVEL_IDS.has(level) ? (level as MaxTokenLevel) : "min";
}

export function maxTokensFor(level: string | undefined): number {
  const id = normalizeMaxTokenLevel(level);
  return MAX_TOKEN_LEVELS.find((entry) => entry.id === id)!.tokens;
}

/**
 * Identity Parser
 *
 * Parses IDENTITY.md files programmatically, following OpenClaw's
 * identity-file.ts pattern. Extracts structured metadata (name, emoji,
 * creature, vibe, avatar) from markdown key-value pairs.
 *
 * NASA 10: No dynamic memory, fixed loop bounds, assertion-validated.
 */

/** Structured identity parsed from IDENTITY.md */
export interface AgentIdentity {
  name?: string;
  emoji?: string;
  creature?: string;
  vibe?: string;
  theme?: string;
  avatar?: string;
}

/** Placeholder values that indicate an unfilled template */
const PLACEHOLDER_VALUES = new Set([
  "pick something you like",
  "ai? robot? familiar? ghost in the machine? something weirder?",
  "how do you come across? sharp? warm? chaotic? calm?",
  "your signature - pick one that feels right",
  "workspace-relative path, http(s) url, or data uri",
]);

/** Normalize a string for comparison: trim, strip markdown, collapse whitespace */
function normalize(value: string): string {
  let out = value.trim();
  // Strip leading/trailing markdown bold/italic
  out = out.replace(/^[*_]+|[*_]+$/g, "").trim();
  // Strip parenthetical wrapper
  if (out.startsWith("(") && out.endsWith(")")) {
    out = out.slice(1, -1).trim();
  }
  // Normalize dashes and whitespace
  out = out.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  return out.toLowerCase();
}

/** Check if a value is an unfilled template placeholder */
function isPlaceholder(value: string): boolean {
  const normalized = normalize(value);
  return PLACEHOLDER_VALUES.has(normalized);
}

/** Known identity field names (lowercase) */
const KNOWN_FIELDS = new Set(["name", "emoji", "creature", "vibe", "theme", "avatar"]);

/**
 * Parse IDENTITY.md content into structured metadata.
 *
 * Supports both list-item format (`- **Name:** foo`) and
 * plain key-value format (`Name: foo`).
 */
export function parseIdentityMarkdown(content: string): AgentIdentity {
  const identity: AgentIdentity = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    // Strip list-item prefix
    const cleaned = line.trim().replace(/^\s*-\s*/, "");
    const colonIndex = cleaned.indexOf(":");

    if (colonIndex === -1) continue;

    const rawLabel = cleaned.slice(0, colonIndex).replace(/[*_]/g, "").trim().toLowerCase();
    const rawValue = cleaned.slice(colonIndex + 1).replace(/^[*_]+|[*_]+$/g, "").trim();

    if (!rawValue || !KNOWN_FIELDS.has(rawLabel)) continue;
    if (isPlaceholder(rawValue)) continue;

    // Type-safe assignment
    if (rawLabel === "name") identity.name = rawValue;
    else if (rawLabel === "emoji") identity.emoji = rawValue;
    else if (rawLabel === "creature") identity.creature = rawValue;
    else if (rawLabel === "vibe") identity.vibe = rawValue;
    else if (rawLabel === "theme") identity.theme = rawValue;
    else if (rawLabel === "avatar") identity.avatar = rawValue;
  }

  return identity;
}

/** Check if an identity has at least one meaningful field */
export function identityHasValues(identity: AgentIdentity): boolean {
  return Boolean(
    identity.name ||
    identity.emoji ||
    identity.theme ||
    identity.creature ||
    identity.vibe ||
    identity.avatar,
  );
}
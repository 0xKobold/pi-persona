/**
 * Workspace Loader
 *
 * Loads persona workspace files with scope-aware priority:
 *
 *   Global  (~/.0xkobold/SOUL.md) — THE agent's persona. Always loaded.
 *   Project (.0xkobold/SOUL.md)  — Augments global. Tagged `scope: project`
 *                                  in frontmatter → agent knows it's situational.
 *
 * When both exist for the same filename, BOTH are loaded (not replaced):
 *   - Global first (who the agent IS)
 *   - Project second (how to behave in THIS project)
 *   - Project files with `scope: project` get explicit annotation in prompt
 *
 * Inspired by OpenClaw's workspace.ts + context file ordering.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { parseIdentityMarkdown, identityHasValues, type AgentIdentity } from "./identity-parser.js";

// ============================================================================
// Constants
// ============================================================================

export const FILENAMES = {
  SOUL: "SOUL.md",
  IDENTITY: "IDENTITY.md",
  USER: "USER.md",
  AGENTS: "AGENTS.md",
  TOOLS: "TOOLS.md",
  HEARTBEAT: "HEARTBEAT.md",
  BOOTSTRAP: "BOOTSTRAP.md",
  MEMORY: "MEMORY.md",
} as const;

export type PersonaFilename = typeof FILENAMES[keyof typeof FILENAMES];

/** Injection priority (lower = earlier in prompt). Matches OpenClaw. */
const FILE_ORDER: Record<string, number> = {
  [FILENAMES.AGENTS]: 10,
  [FILENAMES.SOUL]: 20,
  [FILENAMES.IDENTITY]: 30,
  [FILENAMES.USER]: 40,
  [FILENAMES.TOOLS]: 50,
  [FILENAMES.BOOTSTRAP]: 60,
  [FILENAMES.MEMORY]: 70,
};

const MAX_FILE_BYTES = 2 * 1024 * 1024;

// ============================================================================
// Frontmatter Parsing
// ============================================================================

export interface Frontmatter {
  scope?: "global" | "project";
  /** Any other frontmatter keys */
  [key: string]: unknown;
}

/**
 * Parse YAML-like frontmatter from markdown content.
 *
 * ```md
 * ---
 * scope: project
 * project: my-app
 * ---
 * # SOUL.md
 * ```
 *
 * Returns { frontmatter, body }. If no frontmatter, body = full content.
 */
export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const result: Frontmatter = {};

  if (!content.startsWith("---")) {
    return { frontmatter: result, body: content };
  }

  // Find closing ---
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: result, body: content };
  }

  const raw = content.slice(3, endIdx).trim();

  // Simple key: value parsing (no nested YAML)
  for (const line of raw.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");

    if (key === "scope" && (val === "global" || val === "project")) {
      result.scope = val;
    } else {
      result[key] = val;
    }
  }

  const body = content.slice(endIdx + 4).replace(/^\s+/, "");
  return { frontmatter: result, body };
}

// ============================================================================
// Types
// ============================================================================

export type PersonaScope = "global" | "project";

/** A loaded workspace file with its content and resolved scope */
export interface PersonaFile {
  name: PersonaFilename;
  path: string;
  /** Full content including frontmatter */
  content: string;
  /** Body content (frontmatter stripped) */
  body: string;
  /** Where the file was found on disk */
  source: "global" | "project" | "default";
  /** Explicit scope from frontmatter (or inferred from source) */
  scope: PersonaScope;
  frontmatter: Frontmatter;
  /** Whether this project file is overriding a global file of the same name */
  isOverride: boolean;
}

/** Resolved persona state for a session */
export interface PersonaState {
  /** All loaded files, sorted by priority */
  files: PersonaFile[];
  /** Identity parsed from the active IDENTITY.md */
  identity: AgentIdentity | null;
  /** Whether key persona files exist */
  hasSoul: boolean;
  hasUser: boolean;
  hasIdentity: boolean;
  /** Source map: which directory each file came from */
  sources: Record<string, "global" | "project" | "default">;
  /** Project overrides: files that exist both globally and locally */
  overrides: PersonaFilename[];
}

// ============================================================================
// File Loading
// ============================================================================

function readFile_safe(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function getGlobalDir(): string {
  return path.join(homedir(), ".0xkobold");
}

/** Candidate project directories, in priority order */
function getProjectDirs(projectDir: string): Array<{ dir: string }> {
  return [
    { dir: path.join(projectDir, ".0xkobold") },
    { dir: projectDir },
  ];
}

function sortByPriority(files: PersonaFile[]): PersonaFile[] {
  return files.toSorted((a, b) => {
    // Group by scope first: global before project
    if (a.scope !== b.scope) {
      return a.scope === "global" ? -1 : 1;
    }
    // Then by file type order
    const aOrder = FILE_ORDER[a.name] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = FILE_ORDER[b.name] ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

/** Build a PersonaFile from raw content */
function makePersonaFile(
  filename: PersonaFilename,
  filePath: string,
  rawContent: string,
  source: "global" | "project" | "default",
  isOverride: boolean,
): PersonaFile {
  const { frontmatter, body } = parseFrontmatter(rawContent);

  // Resolve scope: frontmatter wins, then infer from source
  let scope: PersonaScope;
  if (frontmatter.scope) {
    scope = frontmatter.scope;
  } else if (source === "global" || source === "default") {
    scope = "global";
  } else {
    scope = "project";
  }

  return {
    name: filename,
    path: filePath,
    content: rawContent,
    body,
    source,
    scope,
    frontmatter,
    isOverride,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load persona files with scope-aware merging.
 *
 * - Global files (~/.0xkobold/) are ALWAYS loaded — they're the agent's core persona.
 * - Project files (.0xkobold/ or CWD/) AUGMENT globals — loaded IN ADDITION, not instead.
 * - Project files with `scope: project` frontmatter are explicitly annotated in the prompt.
 * - If a file exists in both scopes, both are loaded; the project version is marked as override.
 *
 * @param projectDir - Current working directory (project root)
 * @param defaultTemplates - Map of filename → default template (only used when no global exists)
 */
export function loadPersonaFiles(
  projectDir: string,
  defaultTemplates: Map<string, string>,
): PersonaFile[] {
  const globalDir = getGlobalDir();
  const projectDirs = getProjectDirs(projectDir);
  const files: PersonaFile[] = [];
  const seenFromGlobal = new Set<string>();

  // ---- Pass 1: Load global files (agent's core persona) ----
  for (const filename of Object.values(FILENAMES)) {
    const filePath = path.join(globalDir, filename);
    const content = readFile_safe(filePath);

    if (content !== null) {
      files.push(makePersonaFile(filename as PersonaFilename, filePath, content, "global", false));
      seenFromGlobal.add(filename);
      continue;
    }

    // No global file → use default template if one exists
    if (defaultTemplates.has(filename)) {
      files.push(makePersonaFile(
        filename as PersonaFilename,
        `(default)/${filename}`,
        defaultTemplates.get(filename)!,
        "default",
        false,
      ));
      seenFromGlobal.add(filename);
    }
  }

  // ---- Pass 2: Load project files (situational augmentations) ----
  for (const filename of Object.values(FILENAMES)) {
    let foundInProject = false;

    for (const { dir } of projectDirs) {
      if (foundInProject) break;
      const filePath = path.join(dir, filename);
      const content = readFile_safe(filePath);

      if (content !== null) {
        const isOverride = seenFromGlobal.has(filename);
        files.push(makePersonaFile(filename as PersonaFilename, filePath, content, "project", isOverride));
        foundInProject = true;
      }
    }
  }

  return sortByPriority(files);
}

/**
 * Build the full persona state for a session.
 */
export function buildPersonaState(
  projectDir: string,
  defaultTemplates: Map<string, string>,
): PersonaState {
  const files = loadPersonaFiles(projectDir, defaultTemplates);

  // Parse IDENTITY.md — prefer global, fall back to project
  const identityFile = files.find(f => f.name === FILENAMES.IDENTITY && f.scope === "global")
    ?? files.find(f => f.name === FILENAMES.IDENTITY);
  let identity: AgentIdentity | null = null;
  if (identityFile) {
    const parsed = parseIdentityMarkdown(identityFile.body);
    if (identityHasValues(parsed)) {
      identity = parsed;
    }
  }

  // Build source map (most specific source per filename)
  const sources: Record<string, "global" | "project" | "default"> = {};
  for (const f of files) {
    sources[f.name] = f.source;
  }

  // Find overrides (same filename loaded from both global and project)
  const globalNames = new Set(files.filter(f => f.scope === "global").map(f => f.name));
  const overrides = files
    .filter(f => f.scope === "project" && globalNames.has(f.name))
    .map(f => f.name);

  return {
    files,
    identity,
    hasSoul: files.some(f => f.name === FILENAMES.SOUL && f.scope === "global"),
    hasUser: files.some(f => f.name === FILENAMES.USER && f.scope === "global"),
    hasIdentity: identity !== null,
    sources,
    overrides: [...new Set(overrides)],
  };
}

/**
 * Format persona files for system prompt injection.
 *
 * Scope-aware rendering:
 * - Global files render normally
 * - Project files with `scope: project` get an explicit annotation:
 *   "This is a project-specific override. It augments your core persona for THIS project only."
 * - Project overrides are rendered after their global counterparts
 */
export function formatPersonaForPrompt(files: PersonaFile[]): string {
  if (files.length === 0) return "";

  const lines: string[] = [];
  const hasSoulFile = files.some(f => f.name === FILENAMES.SOUL && f.scope === "global");

  lines.push("## Persona Context");
  lines.push("");

  if (hasSoulFile) {
    lines.push(
      "Your core persona is defined by SOUL.md. **Embody its persona and tone.** " +
      "Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.",
    );
    lines.push("");
  }

  // Group: globals first, then project augmentations
  const globals = files.filter(f => f.scope === "global");
  const projects = files.filter(f => f.scope === "project");

  if (globals.length > 0) {
    lines.push("### Core Persona (global)");
    lines.push("");
    for (const file of globals) {
      lines.push(`#### ${file.path}`, "", file.body, "");
    }
  }

  if (projects.length > 0) {
    lines.push("### Project Augmentation (local)");
    lines.push("");
    lines.push(
      "The following files are project-specific. They augment your core persona for THIS project only. " +
      "When you leave this project, these overrides no longer apply.",
    );
    lines.push("");

    for (const file of projects) {
      const tag = file.isOverride ? " ⚡ OVERRIDE" : "";
      const scopeNote = file.frontmatter.scope === "project"
        ? " *(explicitly scoped to this project)*"
        : "";
      lines.push(`#### ${file.path}${tag}${scopeNote}`, "", file.body, "");
    }
  }

  return lines.join("\n");
}
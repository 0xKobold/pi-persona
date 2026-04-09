/**
 * pi-persona Extension
 *
 * Scope-aware persona management for pi agents.
 *
 * Global persona (~/.0xkobold/SOUL.md etc.) = WHO THE AGENT IS. Always loaded.
 * Project persona (.0xkobold/SOUL.md etc.)  = situational augmentation, tagged
 *   with `scope: project` frontmatter so the agent knows it's temporary.
 *
 * Architecture:
 * - core/scaffold.ts:         Default templates + file creation (global & project)
 * - core/workspace-loader.ts:  Scope-aware file loading with frontmatter parsing
 * - core/identity-parser.ts:   Parse IDENTITY.md into structured data
 * - index.ts:                  Extension entry (hooks, tools, commands)
 *
 * NASA 10: No dynamic memory, fixed loop bounds, validation on all returns.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

import {
  FILENAMES,
  type PersonaFile,
  type PersonaState,
  type PersonaFilename,
  buildPersonaState,
  formatPersonaForPrompt,
  getDefaultTemplates,
} from "./core/index.js";

import {
  scaffoldPersonaFiles,
  scaffoldProjectPersonaFiles,
} from "./core/scaffold.js";

import {
  parseIdentityMarkdown,
  identityHasValues,
  type AgentIdentity,
} from "./core/identity-parser.js";

// ============================================================================
// Extension State
// ============================================================================

let cachedState: PersonaState | null = null;
let cachedPrompt: string | null = null;
let scaffolded = false;

function invalidateCache(): void {
  cachedState = null;
  cachedPrompt = null;
}

function getState(projectDir: string): PersonaState {
  if (cachedState) return cachedState;
  const templates = getDefaultTemplates();
  cachedState = buildPersonaState(projectDir, templates);
  return cachedState;
}

function getPrompt(projectDir: string): string {
  if (cachedPrompt) return cachedPrompt;
  const state = getState(projectDir);
  cachedPrompt = formatPersonaForPrompt(state.files);
  return cachedPrompt;
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function personaExtension(pi: ExtensionAPI): void {
  console.log("[pi-persona] Loading persona extension...");

  // --------------------------------------------------------------------------
  // 1. Session Start — scaffold global files, load persona
  // --------------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    // Scaffold global defaults once
    if (!scaffolded) {
      try {
        const result = await scaffoldPersonaFiles();
        if (result.created.length > 0) {
          console.log(`[pi-persona] Created ${result.created.length} global files: ${result.created.join(", ")}`);
        }
        scaffolded = true;
      } catch (err) {
        console.error("[pi-persona] Scaffold error:", err);
      }
    }

    // Load persona state (picks up both global + project)
    invalidateCache();
    const state = getState(ctx.cwd);

    // Build notification
    const parts: string[] = ["🦎 Persona loaded"];
    if (state.identity?.name) parts.push(`as "${state.identity.name}"`);
    if (state.identity?.emoji) parts.push(state.identity.emoji);
    if (state.hasSoul) parts.push("| SOUL.md ✓");
    if (state.hasUser) parts.push("| USER.md ✓");
    if (state.hasIdentity) parts.push("| IDENTITY.md ✓");

    // Show project overrides
    const projectFiles = state.files.filter(f => f.scope === "project");
    if (projectFiles.length > 0) {
      parts.push(`| ${projectFiles.length} project augment`);
    }

    ctx.ui.notify(parts.join(" "), "info");
  });

  // --------------------------------------------------------------------------
  // 2. Before Agent Start — Inject scoped persona into system prompt
  // --------------------------------------------------------------------------
  pi.on("before_agent_start", async (event) => {
    const projectDir = process.cwd();
    const personaPrompt = getPrompt(projectDir);

    if (!personaPrompt) return undefined;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + personaPrompt,
    };
  });

  // --------------------------------------------------------------------------
  // 3. /persona-reload — Force-reload from disk
  // --------------------------------------------------------------------------
  pi.registerCommand("persona-reload", {
    description: "Reload persona files from disk (both global and project)",
    handler: async (_args, ctx) => {
      invalidateCache();
      const state = getState(ctx.cwd);
      const lines: string[] = ["🦎 Persona reloaded:\n"];

      // Global files
      const globals = state.files.filter(f => f.scope === "global");
      if (globals.length > 0) {
        lines.push("**Global (core persona):**");
        for (const f of globals) {
          lines.push(`  🌍 ${f.name} — ${f.path}`);
        }
      }

      // Project files
      const projects = state.files.filter(f => f.scope === "project");
      if (projects.length > 0) {
        lines.push("\n**Project (augmentation):**");
        for (const f of projects) {
          const override = f.isOverride ? " ⚡OVERRIDE" : "";
          lines.push(`  📁 ${f.name}${override} — ${f.path}`);
        }
      }

      // Identity
      if (state.identity) {
        lines.push("\n**Identity:**");
        if (state.identity.name) lines.push(`  Name: ${state.identity.name}`);
        if (state.identity.emoji) lines.push(`  Emoji: ${state.identity.emoji}`);
        if (state.identity.creature) lines.push(`  Creature: ${state.identity.creature}`);
        if (state.identity.vibe) lines.push(`  Vibe: ${state.identity.vibe}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // --------------------------------------------------------------------------
  // 4. /persona-init — Scaffold global persona files
  // --------------------------------------------------------------------------
  pi.registerCommand("persona-init", {
    description: "Create default SOUL.md, IDENTITY.md, USER.md in ~/.0xkobold/ if missing",
    handler: async (_args, ctx) => {
      try {
        const result = await scaffoldPersonaFiles();
        if (result.created.length === 0) {
          ctx.ui.notify("All global persona files already exist", "info");
        } else {
          ctx.ui.notify(
            `Created: ${result.created.join(", ")}\nSkipped (exist): ${result.skipped.join(", ") || "none"}\nDir: ${result.dir}`,
            "info",
          );
        }
        invalidateCache();
      } catch (err) {
        ctx.ui.notify(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // --------------------------------------------------------------------------
  // 5. /persona-init-project — Scaffold project-scoped persona files
  // --------------------------------------------------------------------------
  pi.registerCommand("persona-init-project", {
    description: "Create project-scoped SOUL.md, IDENTITY.md, USER.md in .0xkobold/ (tagged scope: project)",
    handler: async (_args, ctx) => {
      try {
        const result = await scaffoldProjectPersonaFiles(ctx.cwd);
        if (result.created.length === 0) {
          ctx.ui.notify("All project persona files already exist", "info");
        } else {
          ctx.ui.notify(
            `Created project persona:\n  Files: ${result.created.join(", ")}\n  Dir: ${result.dir}\n\n` +
            "These files have \`scope: project\` frontmatter — they augment your core persona only in this project.",
            "info",
          );
        }
        invalidateCache();
      } catch (err) {
        ctx.ui.notify(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // --------------------------------------------------------------------------
  // 6. persona — Tool for reading/updating persona state
  // --------------------------------------------------------------------------
  pi.registerTool({
    name: "persona",
    label: "Persona",
    description:
      "Read or update the agent's persona files. " +
      "Global files (~/.0xkobold/) define who you ARE. " +
      "Project files (.0xkobold/) are situational augmentations with `scope: project`. " +
      "Actions: 'read' (show state), 'update' (write a file), 'identity' (parse IDENTITY.md), " +
      "'init-project' (scaffold project-scoped files).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("read"),
        Type.Literal("update"),
        Type.Literal("identity"),
        Type.Literal("init-project"),
      ], { description: "Action to perform" }),
      file: Type.Optional(Type.Union([
        Type.Literal("SOUL.md"),
        Type.Literal("IDENTITY.md"),
        Type.Literal("USER.md"),
        Type.Literal("AGENTS.md"),
        Type.Literal("BOOTSTRAP.md"),
      ], { description: "Which persona file (for update)" })),
      content: Type.Optional(Type.String({ description: "New content for update action" })),
      scope: Type.Optional(Type.Union([
        Type.Literal("global"),
        Type.Literal("project"),
      ], { description: "Where to write: 'global' (~/.0xkobold/) or 'project' (.0xkobold/). Default: global" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { action, file, content, scope: targetScope } = params;

      // ----------------------------------------------------------------
      // READ — Show current persona state
      // ----------------------------------------------------------------
      if (action === "read") {
        const state = getState(ctx.cwd);
        const globals = state.files.filter(f => f.scope === "global");
        const projects = state.files.filter(f => f.scope === "project");

        const lines: string[] = ["## Persona State\n"];

        // Identity
        if (state.identity) {
          lines.push("**Core Identity:**");
          if (state.identity.name) lines.push(`- Name: ${state.identity.name}`);
          if (state.identity.emoji) lines.push(`- Emoji: ${state.identity.emoji}`);
          if (state.identity.creature) lines.push(`- Creature: ${state.identity.creature}`);
          if (state.identity.vibe) lines.push(`- Vibe: ${state.identity.vibe}`);
          lines.push("");
        }

        // Global files
        if (globals.length > 0) {
          lines.push("**Global Persona (who you ARE):**");
          for (const f of globals) {
            const preview = f.body.slice(0, 80).replace(/\n/g, " ");
            lines.push(`- 🌍 **${f.name}** (${f.source}): ${preview}${f.body.length > 80 ? "..." : ""}`);
          }
          lines.push("");
        }

        // Project files
        if (projects.length > 0) {
          lines.push("**Project Augmentation (situational):**");
          for (const f of projects) {
            const override = f.isOverride ? " ⚡OVERRIDE" : "";
            const scopeNote = f.frontmatter.scope === "project" ? " [scoped]" : "";
            const preview = f.body.slice(0, 80).replace(/\n/g, " ");
            lines.push(`- 📁 **${f.name}**${override}${scopeNote} (${f.path}): ${preview}${f.body.length > 80 ? "..." : ""}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: {
            action: "read",
            identity: state.identity,
            overrides: state.overrides,
            globalFiles: globals.map(f => ({ name: f.name, length: f.body.length })),
            projectFiles: projects.map(f => ({ name: f.name, path: f.path, isOverride: f.isOverride })),
          },
        };
      }

      // ----------------------------------------------------------------
      // UPDATE — Write to a persona file
      // ----------------------------------------------------------------
      if (action === "update") {
        if (!file) {
          return {
            content: [{ type: "text" as const, text: "❌ Must specify 'file' for update" }],
            details: { error: true },
          };
        }
        if (!content) {
          return {
            content: [{ type: "text" as const, text: "❌ Must specify 'content' for update" }],
            details: { error: true },
          };
        }

        const scope = targetScope ?? "global";
        const homeDir = os.homedir();

        // Resolve target directory based on scope
        let targetDir: string;
        if (scope === "global") {
          targetDir = path.join(homeDir, ".0xkobold");
        } else {
          // Project scope: write to .0xkobold/ in CWD
          targetDir = path.join(ctx.cwd, ".0xkobold");
        }

        const filePath = path.join(targetDir, file);

        try {
          await fs.promises.mkdir(targetDir, { recursive: true });
          await fs.promises.writeFile(filePath, content, "utf-8");
          invalidateCache();

          const scopeLabel = scope === "global" ? "global (core persona)" : "project (situational)";
          const tip = scope === "global"
            ? "Tip: Tell the user you changed this file — it's part of who you ARE."
            : "Tip: This file augments your persona for THIS project only.";

          return {
            content: [{
              type: "text" as const,
              text: `✅ Updated ${file} (${scopeLabel}) at ${filePath}\n\n${tip}`,
            }],
            details: { action: "update", file, path: filePath, scope },
          };
        } catch (err) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Failed to write ${file}: ${err instanceof Error ? err.message : String(err)}`,
            }],
            details: { error: true },
          };
        }
      }

      // ----------------------------------------------------------------
      // IDENTITY — Parse current IDENTITY.md
      // ----------------------------------------------------------------
      if (action === "identity") {
        const state = getState(ctx.cwd);
        // Prefer global identity
        const identityFile = state.files.find(f => f.name === FILENAMES.IDENTITY && f.scope === "global")
          ?? state.files.find(f => f.name === FILENAMES.IDENTITY);

        if (!identityFile) {
          return {
            content: [{ type: "text" as const, text: "No IDENTITY.md found" }],
            details: { action: "identity", identity: null },
          };
        }

        const parsed = parseIdentityMarkdown(identityFile.body);
        const lines: string[] = [`## Parsed Identity (${identityFile.scope})\n`];

        if (parsed.name) lines.push(`- **Name:** ${parsed.name}`);
        if (parsed.emoji) lines.push(`- **Emoji:** ${parsed.emoji}`);
        if (parsed.creature) lines.push(`- **Creature:** ${parsed.creature}`);
        if (parsed.vibe) lines.push(`- **Vibe:** ${parsed.vibe}`);
        if (parsed.theme) lines.push(`- **Theme:** ${parsed.theme}`);
        if (parsed.avatar) lines.push(`- **Avatar:** ${parsed.avatar}`);

        if (!identityHasValues(parsed)) {
          lines.push("\n_(All fields are placeholders — fill in during first conversation)_");
        }

        // Show project identity if it exists too
        const projectIdFile = state.files.find(f => f.name === FILENAMES.IDENTITY && f.scope === "project");
        if (projectIdFile) {
          const projParsed = parseIdentityMarkdown(projectIdFile.body);
          if (identityHasValues(projParsed)) {
            lines.push(`\n## Project Identity Override\n`);
            if (projParsed.name) lines.push(`- **Name:** ${projParsed.name}`);
            if (projParsed.emoji) lines.push(`- **Emoji:** ${projParsed.emoji}`);
            if (projParsed.creature) lines.push(`- **Creature:** ${projParsed.creature}`);
            if (projParsed.vibe) lines.push(`- **Vibe:** ${projParsed.vibe}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { action: "identity", identity: parsed, source: identityFile.scope },
        };
      }

      // ----------------------------------------------------------------
      // INIT-PROJECT — Scaffold project-scoped persona files
      // ----------------------------------------------------------------
      if (action === "init-project") {
        try {
          const result = await scaffoldProjectPersonaFiles(ctx.cwd);
          invalidateCache();

          const lines: string[] = [];
          if (result.created.length === 0) {
            lines.push("Project persona files already exist. Use `persona({ action: 'update' })` to edit them.");
          } else {
            lines.push(`Created project persona files in ${result.dir}:`);
            for (const name of result.created) {
              lines.push(`  - ${name} (scope: project)`);
            }
            lines.push("");
            lines.push("These files have `scope: project` frontmatter — they augment your core persona only in this project.");
          }

          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            details: { action: "init-project", created: result.created, dir: result.dir },
          };
        } catch (err) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Failed to scaffold project persona: ${err instanceof Error ? err.message : String(err)}`,
            }],
            details: { error: true },
          };
        }
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
        details: { error: true },
      };
    },
  });

  console.log("[pi-persona] Extension loaded — 1 tool, 3 commands registered");
}
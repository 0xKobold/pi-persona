# AGENT.md — @0xkobold/pi-persona

## What This Package Does

Scope-aware persona management for pi agents. Loads SOUL.md, IDENTITY.md, USER.md from both global (`~/.0xkobold/`) and project (`.0xkobold/`) locations, merges them with proper scoping, and injects into the system prompt.

**Global persona = who the agent IS.** Project persona = situational augmentation.

## Architecture

```
src/
├── index.ts                 # Extension entry (hooks, tools, commands)
└── core/
    ├── identity-parser.ts   # Parse IDENTITY.md into structured data
    ├── workspace-loader.ts  # Scope-aware file loading + frontmatter + prompt formatting
    ├── scaffold.ts          # Default templates for global & project files
    └── index.ts             # Barrel export
```

## Extension Factory

```typescript
export default async function personaExtension(pi: ExtensionAPI): Promise<void>
```

Async factory matching pi-kobold's `await factory(pi)` pattern. Registered in pi-kobold's `subExtensions` array with sentinel `{ type: "tool", name: "persona" }`.

## Tools

| Tool | Description |
|------|-------------|
| `persona` | Read/update persona files, parse identity, scaffold project files |

**Actions:** `read`, `update`, `identity`, `init-project`

## Commands

| Command | Description |
|---------|-------------|
| `/persona-reload` | Reload persona files from disk |
| `/persona-init` | Create global defaults in `~/.0xkobold/` if missing |
| `/persona-init-project` | Create project-scoped files in `.0xkobold/` |

## Lifecycle Hooks

- `session_start` — Scaffolds global files on first run, loads persona state
- `before_agent_start` — Injects scoped persona into system prompt

## Sentinel Tool

`persona` — Used by pi-kobold's duplicate-load guard to detect if the extension was already loaded.

## Key Types (importable from `@0xkobold/pi-persona/core`)

```typescript
import {
  // Types
  type PersonaFile,
  type PersonaState,
  type PersonaScope,
  type PersonaFilename,
  type AgentIdentity,
  type ScaffoldResult,
  type Frontmatter,

  // Constants
  FILENAMES,

  // Functions
  buildPersonaState,
  formatPersonaForPrompt,
  loadPersonaFiles,
  parseFrontmatter,
  parseIdentityMarkdown,
  identityHasValues,
  scaffoldPersonaFiles,
  scaffoldProjectPersonaFiles,
  getDefaultTemplates,
} from "@0xkobold/pi-persona/core";
```

## Persona File Priority

| Priority | File | Global Purpose | Project Purpose |
|----------|------|---------------|-----------------|
| 10 | AGENTS.md | Workspace rules | Project-specific rules |
| 20 | SOUL.md | Agent personality, values | Project vibe/tone override |
| 30 | IDENTITY.md | Name, emoji, creature | Project role |
| 40 | USER.md | User profile | Project stakeholders |
| 50 | TOOLS.md | Tool preferences | Project tool config |
| 60 | BOOTSTRAP.md | First-run ritual | — |
| 70 | MEMORY.md | Long-term memories | Project memories |

When both global and project files exist for the same type, **both are loaded** (not replaced). Global appears first, project appears second with `scope: project` annotation.

## Frontmatter

Project files can have YAML frontmatter:

```markdown
---
scope: project
---
# Content here
```

If no frontmatter, scope is inferred from location:
- `~/.0xkobold/` → `global`
- `.0xkobold/` or `CWD/` → `project`

## Integration with pi-kobold

Loaded as a sub-extension in pi-kobold's `index.ts`. Users can install either:

- `pi install npm:@0xkobold/pi-persona` — standalone
- `pi install npm:@0xkobold/pi-kobold` — bundled (loads persona automatically)

No conflicts if both are installed — pi-kobold's duplicate guard skips re-loading.

## Dependencies

- `@mariozechner/pi-coding-agent` >=0.65.0 (peer)
- `@sinclair/typebox` >=0.32.0 (peer)
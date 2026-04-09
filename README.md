# @0xkobold/pi-persona

Scope-aware persona management for pi agents.

**Global persona = who the agent IS.** Project persona = situational augmentation.

## How It Works

```
~/.0xkobold/SOUL.md        ← The agent's core personality (always loaded)
~/.0xkobold/IDENTITY.md    ← The agent's name, emoji, vibe (always loaded)
~/.0xkobold/USER.md        ← The user's profile (always loaded)

.0xkobold/SOUL.md          ← Project-specific augmentation (tagged scope: project)
.0xkobold/IDENTITY.md       ← Project identity override (tagged scope: project)
.0xkobold/USER.md           ← Project stakeholder info (tagged scope: project)
```

When both global AND project files exist for the same type:
- **Both are loaded** (not replaced)
- Global appears first ("Core Persona")
- Project appears second ("Project Augmentation")
- Project files with `scope: project` frontmatter get explicit annotation:
  > "This is a project-specific override. It augments your core persona for THIS project only."

## Frontmatter: Tagging Project Scope

Project files can have YAML frontmatter:

```markdown
---
scope: project
---
# SOUL — Project Persona

This only applies when working in this project...
```

If no frontmatter, scope is inferred from location:
- `~/.0xkobold/` → `global`
- `.0xkobold/` or `CWD/` → `project`

## Files

| File | Priority | Global Purpose | Project Purpose |
|------|----------|---------------|-----------------|
| **SOUL.md** | 20 | Agent personality, values, boundaries | Project-specific vibe/tone override |
| **IDENTITY.md** | 30 | Name, emoji, creature, vibe | Project role (e.g., "code reviewer") |
| **USER.md** | 40 | User profile, preferences, context | Project stakeholders, communication style |
| **AGENTS.md** | 10 | Workspace rules, startup ritual | Project-specific rules, conventions |
| **BOOTSTRAP.md** | 60 | First-run ritual (deleted after use) | — |
| **MEMORY.md** | 70 | Long-term curated memories | Project-specific memory |
| **TOOLS.md** | 50 | Tool notes and preferences | Project tool config |

## System Prompt Injection

The extension injects into the system prompt at `before_agent_start`:

```
## Persona Context

Your core persona is defined by SOUL.md. **Embody its persona and tone.**
Avoid stiff, generic replies; follow its guidance unless higher-priority
instructions override it.

### Core Persona (global)
#### ~/.0xkobold/SOUL.md
[content]

### Project Augmentation (local)
The following files are project-specific. They augment your core persona
for THIS project only.

#### .0xkobold/SOUL.md ⚡OVERRIDE *(explicitly scoped to this project)*
[content]
```

## Commands

| Command | Description |
|---------|-------------|
| `/persona-reload` | Reload persona files from disk |
| `/persona-init` | Create global defaults in `~/.0xkobold/` if missing |
| `/persona-init-project` | Create project-scoped files in `.0xkobold/` with `scope: project` |

## Tool: `persona`

| Action | Description |
|--------|-------------|
| `read` | Show current persona state (global + project) |
| `update` | Write to a persona file (`scope`: "global" or "project") |
| `identity` | Parse IDENTITY.md into structured metadata |
| `init-project` | Scaffold project-scoped persona files with frontmatter |

**Update example:**

```
# Update global SOUL.md
persona({ action: "update", file: "SOUL.md", content: "# My Soul\n...", scope: "global" })

# Update project IDENTITY.md
persona({ action: "update", file: "IDENTITY.md", content: "---\nscope: project\n---\n...", scope: "project" })

# Init project files
persona({ action: "init-project" })
```

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

## Integration with pi-kobold

Add to `pi-config.ts`:

```typescript
extensions: [
  // ... other extensions
  './node_modules/@0xkobold/pi-persona/dist/index.js',
]
```

Or as a pi-kobold sub-extension (the factory pattern):

```typescript
import personaExtension from "@0xkobold/pi-persona";

// In pi-kobold's index.ts sub-extension loading:
await personaExtension(pi);
```

## Replaces

- `persona-loader-extension.ts` (scaffolded files but never injected into prompt)
- Persona parts of `memory-bootstrap-extension.ts` (identity loading fallback)

## License

MIT
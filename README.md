# @0xkobold/pi-persona

Scope-aware persona management for [pi](https://pi.dev) agents.

**Global persona = who the agent IS.** Project persona = situational augmentation.

Part of the [0xKobold](https://github.com/0xKobold) ecosystem.

## Installation

### Bundled (recommended)

```bash
pi install npm:@0xkobold/pi-kobold
# pi-persona loaded as sub-extension automatically
```

### Standalone

```bash
pi install npm:@0xkobold/pi-persona

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-persona'
  ]
}

# Or temporary (testing)
pi -e npm:@0xkobold/pi-persona
```

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

## API Functions

Library functions are importable for programmatic use:

```typescript
import {
  buildPersonaState,
  formatPersonaForPrompt,
  parseIdentityMarkdown,
  identityHasValues,
  scaffoldPersonaFiles,
  scaffoldProjectPersonaFiles,
  getDefaultTemplates,
  FILENAMES,
  type PersonaFile,
  type PersonaState,
  type AgentIdentity,
  type ScaffoldResult,
} from "@0xkobold/pi-persona/core";

// Build persona state for a project directory
const state = buildPersonaState("/path/to/project", getDefaultTemplates());
console.log(state.identity?.name, state.hasSoul, state.overrides);

// Format persona files for injection into a prompt
const prompt = formatPersonaForPrompt(state.files);

// Parse an IDENTITY.md file
const identity = parseIdentityMarkdown(markdownContent);
if (identityHasValues(identity)) {
  console.log(identity.name, identity.emoji, identity.vibe);
}

// Scaffold default global persona files
const result = await scaffoldPersonaFiles();
// result.created = ["SOUL.md", "IDENTITY.md", "USER.md"]
// result.skipped = []
// result.dir = "/home/user/.0xkobold"

// Scaffold project-scoped files with frontmatter
const projResult = await scaffoldProjectPersonaFiles("/path/to/project");
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

## Related Packages

- [`@0xkobold/pi-kobold`](https://github.com/0xKobold/pi-kobold) — Meta-extension that bundles this and other sub-extensions
- [`@0xkobold/pi-learn`](https://github.com/0xKobold/pi-learn) — Persistent memory & reasoning for pi agents
- [`@0xkobold/pi-ollama`](https://github.com/0xKobold/pi-ollama) — Ollama integration for pi agents

## Local Development

```bash
git clone https://github.com/0xKobold/pi-persona
cd pi-persona
npm install
npm run build
pi install ./
```

## License

MIT © 0xKobold
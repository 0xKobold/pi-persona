import { describe, expect, test } from "bun:test";
import { parseIdentityMarkdown, identityHasValues } from "../src/core/identity-parser";
import { parseFrontmatter } from "../src/core/workspace-loader";
import { getDefaultTemplates } from "../src/core/scaffold";

// ============================================================================
// identity-parser
// ============================================================================

describe("identity-parser", () => {
  test("parses list-item format", () => {
    const md = `# IDENTITY\n\n- **Name:** Kobold\n- **Emoji:** 🦎\n- **Creature:** Familiar\n- **Vibe:** Warm, curious`;
    const result = parseIdentityMarkdown(md);
    expect(result.name).toBe("Kobold");
    expect(result.emoji).toBe("🦎");
    expect(result.creature).toBe("Familiar");
    expect(result.vibe).toBe("Warm, curious");
  });

  test("parses plain key-value format", () => {
    const md = `# IDENTITY\n\nName: Shalom\nEmoji: ✡\nCreature: Golem`;
    const result = parseIdentityMarkdown(md);
    expect(result.name).toBe("Shalom");
    expect(result.emoji).toBe("✡");
    expect(result.creature).toBe("Golem");
  });

  test("skips placeholder values", () => {
    const md = `# IDENTITY\n\n- **Name:** _(pick something you like)_\n- **Vibe:** How do you come across? sharp? warm? chaotic? calm?`;
    const result = parseIdentityMarkdown(md);
    expect(result.name).toBeUndefined();
    expect(result.vibe).toBeUndefined();
  });

  test("identityHasValues returns false for empty", () => {
    expect(identityHasValues({})).toBe(false);
    expect(identityHasValues({ name: "Kobold" })).toBe(true);
  });
});

// ============================================================================
// frontmatter parser
// ============================================================================

describe("parseFrontmatter", () => {
  test("parses scope: project", () => {
    const md = `---\nscope: project\n---\n# SOUL\n\nHello`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.scope).toBe("project");
    expect(body).toBe("# SOUL\n\nHello");
  });

  test("parses scope: global", () => {
    const md = `---\nscope: global\n---\nContent`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.scope).toBe("global");
    expect(body).toBe("Content");
  });

  test("returns full body when no frontmatter", () => {
    const md = `# SOUL\n\nJust content`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.scope).toBeUndefined();
    expect(body).toBe("# SOUL\n\nJust content");
  });

  test("handles unclosed frontmatter gracefully", () => {
    const md = `---\nscope: project\nNo closing dashes`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.scope).toBeUndefined();
    expect(body).toBe(md);
  });

  test("parses arbitrary keys", () => {
    const md = `---\nscope: project\nproject: my-app\nversion: "1.0"\n---\nContent`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.scope).toBe("project");
    expect(frontmatter.project).toBe("my-app");
    expect(frontmatter.version).toBe("1.0");
  });
});

// ============================================================================
// templates
// ============================================================================

describe("getDefaultTemplates", () => {
  test("provides SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md", () => {
    const templates = getDefaultTemplates();
    expect(templates.has("SOUL.md")).toBe(true);
    expect(templates.has("IDENTITY.md")).toBe(true);
    expect(templates.has("USER.md")).toBe(true);
    expect(templates.has("BOOTSTRAP.md")).toBe(true);
  });

  test("SOUL.md mentions Core Truths", () => {
    const templates = getDefaultTemplates();
    expect(templates.get("SOUL.md")!).toContain("Core Truths");
  });

  test("IDENTITY.md has placeholder values", () => {
    const templates = getDefaultTemplates();
    const content = templates.get("IDENTITY.md")!;
    expect(content).toContain("pick something you like");
  });

  test("USER.md mentions About Your Human", () => {
    const templates = getDefaultTemplates();
    expect(templates.get("USER.md")!).toContain("About Your Human");
  });
});
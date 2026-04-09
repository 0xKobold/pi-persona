/**
 * Core module barrel export
 */

export { parseIdentityMarkdown, identityHasValues, type AgentIdentity } from "./identity-parser.js";
export {
  parseFrontmatter,
  type Frontmatter,
  FILENAMES,
  type PersonaFilename,
  type PersonaScope,
  type PersonaFile,
  type PersonaState,
  loadPersonaFiles,
  buildPersonaState,
  formatPersonaForPrompt,
} from "./workspace-loader.js";
export {
  DEFAULT_SOUL,
  DEFAULT_IDENTITY,
  DEFAULT_USER,
  DEFAULT_BOOTSTRAP,
  PROJECT_SOUL_TEMPLATE,
  PROJECT_IDENTITY_TEMPLATE,
  PROJECT_USER_TEMPLATE,
  scaffoldPersonaFiles,
  scaffoldProjectPersonaFiles,
  getDefaultTemplates,
  type ScaffoldResult,
} from "./scaffold.js";
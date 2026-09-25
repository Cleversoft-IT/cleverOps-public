// Legge i manifest reali in ../skills/*/SKILL.md e ../agents/*.md,
// estrae frontmatter (name + description), assegna categoria, e scrive
// data/skills.generated.json. Eseguito da `predev` / `prebuild`.
//
// "Pratica ciò che predichi": il sito è generato dalle skill vere, non da una lista a mano.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(SITE_ROOT, "..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const AGENTS_DIR = path.join(REPO_ROOT, "agents");
const OUT = path.join(SITE_ROOT, "data", "skills.generated.json");

const REPO = "Cleversoft-IT/cleverOps-public";

// Categoria per nome skill (fallback: "Altro").
const CATEGORY = {
  "drupal-expert": "Drupal",
  "drupal-migration": "Drupal",
  "drupal-security": "Drupal",
  "ddev-expert": "Drupal",
  "docker-local": "DevOps",
  "ionic-skills": "Mobile",
  "transcribe": "AI",
  "plan-auditor": "Workflow",
  "subagent-dev-with-codex": "Workflow",
  "frontend-design": "Design",
  "cleversoft-design": "Design",
  "cleversoft-design-system": "Design",
};

const LEGACY = new Set(["cleversoft-design"]);

// Le skill sono installabili sia in Claude Code che in Codex.
const SKILL_TARGETS = "claude,codex";

// Parser frontmatter minimale: blocco tra i primi due "---".
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const body = m[1];
  const out = {};
  const re = /^([a-zA-Z0-9_-]+):\s*(.*)$/gm;
  let mm;
  while ((mm = re.exec(body))) {
    let key = mm[1];
    let val = mm[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readSkill(name) {
  const file = path.join(SKILLS_DIR, name, "SKILL.md");
  if (!fs.existsSync(file)) return null;
  const fm = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const description = (fm.description || "").replace(/^\[LEGACY[^\]]*\]\s*/i, "").trim();
  // Harness di destinazione: frontmatter `targets: claude|codex` (assente = entrambi).
  const targets = (fm.targets || SKILL_TARGETS).split(",").map((t) => t.trim()).filter(Boolean);
  return {
    name,
    description,
    category: CATEGORY[name] || "Altro",
    legacy: LEGACY.has(name) || /\blegacy\b/i.test(fm.description || ""),
    targets,
    command: `npx github:${REPO} --target ${targets.join(",")} --skills ${name}`,
  };
}

function readAgent(file) {
  const full = path.join(AGENTS_DIR, file);
  const fm = parseFrontmatter(fs.readFileSync(full, "utf8"));
  const name = file.replace(/\.md$/, "");
  // gli agent hanno frontmatter con name/description (formato Claude Code subagent)
  let description = fm.description || "";
  // taglia eventuali blocchi <example> dalla descrizione lunga
  description = description.split(/<example>/i)[0].trim();
  if (description.length > 320) description = description.slice(0, 317).trimEnd() + "…";
  return {
    name: fm.name || name,
    description,
    command: `npx github:${REPO} --target claude --agents ${file}`,
  };
}

function main() {
  // Deploy da sottocartella (es. Vercel CLI da site/): ../skills non è caricato.
  // Se la sorgente manca ma il JSON è già committato, lo teniamo e usciamo.
  if (!fs.existsSync(SKILLS_DIR)) {
    if (fs.existsSync(OUT)) {
      console.log(`[generate-skills] ../skills assente: uso il JSON committato (${path.relative(SITE_ROOT, OUT)})`);
      return;
    }
    throw new Error(`[generate-skills] ../skills non trovato e nessun ${path.relative(SITE_ROOT, OUT)} committato`);
  }

  const skillNames = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => !/\.bak/i.test(n)) // esclude i backup tipo transcribe.bak-...
    .sort();

  const skills = skillNames.map(readSkill).filter(Boolean);

  const agents = fs.existsSync(AGENTS_DIR)
    ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).sort().map(readAgent)
    : [];

  const categories = [...new Set(skills.map((s) => s.category))].sort();

  const data = {
    repo: REPO,
    counts: { skills: skills.length, agents: agents.length },
    categories,
    skills,
    agents,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `[generate-skills] ${skills.length} skill, ${agents.length} agent → ${path.relative(SITE_ROOT, OUT)}`
  );
}

main();

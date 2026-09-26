// Genera data/skills.generated.json per il sito a partire dal manifest della sorgente
// (../cleverops.json, contratto in docs/manifest.md e cleverops.schema.json) e dalle
// SKILL.md / agents/*.md reali. Eseguito da `predev`, `prebuild` e `pretypecheck`;
// il JSON prodotto non è versionato.
//
// "Pratica ciò che predichi": il sito è generato dalle skill vere, non da una lista a mano.
// Categorie, targets e legacy arrivano dal manifest; nome e descrizione dal frontmatter.
// Il manifest viene validato per intero contro il contratto PRIMA di costruire qualunque
// comando: tutti gli errori (manifest, cartelle, frontmatter) escono in un unico messaggio.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.join(__dirname, "..");

export const SUPPORTED_SCHEMA = 1;
const HARNESSES = ["claude", "codex"];
const VISIBILITIES = ["public", "private"];
const NAME_RE = /^[a-z0-9-]{1,64}$/;
const ID_RE = /^[a-z][a-z0-9-]*$/;
const KNOWN_TOP_KEYS = new Set(["$schema", "schemaVersion", "id", "visibility", "skills", "agents"]);
// "visibility" sulla singola voce non è nello schema v1: se presente deve valere
// public|private e può solo escludere la voce dal sito, mai includerla.
const KNOWN_SKILL_KEYS = new Set(["category", "targets", "legacy", "replaces", "requires", "visibility"]);
const KNOWN_AGENT_KEYS = new Set(["category", "targets", "visibility"]);
const AGENT_DESCRIPTION_MAX = 320;

export class ManifestError extends Error {}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Descrizione breve del valore trovato, per i messaggi di errore.
function show(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array ${truncate(JSON.stringify(value))}`;
  if (typeof value === "object") return "oggetto";
  if (typeof value === "string") return `stringa ${truncate(JSON.stringify(value))}`;
  return `${typeof value} ${truncate(String(value))}`;
}
const truncate = (s) => (s.length > 60 ? s.slice(0, 57) + "…" : s);

// ---------------------------------------------------------------------------
// Validazione del manifest (solo struttura e valori, senza toccare il disco)
// ---------------------------------------------------------------------------

function validateTargets(where, value, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${where}: "targets" non valido: atteso array di ${HARNESSES.join("|")}, trovato ${show(value)}`);
    return;
  }
  if (!value.length) errors.push(`${where}: "targets" non valido: la lista è vuota`);
  const bad = value.filter((t) => !HARNESSES.includes(t));
  if (bad.length) {
    errors.push(`${where}: "targets" non valido: valori ammessi ${HARNESSES.join("|")}, trovati ${bad.map(show).join(", ")}`);
  }
  const dup = value.filter((t, i) => value.indexOf(t) !== i);
  if (dup.length) errors.push(`${where}: "targets" non valido: duplicati ${[...new Set(dup)].join(", ")}`);
}

function validateEntry(kind, name, entry, errors, warnings) {
  const where = `${kind} "${name}"`;
  if (!NAME_RE.test(name)) errors.push(`${where}: nome non valido (atteso ${NAME_RE})`);
  if (!isPlainObject(entry)) {
    errors.push(`${where}: la voce deve essere un oggetto, trovato ${show(entry)}`);
    return;
  }

  if (!has(entry, "category")) errors.push(`${where}: manca "category"`);
  else if (typeof entry.category !== "string" || !entry.category.trim()) {
    errors.push(`${where}: "category" non valida: attesa stringa non vuota, trovato ${show(entry.category)}`);
  }

  if (has(entry, "targets")) validateTargets(where, entry.targets, errors);

  if (has(entry, "visibility") && !VISIBILITIES.includes(entry.visibility)) {
    errors.push(`${where}: "visibility" non valida: attesa ${VISIBILITIES.join("|")}, trovato ${show(entry.visibility)}`);
  }

  if (kind === "skill") {
    if (has(entry, "legacy") && typeof entry.legacy !== "boolean") {
      errors.push(`${where}: "legacy" non valido: atteso booleano, trovato ${show(entry.legacy)}`);
    }
    if (has(entry, "replaces")) {
      const r = entry.replaces;
      if (!Array.isArray(r)) {
        errors.push(`${where}: "replaces" non valido: atteso array di nomi, trovato ${show(r)}`);
      } else {
        const bad = r.filter((n) => typeof n !== "string" || !NAME_RE.test(n));
        if (bad.length) errors.push(`${where}: "replaces" non valido: nomi non conformi a ${NAME_RE}: ${bad.map(show).join(", ")}`);
        const dup = r.filter((n, i) => r.indexOf(n) !== i);
        if (dup.length) errors.push(`${where}: "replaces" non valido: duplicati ${[...new Set(dup)].join(", ")}`);
      }
    }
    if (has(entry, "requires")) {
      const req = entry.requires;
      if (!isPlainObject(req)) {
        errors.push(`${where}: "requires" non valido: atteso oggetto, trovato ${show(req)}`);
      } else if (has(req, "path") && (typeof req.path !== "string" || !req.path.trim())) {
        errors.push(`${where}: "requires.path" non valido: attesa stringa non vuota, trovato ${show(req.path)}`);
      }
    }
  }

  const known = kind === "skill" ? KNOWN_SKILL_KEYS : KNOWN_AGENT_KEYS;
  for (const key of Object.keys(entry)) {
    if (!known.has(key)) warnings.push(`${where}: campo sconosciuto "${key}" ignorato`);
  }
}

function validateCollection(kind, key, manifest, required, errors, warnings) {
  if (!has(manifest, key)) {
    if (required) errors.push(`manca "${key}"`);
    return {};
  }
  const value = manifest[key];
  if (!isPlainObject(value)) {
    errors.push(`"${key}" non valido: atteso oggetto { nome: voce }, trovato ${show(value)}`);
    return null; // invalido: le cartelle non si possono confrontare
  }
  for (const [name, entry] of Object.entries(value)) validateEntry(kind, name, entry, errors, warnings);
  return value;
}

/**
 * Valida un manifest già letto contro il contratto (schemaVersion 1).
 * Non lancia: restituisce { errors, warnings, skills, agents }, dove skills/agents sono
 * null se la collezione è invalida (e quindi non confrontabile con le cartelle).
 */
export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(manifest)) {
    return { errors: [`il manifest deve essere un oggetto JSON, trovato ${show(manifest)}`], warnings, skills: null, agents: null };
  }

  if (!has(manifest, "schemaVersion")) errors.push(`manca "schemaVersion"`);
  else if (manifest.schemaVersion !== SUPPORTED_SCHEMA) {
    const v = manifest.schemaVersion;
    if (Number.isInteger(v) && v > SUPPORTED_SCHEMA) {
      // Uno schema futuro non si valida con le regole della v1: basta l'invito ad aggiornare.
      return {
        errors: [`schemaVersion ${v} non supportata (massima ${SUPPORTED_SCHEMA}): aggiorna scripts/generate-skills.mjs`],
        warnings,
        skills: null,
        agents: null,
      };
    }
    errors.push(`"schemaVersion" non valido: atteso ${SUPPORTED_SCHEMA}, trovato ${show(v)}`);
  }

  if (!has(manifest, "id")) errors.push(`manca "id"`);
  else if (typeof manifest.id !== "string" || !ID_RE.test(manifest.id)) {
    errors.push(`"id" non valido: atteso ${ID_RE}, trovato ${show(manifest.id)}`);
  }

  if (!has(manifest, "visibility")) errors.push(`manca "visibility"`);
  else if (!VISIBILITIES.includes(manifest.visibility)) {
    errors.push(`"visibility" non valida: attesa ${VISIBILITIES.join("|")}, trovato ${show(manifest.visibility)}`);
  }

  if (has(manifest, "$schema") && typeof manifest.$schema !== "string") {
    errors.push(`"$schema" non valido: attesa stringa, trovato ${show(manifest.$schema)}`);
  }

  const skills = validateCollection("skill", "skills", manifest, true, errors, warnings);
  const agents = validateCollection("agent", "agents", manifest, false, errors, warnings);

  for (const key of Object.keys(manifest)) {
    if (!KNOWN_TOP_KEYS.has(key)) warnings.push(`campo sconosciuto "${key}" ignorato`);
  }

  return { errors, warnings, skills, agents };
}

// ---------------------------------------------------------------------------
// Lettura dal disco
// ---------------------------------------------------------------------------

function readJson(file, label, rel) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw new ManifestError(`${label} non trovato: ${rel(file)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ManifestError(`${label} non è JSON valido (${rel(file)}): ${err.message}`);
  }
}

// "owner/repo" dal campo repository del package.json alla radice
// (stringa "github:owner/repo" / "owner/repo" oppure oggetto { url }).
export function repoSlug(pkg) {
  const repo = pkg?.repository;
  const url = typeof repo === "string" ? repo : repo?.url;
  if (typeof url !== "string" || !url) throw new ManifestError(`package.json della radice: manca "repository.url"`);
  const m =
    url.match(/github\.com[/:]([^/\s]+)\/([^/\s#]+?)(?:\.git)?\/?(?:#.*)?$/i) ||
    url.match(/^(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!m) throw new ManifestError(`package.json della radice: repository.url non è un repo GitHub (${url})`);
  return `${m[1]}/${m[2]}`;
}

// Frontmatter YAML tra i due "---" iniziali, letto con un parser YAML vero.
function readFrontmatter(file, rel) {
  const md = fs.readFileSync(file, "utf8");
  const m = md.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new ManifestError(`${rel(file)}: frontmatter YAML assente`);
  let fm;
  try {
    fm = YAML.parse(m[1]);
  } catch (err) {
    throw new ManifestError(`${rel(file)}: frontmatter YAML non valido: ${err.message.split("\n")[0]}`);
  }
  if (!isPlainObject(fm)) throw new ManifestError(`${rel(file)}: il frontmatter deve essere una mappa YAML`);
  return fm;
}

const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

function listAgentFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => d.name.replace(/\.md$/, ""))
    .sort();
}

// Differenze tra le voci del manifest e ciò che esiste su disco.
function compareSets(kind, manifestNames, diskNames, where, errors) {
  const onDisk = new Set(diskNames);
  const inManifest = new Set(manifestNames);
  const missingOnDisk = manifestNames.filter((n) => !onDisk.has(n));
  const missingInManifest = diskNames.filter((n) => !inManifest.has(n));
  if (missingOnDisk.length) errors.push(`${kind} nel manifest ma assenti in ${where}: ${missingOnDisk.join(", ")}`);
  if (missingInManifest.length) errors.push(`${kind} in ${where} ma assenti dal manifest: ${missingInManifest.join(", ")}`);
}

// Una voce è pubblica solo se il manifest è "public" e la voce non dichiara altro.
const isPublic = (manifest, entry) => manifest.visibility === "public" && (entry.visibility ?? "public") === "public";

/**
 * Legge manifest, package.json e file di una sorgente e restituisce il catalogo del sito.
 * Lancia ManifestError con tutti gli errori raccolti in un unico messaggio.
 */
export function buildCatalog(repoRoot, { warn = () => {} } = {}) {
  const rel = (p) => path.relative(repoRoot, p) || ".";
  const manifestFile = path.join(repoRoot, "cleverops.json");
  const skillsDir = path.join(repoRoot, "skills");
  const agentsDir = path.join(repoRoot, "agents");

  const manifest = readJson(manifestFile, "manifest", rel);

  // 1. Contratto del manifest.
  const { errors, warnings, skills: skillEntries, agents: agentEntries } = validateManifest(manifest);
  warnings.forEach(warn);

  // 2. Repository per i comandi.
  let repo = null;
  try {
    repo = repoSlug(readJson(path.join(repoRoot, "package.json"), "package.json della radice", rel));
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    errors.push(err.message);
  }

  // 3. Coerenza manifest ↔ cartelle e frontmatter (su tutte le voci, anche non pubbliche).
  const frontmatter = { skill: new Map(), agent: new Map() };
  if (skillEntries) {
    const names = Object.keys(skillEntries).sort();
    compareSets("skill", names, listDirs(skillsDir), "skills/", errors);
    // I nomi non validi sono già errori: non li si usa per costruire percorsi.
    for (const name of names.filter((n) => NAME_RE.test(n))) {
      const file = path.join(skillsDir, name, "SKILL.md");
      if (!fs.existsSync(path.dirname(file))) continue; // già segnalata da compareSets
      if (!fs.existsSync(file)) {
        errors.push(`skill "${name}": manca ${rel(file)}`);
        continue;
      }
      try {
        const fm = readFrontmatter(file, rel);
        if (fm.name !== name) errors.push(`skill "${name}": il frontmatter ha name ${show(fm.name)} (deve coincidere con la cartella)`);
        if (typeof fm.description !== "string" || !fm.description.trim()) errors.push(`skill "${name}": description mancante nel frontmatter`);
        frontmatter.skill.set(name, fm);
      } catch (err) {
        errors.push(err.message);
      }
    }
  }
  if (agentEntries) {
    const names = Object.keys(agentEntries).sort();
    compareSets("agent", names, listAgentFiles(agentsDir), "agents/", errors);
    for (const name of names.filter((n) => NAME_RE.test(n))) {
      const file = path.join(agentsDir, `${name}.md`);
      if (!fs.existsSync(file)) continue; // già segnalato da compareSets
      try {
        const fm = readFrontmatter(file, rel);
        if (fm.name !== undefined && fm.name !== name) errors.push(`agent "${name}": il frontmatter ha name ${show(fm.name)} (deve coincidere con il file)`);
        if (typeof fm.description !== "string" || !fm.description.trim()) errors.push(`agent "${name}": description mancante nel frontmatter`);
        frontmatter.agent.set(name, fm);
      } catch (err) {
        errors.push(err.message);
      }
    }
  }

  if (errors.length) {
    throw new ManifestError(
      `${rel(manifestFile)} non valido o non allineato alle cartelle (${errors.length} errori):\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }

  // 4. Solo ora, con tutto validato, si costruiscono voci e comandi.
  const skills = Object.keys(skillEntries)
    .sort()
    .filter((name) => isPublic(manifest, skillEntries[name]))
    .map((name) => {
      const entry = skillEntries[name];
      const targets = entry.targets ?? HARNESSES;
      return {
        name,
        description: oneLine(frontmatter.skill.get(name).description),
        category: entry.category.trim(),
        legacy: entry.legacy === true,
        targets,
        command: `npx github:${repo} --target ${targets.join(",")} --skills ${name}`,
      };
    });

  const agents = Object.keys(agentEntries)
    .sort()
    .filter((name) => isPublic(manifest, agentEntries[name]))
    .map((name) => {
      const entry = agentEntries[name];
      const targets = entry.targets ?? HARNESSES;
      // Le description degli agent contengono spesso blocchi <example>: sul sito basta l'intro.
      let description = oneLine(frontmatter.agent.get(name).description.split(/<example>/i)[0]);
      if (description.length > AGENT_DESCRIPTION_MAX) {
        description = description.slice(0, AGENT_DESCRIPTION_MAX - 1).trimEnd() + "…";
      }
      return {
        name,
        description,
        category: entry.category.trim(),
        targets,
        command: `npx github:${repo} --target ${targets.join(",")} --agents ${name}`,
      };
    });

  if (!skills.length) {
    throw new ManifestError(
      `${rel(manifestFile)}: nessuna skill pubblica (visibility "${manifest.visibility}"): il sito mostra solo voci public`
    );
  }

  const categories = [...new Set(skills.map((s) => s.category))].sort((a, b) => a.localeCompare(b, "it"));
  return { repo, counts: { skills: skills.length, agents: agents.length }, categories, skills, agents };
}

function main() {
  const repoRoot = path.join(SITE_ROOT, "..");
  const out = path.join(SITE_ROOT, "data", "skills.generated.json");
  const data = buildCatalog(repoRoot, { warn: (w) => console.warn(`[generate-skills] avviso: ${w}`) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `[generate-skills] ${data.counts.skills} skill, ${data.counts.agents} agent (${data.repo}) → ${path.relative(SITE_ROOT, out)}`
  );
}

// Eseguito come script (non importato dai test).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    if (err instanceof ManifestError) {
      console.error(`[generate-skills] errore: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

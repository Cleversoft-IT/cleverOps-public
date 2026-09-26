#!/usr/bin/env node
// Cataloghi e pacchetti derivati: modificare cleverops.json e le risorse originali.
import fs from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, readManifest } from '../bin/lib/manifest.mjs';
import { excluded, treeHash } from '../bin/lib/treehash.mjs';
import { isEntryPoint } from '../bin/lib/entry.mjs';
import { parseFrontmatter } from './validate-skills.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE = '.claude-plugin/marketplace.json';
const CODEX = '.agents/plugins/marketplace.json';
const MARKER = 'plugins/README.md';
const NOTICE = '# Plugin generati da cleverOps\n\n'
  + 'Questa directory è interamente generata da `scripts/gen-marketplace.mjs`.\n'
  + 'Non modificarla a mano: sorgenti in `skills/`, `agents/` e `cleverops.json`.\n'
  + 'Rigenerare dopo ogni modifica; `--check` verifica anche contenuti e file obsoleti.\n';
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const stat = path => fs.lstatSync(path, { throwIfNoEntry: false });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// Regola stabile fra versioni Node: termina su . ! ? seguiti da spazio o fine.
// I punti interni a versioni e percorsi non interrompono la frase.
function firstSentence(description) {
  const text = description.replace(/\s+/g, ' ').trim();
  return text.match(/^.*?[.!?]["'”’»]*(?=\s|$)/u)?.[0] || text;
}

// Riserva un carattere per l'ellissi e non spezza parole o coppie surrogate.
// Se la prima parola supera da sola il limite, taglia per caratteri Unicode.
function shortDescription(sentence) {
  const chars = [...sentence], limit = 120;
  if (chars.length <= limit) return sentence;
  const prefix = chars.slice(0, limit - 1).join('');
  const boundary = prefix.lastIndexOf(' ');
  const text = chars[limit - 1] === ' ' || boundary < 0 ? prefix : prefix.slice(0, boundary);
  return `${text.trimEnd()}…`;
}

// Copie autonome: niente link verso file esclusi dalla cache del singolo plugin.
function addResource(files, root, source, dest, directory) {
  const path = join(root, source), info = stat(path);
  if (!info || info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
    throw new Error(`Risorsa mancante o non regolare: ${source}`);
  }
  if (!fs.realpathSync(path).startsWith(fs.realpathSync(root) + sep)) {
    throw new Error(`Risorsa esterna alla sorgente: ${source}`);
  }
  treeHash(path); // Verifica anche cicli e link figli esterni alla risorsa.
  const visit = (src, dst, relative = '') => {
    if (excluded(relative)) return;
    const entry = fs.statSync(src);
    if (entry.isDirectory()) {
      for (const child of fs.readdirSync(src).sort(compare)) {
        visit(join(src, child), `${dst}/${child}`, relative ? `${relative}/${child}` : child);
      }
    } else {
      files.set(dst, { data: fs.readFileSync(src), mode: entry.mode & 0o111 ? 0o755 : 0o644 });
    }
  };
  visit(path, dest);
}

export function buildMarketplace(root, warn = () => {}) {
  const manifest = readManifest(root, warn);
  const pkg = readJSON(join(root, 'package.json'));
  const { version } = pkg;
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error('package.json deve dichiarare una version SemVer.');
  }
  const name = `cleverops-${manifest.id}`;
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const repositoryField = typeof repository === 'string' && repository.trim() ? { repository: repository.trim() } : {};
  const description = typeof pkg.description === 'string' && pkg.description.trim()
    ? pkg.description.trim() : `Plugin di skill e agent del catalogo ${name}.`;
  const claude = { name, owner: { name: 'Cleversoft IT' }, description, plugins: [] };
  const codex = { name, interface: { displayName: name }, plugins: [] };
  const files = new Map([[MARKER, { data: Buffer.from(NOTICE), mode: 0o644 }]]);
  const names = new Set();
  const entries = ['skills', 'agents'].flatMap(kind => Object.entries(manifest[kind])
    .map(([name, meta]) => ({ kind, name, ...meta }))).sort((a, b) => compare(a.name, b.name));

  for (const item of entries) {
    if (names.has(item.name)) throw new Error(`Nome plugin ambiguo fra skill e agent: ${item.name}`);
    names.add(item.name);
    // I riferimenti Codex forniti non definiscono agent personalizzati nei plugin.
    const targets = item.targets.filter(target => item.kind === 'skills' || target === 'claude');
    if (item.kind === 'agents' && item.targets.includes('codex')) {
      warn(`Agent ${item.name}: su Codex resta gestito dall'installer; formato plugin non documentato.`);
    }
    if (!targets.length) continue;
    const plugin = `plugins/${item.name}`;
    let description = `${item.name} — ${item.category}`;
    let longDescription = description;
    if (item.kind === 'skills') {
      const skill = `skills/${item.name}`;
      if (!stat(join(root, skill, 'SKILL.md'))?.isFile()) throw new Error(`SKILL.md mancante: ${skill}`);
      // Manifest annidati altererebbero la scoperta dei componenti negli host.
      for (const reserved of ['plugin.json', '.claude-plugin', '.codex-plugin']) {
        if (stat(join(root, skill, reserved))) throw new Error(`File plugin riservato nella skill: ${skill}/${reserved}`);
      }
      addResource(files, root, skill, `${plugin}/${skill}`, true);
      // Legge il payload solo dopo aver verificato il confine della risorsa.
      const frontmatter = parseFrontmatter(files.get(`${plugin}/${skill}/SKILL.md`).data.toString('utf8'));
      longDescription = frontmatter.description.replace(/\s+/g, ' ').trim();
      description = firstSentence(longDescription);
    } else {
      const agent = `agents/${item.name}.md`;
      addResource(files, root, agent, `${plugin}/${agent}`, false);
    }
    if (targets.includes('claude')) {
      // Senza .claude-plugin/plugin.json, l'entry funge da manifest.
      claude.plugins.push({ name: item.name, source: `./${plugin}`, description, version, ...repositoryField, category: item.category });
    }
    if (targets.includes('codex')) {
      files.set(`${plugin}/plugin.json`, { data: json({
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: item.name, version, description, author: { name: 'Cleversoft IT' }, ...repositoryField,
        extensions: { 'com.openai': { interface: {
          displayName: item.name, shortDescription: shortDescription(description), longDescription,
          developerName: 'Cleversoft IT', category: item.category,
          defaultPrompt: [`Usa la skill ${item.name}.`],
        } } },
      }), mode: 0o644 });
      codex.plugins.push({ name: item.name, source: { source: 'local', path: `./${plugin}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: item.category });
    }
  }
  files.set(CLAUDE, { data: json(claude), mode: 0o644 });
  files.set(CODEX, { data: json(codex), mode: 0o644 });
  return new Map([...files].sort(([a], [b]) => compare(a, b)));
}

function checkParents(root, path) {
  let dir = root;
  for (const part of path.split('/')) {
    dir = join(dir, part);
    if (stat(dir)?.isSymbolicLink()) throw new Error(`Output attraversa un symlink: ${path}`);
  }
}

function existingPlugins(root) {
  const found = [];
  const visit = path => {
    const info = stat(join(root, path));
    if (!info) return;
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(join(root, path)).sort(compare)) visit(`${path}/${name}`);
    } else found.push(path);
  };
  visit('plugins');
  return found;
}

export function generateMarketplace(root = DEFAULT_ROOT, { check = false, warn = () => {} } = {}) {
  root = resolve(root);
  const files = buildMarketplace(root, warn);
  for (const path of [CLAUDE, CODEX, 'plugins']) checkParents(root, path);
  const existing = existingPlugins(root);
  const differences = [];
  for (const [path, expected] of files) {
    checkParents(root, path);
    const info = stat(join(root, path));
    if (!info?.isFile() || !fs.readFileSync(join(root, path)).equals(expected.data)
      || (process.platform !== 'win32' && (info.mode & 0o111) !== (expected.mode & 0o111))) differences.push(path);
  }
  const stale = existing.filter(path => !files.has(path));
  differences.push(...stale);
  if (check) return { ok: differences.length === 0, differences: differences.sort(compare), files: files.size };

  // Non prendere possesso di una directory di plugin mantenuta a mano.
  if (existing.length && (!stat(join(root, MARKER))?.isFile() || fs.readFileSync(join(root, MARKER), 'utf8') !== NOTICE)) {
    throw new Error('plugins/ esiste senza il marker del generatore; spostarla prima di generare.');
  }
  for (const path of stale) fs.rmSync(join(root, path));
  for (const [path, { data, mode }] of files) {
    if (!differences.includes(path)) continue;
    fs.mkdirSync(dirname(join(root, path)), { recursive: true });
    fs.writeFileSync(join(root, path), data);
    fs.chmodSync(join(root, path), mode);
  }
  // Rimuove i contenitori vuoti dei plugin eliminati dal manifest.
  const prune = dir => {
    for (const child of fs.readdirSync(dir)) {
      const path = join(dir, child);
      if (stat(path)?.isDirectory()) { prune(path); if (!fs.readdirSync(path).length) fs.rmdirSync(path); }
    }
  };
  prune(join(root, 'plugins'));
  return { ok: true, differences: differences.sort(compare), files: files.size };
}

function main(args) {
  let root, check = false;
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log('Uso: node scripts/gen-marketplace.mjs [radice-repo] [--check]');
      return;
    }
    if (arg === '--check' && !check) check = true;
    else if (!arg.startsWith('-') && !root) root = arg;
    else { console.error(`Argomento non valido: ${arg}`); process.exitCode = 2; return; }
  }
  try {
    const result = generateMarketplace(root, { check, warn: message => console.error(message) });
    if (!result.ok) {
      console.error(`Marketplace da rigenerare:\n${result.differences.map(path => `  ${path}`).join('\n')}`);
      process.exitCode = 1;
    } else console.log(`Marketplace ${check ? 'verificati' : 'generati'}: ${result.files} file.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2));

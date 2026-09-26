#!/usr/bin/env node
// Validazione offline: usa solo Node e i validatori già condivisi con l'installer.
import fs from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME, object, readJSON, validateManifest } from '../bin/lib/manifest.mjs';
import { validateLegacy } from '../bin/lib/migrate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = new Set(['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata']);
const FIXED_PATH = /\.(?:claude|agents|codex)[/\\]skills\b|\$\{(?:CLAUDE_CONFIG_DIR|CODEX_HOME)[^}]*\}[/\\]skills\b/g;
const fail = message => { throw new Error(message); };

// Sottoinsieme YAML intenzionale: stringhe, blocchi |/>, lista di strumenti,
// metadata stringa→stringa. Tag, alias e strutture arbitrarie non sono necessari
// al frontmatter standard: si rifiutano esplicitamente, senza interpretarli male.
function stringValue(raw) {
  const text = raw.trim();
  if (text.startsWith('"')) {
    const match = text.match(/^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/);
    if (!match) fail('stringa YAML tra virgolette non valida');
    try { return JSON.parse(match[1]); }
    catch { fail('escape non supportato: usare gli escape JSON nelle stringhe YAML'); }
  }
  if (text.startsWith("'")) {
    const match = text.match(/^'((?:[^']|'')*)'(?:\s+#.*)?$/);
    if (!match) fail('stringa YAML con apici non valida');
    return match[1].replace(/''/g, "'");
  }
  const value = text.replace(/\s+#.*$/, '').trimEnd();
  if (!value || /^[\[\]{}&*!|>@`%#]/.test(value) || /^[-?:](?:\s|$)/.test(value) || /:(?:\s|$)/.test(value)) {
    fail('scalare YAML non valido o sintassi non supportata: usare una stringa tra virgolette');
  }
  if (/^(?:null|true|false|~|[-+]?(?:[0-9][0-9_.eE+-]*|\.[0-9]+|0x[\da-f]+|0o[0-7]+|\.inf|\.nan))$/i.test(value)) {
    fail('attesa stringa YAML, non un valore booleano, numerico o nullo');
  }
  return value;
}

function inlineList(raw) {
  // Le virgole dentro stringhe quotate non separano elementi.
  const parts = []; let part = '', quote = '';
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      part += ch;
      if (quote === '"' && ch === '\\') part += raw[++i] ?? '';
      else if (ch === quote) {
        if (quote === "'" && raw[i + 1] === "'") part += raw[++i];
        else quote = '';
      }
    } else if (ch === '"' || ch === "'") { quote = ch; part += ch; }
    else if (ch === ',' || ch === ']') {
      if (part.trim()) parts.push(stringValue(part));
      else if (ch === ',') fail('elemento vuoto nella lista YAML');
      part = '';
      if (ch === ']') {
        if (!/^(?:\s*|\s+#.*)$/.test(raw.slice(i + 1))) fail('contenuto dopo la lista YAML');
        return parts;
      }
    } else if (ch === '#' && /\s$/.test(part)) fail('commento prima della chiusura della lista YAML');
    else if ('[{}'.includes(ch)) fail('liste annidate non supportate nel frontmatter');
    else part += ch;
  }
  fail('lista YAML non chiusa');
}

export function parseFrontmatter(markdown) {
  const match = markdown.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail('frontmatter YAML assente o non chiuso');
  const lines = match[1].replace(/\r\n/g, '\n').split('\n');
  if (lines.some(line => /^ *\t/.test(line) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(line))) fail('tab o carattere di controllo nel frontmatter');
  const result = Object.create(null);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:#.*)?$/.test(lines[i])) continue;
    const entry = lines[i].match(/^([a-z][a-z0-9-]*):(?:\s+(.*))?$/);
    if (!entry) fail(`YAML non valido alla riga ${i + 2}`);
    const [, key, rest = ''] = entry;
    if (!KEYS.has(key)) fail(`chiave non standard: ${key}`);
    if (Object.hasOwn(result, key)) fail(`chiave YAML duplicata: ${key}`);
    const raw = rest.replace(/^#.*$/, '').trimEnd();
    const children = [];
    while (i + 1 < lines.length && (/^ /.test(lines[i + 1]) || /^\s*$/.test(lines[i + 1]))) children.push(lines[++i]);
    const meaningful = children.filter(line => line.trim() && !/^\s*#/.test(line));
    const indent = children.find(line => line.trim())?.match(/^ */)[0].length;
    if (/^[|>][+-]?(?:\s+#.*)?$/.test(raw)) {
      if (children.some(line => line.trim() && line.match(/^ */)[0].length < indent)) fail('indentazione del blocco YAML non valida');
      const firstContent = children.findIndex(line => line.trim());
      if (children.slice(0, firstContent).some(line => line.length > indent)) fail('indentazione iniziale del blocco YAML non valida');
      const block = children.map(line => line.slice(indent));
      let value = '';
      for (let n = 0; n < block.length; n++) {
        value += block[n];
        const fold = raw[0] === '>' && block[n] && block[n + 1] && !/^ /.test(block[n]) && !/^ /.test(block[n + 1]);
        const following = block.slice(n + 1).find(line => line !== '');
        const paragraph = raw[0] === '>' && block[n] && !/^ /.test(block[n]) && block[n + 1] === '' && following && !/^ /.test(following);
        value += fold ? ' ' : paragraph ? '' : '\n';
      }
      if (!raw.startsWith('|+') && !raw.startsWith('>+')) value = value.replace(/\n+$/, raw[1] === '-' ? '' : '\n');
      result[key] = value;
    } else if (key === 'metadata' && (!raw || raw === '{}')) {
      if (raw && meaningful.length) fail('contenuto dopo metadata inline');
      const metadata = Object.create(null);
      for (const line of meaningful) {
        if (line.match(/^ */)[0].length !== indent) fail('indentazione metadata non valida');
        const field = line.trim().match(/^([a-zA-Z0-9_-]+):\s+(.+)$/);
        if (!field || Object.hasOwn(metadata, field[1])) fail('metadata non validi o chiave duplicata');
        metadata[field[1]] = stringValue(field[2]);
      }
      result[key] = metadata;
    } else if (key === 'allowed-tools' && !raw) {
      result[key] = meaningful.map(line => {
        if (line.match(/^ */)[0].length !== indent || !line.trim().startsWith('- ')) fail('lista allowed-tools non valida');
        return stringValue(line.trim().slice(2));
      });
    } else if (key === 'allowed-tools' && raw.startsWith('[')) {
      if (meaningful.length) fail('contenuto dopo allowed-tools inline');
      result[key] = inlineList(raw);
    } else {
      if (meaningful.length && /^["']/.test(raw)) fail('contenuto dopo stringa quotata');
      result[key] = stringValue([raw, ...meaningful.map(line => line.trim())].join(' '));
    }
  }
  if (typeof result.name !== 'string' || !NAME.test(result.name)) fail('name non conforme a ^[a-z0-9-]{1,64}$');
  if (typeof result.description !== 'string' || !result.description.trim() || [...result.description].length > 1024) fail('description obbligatoria, non vuota e al massimo 1024 caratteri');
  if (result.metadata !== undefined && !object(result.metadata)) fail('metadata deve essere una mappa di stringhe');
  return result;
}

export function validateSkills(root = ROOT) {
  const errors = [], warnings = [];
  const check = (label, fn) => { try { return fn(); } catch (error) { errors.push(`${label}: ${error.message}`); } };
  const manifest = check('cleverops.json', () => validateManifest(readJSON(join(root, 'cleverops.json')), message => warnings.push(message)));
  check('legacy-hashes.json', () => validateLegacy(readJSON(join(root, 'legacy-hashes.json'))));
  const dirs = check('skills/', () => fs.readdirSync(join(root, 'skills'), { withFileTypes: true })) || [];
  const names = new Set(dirs.filter(entry => entry.isDirectory()).map(entry => entry.name));
  if (manifest) {
    for (const name of Object.keys(manifest.skills)) if (!names.has(name)) errors.push(`skills/${name}: nel manifest ma cartella assente`);
    for (const name of names) if (!Object.hasOwn(manifest.skills, name)) errors.push(`skills/${name}: cartella assente dal manifest`);
  }
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name), label = relative(root, file);
      if (entry.isSymbolicLink()) { errors.push(`${label}: symlink non ammesso nelle skill`); continue; }
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) { errors.push(`${label}: atteso file regolare`); continue; }
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(FIXED_PATH)) errors.push(`${label}:${text.slice(0, match.index).split('\n').length}: percorso di installazione fisso`);
      if (entry.name === 'SKILL.md') check(label, () => {
        const fm = parseFrontmatter(text);
        if (fm.name !== basename(dir)) fail('name diverso dal nome della cartella');
        const count = text.split('\n').length - Number(text.endsWith('\n'));
        if (count > 500) warnings.push(`${label}: ${count} righe (consigliate al massimo 500)`);
      });
    }
  };
  for (const name of names) if (!fs.existsSync(join(root, 'skills', name, 'SKILL.md'))) errors.push(`skills/${name}: SKILL.md assente`);
  check('skills/', () => walk(join(root, 'skills')));
  return { errors, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warnings } = validateSkills(process.argv[2] ? resolve(process.argv[2]) : ROOT);
  for (const message of warnings) console.warn(`AVVISO: ${message}`);
  for (const message of errors) console.error(`ERRORE: ${message}`);
  if (errors.length) process.exitCode = 1;
  else console.log('Skill, manifest e hash legacy validi.');
}

#!/usr/bin/env node
// Guardia pubblica: impedisce che contenuti riservati finiscano in questo repo.
//
//   node scripts/check-public.mjs --all                      albero di HEAD
//   node scripts/check-public.mjs --staged                   indice (pre-commit)
//   node scripts/check-public.mjs --range <base> <head>      commit in <base>..<head> (pre-push, CI)
//   node scripts/check-public.mjs --new <head> [<remote>]    commit di <head> non presenti su <remote>
//                                                            (default origin): branch nuovo
//   node scripts/check-public.mjs --history <rev>            TUTTI i commit raggiungibili da <rev>
//                                                            (primo push, CI senza "before")
//   node scripts/check-public.mjs --name <testo>             un nome (es. branch) contro regole e denylist
//
// Per i commit si controllano autore, committer e messaggio, e il contenuto COMPLETO di ogni
// file aggiunto o modificato (merge compresi, rispetto a ciascun genitore), non il diff.
//
// Denylist (termini riservati, una regex case-insensitive per riga, '#' = commento):
//   $PUBLIC_GUARD_DENYLIST (contenuto) → $PUBLIC_GUARD_DENYLIST_FILE → ~/.config/cleverops/public-denylist.txt
// La denylist non sta mai nel repo e non viene mai stampata: in output compaiono solo l'indice
// della regola e la posizione, con il percorso redatto se contiene qualcosa di vietato.
// Senza denylist la guardia fallisce (fail-closed): sulle PR da fork vale la procedura sostitutiva.
//
// File non testuali (binari, UTF-16, …): ammessi solo se elencati con il loro sha256 in
// scripts/public-assets.json. Falsi positivi delle regole generiche: commento
// "public-guard:allow <id-regola>" sulla stessa riga. La denylist non ha eccezioni.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW_MARKER = 'public-guard:allow';
const ASSETS_FILE = process.env.PUBLIC_GUARD_ASSETS
  || join(dirname(fileURLToPath(import.meta.url)), 'public-assets.json');

// Percorsi che non devono mai esistere nel repo pubblico.
const FORBIDDEN_PATHS = [
  [/^agents\//, 'agent interni'],
  [/^legacy\//, 'materiale legacy'],
  [/(^|\/)references\/[^/]*contact/i, 'file di contatti'],
  [/^install\.sh$/, 'installer bash dismesso'],
  [/^skills\/cleversoft-design/, 'design system interno'],
  [/^skills\/transcribe-pro(\/|$)/, 'skill interna'],
  [/^skills\/frontend-design(\/|$)/, 'skill rimossa (plugin ufficiale)'],
];

// Regole generiche: sono pubbliche, quindi non contengono nulla di riservato.
const RULES = [
  ['cellulare-it', /(?<![\d.])(?:\+39[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\d.])/],
  ['partita-iva', /(p\.?\s?iva|partita\s+iva|\bvat\b)\W{0,5}(it)?\d{11}/i],
  ['email-aziendale', /[a-z0-9._%+-]+@cleversoft\.it/i],
  ['path-personale', /\/(home|Users)\/(?!user\b|username\b|you\b|me\b|runner\b|<|\$|\{|\.\.\.)[A-Za-z0-9._-]+\//],
  ['git-ssh-install', /git\+ssh:\/\//],
  ['falso-privato', /repo(sitory)?\s+privat[oi]\s+(con|via)\s+(la\s+)?(tua\s+)?chiave/i],
];

function fail(msg, code = 2) {
  console.error(`✗ check-public: ${msg}`);
  process.exit(code);
}

// Git senza mai lasciar trapelare argomenti, percorsi o stderr grezzi.
function git(args, { raw = false } = {}) {
  try {
    const out = execFileSync('git', args, { maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return raw ? out : out.toString('utf8');
  } catch {
    fail(`comando git fallito (git ${args[0]}): controlla lo stato del repo`);
  }
}

function loadDenylist() {
  let raw = process.env.PUBLIC_GUARD_DENYLIST;
  if (!raw) {
    const file = process.env.PUBLIC_GUARD_DENYLIST_FILE
      || join(homedir(), '.config', 'cleverops', 'public-denylist.txt');
    if (existsSync(file)) raw = readFileSync(file, 'utf8');
  }
  if (!raw || !raw.trim()) return null;
  const rules = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    try { rules.push(new RegExp(t, 'i')); }
    catch { fail(`regola ${rules.length + 1} della denylist non valida`); }
  }
  return rules.length ? rules : null;
}

const denylist = loadDenylist();
if (!denylist) {
  fail('denylist non disponibile. PR da fork: procedura sostitutiva (snapshot approvato su un '
    + 'branch work/fork-<n>). In locale crea ~/.config/cleverops/public-denylist.txt.', 3);
}

let assets = {};
if (existsSync(ASSETS_FILE)) {
  try { assets = JSON.parse(readFileSync(ASSETS_FILE, 'utf8')); }
  catch { fail('scripts/public-assets.json non è JSON valido'); }
}

const findings = new Set();

// Un percorso si mostra solo se non contiene nulla di vietato e nessun carattere di controllo.
function shown(path) {
  if (denylist.some(re => re.test(path)) || RULES.some(([, re]) => re.test(path))) return '<percorso redatto>';
  return path.replace(/[\u0000-\u001f\u007f]/g, '?');
}

function checkLine(line, pos) {
  const allowed = new Set();
  const i = line.indexOf(ALLOW_MARKER);
  if (i >= 0) for (const id of line.slice(i + ALLOW_MARKER.length).trim().split(/[\s,]+/)) allowed.add(id);
  for (const [id, re] of RULES) if (!allowed.has(id) && re.test(line)) findings.add(`${pos}: regola "${id}"`);
  denylist.forEach((re, n) => { if (re.test(line)) findings.add(`${pos}: denylist match #${n + 1}`); });
}

function checkPath(path, where) {
  const s = shown(path);
  for (const [re, label] of FORBIDDEN_PATHS) if (re.test(path)) findings.add(`${where}${s}: percorso vietato (${label})`);
  for (const [id, re] of RULES) if (re.test(path)) findings.add(`${where}${s}: regola "${id}" nel nome del file`);
  denylist.forEach((re, n) => { if (re.test(path)) findings.add(`${where}${s}: denylist match #${n + 1} nel nome del file`); });
}

function isText(buf) {
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return false;
  if (buf.includes(0)) return false;
  // UTF-8 valido, altrimenti non scansionabile
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}

function checkBlob(blobSha, path, where) {
  checkPath(path, where);
  const buf = git(['cat-file', 'blob', blobSha], { raw: true });
  if (!isText(buf)) {
    const sha = createHash('sha256').update(buf).digest('hex');
    if (assets[path] !== sha) findings.add(`${where}${shown(path)}: file non testuale non presente in scripts/public-assets.json`);
    return;
  }
  buf.toString('utf8').split('\n').forEach((line, idx) => checkLine(line, `${where}${shown(path)}:${idx + 1}`));
}

// Voci separate da NUL. ls-tree -z: "<mode> <type> <sha>\t<path>";
// ls-files -s -z: "<mode> <sha> <stage>\t<path>".
function parseEntries(out, format = 'ls-tree') {
  return out.split('\0').filter(Boolean).map(e => {
    const tab = e.indexOf('\t');
    const [mode, x, y] = e.slice(0, tab).split(' ');
    const path = e.slice(tab + 1);
    if (format === 'ls-files') return { mode, sha: x, type: mode === '160000' ? 'commit' : 'blob', path };
    return { mode, type: x, sha: y, path };
  });
}

function checkTree(treeish, where) {
  for (const e of parseEntries(git(['ls-tree', '-r', '-z', '--full-tree', treeish]))) {
    if (e.type === 'commit') { findings.add(`${where}${shown(e.path)}: submodule non ammesso`); continue; }
    if (e.type === 'blob') checkBlob(e.sha, e.path, where);
  }
}

function checkCommit(sha) {
  const short = sha.slice(0, 7);
  const [an, ae, cn, ce, ...msg] = git(['log', '-1', '--format=%an%x00%ae%x00%cn%x00%ce%x00%B', sha]).split('\0');
  [an, ae, cn, ce].forEach((v, i) => checkLine(v, `commit ${short} (${['autore', 'email autore', 'committer', 'email committer'][i]})`));
  msg.join('\0').split('\n').forEach((line, idx) => checkLine(line, `commit ${short} (messaggio):${idx + 1}`));
  // percorsi aggiunti/modificati rispetto a OGNI genitore (-m), anche per commit radice e merge
  const changed = new Set();
  const parts = git(['diff-tree', '-r', '-z', '-m', '--root', '--no-commit-id', '--name-status', '--no-renames', sha]).split('\0');
  for (let i = 0; i < parts.length - 1; i += 2) {
    if (parts[i] && parts[i] !== 'D') changed.add(parts[i + 1]);
  }
  if (!changed.size) return;
  const entries = parseEntries(git(['ls-tree', '-r', '-z', '--full-tree', sha]));
  for (const e of entries) {
    if (!changed.has(e.path)) continue;
    if (e.type === 'commit') { findings.add(`commit ${short} ${shown(e.path)}: submodule non ammesso`); continue; }
    checkBlob(e.sha, e.path, `commit ${short} `);
  }
}

const [mode, a, b] = process.argv.slice(2);
if (mode === '--all') {
  checkTree('HEAD', '');
} else if (mode === '--staged') {
  const changed = new Set(git(['diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMRT']).split('\0').filter(Boolean));
  for (const e of parseEntries(git(['ls-files', '-s', '-z']), 'ls-files')) {
    if (!changed.has(e.path)) continue;
    if (e.type === 'commit') { findings.add(`${shown(e.path)}: submodule non ammesso`); continue; }
    checkBlob(e.sha, e.path, '');
  }
} else if (mode === '--range' && a && b) {
  git(['rev-list', `${a}..${b}`]).split('\n').filter(Boolean).forEach(checkCommit);
} else if (mode === '--new' && a) {
  git(['rev-list', a, '--not', `--remotes=${b || 'origin'}`]).split('\n').filter(Boolean).forEach(checkCommit);
} else if (mode === '--history' && a) {
  git(['rev-list', a]).split('\n').filter(Boolean).forEach(checkCommit);
} else if (mode === '--name' && a) {
  checkPath(a, 'nome ');
} else {
  fail('uso: --all | --staged | --range <base> <head> | --new <head> [<remote>] | --history <rev> | --name <testo>');
}

if (findings.size) {
  console.error(`✗ check-public: ${findings.size} problemi\n  ` + [...findings].join('\n  '));
  console.error(`Falso positivo di una regola generica: commento "${ALLOW_MARKER} <id-regola>" sulla stessa riga.`);
  process.exit(1);
}
console.log('✓ check-public: nessun contenuto riservato');

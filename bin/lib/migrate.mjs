import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { NAME, object, readJSON } from './manifest.mjs';
import { treeHash } from './treehash.mjs';
import { destination, intact, lstat, targetDirs } from './registry.mjs';

export function validateLegacy(data) {
  const sorted = values => values.every((v, i) => !i || values[i - 1] < v);
  if (!object(data) || data.schemaVersion !== 1 || Object.keys(data).some(k => !['schemaVersion', 'skills', 'agents'].includes(k))) throw new Error('legacy-hashes.json: schema non valido.');
  for (const kind of ['skills', 'agents']) {
    if (!object(data[kind]) || !sorted(Object.keys(data[kind]))) throw new Error(`legacy-hashes.json: ${kind} non ordinati.`);
    for (const [name, hashes] of Object.entries(data[kind])) if (!NAME.test(name) || !Array.isArray(hashes) || hashes.some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h)) || !sorted(hashes)) throw new Error('legacy-hashes.json: nome o hash non valido.');
  }
  return data;
}
export function loadLegacy(sources) {
  return sources.map(source => {
    const file = join(source.root, 'legacy-hashes.json');
    return { source, hashes: fs.existsSync(file) ? validateLegacy(readJSON(file)) : { schemaVersion: 1, skills: {}, agents: {} } };
  });
}
function successors(name, kind, source, items) {
  const sameSource = items.filter(i => i.source.id === source.id && i.kind === kind);
  const explicit = sameSource.filter(i => i.replaces?.includes(name));
  if (explicit.length) return explicit;
  // Rinomine e sostituzioni appartengono a replaces; stesso nome per le rilocazioni.
  return sameSource.filter(i => i.name === name);
}
const removedSkills = new Set(['frontend-design']);
function migrationRoots(harness, kind, project) {
  const roots = [targetDirs(harness, project)[`${kind}s`]];
  if (harness === 'codex' && kind === 'skill') {
    roots.push(join(process.env.CODEX_HOME || join(os.homedir(), '.codex'), 'skills'));
  }
  return roots;
}
export function scanMigrations({ sources, items, targets, project, registry }) {
  const candidates = new Map();
  // I backup non devono essere caricati come skill, anche se nome/hash sono ignoti.
  for (const harness of targets) for (const kind of ['skill', 'agent']) {
    for (const root of migrationRoots(harness, kind, project)) {
      if (!fs.existsSync(root)) continue;
      for (const file of fs.readdirSync(root)) {
        const backup = file.match(/^(.+)\.bak-.+$/);
        if (!backup) continue;
        const path = join(root, file);
        if (registry.entries.some(e => e.dest === path)) continue;
        candidates.set(path, { path, name: backup[1], kind, harness, source: null,
          known: false, backup: true, removed: false, replacements: [],
          reason: 'backup legacy: da spostare nei backup dello stato' });
      }
    }
  }
  for (const { source, hashes } of loadLegacy(sources)) for (const harness of targets) {
    for (const kind of ['skill', 'agent']) {
      for (const root of migrationRoots(harness, kind, project)) {
        if (!fs.existsSync(root)) continue;
        for (const file of fs.readdirSync(root)) {
          if (candidates.get(join(root, file))?.backup) continue;
          const raw = file;
          const name = kind === 'agent' ? raw.replace(/\.md$/, '') : raw;
          if (!Object.hasOwn(hashes[`${kind}s`], name) || (kind === 'agent' && !raw.endsWith('.md'))) continue;
          const path = join(root, file);
          if (registry.entries.some(e => e.dest === path)) continue;
          const replacements = successors(name, kind, source, items).filter(i => i.targets.includes(harness === 'codex' ? 'codex' : 'claude'));
          let known = false;
          try { known = hashes[`${kind}s`][name].includes(treeHash(path, { allowRootLink: true })); }
          catch { /* Link rotto o contenuto non leggibile: lasciarlo. */ }
          const candidate = { path, name, kind, harness, source: source.id, known, backup: false,
            removed: kind === 'skill' && removedSkills.has(name) && !replacements.length,
            replacements, reason: known ? 'hash legacy riconosciuto' : 'hash sconosciuto: lasciato invariato' };
          if (!candidates.has(path) || known) candidates.set(path, candidate);
        }
      }
    }
  }
  return [...candidates.values()];
}
export function applyMigrations(candidates, registry, tx, project, warn = () => {}, pluginActive = () => false) {
  const results = [];
  for (const c of candidates) {
    if (!lstat(c.path)) continue;
    if (c.backup) { tx.remove(c.path, true); results.push(`✓ backup legacy spostato: ${c.name}`); continue; }
    if (!c.known) { warn(`Migrazione dubbia: ${c.path}; ${c.reason}.`); continue; }
    // Ogni sostituta deve essere integra nel registro o abilitata come plugin nello stesso scope.
    const plugins = c.replacements.map(i => pluginActive(i, c.harness, project));
    const ready = c.replacements.length && c.replacements.every((i, n) => plugins[n] || registry.entries.some(e => e.dest === destination(i, c.harness, project) && e.source === i.source.id && intact(e)));
    if (!c.removed && !ready) { warn(`Migrazione in attesa delle sostitute: ${c.name}.`); continue; }
    if (registry.entries.some(e => e.dest === c.path)) continue;
    // Il canale plugin non appartiene al registro: conserva sempre il legacy recuperabile.
    const backup = plugins.some(Boolean) || lstat(c.path).isSymbolicLink();
    tx.remove(c.path, backup);
    results.push(`✓ migrato [${c.harness}] ${c.name}${backup ? ' (originale nei backup dello stato)' : ''}`);
  }
  return results;
}

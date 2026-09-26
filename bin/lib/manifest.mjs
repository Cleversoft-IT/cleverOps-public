import fs from 'node:fs';
import { join } from 'node:path';

export const NAME = /^[a-z0-9-]{1,64}$/;
export const ID = /^[a-z][a-z0-9-]*$/;
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export class UsageError extends Error { constructor(message) { super(message); this.exitCode = 2; } }
export class SourceError extends Error { constructor(message) { super(message); this.exitCode = 3; } }
export function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`JSON non leggibile (${file}): ${e.message}`); }
}
export function validateManifest(m, warn = () => {}) {
  const fail = detail => { throw new Error(`Manifest non valido: ${detail}`); };
  const unknown = (v, keys, label) => Object.keys(v).filter(k => !keys.includes(k)).forEach(k => warn(`Campo sconosciuto ignorato: ${label}.${k}`));
  if (!object(m)) fail('oggetto richiesto');
  if (Number.isInteger(m.schemaVersion) && m.schemaVersion > 1) {
    const e = new Error('Sorgente saltata: schemaVersion non supportata; aggiorna cleverOps.');
    e.unsupported = true; throw e;
  }
  if (m.schemaVersion !== 1 || typeof m.id !== 'string' || !ID.test(m.id) || !['public', 'private'].includes(m.visibility)) fail('schemaVersion, id o visibility');
  if (m.$schema !== undefined && typeof m.$schema !== 'string') fail('$schema');
  if (!object(m.skills) || (m.agents !== undefined && !object(m.agents))) fail('skills/agents');
  unknown(m, ['$schema', 'schemaVersion', 'id', 'visibility', 'skills', 'agents'], 'manifest');
  const result = { schemaVersion: 1, id: m.id, visibility: m.visibility, skills: {}, agents: {} };
  for (const kind of ['skills', 'agents']) for (const [name, item] of Object.entries(m[kind] || {})) {
    if (!NAME.test(name) || !object(item) || typeof item.category !== 'string' || !item.category.length) fail(`${kind}.${name}`);
    const keys = kind === 'skills' ? ['category', 'targets', 'legacy', 'replaces', 'requires'] : ['category', 'targets'];
    unknown(item, keys, `${kind}.${name}`);
    if (item.targets !== undefined && (!Array.isArray(item.targets) || !item.targets.length || new Set(item.targets).size !== item.targets.length || item.targets.some(t => !['claude', 'codex'].includes(t)))) fail(`targets di ${name}`);
    const clean = { category: item.category, targets: item.targets || ['claude', 'codex'] };
    if (kind === 'skills') {
      if (item.legacy !== undefined && typeof item.legacy !== 'boolean') fail(`legacy di ${name}`);
      if (item.replaces !== undefined && (!Array.isArray(item.replaces) || item.replaces.some(n => typeof n !== 'string' || !NAME.test(n)) || new Set(item.replaces).size !== item.replaces.length)) fail(`replaces di ${name}`);
      if (item.requires !== undefined) {
        if (!object(item.requires) || (item.requires.path !== undefined && typeof item.requires.path !== 'string')) fail(`requires di ${name}`);
        unknown(item.requires, ['path'], `requires di ${name}`);
        clean.requires = { path: item.requires.path };
      }
      clean.legacy = item.legacy || false;
      clean.replaces = item.replaces || [];
    }
    result[kind][name] = clean;
  }
  return result;
}
export const readManifest = (root, warn) => validateManifest(readJSON(join(root, 'cleverops.json')), warn);
export function catalog(sources, warn = () => {}) {
  const items = new Map();
  for (const source of [...sources].sort((a, b) => Number(b.id === 'public') - Number(a.id === 'public'))) {
    for (const kind of ['skill', 'agent']) for (const [name, meta] of Object.entries(source.manifest[`${kind}s`])) {
      const key = `${kind}:${name}`;
      if (items.has(key)) { warn(`Collisione ${key}: prevale la sorgente ${items.get(key).source.id}.`); continue; }
      items.set(key, { kind, name, ...meta, source, path: join(source.root, `${kind}s`, name + (kind === 'agent' ? '.md' : '')) });
    }
  }
  return [...items.values()];
}

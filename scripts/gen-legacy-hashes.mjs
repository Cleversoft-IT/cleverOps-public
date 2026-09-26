#!/usr/bin/env node
// Legge esclusivamente le risorse nella allowlist; non esporta contenuti o percorsi.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { NAME } from '../bin/lib/manifest.mjs';
import { excluded, treeHash } from '../bin/lib/treehash.mjs';

const git = (repo, args, encoding = 'utf8') => execFileSync('git', ['-C', repo, ...args], { encoding, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
export function generateLegacy(repos, names) {
  if (!repos.length || !names.length || names.some(n => !NAME.test(n))) throw new Error('Specifica almeno --repo PATH e --names nome,altro.');
  const sets = { skills: {}, agents: {} };
  for (const name of [...new Set(names)].sort()) for (const kind of ['skills', 'agents']) {
    const hashes = new Set();
    for (const repo of repos) {
      // Supporta anche suite standalone con cartelle skill alla radice.
      const prefixes = kind === 'skills' ? [`skills/${name}`, name] : [`agents/${name}.md`];
      for (const prefix of prefixes) {
        const commits = git(repo, ['log', '--all', '--full-history', '--format=%H', '--', prefix]).trim().split('\n').filter(Boolean);
        for (const commit of commits) {
          const listing = git(repo, ['ls-tree', '-r', '-z', commit, '--', prefix]).split('\0').filter(Boolean);
          if (!listing.length) continue;
          const snapshot = fs.mkdtempSync(join(os.tmpdir(), 'cleverops-legacy-'));
          try {
            let hasResource = false;
            for (const line of listing) {
              const match = line.match(/^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/);
              if (!match) continue;
              const [, mode, oid, file] = match;
              const path = kind === 'agents' ? `${name}.md` : file.slice(prefix.length + 1);
              if (excluded(path)) continue;
              if (!path || path.split('/').includes('..')) throw new Error(`Percorso storico non supportato: ${name}.`);
              const destination = join(snapshot, path);
              fs.mkdirSync(dirname(destination), { recursive: true });
              const data = git(repo, ['cat-file', 'blob', oid], null);
              if (mode === '120000') fs.symlinkSync(data.toString('utf8'), destination);
              else fs.writeFileSync(destination, data, { mode: 0o600 });
              if (kind === 'agents' || path === 'SKILL.md') hasResource = true;
            }
            // La stessa funzione runtime risolve i link interni e rifiuta quelli
            // esterni. Lo snapshot contiene soltanto file della risorsa ammessa.
            if (hasResource) hashes.add(treeHash(kind === 'agents' ? join(snapshot, `${name}.md`) : snapshot));
          } finally { fs.rmSync(snapshot, { recursive: true, force: true }); }
        }
      }
    }
    if (hashes.size) sets[kind][name] = [...hashes].sort();
  }
  return { schemaVersion: 1, skills: sets.skills, agents: sets.agents };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repos = [], names = [];
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--repo' && args[i + 1]) repos.push(args[++i]);
      else if (args[i] === '--names' && args[i + 1]) names.push(...args[++i].split(','));
      else throw new Error('Uso: gen-legacy-hashes.mjs --repo PATH [--repo PATH] --names nome,altro');
    }
    process.stdout.write(JSON.stringify(generateLegacy(repos, names), null, 2) + '\n');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}

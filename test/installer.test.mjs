import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'smol-toml';
import { treeHash, hashEntries } from '../bin/lib/treehash.mjs';
import { validateManifest } from '../bin/lib/manifest.mjs';
import { move } from '../bin/lib/registry.mjs';
import { sandbox, fixture, write, json, read, snapshot, backupEntries, captured, ROOT } from './helpers.mjs';

const ok = result => assert.equal(result.status, 0, result.stderr || result.stdout);

test('copia, marker, targets del manifest, progetto e due reinstallazioni senza backup', t => {
  const s = sandbox(t);
  const src = fixture(s, 'public', { alpha: { category: 'Test' }, solo: { category: 'Test', targets: ['codex'] } });
  write(join(src, 'skills', 'alpha', 'SKILL.md'), '---\ntargets: claude\n---\nIgnorare il vecchio campo.');
  const args = ['--from', src, '--all', '--target', 'claude,codex,project', '--project', s.root];
  for (let i = 0; i < 3; i++) ok(s.run(args));
  assert(fs.existsSync(join(s.claude, 'alpha', '.cleverops.json')));
  assert(!fs.existsSync(join(s.claude, 'solo')));
  assert(fs.existsSync(join(s.codex, 'solo')));
  assert(fs.existsSync(join(s.root, '.claude', 'skills', 'alpha')));
  assert(!fs.existsSync(join(src, 'skills', 'alpha', '.cleverops.json')));
  const registry = read(s.registry);
  assert.equal(registry.entries.length, 4);
  for (const e of registry.entries) { assert.equal(e.sha256, treeHash(e.dest)); assert.equal(e.commit, null); assert.equal(e.version, '1.0.0'); }
  assert.deepEqual(backupEntries(s), []);
  assert(!Object.keys(snapshot(s.home)).some(k => k.includes('.bak-') || k.includes('.cleverops-tmp-')));
});

test('terzi e copie modificate vanno nei backup esterni; uninstall offline conserva gli estranei', t => {
  const s = sandbox(t), src = fixture(s);
  write(join(s.claude, 'estranea', 'SKILL.md'), 'terza');
  write(join(s.claude, 'alpha', 'SKILL.md'), 'conflitto terzo');
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  let backups = backupEntries(s);
  assert.equal(fs.readFileSync(join(backups[0].folder, backups[0].stored, 'SKILL.md'), 'utf8'), 'conflitto terzo');
  write(join(s.claude, 'alpha', 'locale.txt'), 'modifica utente');
  const offline = { CLEVEROPS_SOURCES: 'non-JSON: deve essere ignorato' };
  ok(s.run(['uninstall', '--all', '--target', 'claude'], offline));
  assert(fs.existsSync(join(s.claude, 'estranea', 'SKILL.md')));
  assert(!fs.existsSync(join(s.claude, 'alpha')));
  backups = backupEntries(s); assert.equal(backups.length, 2);
  assert(backups.some(b => fs.existsSync(join(b.folder, b.stored, 'locale.txt'))));
  assert.equal(read(s.registry).entries.length, 0);
});

test('link espliciti, nessun marker nella sorgente, uninstall link rotto e link cambiato', t => {
  const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'Test' }, beta: { category: 'Test' } });
  ok(s.run(['--from', src, '--link', '--all', '--target', 'codex']));
  assert(!fs.existsSync(join(src, 'skills', 'alpha', '.cleverops.json')));
  const beta = join(s.codex, 'beta'); fs.unlinkSync(beta); fs.symlinkSync('../scelto-dall-utente', beta);
  fs.rmSync(src, { recursive: true });
  ok(s.run(['uninstall', '--all', '--target', 'codex']));
  assert(!fs.lstatSync(join(s.codex, 'alpha'), { throwIfNoEntry: false }));
  assert.equal(fs.readlinkSync(beta), '../scelto-dall-utente');
});

test('backup e ripristino dei symlink relativi conserva il target grezzo', t => {
  const s = sandbox(t), src = fixture(s);
  write(join(s.home, 'originale', 'SKILL.md'), 'vecchio');
  fs.mkdirSync(s.claude, { recursive: true });
  const dest = join(s.claude, 'alpha'), raw = relative(s.claude, join(s.home, 'originale'));
  fs.symlinkSync(raw, dest);
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  const backups = backupEntries(s); assert.equal(backups[0].linkTarget, raw);
  assert.equal(backups[0].resolved, fs.realpathSync(join(s.home, 'originale')));
  fs.rmSync(dest, { recursive: true }); ok(s.run(['restore', backups[0].folder]));
  assert.equal(fs.readlinkSync(dest), raw);
});

test('argomenti invalidi e non-TTY: exit 2, nessuna scrittura', t => {
  const s = sandbox(t), src = fixture(s);
  for (const args of [[], ['uninstall'], ['install'], ['--wat'], ['--target', 'strano', '--all'], ['--target'], ['--link', '--all'], ['--copy'], ['--yes'], ['--verbose'], ['--no-private'], ['--from', src], ['--all'], ['--skills', '../alpha', '--target', 'claude'], ['--from', src, '--skills', 'assente', '--target', 'claude'], ['--from', src, '--skills', 'alpha', '--target', 'codex', '--json']]) {
    const before = snapshot(s.home), r = s.run(args);
    assert.equal(r.status, 2, `${args}: ${r.stderr}`); assert.deepEqual(snapshot(s.home), before, String(args));
  }
});

test('nessuna risorsa compatibile: exit 2 senza scritture', t => {
  const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'Test', targets: ['codex'] } });
  const before = snapshot(s.home); const r = s.run(['--from', src, '--all', '--target', 'claude']);
  assert.equal(r.status, 2, r.stderr); assert.deepEqual(snapshot(s.home), before);
});

test('default rileva gli harness; requires.path segnala il prerequisito', t => {
  const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'Test', requires: { path: '~/.fixture-runtime' } } });
  fs.mkdirSync(s.env.CODEX_HOME);
  const r = s.run(['--from', src, '--all']); ok(r);
  assert.match(r.stderr, /Prerequisito assente/); assert(fs.existsSync(join(s.codex, 'alpha'))); assert(!fs.existsSync(s.claude));
});

test('errore a metà install: rollback di file e registro invariato', t => {
  const s = sandbox(t), src = fixture(s);
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  const before = snapshot(s.home);
  write(join(src, 'skills', 'alpha', 'SKILL.md'), 'versione nuova');
  const m = read(join(src, 'cleverops.json')); m.skills.beta = { category: 'Test' }; json(join(src, 'cleverops.json'), m);
  const r = s.run(['--from', src, '--all', '--target', 'claude']);
  assert.equal(r.status, 1); assert.deepEqual(snapshot(s.home), before);
});

test('registro corrotto: errore chiaro, nessuna cancellazione né lock', t => {
  const s = sandbox(t), src = fixture(s);
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  write(s.registry, '{'); const before = snapshot(s.home);
  for (const args of [['uninstall', '--all', '--target', 'claude'], ['--from', src, '--all', '--target', 'claude'], ['doctor', '--target', 'claude']]) {
    const r = s.run(args); assert.equal(r.status, 1); assert.match(r.stderr, /Registro corrotto/); assert.deepEqual(snapshot(s.home), before);
  }
});

test('lock globale e di registro: seconda installazione rifiutata', t => {
  const s = sandbox(t), src = fixture(s);
  write(join(s.state, 'installed.lock'), 'processo sintetico');
  const before = snapshot(s.home), r = s.run(['--from', src, '--all', '--target', 'claude']);
  assert.equal(r.status, 1); assert.match(r.stderr, /lock/); assert.deepEqual(snapshot(s.home), before);
});

test('agent Codex serializzato con smol-toml, senza campi Claude o marker', t => {
  const s = sandbox(t), src = fixture(s, 'public', {}, { assistente: { category: 'Test' } });
  ok(s.run(['--from', src, '--all', '--link', '--target', 'claude,codex']));
  const file = join(s.env.CODEX_HOME, 'agents', 'assistente.toml');
  const agent = parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(agent).sort(), ['description', 'developer_instructions', 'name']);
  assert.equal(agent.description, 'Agent sintetico.'); assert.match(agent.developer_instructions, /Unicode è/); assert.match(agent.developer_instructions, /C:\\test/);
  assert(!fs.lstatSync(file).isSymbolicLink()); assert(fs.lstatSync(join(s.env.CLAUDE_CONFIG_DIR, 'agents', 'assistente.md')).isSymbolicLink());
  assert.equal(read(s.registry).entries.find(e => e.harness === 'codex').sha256, treeHash(file));
});

test('doctor è di sola lettura, anche con cache mancante e registro modificato', t => {
  const s = sandbox(t), src = fixture(s);
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  write(join(s.claude, 'alpha', 'modificato'), 'locale');
  const before = snapshot(s.home), r = s.run(['doctor', '--from', src, '--target', 'claude', '--json']);
  ok(r); assert.equal(JSON.parse(r.stdout).entries[0].status, 'modificata'); assert.deepEqual(snapshot(s.home), before);
  const remote = [{ id: 'internal', url: 'file:///sorgente-assente.git' }];
  ok(s.run(['doctor', '--target', 'claude'], { CLEVEROPS_SOURCES: JSON.stringify(remote) })); assert.deepEqual(snapshot(s.home), before);
});

test('treeHash esclude soltanto i file richiesti e gestisce la catena root', t => {
  const s = sandbox(t), src = fixture(s), path = join(src, 'skills', 'alpha');
  const initial = treeHash(path);
  for (const name of ['.cleverops.json', '__pycache__/x', 'cache.pyc', '.DS_Store']) write(join(path, name), 'ignorato');
  assert.equal(treeHash(path), initial);
  const link = join(s.root, 'link'); fs.symlinkSync(path, link); assert.throws(() => treeHash(link), /Symlink alla radice/);
  write(join(path, 'script.py'), 'contato'); assert.notEqual(treeHash(path), initial);
  assert.equal(hashEntries([['b', Buffer.from('2')], ['a', Buffer.from('1')]]), hashEntries([['a', Buffer.from('1')], ['b', Buffer.from('2')]]));
});

test('manifest validato, campi sconosciuti ignorati e schema futuro distinto', () => {
  const m = { schemaVersion: 1, id: 'public', visibility: 'public', skills: { alpha: { category: 'Test', futuro: true } }, futuro: true };
  const warnings = []; const result = validateManifest(m, w => warnings.push(w));
  assert.equal(warnings.length, 2); assert(!('futuro' in result)); assert(!('futuro' in result.skills.alpha));
  for (const patch of [{ schemaVersion: 0 }, { id: '../public' }, { skills: [] }, { skills: { alpha: { category: 'Test', targets: [] } } }, { skills: { alpha: { category: 'Test', requires: { path: 3 } } } }]) assert.throws(() => validateManifest({ ...m, ...patch }));
  assert.throws(() => validateManifest({ ...m, schemaVersion: 2 }), e => e.unsupported && /aggiorna/.test(e.message));
});

test('extra falliti propagano exit 1 senza installazioni reali', t => {
  const s = sandbox(t);
  const bin = join(s.root, 'bin'); write(join(bin, 'npx'), '#!/bin/sh\nexit 7\n'); fs.chmodSync(join(bin, 'npx'), 0o755);
  const r = s.run(['--impeccable', '--target', 'claude'], { PATH: bin + ':' + s.env.PATH });
  assert.equal(r.status, 1); assert.match(r.stderr, /Extra impeccable non completato/);
});

test('fallback EXDEV copia e rimuove senza perdere il contenuto', t => {
  const s = sandbox(t), from = join(s.root, 'originale'), to = join(s.root, 'spostato');
  write(join(from, 'file'), 'contenuto');
  const rename = fs.renameSync;
  fs.renameSync = () => { const e = new Error('filesystem diversi'); e.code = 'EXDEV'; throw e; };
  try { move(from, to); } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(join(to, 'file'), 'utf8'), 'contenuto'); assert(!fs.existsSync(from));
});

test('npm pack: inventario runtime e install dal tarball senza .git', t => {
  const s = sandbox(t);
  const packed = captured('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', s.root], { cwd: ROOT, env: s.env, encoding: 'utf8', timeout: 60000 });
  ok(packed); const [pack] = JSON.parse(packed.stdout);
  for (const name of ['cleverops.json', 'cleverops.schema.json', 'legacy-hashes.json', 'bin/lib/install.mjs', 'extras/toolbelt/install.sh']) assert(pack.files.some(f => f.path === name), name);
  assert(!pack.files.some(f => f.path.startsWith('.git/')));
  const extracted = captured('tar', ['-xzf', join(s.root, pack.filename), '-C', s.root], { env: s.env, encoding: 'utf8' }); ok(extracted);
  const pkg = join(s.root, 'package'); assert(!fs.existsSync(join(pkg, '.git')));
  // Le sole dipendenze runtime già installate; il codice e le risorse vengono dal tarball.
  fs.symlinkSync(join(ROOT, 'node_modules'), join(pkg, 'node_modules'));
  const r = captured(process.execPath, [join(pkg, 'bin', 'cleverops.mjs'), '--all', '--target', 'claude,codex', '--no-private'], { cwd: s.root, env: { ...s.env, CLEVEROPS_SOURCES: JSON.stringify([{ id: 'public', path: pkg }]) }, encoding: 'utf8', timeout: 30000 });
  ok(r); assert(read(s.registry).entries.length > 0); assert(read(s.registry).entries.every(e => e.commit === null));
});

test('lo stesso registro conserva scope con CLAUDE_CONFIG_DIR diversi', t => {
  const s = sandbox(t), src = fixture(s), other = join(s.home, 'claude-alternativo');
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  ok(s.run(['--from', src, '--all', '--target', 'claude'], { CLAUDE_CONFIG_DIR: other }));
  assert.equal(read(s.registry).entries.length, 2);
  ok(s.run(['uninstall', '--all', '--target', 'claude'], { CLAUDE_CONFIG_DIR: other }));
  assert(fs.existsSync(join(s.claude, 'alpha'))); assert(!fs.existsSync(join(other, 'skills', 'alpha')));
});

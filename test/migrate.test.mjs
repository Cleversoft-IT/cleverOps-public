import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { treeHash } from '../bin/lib/treehash.mjs';
import { validateLegacy } from '../bin/lib/migrate.mjs';
import { sandbox, fixture, write, json, read, snapshot, backupEntries, captured, ROOT } from './helpers.mjs';

const ok = r => assert.equal(r.status, 0, r.stderr || r.stdout);
function legacy(src, skills = {}, agents = {}) {
  const sorted = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a < b ? -1 : 1).map(([name, hashes]) => [name, [...new Set(hashes)].sort()]));
  json(join(src, 'legacy-hashes.json'), { schemaVersion: 1, skills: sorted(skills), agents: sorted(agents) });
}

test('migrazioni: rinomina conosciuta, sconosciuta lasciata, backup .bak fuori skills', t => {
  const s = sandbox(t), src = fixture(s, 'public', { nuova: { category: 'Test', replaces: ['vecchia', 'dubbia'] } });
  const old = join(s.claude, 'vecchia'), unknown = join(s.claude, 'dubbia'), bak = join(s.claude, 'vecchia.bak-20200101');
  write(join(old, 'SKILL.md'), 'legacy sintetica'); fs.cpSync(old, bak, { recursive: true }); write(join(unknown, 'SKILL.md'), 'contenuto locale');
  legacy(src, { vecchia: [treeHash(old)], dubbia: [treeHash(old)] });
  const before = snapshot(s.home);
  const diag = s.run(['doctor', '--from', src, '--target', 'claude', '--json']); ok(diag);
  assert.equal(JSON.parse(diag.stdout).migrations.length, 3); assert.deepEqual(snapshot(s.home), before);
  const r = s.run(['sync', '--from', src, '--target', 'claude']); ok(r); assert.match(r.stderr, /Migrazione dubbia/);
  assert(fs.existsSync(join(s.claude, 'nuova', '.cleverops.json'))); assert(!fs.existsSync(old)); assert(!fs.existsSync(bak)); assert(fs.existsSync(unknown));
  assert(backupEntries(s).some(b => b.path === bak));
});

test('migrazione attende tutte le sostitute e non elimina dopo installazione fallita', t => {
  const s = sandbox(t), src = fixture(s, 'public', { prima: { category: 'Test', replaces: ['vecchia'] }, seconda: { category: 'Test', replaces: ['vecchia'] } });
  const old = join(s.claude, 'vecchia'); write(join(old, 'SKILL.md'), 'legacy'); legacy(src, { vecchia: [treeHash(old)] });
  ok(s.run(['--from', src, '--skills', 'prima', '--target', 'claude'])); assert(fs.existsSync(old));
  fs.rmSync(join(src, 'skills', 'seconda'), { recursive: true }); const before = snapshot(s.home);
  const r = s.run(['sync', '--from', src, '--target', 'claude']); assert.equal(r.status, 1); assert.deepEqual(snapshot(s.home), before);
  write(join(src, 'skills', 'seconda', 'SKILL.md'), 'sostituta'); ok(s.run(['sync', '--from', src, '--target', 'claude'])); assert(!fs.existsSync(old));
});

test('copie legacy Codex migrano da CODEX_HOME/skills a ~/.agents/skills', t => {
  const s = sandbox(t), src = fixture(s);
  const old = join(s.env.CODEX_HOME, 'skills', 'alpha'); fs.mkdirSync(join(s.env.CODEX_HOME, 'skills'), { recursive: true }); fs.cpSync(join(src, 'skills', 'alpha'), old, { recursive: true });
  legacy(src, { alpha: [treeHash(old)] });
  ok(s.run(['sync', '--from', src, '--target', 'codex'])); assert(!fs.existsSync(old)); assert(fs.existsSync(join(s.codex, 'alpha', '.cleverops.json')));
});

test('catena di symlink Drupal risolta con hash noto e conservata nei manifest backup', t => {
  const s = sandbox(t), name = 'drupal11-module-development', src = fixture(s, 'public', { [name]: { category: 'Drupal' } });
  const suite = join(s.home, 'projects', 'suite', name); fs.mkdirSync(join(s.home, 'projects', 'suite'), { recursive: true }); fs.cpSync(join(src, 'skills', name), suite, { recursive: true });
  legacy(src, { [name]: [treeHash(suite)] });
  fs.mkdirSync(s.codex, { recursive: true }); fs.mkdirSync(s.claude, { recursive: true });
  fs.symlinkSync(`../../projects/suite/${name}`, join(s.codex, name)); fs.symlinkSync(`../../.agents/skills/${name}`, join(s.claude, name));
  ok(s.run(['sync', '--from', src, '--target', 'claude,codex']));
  for (const dir of [s.codex, s.claude]) { assert(!fs.lstatSync(join(dir, name)).isSymbolicLink()); assert(fs.existsSync(join(dir, name, '.cleverops.json'))); }
  const backups = backupEntries(s); assert.equal(backups.length, 2);
  assert(backups.some(b => b.linkTarget === `../../.agents/skills/${name}`)); assert(backups.every(b => b.resolved === fs.realpathSync(suite)));
  assert(!fs.existsSync(join(suite, '.cleverops.json')));
});

test('agent legacy .md migrato in .toml solo dopo verifica', t => {
  const s = sandbox(t), src = fixture(s, 'internal', {}, { assistente: { category: 'Test' } });
  const old = join(s.env.CODEX_HOME, 'agents', 'assistente.md'); write(old, fs.readFileSync(join(src, 'agents', 'assistente.md')));
  legacy(src, {}, { assistente: [treeHash(old)] });
  ok(s.run(['sync', '--from', src, '--target', 'codex'])); assert(!fs.existsSync(old)); assert(fs.existsSync(join(s.env.CODEX_HOME, 'agents', 'assistente.toml')));
});

test('frontend-design noto rimosso; gli hash restano per sorgente', t => {
  const s = sandbox(t), pub = fixture(s), internal = fixture(s, 'internal', { nuova: { category: 'Test', replaces: ['vecchia'] } });
  const removed = join(s.claude, 'frontend-design'), old = join(s.claude, 'vecchia'); write(join(removed, 'SKILL.md'), 'plugin'); write(join(old, 'SKILL.md'), 'legacy');
  legacy(pub, { 'frontend-design': [treeHash(removed)] }); legacy(internal, { vecchia: [treeHash(old)] });
  s.env.CLEVEROPS_SOURCES = JSON.stringify([{ id: 'public', path: pub }, { id: 'internal', path: internal }]);
  ok(s.run(['sync', '--target', 'claude', '--no-private'])); assert(!fs.existsSync(removed)); assert(fs.existsSync(old));
  ok(s.run(['sync', '--target', 'claude'])); assert(!fs.existsSync(old)); assert.equal(read(s.registry).entries.find(e => e.name === 'nuova').source, 'internal');
});

test('generatore storico: più repo, allowlist, radice standalone, output deterministico', t => {
  const s = sandbox(t), repo = fixture(s);
  write(join(repo, 'skills', 'esclusa', 'SKILL.md'), 'mai esportare');
  s.git(repo, ['init', '-b', 'main']); s.git(repo, ['add', '.']); s.git(repo, ['commit', '-m', 'Prima versione']);
  const first = treeHash(join(repo, 'skills', 'alpha'));
  write(join(repo, 'skills', 'alpha', 'SKILL.md'), 'seconda versione');
  write(join(repo, 'skills', 'alpha', 'risorse', 'file.txt'), 'asset sintetico');
  fs.symlinkSync('risorse', join(repo, 'skills', 'alpha', 'alias'));
  s.git(repo, ['add', '.']); s.git(repo, ['commit', '-m', 'Seconda versione']);
  const second = treeHash(join(repo, 'skills', 'alpha'));
  const flat = join(s.root, 'suite'); write(join(flat, 'beta', 'SKILL.md'), 'suite'); write(join(flat, 'beta', 'file.pyc'), 'escluso');
  write(join(flat, 'agents', 'alpha.md'), 'agent'); s.git(flat, ['init', '-b', 'main']); s.git(flat, ['add', '.']); s.git(flat, ['commit', '-m', 'Suite']);
  const args = [join(ROOT, 'scripts', 'gen-legacy-hashes.mjs'), '--repo', repo, '--repo', flat, '--names', 'alpha,beta'];
  const r = captured(process.execPath, args, { env: s.env, encoding: 'utf8' }); ok(r);
  const data = validateLegacy(JSON.parse(r.stdout)); assert.deepEqual(data.skills.alpha, [first, second].sort()); assert.deepEqual(data.skills.beta, [treeHash(join(flat, 'beta'))]); assert.deepEqual(data.agents.alpha, [treeHash(join(flat, 'agents', 'alpha.md'))]);
  assert(!r.stdout.includes('esclusa')); assert(!r.stdout.includes(s.root));
  assert.equal(captured(process.execPath, args, { env: s.env, encoding: 'utf8' }).stdout, r.stdout);
});

test('legacy-hashes pubblico: schema, ordine e allowlist esatta', () => {
  const data = validateLegacy(read(join(ROOT, 'legacy-hashes.json')));
  const allowed = ['ddev-expert', 'docker-local', 'drupal-expert', 'drupal-migration', 'drupal-security', 'ionic-skills', 'plan-auditor', 'subagent-dev-with-codex', 'transcribe', 'frontend-design', 'drupal11-config-management', 'drupal11-devops-testing-security', 'drupal11-frontend-theming', 'drupal11-module-development', 'drupal11-performance-caching', 'drupal11-views-and-queries'];
  assert.deepEqual(Object.keys(data.skills), allowed.sort()); assert.deepEqual(data.agents, {});
  assert.throws(() => validateLegacy({ schemaVersion: 1, skills: { z: [], a: [] }, agents: {} }));
});

test('sync file → plugin → file isolato per harness; copia modificata salvata', t => {
  const s = sandbox(t), src = fixture(s);
  ok(s.run(['--from', src, '--all', '--target', 'claude,codex']));
  write(join(s.claude, 'alpha', 'personale'), 'preservare');
  json(join(s.env.CLAUDE_CONFIG_DIR, 'settings.json'), { enabledPlugins: { 'cleverops-public@cleverops-public': true } });
  ok(s.run(['sync', '--from', src, '--target', 'claude,codex']));
  assert(!fs.existsSync(join(s.claude, 'alpha'))); assert(fs.existsSync(join(s.codex, 'alpha'))); assert.equal(backupEntries(s).length, 1);
  const active = s.run(['--from', src, '--all', '--target', 'claude']); assert.equal(active.status, 1); assert.match(active.stderr, /plugin abilitato/);
  json(join(s.env.CLAUDE_CONFIG_DIR, 'settings.json'), { enabledPlugins: { 'cleverops-public@cleverops-public': false } });
  ok(s.run(['--from', src, '--all', '--target', 'claude'])); assert(fs.existsSync(join(s.claude, 'alpha')));
  write(join(s.env.CODEX_HOME, 'config.toml'), '[plugins."alpha@fixture-marketplace"]\nenabled = true\n');
  json(join(src, '.agents', 'plugins', 'marketplace.json'), { name: 'fixture-marketplace', plugins: [{ name: 'alpha' }] });
  ok(s.run(['sync', '--from', src, '--target', 'codex'])); assert(!fs.existsSync(join(s.codex, 'alpha'))); assert(fs.existsSync(join(s.claude, 'alpha')));
});

test('plugin di progetto rimuove soltanto la copia registrata per quel progetto', t => {
  const s = sandbox(t), src = fixture(s), other = join(s.root, 'altro');
  ok(s.run(['--from', src, '--all', '--target', 'claude,project', '--project', s.root]));
  ok(s.run(['--from', src, '--all', '--target', 'project', '--project', other]));
  json(join(s.root, '.claude', 'settings.json'), { enabledPlugins: { 'cleverops-public@cleverops-public': true } });
  ok(s.run(['sync', '--from', src, '--target', 'project', '--project', s.root]));
  assert(!fs.existsSync(join(s.root, '.claude', 'skills', 'alpha'))); assert(fs.existsSync(join(other, '.claude', 'skills', 'alpha'))); assert(fs.existsSync(join(s.claude, 'alpha')));
});

test('legacy dubbio nella destinazione attuale rimane invariato anche con --all', t => {
  const s = sandbox(t), src = fixture(s), dest = join(s.claude, 'alpha');
  write(join(dest, 'SKILL.md'), 'modifiche da conservare');
  legacy(src, { alpha: [treeHash(join(src, 'skills', 'alpha'))] });
  const before = snapshot(dest), r = s.run(['--from', src, '--all', '--target', 'claude']);
  ok(r); assert.match(r.stderr, /Migrazione dubbia/); assert.deepEqual(snapshot(dest), before); assert.equal(read(s.registry).entries.length, 0);
});

test('sync del bundle installato può riconciliare dal registro senza sorgente disponibile', t => {
  const s = sandbox(t), src = fixture(s, 'internal');
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  json(join(s.env.CLAUDE_CONFIG_DIR, 'settings.json'), { enabledPlugins: { 'cleverops-internal@cleverops-internal': true } });
  ok(s.run(['sync', '--target', 'claude', '--no-private'])); assert(fs.existsSync(join(s.claude, 'alpha')));
  ok(s.run(['sync', '--target', 'claude'])); assert(!fs.existsSync(join(s.claude, 'alpha'))); assert.equal(read(s.registry).entries.length, 0);
});

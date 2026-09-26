import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { buildMarketplace, generateMarketplace } from '../scripts/gen-marketplace.mjs';
import { treeHash } from '../bin/lib/treehash.mjs';
import { sandbox, fixture, write, json, read, snapshot, backupEntries, captured, ROOT } from './helpers.mjs';

const SCRIPT = join(ROOT, 'scripts/gen-marketplace.mjs');
const CLAUDE = '.claude-plugin/marketplace.json';
const CODEX = '.agents/plugins/marketplace.json';
const ok = result => assert.equal(result.status, 0, result.stderr || result.stdout);
const run = (s, args) => captured(process.execPath, [SCRIPT, ...args], { cwd: s.root, env: s.env, timeout: 10000 });

function assertCodexManifests(src, path) {
  const portable = read(join(src, path, 'plugin.json'));
  const legacy = read(join(src, path, '.codex-plugin/plugin.json'));
  const { $schema, extensions, ...identity } = portable;
  assert.equal($schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.deepEqual(legacy, { ...identity, skills: './skills/', interface: extensions['com.openai'].interface });
}

test('targets espliciti, default entrambi e soli elementi del manifest nei pacchetti', t => {
  const s = sandbox(t), src = fixture(s, 'public', {
    zeta: { category: 'Test', targets: ['codex'] },
    alpha: { category: 'Test' },
    beta: { category: 'Altro', targets: ['claude'] },
  });
  write(join(src, 'skills', 'estranea', 'SKILL.md'), 'Non elencata.');
  write(join(src, 'skills', 'alpha', 'scripts', 'run.sh'), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(join(src, 'skills', 'alpha', 'scripts', 'run.sh'), 0o755);
  write(join(src, 'skills', 'alpha', 'assets', 'example.bin'), Buffer.from([0, 255, 1]));
  write(join(src, 'skills', 'alpha', '__pycache__', 'cache.pyc'), 'Non distribuire.');
  generateMarketplace(src);
  const claude = read(join(src, CLAUDE)), codex = read(join(src, CODEX));
  assert.equal(claude.name, 'cleverops-public');
  assert.equal(codex.name, 'cleverops-public');
  assert.deepEqual(claude.plugins.map(p => p.name), ['alpha', 'beta']);
  assert.deepEqual(codex.plugins.map(p => p.name), ['alpha', 'zeta']);
  assert.deepEqual(claude.owner, { name: 'Cleversoft IT' });
  assert.equal(claude.description, 'Plugin di skill e agent del catalogo cleverops-public.');
  for (const entry of claude.plugins) {
    assert.equal(entry.source, `./plugins/${entry.name}`);
    assert.equal(entry.version, '1.0.0');
    assert.equal(entry.description, 'Skill sintetica.');
    assert(!Object.hasOwn(entry, 'repository'));
    assert(!Object.hasOwn(entry, 'targets'));
    assert(!fs.existsSync(join(src, entry.source, '.claude-plugin/plugin.json')));
    assert.deepEqual(fs.readdirSync(join(src, entry.source, 'skills')), [entry.name]);
  }
  for (const entry of codex.plugins) {
    assert.deepEqual(entry.source, { source: 'local', path: `./plugins/${entry.name}` });
    assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
    assert.equal(entry.category, 'Test');
    const plugin = read(join(src, entry.source.path, 'plugin.json'));
    assert.equal(plugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(plugin.name, entry.name);
    assert.equal(plugin.version, '1.0.0');
    assert.equal(plugin.description, 'Skill sintetica.');
    assert(!Object.hasOwn(plugin, 'skills'));
    assert(!Object.hasOwn(plugin, 'interface'));
    assert(!Object.hasOwn(plugin, 'repository'));
    const ui = plugin.extensions['com.openai'].interface;
    assert.equal(ui.shortDescription, plugin.description);
    assert.equal(ui.longDescription, plugin.description);
    assert.deepEqual(ui.defaultPrompt, [`Usa la skill ${entry.name}.`]);
    assert(!Object.hasOwn(ui, 'capabilities'));
    assert.deepEqual(fs.readdirSync(join(src, entry.source.path, 'skills')), [entry.name]);
    assertCodexManifests(src, entry.source.path);
  }
  assert(!fs.existsSync(join(src, 'plugins/beta/.codex-plugin')));
  assert(!fs.existsSync(join(src, 'plugins/beta/plugin.json')));
  assert(!fs.existsSync(join(src, 'plugins/estranea')));
  assert(!fs.existsSync(join(src, 'plugins/alpha/skills/alpha/__pycache__')));
  assert.equal(treeHash(join(src, 'skills/alpha')), treeHash(join(src, 'plugins/alpha/skills/alpha')));
  if (process.platform !== 'win32') assert.equal(fs.statSync(join(src, 'plugins/alpha/skills/alpha/scripts/run.sh')).mode & 0o111, 0o111);
});

test('descrizioni da frontmatter e repository nei soli campi documentati', t => {
  const s = sandbox(t), src = fixture(s);
  const repository = 'https://example.test/team/skills.git';
  const cases = [
    ['description: "Supporta Drupal 11.4 e config.yaml. Usa anche i test."', 'Supporta Drupal 11.4 e config.yaml.', 'Supporta Drupal 11.4 e config.yaml. Usa anche i test.'],
    ['description: >\n  Usa risorse\n  su più righe. Seconda frase.', 'Usa risorse su più righe.', 'Usa risorse su più righe. Seconda frase.'],
    ['description: |\n  Gestisce audio (mp3, mp4...) in locale.\n  Poi formatta il testo.', 'Gestisce audio (mp3, mp4...) in locale.', 'Gestisce audio (mp3, mp4...) in locale. Poi formatta il testo.'],
    ['description: \'Dice "Pronto?" Poi continua.\'', 'Dice "Pronto?"', 'Dice "Pronto?" Poi continua.'],
    ['description: "Una descrizione senza punto finale"', 'Una descrizione senza punto finale'],
  ];
  for (const pkgRepository of [repository, { type: 'git', url: repository }]) {
    json(join(src, 'package.json'), { version: '1.0.0', description: 'Catalogo di esempio.', repository: pkgRepository });
    for (const [frontmatter, expected, full = expected] of cases) {
      write(join(src, 'skills/alpha/SKILL.md'), `---\nname: alpha\n${frontmatter}\n---\nContenuto.\n`);
      generateMarketplace(src);
      const claude = read(join(src, CLAUDE)), codex = read(join(src, CODEX));
      const plugin = read(join(src, 'plugins/alpha/plugin.json'));
      assert.equal(claude.description, 'Catalogo di esempio.');
      assert.equal(claude.plugins[0].description, expected);
      assert.equal(claude.plugins[0].repository, repository);
      assert(!Object.hasOwn(claude, 'repository'));
      assert.equal(plugin.description, expected);
      assert.equal(plugin.repository, repository);
      assert.equal(plugin.extensions['com.openai'].interface.shortDescription, expected);
      assert.equal(plugin.extensions['com.openai'].interface.longDescription, full);
      assertCodexManifests(src, 'plugins/alpha');
      assert(!Object.hasOwn(codex, 'description'));
      assert(!Object.hasOwn(codex.plugins[0], 'description'));
      assert(!Object.hasOwn(codex.plugins[0], 'repository'));
    }
  }
  write(join(src, 'skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: true\n---\n');
  const before = snapshot(src);
  assert.equal(run(s, [src]).status, 1);
  assert.deepEqual(snapshot(src), before);
});

test('shortDescription entro 120 caratteri con ellissi e parole intere, longDescription integrale', t => {
  const s = sandbox(t), src = fixture(s);
  const prefix = 'Drupal '.repeat(16).trimEnd();
  const exact = 'a'.repeat(115) + ' fine';
  const boundary = 'a'.repeat(115) + ' uno';
  const cases = [
    [`${prefix} configurazione dettagliata. Seconda frase completa.`, `${prefix}…`],
    [exact, exact],
    [`${boundary} extra.`, `${boundary}…`],
    ['🙂'.repeat(130), '🙂'.repeat(119) + '…'],
    [`Prima frase breve. ${prefix} configurazione dettagliata.`, 'Prima frase breve.'],
  ];
  for (const [description, expected] of cases) {
    write(join(src, 'skills/alpha/SKILL.md'), `---\nname: alpha\ndescription: ${JSON.stringify(description)}\n---\nContenuto.\n`);
    generateMarketplace(src);
    const ui = read(join(src, 'plugins/alpha/plugin.json')).extensions['com.openai'].interface;
    assert.equal(ui.shortDescription, expected);
    assert([...ui.shortDescription].length <= 120);
    assert.equal(ui.longDescription, description);
    assertCodexManifests(src, 'plugins/alpha');
  }
});

test('output deterministico anche riordinando manifest, nessuna riscrittura inutile', t => {
  const s = sandbox(t), src = fixture(s, 'public', { zeta: { category: 'Z' }, alpha: { category: 'A' } });
  ok(run(s, [src]));
  const first = buildMarketplace(src), before = snapshot(join(src, 'plugins'));
  const timestamp = fs.statSync(join(src, CLAUDE)).mtimeMs;
  const manifest = read(join(src, 'cleverops.json'));
  manifest.skills = Object.fromEntries(Object.entries(manifest.skills).reverse());
  manifest.skills.alpha.targets = ['codex', 'claude'];
  json(join(src, 'cleverops.json'), manifest);
  assert.deepEqual(buildMarketplace(src), first);
  ok(run(s, [src]));
  assert.deepEqual(snapshot(join(src, 'plugins')), before);
  assert.equal(fs.statSync(join(src, CLAUDE)).mtimeMs, timestamp);
});

test('--check non scrive e rileva cataloghi, versioni, contenuti e file obsoleti', t => {
  const s = sandbox(t), src = fixture(s);
  const before = snapshot(src);
  assert.equal(run(s, [src, '--check']).status, 1);
  assert.deepEqual(snapshot(src), before);
  ok(run(s, [src]));
  ok(run(s, ['--check', src]));
  const catalog = join(src, CLAUDE);
  fs.appendFileSync(catalog, ' ');
  const changed = snapshot(src);
  assert.equal(run(s, [src, '--check']).status, 1);
  assert.deepEqual(snapshot(src), changed);
  ok(run(s, [src]));
  write(join(src, 'plugins/alpha/skills/alpha/SKILL.md'), 'Modifica del derivato.');
  write(join(src, 'plugins/obsoleto/skills/obsoleto/SKILL.md'), 'Obsoleto.');
  const stale = run(s, [src, '--check']);
  assert.equal(stale.status, 1); assert.match(stale.stderr, /obsoleto/);
  ok(run(s, [src]));
  assert(!fs.existsSync(join(src, 'plugins/obsoleto')));
  fs.appendFileSync(join(src, 'skills/alpha/SKILL.md'), 'Modifica sorgente.');
  assert.equal(run(s, [src, '--check']).status, 1);
  json(join(src, 'package.json'), { version: '2.3.4' });
  ok(run(s, [src]));
  assert.equal(read(catalog).plugins[0].version, '2.3.4');
  assert.equal(read(join(src, 'plugins/alpha/plugin.json')).version, '2.3.4');
  assertCodexManifests(src, 'plugins/alpha');
  ok(run(s, [src, '--check']));
});

test('rigenerazione riallinea entrambi i manifest Codex e conserva i payload', t => {
  const s = sandbox(t), src = fixture(s);
  generateMarketplace(src);
  fs.renameSync(join(src, 'plugins/alpha/plugin.json'), join(src, 'plugins/alpha/precedente.json'));
  json(join(src, 'plugins/alpha/.codex-plugin/plugin.json'), { name: 'alpha', version: '1.0.0', skills: './skills/' });
  const before = snapshot(join(src, 'plugins/alpha/skills'));
  assert.equal(generateMarketplace(src, { check: true }).ok, false);
  generateMarketplace(src);
  assertCodexManifests(src, 'plugins/alpha');
  assert(!fs.existsSync(join(src, 'plugins/alpha/precedente.json')));
  assert(fs.existsSync(join(src, 'plugins/alpha/plugin.json')));
  assert.deepEqual(snapshot(join(src, 'plugins/alpha/skills')), before);
  assert.equal(generateMarketplace(src, { check: true }).ok, true);
  fs.unlinkSync(join(src, 'plugins/alpha/.codex-plugin/plugin.json'));
  assert.equal(generateMarketplace(src, { check: true }).ok, false);
  generateMarketplace(src);
  assertCodexManifests(src, 'plugins/alpha');
});

for (const id of ['public', 'internal']) {
  test(`generatore ${id}: frontmatter con nome diverso rifiutato prima delle scritture`, t => {
    const s = sandbox(t), src = fixture(s, id);
    generateMarketplace(src);
    write(join(src, 'skills/alpha/SKILL.md'), '---\nname: beta\ndescription: Fixture sintetica.\n---\n');
    const before = snapshot(src);
    assert.throws(() => buildMarketplace(src), /name diverso.*alpha/);
    assert.throws(() => generateMarketplace(src), /name diverso.*alpha/);
    assert.deepEqual(snapshot(src), before);
    const result = run(s, [src]);
    assert.equal(result.status, 1); assert.match(result.stderr, /name diverso.*alpha/);
    assert.deepEqual(snapshot(src), before);
  });
}

test('cambio targets e rimozione risorse eliminano i derivati non più necessari', t => {
  const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'A' }, beta: { category: 'B' } });
  generateMarketplace(src);
  const manifest = read(join(src, 'cleverops.json'));
  manifest.skills.alpha.targets = ['claude']; delete manifest.skills.beta;
  json(join(src, 'cleverops.json'), manifest);
  assert.equal(generateMarketplace(src, { check: true }).ok, false);
  generateMarketplace(src);
  assert(!fs.existsSync(join(src, 'plugins/alpha/.codex-plugin')));
  assert(!fs.existsSync(join(src, 'plugins/alpha/plugin.json')));
  assert(!fs.existsSync(join(src, 'plugins/beta')));
  assert.deepEqual(read(join(src, CODEX)).plugins, []);
  assert.equal(generateMarketplace(src, { check: true }).ok, true);
});

test('radice privata sintetica: ID distinto e agent Claude, agent Codex lasciati ai file', t => {
  const s = sandbox(t), src = fixture(s, 'internal', { alpha: { category: 'Test' } }, {
    reviewer: { category: 'Test' }, solo: { category: 'Test', targets: ['codex'] },
  });
  const warnings = [];
  generateMarketplace(src, { warn: message => warnings.push(message) });
  assert.equal(read(join(src, CLAUDE)).name, 'cleverops-internal');
  assert.equal(read(join(src, CODEX)).name, 'cleverops-internal');
  assert.deepEqual(read(join(src, CLAUDE)).plugins.map(p => p.name), ['alpha', 'reviewer']);
  assert.deepEqual(read(join(src, CODEX)).plugins.map(p => p.name), ['alpha']);
  assert.equal(warnings.length, 2);
  assert.equal(fs.readFileSync(join(src, 'plugins/reviewer/agents/reviewer.md'), 'utf8'), fs.readFileSync(join(src, 'agents/reviewer.md'), 'utf8'));
  assert(!fs.existsSync(join(src, 'plugins/solo')));
});

test('input invalidi falliscono prima delle scritture e non sovrascrivono plugin manuali', t => {
  const s = sandbox(t), src = fixture(s);
  for (const mutate of [
    () => json(join(src, 'package.json'), {}),
    () => json(join(src, 'package.json'), { version: '01.0.0' }),
    () => { json(join(src, 'package.json'), { version: '1.0.0' }); json(join(src, 'cleverops.json'), { schemaVersion: 2 }); },
    () => json(join(src, 'cleverops.json'), { schemaVersion: 1, id: 'public', visibility: 'public', skills: { alpha: { category: 'Test', targets: ['project'] } } }),
  ]) {
    mutate(); const before = snapshot(src);
    assert.equal(run(s, [src]).status, 1); assert.deepEqual(snapshot(src), before);
  }
  fixture(s);
  write(join(src, 'plugins/manuale/file.md'), 'Da conservare.');
  const before = snapshot(src);
  assert.equal(run(s, [src]).status, 1); assert.deepEqual(snapshot(src), before);
  assert.equal(run(s, ['--sconosciuto']).status, 2);
  assert.equal(run(s, [src, src]).status, 2);
});

test('rifiuta nomi ambigui e symlink esterni alle risorse o agli output', t => {
  const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'Test' } }, { alpha: { category: 'Test' } });
  assert.throws(() => buildMarketplace(src), /ambiguo/);
  fixture(s);
  write(join(s.root, 'esterno.md'), 'Esterno.');
  fs.symlinkSync(join(s.root, 'esterno.md'), join(src, 'skills/alpha/link.md'));
  assert.throws(() => buildMarketplace(src), /esterno/);
  fs.unlinkSync(join(src, 'skills/alpha/link.md'));
  fs.mkdirSync(join(s.root, 'altro'));
  fs.symlinkSync(join(s.root, 'altro'), join(src, 'plugins'));
  assert.throws(() => generateMarketplace(src), /symlink/);
  assert.deepEqual(fs.readdirSync(join(s.root, 'altro')), []);
});

function setEnabled(s, harness, id, enabled, project) {
  if (harness === 'codex') write(join(s.env.CODEX_HOME, 'config.toml'), `[plugins."${id}"]\nenabled = ${enabled}\n`);
  else json(join(project ? join(project, '.claude') : s.env.CLAUDE_CONFIG_DIR, 'settings.json'), { enabledPlugins: { [id]: enabled } });
}

function diagnose(s, src, targets) {
  const result = s.run(['doctor', '--from', src, '--target', targets, '--json']); ok(result);
  return JSON.parse(result.stdout);
}

for (const harness of ['claude', 'codex']) for (const command of ['sync', 'install']) for (const linked of [false, true]) {
  test(`legacy → plugin ${harness} via ${command}, ${linked ? 'link' : 'copia'} riconosciuta nei backup`, t => {
    const s = sandbox(t), src = fixture(s, 'public', {
      alpha: { category: 'Test', replaces: ['vecchia'] }, beta: { category: 'Test' },
    });
    generateMarketplace(src);
    ok(s.run(['--from', src, '--skills', 'beta', '--target', 'claude,codex']));
    const entries = () => read(s.registry).entries.sort((a, b) => a.dest.localeCompare(b.dest));
    const registry = entries();
    const dir = harness === 'claude' ? s.claude : join(s.env.CODEX_HOME, 'skills');
    const old = join(dir, 'vecchia'), original = join(dir, 'originale');
    write(join(linked ? original : old, 'SKILL.md'), 'Legacy sintetica riconosciuta.');
    if (linked) fs.symlinkSync('originale', old);
    json(join(src, 'legacy-hashes.json'), { schemaVersion: 1,
      skills: { vecchia: [treeHash(old, { allowRootLink: true })] }, agents: {} });
    const other = join(harness === 'claude' ? s.codex : s.claude, 'vecchia');
    write(join(other, 'SKILL.md'), 'Legacy sintetica riconosciuta.');
    const third = join(harness === 'claude' ? s.claude : s.codex, 'alpha');
    write(join(third, 'SKILL.md'), 'Copia estranea non registrata.');
    setEnabled(s, harness, 'alpha@cleverops-public', true);
    const sourceBefore = snapshot(src), oldBefore = snapshot(linked ? original : old);
    const args = [...(command === 'sync' ? ['sync'] : ['--skills', 'alpha']), '--from', src, '--target', harness];
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = s.run(args);
      assert.equal(result.status, command === 'sync' ? 0 : 1, result.stderr);
      if (command === 'install') assert.match(result.stderr, /rifiutata: plugin abilitato/);
      assert.doesNotMatch(result.stderr, /Migrazione in attesa/);
      assert(!fs.lstatSync(old, { throwIfNoEntry: false }));
      assert.deepEqual(entries(), registry);
      assert.equal(fs.readFileSync(join(third, 'SKILL.md'), 'utf8'), 'Copia estranea non registrata.');
      assert(fs.existsSync(other));
      const [entry] = backupEntries(s); assert.equal(backupEntries(s).length, 1); assert.equal(entry.path, old);
      if (linked) {
        assert.equal(entry.linkTarget, 'originale'); assert.equal(entry.resolved, original);
        assert.deepEqual(snapshot(original), oldBefore);
      } else assert.deepEqual(snapshot(join(entry.folder, entry.stored)), oldBefore);
      assert.deepEqual(snapshot(src), sourceBefore);
      assert.deepEqual(diagnose(s, src, harness).migrations, []);
    }
    // Restore mantiene la proprietà precedente e ricrea anche il target grezzo del link.
    setEnabled(s, harness, 'alpha@cleverops-public', false);
    ok(s.run(['restore', backupEntries(s)[0].folder]));
    if (linked) assert.equal(fs.readlinkSync(old), 'originale');
    else assert.deepEqual(snapshot(old), oldBefore);
    assert.deepEqual(entries(), registry);
  });
}

for (const harness of ['claude', 'codex']) {
  test(`legacy → plugin ${harness}: servono tutte le sostitute della sorgente nello stesso harness`, t => {
    const s = sandbox(t), src = fixture(s, 'public', {
      alpha: { category: 'Test', replaces: ['vecchia'] }, beta: { category: 'Test', replaces: ['vecchia'] },
    });
    generateMarketplace(src);
    const old = join(harness === 'claude' ? s.claude : s.codex, 'vecchia');
    write(join(old, 'SKILL.md'), 'Legacy sintetica.');
    const original = snapshot(old);
    json(join(src, 'legacy-hashes.json'), { schemaVersion: 1, skills: { vecchia: [treeHash(old)] }, agents: {} });
    // Il catalogo, un'altra sorgente e l'altro harness non soddisfano la sostituta.
    setEnabled(s, harness === 'claude' ? 'codex' : 'claude', 'beta@cleverops-public', true);
    for (const id of ['beta@cleverops-internal', 'beta@cleverops-public']) {
      setEnabled(s, harness, id, false);
      if (id.includes('internal')) setEnabled(s, harness, id, true);
      const result = s.run(['--from', src, '--skills', 'alpha', '--target', harness]); ok(result);
      assert.match(result.stderr, /Migrazione in attesa/);
      assert.deepEqual(snapshot(old), original); assert.deepEqual(backupEntries(s), []);
    }
    setEnabled(s, harness, 'beta@cleverops-public', true);
    ok(s.run(['--from', src, '--skills', 'alpha', '--target', harness]));
    assert(!fs.existsSync(old));
    assert.deepEqual(read(s.registry).entries.map(e => e.name), ['alpha']);
    const [entry] = backupEntries(s); assert.equal(entry.path, old);
    assert.deepEqual(snapshot(join(entry.folder, entry.stored)), original);
    // Un hash ignoto resta intatto anche se entrambe le sostitute sono disponibili.
    write(join(old, 'SKILL.md'), 'Modifica locale non riconosciuta.');
    const unknown = snapshot(old), result = s.run(['sync', '--from', src, '--target', harness]); ok(result);
    assert.match(result.stderr, /Migrazione dubbia/); assert.deepEqual(snapshot(old), unknown);
    assert.equal(backupEntries(s).length, 1);
  });
}

for (const source of ['public', 'internal']) for (const harness of ['claude', 'codex']) {
  test(`${source}/${harness}: catalogo → file → plugin → file, con ID generati e doctor pulito`, t => {
    const s = sandbox(t), src = fixture(s, source, { alpha: { category: 'Test' }, beta: { category: 'Test' } }, { reviewer: { category: 'Test' } });
    generateMarketplace(src);
    const catalog = read(join(src, harness === 'claude' ? CLAUDE : CODEX));
    const id = `${catalog.plugins.find(p => p.name === 'alpha').name}@${catalog.name}`;
    // Il catalogo disponibile, da solo, non abilita nessun plugin.
    ok(s.run(['--from', src, '--all', '--target', 'claude,codex']));
    assert(diagnose(s, src, 'claude,codex').entries.every(e => e.plugin === false));
    write(join(s[harness], 'alpha/personale.txt'), 'Da preservare.');
    write(join(s[harness], 'terza/SKILL.md'), 'Skill estranea.');
    setEnabled(s, harness, id, true);
    assert.equal(diagnose(s, src, harness).entries.find(e => e.name === 'alpha').plugin, true);
    const synced = s.run(['sync', '--from', src, '--target', 'claude,codex']); ok(synced);
    assert.doesNotMatch(synced.stderr, /rifiutata: plugin abilitato/);
    assert(synced.stdout.includes(`[${harness}] alpha: ora gestito dal plugin`));
    assert(!fs.existsSync(join(s[harness], 'alpha')));
    assert(fs.existsSync(join(s[harness === 'claude' ? 'codex' : 'claude'], 'alpha')));
    assert(fs.existsSync(join(s[harness], 'beta')));
    assert(fs.existsSync(join(s[harness], 'terza/SKILL.md')));
    const backups = backupEntries(s); assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(join(backups[0].folder, backups[0].stored, 'personale.txt'), 'utf8'), 'Da preservare.');
    const clean = diagnose(s, src, 'claude,codex');
    assert.deepEqual(clean.issues, []); assert.deepEqual(clean.migrations, []);
    assert(clean.entries.every(e => !e.plugin && e.status === 'integra'));
    const blocked = s.run(['--from', src, '--skills', 'alpha', '--target', harness]);
    assert.equal(blocked.status, 1); assert.match(blocked.stderr, /plugin abilitato/);
    setEnabled(s, harness, id, false);
    ok(s.run(['--from', src, '--skills', 'alpha', '--target', harness]));
    assert(fs.existsSync(join(s[harness], 'alpha')));
    const restored = diagnose(s, src, 'claude,codex');
    assert.deepEqual(restored.issues, []); assert.deepEqual(restored.migrations, []);
    assert(restored.entries.every(e => !e.plugin && e.status === 'integra'));
    // Il plugin della skill non sostituisce l'agent Codex convertito dall'installer.
    assert.equal(parse(fs.readFileSync(join(s.env.CODEX_HOME, 'agents/reviewer.toml'), 'utf8')).name, 'reviewer');
  });
}

test('plugin prima dei file: install rifiuta solo la risorsa abilitata', t => {
  const s = sandbox(t), src = fixture(s);
  generateMarketplace(src);
  setEnabled(s, 'codex', 'alpha@cleverops-public', true);
  const result = s.run(['--from', src, '--all', '--target', 'claude,codex']);
  assert.equal(result.status, 1); assert.match(result.stderr, /plugin abilitato/);
  assert(fs.existsSync(join(s.claude, 'alpha'))); assert(!fs.existsSync(join(s.codex, 'alpha')));
  setEnabled(s, 'codex', 'alpha@cleverops-public', false);
  ok(s.run(['--from', src, '--all', '--target', 'codex']));
  assert(diagnose(s, src, 'claude,codex').entries.every(e => !e.plugin && e.status === 'integra'));
});

test('ID generati: plugin Claude di progetto non rimuove file globali o di altri progetti', t => {
  const s = sandbox(t), src = fixture(s), other = join(s.root, 'altro');
  generateMarketplace(src);
  ok(s.run(['--from', src, '--all', '--target', 'claude,project', '--project', s.root]));
  ok(s.run(['--from', src, '--all', '--target', 'project', '--project', other]));
  setEnabled(s, 'claude', 'alpha@cleverops-public', true, s.root);
  ok(s.run(['sync', '--from', src, '--target', 'project', '--project', s.root]));
  assert(!fs.existsSync(join(s.root, '.claude/skills/alpha')));
  assert(fs.existsSync(join(s.claude, 'alpha'))); assert(fs.existsSync(join(other, '.claude/skills/alpha')));
});

for (const harness of ['claude', 'codex']) {
  test(`${harness}: ID per risorsa riconosciuto dal registro anche senza catalogo disponibile`, t => {
    const s = sandbox(t), src = fixture(s);
    generateMarketplace(src);
    ok(s.run(['--from', src, '--all', '--target', harness]));
    setEnabled(s, harness, 'alpha@cleverops-public', true);
    const report = s.run(['doctor', '--target', harness, '--json']); ok(report);
    assert.equal(JSON.parse(report.stdout).entries[0].plugin, true);
    ok(s.run(['sync', '--target', harness]));
    assert(!fs.existsSync(join(s[harness], 'alpha')));
    assert.deepEqual(read(s.registry).entries, []);
  });
}

test('risorse pubbliche reali: generazione offline da checkout senza .git', t => {
  const s = sandbox(t), checkout = join(s.root, 'checkout');
  for (const path of ['cleverops.json', 'package.json', 'skills', 'agents', 'bin', 'scripts', 'docs']) {
    if (fs.existsSync(join(ROOT, path))) fs.cpSync(join(ROOT, path), join(checkout, path), { recursive: true });
  }
  // Lo script copiato funziona senza node_modules e trova la radice da import.meta.url.
  ok(captured(process.execPath, [join(checkout, 'scripts/gen-marketplace.mjs')], { cwd: s.root, env: s.env, timeout: 10000 }));
  ok(run(s, [checkout, '--check']));
  const manifest = read(join(checkout, 'cleverops.json'));
  for (const [harness, path] of [['claude', CLAUDE], ['codex', CODEX]]) {
    const names = read(join(checkout, path)).plugins.map(p => p.name);
    assert.deepEqual(names, Object.entries(manifest.skills)
      .filter(([, meta]) => !meta.targets || meta.targets.includes(harness)).map(([name]) => name).sort());
    for (const name of names) {
      assert.equal(treeHash(join(checkout, 'plugins', name, 'skills', name)), treeHash(join(checkout, 'skills', name)));
    }
  }
  const packed = captured('npm', ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', s.root], { cwd: checkout, env: s.env, timeout: 20000 });
  ok(packed);
  const [{ files, filename }] = JSON.parse(packed.stdout);
  for (const name of [CLAUDE, CODEX, 'scripts/gen-marketplace.mjs', 'scripts/validate-skills.mjs', 'bin/lib/entry.mjs', 'docs/marketplace.md']) {
    assert(files.some(file => file.path === name), name);
  }
  assert(!files.some(file => file.path.startsWith('plugins/')));
  ok(captured('tar', ['-xzf', join(s.root, filename), '-C', s.root], { env: s.env, timeout: 10000 }));
  const unpacked = join(s.root, 'package');
  assert(!fs.existsSync(join(unpacked, 'node_modules')));
  assert(!fs.existsSync(join(unpacked, 'plugins')));
  // Il generatore distribuito deve poter creare i plugin anche dal solo tarball.
  ok(captured(process.execPath, [join(unpacked, 'scripts/gen-marketplace.mjs')], { cwd: s.root, env: s.env, timeout: 10000 }));
  ok(run(s, [unpacked, '--check']));
});

test('CLI del generatore eseguita tramite symlink: genera e verifica nella radice indicata', t => {
  const s = sandbox(t), src = fixture(s), link = join(s.root, 'gen-marketplace.mjs');
  fs.symlinkSync(SCRIPT, link);
  const invoke = args => captured(process.execPath, [link, ...args], { cwd: s.root, env: s.env, timeout: 10000 });
  const result = invoke([src]); ok(result);
  assert.match(result.stdout, /Marketplace generati/);
  assert(fs.existsSync(join(src, CLAUDE)));
  assert(fs.existsSync(join(src, CODEX)));
  ok(invoke([src, '--check']));
  fs.appendFileSync(join(src, CLAUDE), ' ');
  assert.equal(invoke([src, '--check']).status, 1);
});

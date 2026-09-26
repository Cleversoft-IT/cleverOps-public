import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { treeHash } from '../bin/lib/treehash.mjs';
import { Transaction, restoreBackup, withRegistry } from '../bin/lib/registry.mjs';
import { sandbox, fixture, bareSource, write, json, read, snapshot, backupEntries, captured, ROOT } from './helpers.mjs';

const ok = r => assert.equal(r.status, 0, r.stderr || r.stdout);
function inEnvironment(s, fn) {
  const previous = { ...process.env };
  Object.assign(process.env, s.env);
  try { return fn(); }
  finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

for (const kind of ['skill', 'agent']) for (const fromGit of [false, true]) {
  for (const escape of ['radice', 'cartella superiore']) {
    test(`rifiuta ${kind} con symlink ${escape}, sorgente ${fromGit ? 'git' : '--from'}`, t => {
      const s = sandbox(t);
      const src = fixture(s, 'public', kind === 'skill' ? { alpha: { category: 'Test' } } : {},
        kind === 'agent' ? { alpha: { category: 'Test' } } : {});
      const parent = join(src, `${kind}s`), item = join(parent, kind === 'agent' ? 'alpha.md' : 'alpha');
      const external = join(s.home, 'file-personali');
      const target = escape === 'radice' ? item : parent;
      const personal = kind === 'agent'
        ? (escape === 'radice' ? external : join(external, 'alpha.md'))
        : join(external, ...(escape === 'radice' ? [] : ['alpha']), 'SKILL.md');
      write(personal, 'contenuto personale sintetico, mai da installare');
      fs.rmSync(target, { recursive: true }); fs.symlinkSync(external, target);
      const before = snapshot(s.home);
      const sourceArgs = fromGit ? [] : ['--from', src];
      if (fromGit) s.env.CLEVEROPS_SOURCES = JSON.stringify([bareSource(s, src, 'public')]);
      const result = s.run([...sourceArgs, '--all', '--target', 'claude,codex']);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Symlink alla radice|Risorsa esterna alla sorgente/);
      assert(!result.stdout.includes('contenuto personale'));
      assert(!fs.existsSync(s.registry)); assert(!fs.existsSync(s.claude)); assert(!fs.existsSync(s.codex));
      if (!fromGit) assert.deepEqual(snapshot(s.home), before);
      assert.equal(fs.readFileSync(personal, 'utf8'), 'contenuto personale sintetico, mai da installare');
      if (!fromGit) {
        const linked = s.run([...sourceArgs, '--link', '--all', '--target', 'claude,codex']);
        assert.equal(linked.status, 1); assert(!fs.existsSync(s.registry));
      }
    });
  }
}

test('treeHash rifiuta link figli esterni e cicli; install non legge il figlio esterno', t => {
  const s = sandbox(t), src = fixture(s), item = join(src, 'skills', 'alpha');
  const privateFile = join(s.home, 'privato.txt'); write(privateFile, 'sintetico');
  const link = join(item, 'figlio'); fs.symlinkSync(privateFile, link);
  assert.throws(() => treeHash(item), /Symlink esterno/);
  const result = s.run(['--from', src, '--all', '--target', 'claude']);
  assert.equal(result.status, 1); assert.match(result.stderr, /Symlink esterno/);
  assert(!fs.existsSync(join(s.claude, 'alpha')));
  fs.unlinkSync(link); fs.symlinkSync('.', link);
  assert.throws(() => treeHash(item), /Ciclo di symlink/);
});

for (const original of ['claude', 'codex']) {
  test(`sync su due target mantiene skill e agent solo su ${original}`, t => {
    const s = sandbox(t), src = fixture(s, 'public', { alpha: { category: 'Test' } }, { alpha: { category: 'Test' } });
    ok(s.run(['--from', src, '--all', '--target', original]));
    const before = read(s.registry).entries.map(e => e.dest).sort();
    ok(s.run(['sync', '--from', src, '--target', 'claude,codex']));
    assert.deepEqual(read(s.registry).entries.map(e => e.dest).sort(), before);
    assert(!fs.existsSync(join(original === 'claude' ? s.codex : s.claude, 'alpha')));
  });
}

test('sync installa la sostituta soltanto sull’harness del legacy', t => {
  const s = sandbox(t), src = fixture(s, 'public', { nuova: { category: 'Test', replaces: ['vecchia'] } });
  const old = join(s.claude, 'vecchia'); write(join(old, 'SKILL.md'), 'legacy sintetico');
  json(join(src, 'legacy-hashes.json'), { schemaVersion: 1, skills: { vecchia: [treeHash(old)] }, agents: {} });
  ok(s.run(['sync', '--from', src, '--target', 'claude,codex']));
  assert(!fs.existsSync(old)); assert(fs.existsSync(join(s.claude, 'nuova')));
  assert(!fs.existsSync(join(s.codex, 'nuova')));
});

test('backup .bak ignoti vengono spostati anche senza sorgenti e conservano i link', t => {
  const s = sandbox(t), dir = join(s.claude, 'sconosciuta.bak-vecchio'), link = join(s.claude, 'rotta.bak-vecchio');
  write(join(dir, 'SKILL.md'), 'da conservare'); fs.symlinkSync('../inesistente', link);
  const before = snapshot(s.home);
  const diag = s.run(['doctor', '--target', 'claude', '--json']); ok(diag);
  assert.equal(JSON.parse(diag.stdout).migrations.length, 2); assert.deepEqual(snapshot(s.home), before);
  ok(s.run(['sync', '--target', 'claude']));
  assert(!fs.existsSync(dir)); assert(!fs.lstatSync(link, { throwIfNoEntry: false }));
  const backups = backupEntries(s); assert.equal(backups.length, 2);
  assert.equal(backups.find(b => b.path === link).linkTarget, '../inesistente');
  const saved = backups.find(b => b.path === dir);
  assert.equal(fs.readFileSync(join(saved.folder, saved.stored, 'SKILL.md'), 'utf8'), 'da conservare');
});

test('commit conserva i backup tramite backedUp e pulisce solo i temporanei', t => {
  const s = sandbox(t);
  inEnvironment(s, () => {
    const kept = join(s.root, 'originale'), replaced = join(s.root, 'gestita');
    write(kept, 'originale'); write(replaced, 'vecchio');
    const tx = new Transaction();
    tx.replace(kept, tmp => write(tmp, 'nuovo'), true);
    tx.replace(replaced, tmp => write(tmp, 'aggiornato'), false);
    const [backup, temporary] = tx.changes;
    assert.equal(backup.backedUp, true); assert.equal(temporary.backedUp, false);
    tx.commit({ schemaVersion: 1, entries: [] });
    assert.equal(fs.readFileSync(backup.old, 'utf8'), 'originale'); assert(!fs.existsSync(temporary.old));
  });
});

test('rollback fallito conserva un manifest utilizzabile per restore', t => {
  const s = sandbox(t);
  inEnvironment(s, () => {
    const dest = join(s.claude, 'originale'); write(dest, 'da recuperare');
    const tx = new Transaction(); tx.replace(dest, tmp => write(tmp, 'nuovo'), true);
    const originalRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (from === tx.changes[0].old) throw new Error('errore sintetico di rollback');
      return originalRename(from, to);
    };
    try { assert.throws(() => tx.rollback(), /Rollback incompleto/); }
    finally { fs.renameSync = originalRename; }
    const manifest = read(join(tx.backupDir, 'manifest.json'));
    assert.equal(manifest.entries.length, 1); assert.equal(manifest.entries[0].path, dest);
    restoreBackup(tx.backupDir); assert.equal(fs.readFileSync(dest, 'utf8'), 'da recuperare');
  });
});

for (const backup of [true, false]) {
  test(`EXDEV con rimozione parziale: rollback conserva la copia completa (backup=${backup})`, t => {
    const s = sandbox(t), src = fixture(s), dest = join(s.claude, 'alpha');
    ok(s.run(['--from', src, '--all', '--target', 'claude']));
    write(join(dest, 'a'), 'primo'); write(join(dest, 'b'), 'secondo');
    const original = snapshot(dest), registry = fs.readFileSync(s.registry, 'utf8');
    inEnvironment(s, () => {
      const rename = fs.renameSync, rm = fs.rmSync;
      let saved;
      fs.renameSync = (from, to) => {
        if (from === dest) { saved = to; throw Object.assign(new Error('filesystem diversi'), { code: 'EXDEV' }); }
        return rename(from, to);
      };
      fs.rmSync = (path, options) => {
        if (path === dest) {
          rm(join(dest, 'a'));
          throw Object.assign(new Error('rimozione parziale sintetica'), { code: 'EACCES' });
        }
        return rm(path, options);
      };
      try {
        assert.throws(() => withRegistry((data, tx) => {
          data.entries = [];
          tx.replace(dest, tmp => write(join(tmp, 'SKILL.md'), 'nuovo'), backup);
        }), error => {
          assert.match(error.message, /rimozione parziale sintetica/);
          assert.match(error.message, /Rollback incompleto/);
          assert(error.message.includes(`conservato in ${saved}`));
          return true;
        });
      } finally { fs.renameSync = rename; fs.rmSync = rm; }
      assert.deepEqual(snapshot(saved), original);
      assert.equal(fs.readFileSync(join(dest, 'b'), 'utf8'), 'secondo');
      assert.equal(fs.readFileSync(s.registry, 'utf8'), registry);
      assert(!fs.existsSync(join(s.state, 'installed.lock')));
      assert(!Object.values(snapshot(s.home)).includes(Buffer.from('nuovo').toString('base64')));
      if (backup) {
        const [entry] = backupEntries(s);
        assert.equal(entry.path, dest); assert.equal(join(entry.folder, entry.stored), saved);
        fs.rmSync(dest, { recursive: true });
        restoreBackup(entry.folder);
        assert.deepEqual(snapshot(dest), original);
        assert.equal(fs.readFileSync(s.registry, 'utf8'), registry);
      }
    });
  });
}

test('guardia pubblica: payload privati dei plugin vietati in pre-commit e pre-push', t => {
  const s = sandbox(t), repo = join(s.root, 'guard-fixture');
  const denied = [
    'skills/transcribe-pro/SKILL.md',
    'skills/cleversoft-design-system/SKILL.md',
    'skills/frontend-design/SKILL.md',
    'agents/assistente.md',
    'plugins/contenitore/skills/transcribe-pro/SKILL.md',
    'skills/cleverops-maintainer/SKILL.md',
    'plugins/cleverops-maintainer/skills/cleverops-maintainer/SKILL.md',
    'plugins/transcribe-pro/skills/transcribe-pro/SKILL.md',
    'plugins/transcribe-pro/skills/innocua/SKILL.md',
    'plugins/transcribe-pro/plugin.json',
    'plugins/contenitore/skills/cleversoft-design/SKILL.md',
    'plugins/contenitore/skills/cleversoft-design-system/SKILL.md',
    'plugins/cleversoft-design-system/plugin.json',
    'plugins/cleversoft-design-system/skills/cleversoft-design-system/SKILL.md',
    'plugins/cleversoft-design-legacy/README.md',
    'plugins/contenitore/agents/assistente.md',
    'plugins/contenitore/agents/assistente.toml',
  ];
  const allowed = [
    'plugins/transcribe-local/skills/transcribe-local/SKILL.md',
    'plugins/drupal11-module-development/plugin.json',
    'plugins/transcribe-pro-example/skills/alpha/SKILL.md',
    'plugins/contenitore/skills/transcribe-pro-example/SKILL.md',
    'docs/plugins/transcribe-pro.md',
  ];
  for (const path of allowed) write(join(repo, path), 'Fixture pubblica sintetica.');
  s.git(repo, ['init', '-b', 'main']); s.git(repo, ['add', '.']);
  // Oggetti Git solo nella sandbox: nessun commit o ref nel repository reale.
  const base = s.git(repo, ['commit-tree', s.git(repo, ['write-tree']), '-m', 'Fixture pubblica']);
  const guard = args => captured(process.execPath, [join(ROOT, 'scripts/check-public.mjs'), ...args], {
    cwd: repo, env: { ...s.env, PUBLIC_GUARD_DENYLIST: 'termine-sintetico-vietato' }, timeout: 10000,
  });
  ok(guard(['--staged'])); ok(guard(['--history', base]));
  for (const path of denied) write(join(repo, path), 'Fixture pubblica sintetica.');
  s.git(repo, ['add', '.']);
  const head = s.git(repo, ['commit-tree', s.git(repo, ['write-tree']), '-p', base, '-m', 'Fixture percorsi']);
  for (const args of [['--staged'], ['--range', base, head], ['--new', head]]) {
    const result = guard(args);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    for (const path of denied) assert(result.stderr.includes(`${path}: percorso vietato`), `${args[0]}: ${path}`);
    for (const path of allowed) assert(!result.stderr.includes(path), `${args[0]}: ${path}`);
  }
});

test('restore CLI offline ricrea link identici e rifiuta destinazioni occupate prima di scrivere', t => {
  const s = sandbox(t), folder = join(s.state, 'backups', 'fixture');
  const link = join(s.claude, 'link'), file = join(s.env.CODEX_HOME, 'agents', 'file.toml');
  write(join(folder, 'originale'), 'file recuperato'); write(file, 'occupato');
  json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [
    { path: link, linkTarget: '../bersaglio-relativo', resolved: null }, { path: file, stored: 'originale' },
  ] });
  const before = snapshot(s.home);
  const refused = s.run(['restore', folder]); assert.equal(refused.status, 1); assert.match(refused.stderr, /destinazione occupata/);
  assert.deepEqual(snapshot(s.home), before);
  fs.unlinkSync(file);
  ok(s.run(['restore', folder], { CLEVEROPS_SOURCES: 'JSON non valido da ignorare' }));
  assert.equal(fs.readlinkSync(link), '../bersaglio-relativo'); assert.equal(fs.readFileSync(file, 'utf8'), 'file recuperato');
  assert(!fs.existsSync(s.registry));
  assert.equal(s.run(['restore']).status, 2);
});

test('restore rifiuta percorsi stored che escono dal backup', t => {
  const s = sandbox(t), folder = join(s.state, 'backups', 'fixture');
  json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [{ path: join(s.claude, 'dest'), stored: '../estraneo' }] });
  const r = s.run(['restore', folder]); assert.equal(r.status, 1); assert.match(r.stderr, /Percorso nel backup non valido/);
});

test('restore rifiuta file e link fuori dagli harness e dentro una skill gestita', t => {
  const s = sandbox(t), src = fixture(s), folder = join(s.state, 'backups', 'fixture');
  ok(s.run(['--from', src, '--all', '--target', 'claude']));
  const paths = [
    join(s.home, '.bashrc.d', 'zz-payload.sh'),
    join(s.home, '.ssh', 'authorized_keys'),
    join(s.claude, 'alpha', 'references', 'iniettato.md'),
    join(s.home, 'altro', 'skills', 'alpha'),
  ];
  for (const path of paths) for (const link of [false, true]) {
    write(join(folder, 'originale'), 'contenuto sintetico');
    json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [
      { path: join(s.claude, 'ammessa'), linkTarget: '../destinazione' },
      { path, ...(link ? { linkTarget: '../payload' } : { stored: 'originale' }) },
    ] });
    const before = snapshot(s.home), r = s.run(['restore', folder]);
    assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /Destinazione nel manifest del backup non valida/);
    assert.deepEqual(snapshot(s.home), before);
  }
});

test('restore rifiuta backup esterni, prefissi simili e symlink verso cartelle esterne', t => {
  const s = sandbox(t), backups = join(s.state, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const external = join(s.home, 'Downloads', 'backup');
  const sibling = join(s.state, 'backups-estranei', 'fixture');
  const escaped = join(backups, 'link-esterno');
  for (const folder of [external, sibling, backups]) {
    write(join(folder, 'originale'), 'contenuto sintetico');
    json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [
      { path: join(s.claude, 'alpha'), stored: 'originale' },
    ] });
  }
  fs.symlinkSync(external, escaped);
  for (const folder of [external, sibling, escaped, backups]) {
    const before = snapshot(s.home), r = s.run(['restore', folder]);
    assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /cartella deve trovarsi nei backup dello stato/);
    assert.deepEqual(snapshot(s.home), before);
  }
});

test('restore limita i nomi alle risorse e ai suffissi legacy ammessi', t => {
  const s = sandbox(t), folder = join(s.state, 'backups', 'fixture');
  for (const name of ['.env', 'alpha.txt', 'alpha.bak-', 'nome errato.bak-123', 'a'.repeat(65)]) {
    json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [
      { path: join(s.claude, name), linkTarget: '../destinazione' },
    ] });
    const before = snapshot(s.home), r = s.run(['restore', folder]);
    assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /Destinazione nel manifest del backup non valida/);
    assert.deepEqual(snapshot(s.home), before);
  }
});

test('restore ammette radici configurate, Codex legacy, project e suffissi dei backup', t => {
  const s = sandbox(t), folder = join(s.state, 'backups', 'fixture');
  s.env.CLAUDE_CONFIG_DIR = join(s.home, 'claude-config');
  s.env.CODEX_HOME = join(s.home, 'codex-config');
  const paths = [
    join(s.env.CLAUDE_CONFIG_DIR, 'skills', 'alpha'),
    join(s.env.CLAUDE_CONFIG_DIR, 'agents', 'alpha.md'),
    join(s.codex, 'alpha.bak-123'),
    join(s.env.CODEX_HOME, 'agents', 'alpha.toml.bak-123'),
    join(s.env.CODEX_HOME, 'skills', 'legacy'),
    join(s.root, 'progetto', '.claude', 'skills', 'alpha'),
    join(s.root, 'progetto', '.claude', 'agents', 'alpha.md.bak-123'),
  ];
  json(join(folder, 'manifest.json'), { schemaVersion: 1,
    entries: paths.map(path => ({ path, linkTarget: '../originale-relativo' })) });
  ok(s.run(['restore', folder]));
  for (const path of paths) assert.equal(fs.readlinkSync(path), '../originale-relativo');
  assert(!fs.existsSync(s.registry));
});

test('restore non cambia il registro; reinstall salva la copia ripristinata diversa', t => {
  const s = sandbox(t), src = fixture(s), dest = join(s.claude, 'alpha');
  write(join(dest, 'SKILL.md'), 'originale da conservare');
  const args = ['--from', src, '--all', '--target', 'claude'];
  ok(s.run(args));
  const backup = backupEntries(s)[0], registry = fs.readFileSync(s.registry, 'utf8');
  fs.rmSync(dest, { recursive: true });
  const absent = s.run(['doctor', '--from', src, '--target', 'claude', '--json']); ok(absent);
  assert.equal(JSON.parse(absent.stdout).entries[0].status, 'assente');
  ok(s.run(['restore', backup.folder]));
  assert.equal(fs.readFileSync(s.registry, 'utf8'), registry);
  ok(s.run(args));
  const saved = backupEntries(s).filter(entry => entry.folder !== backup.folder);
  assert.equal(saved.length, 1);
  assert.equal(fs.readFileSync(join(saved[0].folder, saved[0].stored, 'SKILL.md'), 'utf8'), 'originale da conservare');
});

test('rollback fallito indica il percorso degli originali temporanei senza backup', t => {
  const s = sandbox(t);
  inEnvironment(s, () => {
    const dest = join(s.claude, 'alpha'); write(dest, 'originale');
    const tx = new Transaction(); tx.replace(dest, tmp => write(tmp, 'nuovo'), false);
    const original = tx.changes[0].old, rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (from === original) throw new Error('errore sintetico');
      return rename(from, to);
    };
    try {
      assert.throws(() => tx.rollback(), error => {
        assert.match(error.message, /Rollback incompleto/);
        assert(error.message.includes(`conservato in ${original}`));
        return true;
      });
    } finally { fs.renameSync = rename; }
    assert.equal(tx.backupDir, null); assert.equal(fs.readFileSync(original, 'utf8'), 'originale');
  });
});

test('sync rifiuta le selezioni con exit 2 prima di caricare sorgenti o scrivere', t => {
  const s = sandbox(t);
  for (const selection of [['--all'], ['--skills', 'alpha'], ['--agents', 'alpha']]) {
    const before = snapshot(s.home);
    const r = s.run(['sync', ...selection, '--target', 'claude'], { CLEVEROPS_SOURCES: 'JSON da non leggere' });
    assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /sync non accetta selezioni/);
    assert.deepEqual(snapshot(s.home), before);
  }
});

test('restore distingue il comando ripetuto da una cartella omonima esplicita', t => {
  const s = sandbox(t);
  const repeated = s.run(['restore', 'restore']);
  assert.equal(repeated.status, 2); assert.match(repeated.stderr, /Comando restore ripetuto/);
  const folder = join(s.state, 'backups', 'restore');
  json(join(folder, 'manifest.json'), { schemaVersion: 1, entries: [
    { path: join(s.claude, 'alpha'), linkTarget: '../originale' },
  ] });
  fs.symlinkSync(folder, join(s.root, 'restore'));
  ok(s.run(['restore', './restore']));
  assert.equal(fs.readlinkSync(join(s.claude, 'alpha')), '../originale');
  assert.equal(s.run(['restore', folder, '--project', s.root]).status, 2);
});

test('TOML Codex malformato: errore operativo chiaro, doctor continua senza scritture', t => {
  const s = sandbox(t), src = fixture(s);
  ok(s.run(['--from', src, '--all', '--target', 'codex']));
  write(join(s.env.CODEX_HOME, 'config.toml'), '[plugins.');
  const before = snapshot(s.home);
  for (const args of [['--all'], ['sync']]) {
    const r = s.run([...args, '--from', src, '--target', 'codex']);
    assert.equal(r.status, 1); assert.match(r.stderr, /Configurazione Codex non valida.*config\.toml/s);
    assert.deepEqual(snapshot(s.home), before);
  }
  const r = s.run(['doctor', '--from', src, '--target', 'codex', '--json']); ok(r);
  const data = JSON.parse(r.stdout); assert.equal(data.entries[0].plugin, null); assert.match(data.issues[0], /Configurazione Codex non valida/);
  assert.deepEqual(snapshot(s.home), before);
  fs.unlinkSync(s.registry);
  const empty = s.run(['doctor', '--from', src, '--target', 'codex', '--json']); ok(empty);
  assert.match(JSON.parse(empty.stdout).issues[0], /Configurazione Codex non valida/);
});

test('SKILL.md assente: diagnostica dedicata prima di statSync', t => {
  const s = sandbox(t), src = fixture(s); fs.unlinkSync(join(src, 'skills', 'alpha', 'SKILL.md'));
  const r = s.run(['--from', src, '--all', '--target', 'claude']);
  assert.equal(r.status, 1); assert.match(r.stderr, /SKILL\.md mancante: alpha/); assert(!r.stderr.includes('stat'));
});

test('rinomine solo da replaces, senza associazioni implicite ai nuovi nomi', t => {
  const s = sandbox(t), src = fixture(s, 'public', { 'transcribe-local': { category: 'Test' }, scelta: { category: 'Test' } });
  const old = join(s.claude, 'transcribe'); write(join(old, 'SKILL.md'), 'legacy');
  json(join(src, 'legacy-hashes.json'), { schemaVersion: 1, skills: { transcribe: [treeHash(old)] }, agents: {} });
  ok(s.run(['sync', '--from', src, '--target', 'claude']));
  assert(fs.existsSync(old)); assert(!fs.existsSync(join(s.claude, 'transcribe-local')));
  const manifest = read(join(src, 'cleverops.json')); manifest.skills.scelta.replaces = ['transcribe']; json(join(src, 'cleverops.json'), manifest);
  ok(s.run(['sync', '--from', src, '--target', 'claude']));
  assert(!fs.existsSync(old)); assert(fs.existsSync(join(s.claude, 'scelta'))); assert(!fs.existsSync(join(s.claude, 'transcribe-local')));
});

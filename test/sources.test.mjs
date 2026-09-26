import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { sandbox, fixture, bareSource, write, read, snapshot, captured } from './helpers.mjs';

const ok = r => assert.equal(r.status, 0, r.stderr || r.stdout);
function sources(s, specs) { s.env.CLEVEROPS_SOURCES = JSON.stringify(specs); }
function gitWrapper(s, extra = '') {
  const real = captured('sh', ['-c', 'command -v git'], { env: s.env, encoding: 'utf8' }).stdout.trim();
  const bin = join(s.root, 'bin'), log = join(s.root, 'git.log');
  write(join(bin, 'git'), `#!${process.execPath}\nimport fs from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nlet args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, ssh:process.env.GIT_SSH_COMMAND, prompt:process.env.GIT_TERMINAL_PROMPT, interactive:process.env.GCM_INTERACTIVE, gitAskpass:process.env.GIT_ASKPASS, sshAskpass:process.env.SSH_ASKPASS})+'\\n');\n${extra}\nconst r = spawnSync(${JSON.stringify(real)}, args, {env:process.env, stdio:'inherit'});\nprocess.exit(r.status ?? 1);\n`);
  // Il wrapper ESM ha estensione senza suffisso: package.json ne fissa il tipo.
  write(join(bin, 'package.json'), '{"type":"module"}');
  fs.chmodSync(join(bin, 'git'), 0o755); s.env.PATH = bin + ':' + s.env.PATH;
  return () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

test('privata inaccessibile: skip silenzioso e 0; richiesta esplicita: 3', t => {
  const s = sandbox(t), pub = fixture(s);
  sources(s, [{ id: 'public', path: pub }, { id: 'internal', url: 'file:///sorgente-assente.git' }]);
  const r = s.run(['--all', '--target', 'claude']); ok(r); assert.equal(r.stderr, '');
  assert(fs.existsSync(join(s.claude, 'alpha')));
  const explicit = s.run(['--list', '--source', 'internal']); assert.equal(explicit.status, 3); assert.match(explicit.stderr, /non disponibile/);
});

test('privata accessibile, cache 0700, nuovo commit aggiornato e clean -fdx', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src); sources(s, [spec]);
  ok(s.run(['--all', '--target', 'codex']));
  const cache = join(s.env.XDG_CACHE_HOME, 'cleverops', 'sources', 'internal');
  assert.equal(fs.statSync(cache).mode & 0o777, 0o700);
  const first = read(s.registry).entries[0].commit; assert.match(first, /^[a-f0-9]{40}$/);
  write(join(cache, 'spazzatura'), 'non tracciato');
  write(join(src, 'skills', 'alpha', 'SKILL.md'), 'nuova versione sintetica');
  s.git(src, ['add', '.']); s.git(src, ['commit', '-m', 'Aggiornamento sintetico']); s.git(src, ['push', spec.url, 'main']);
  ok(s.run(['--all', '--target', 'codex']));
  assert(!fs.existsSync(join(cache, 'spazzatura')));
  assert.notEqual(read(s.registry).entries[0].commit, first);
  assert.equal(fs.readFileSync(join(s.codex, 'alpha', 'SKILL.md'), 'utf8'), 'nuova versione sintetica');
  assert(!fs.existsSync(join(s.env.XDG_CACHE_HOME, 'cleverops', 'sources', 'internal.lock')));
});

test('probe riuscito e fetch fallito: mai usare la cache vecchia', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src); sources(s, [spec]);
  ok(s.run(['--all', '--target', 'claude']));
  const before = snapshot(s.claude);
  const log = gitWrapper(s, "if (args.includes('fetch')) process.exit(9);");
  const r = s.run(['--list', '--json']); ok(r); const data = JSON.parse(r.stdout);
  assert.equal(data.items.length, 0); assert.equal(data.sources[0].status, 'saltata'); assert.equal(r.stderr, '');
  assert(log().some(l => l.args.includes('ls-remote'))); assert(log().some(l => l.args.includes('fetch')));
  assert.deepEqual(snapshot(s.claude), before);
});

test('origin inatteso: cache riclonata dalla sorgente corretta', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src); sources(s, [spec]);
  ok(s.run(['--list']));
  const cache = join(s.env.XDG_CACHE_HOME, 'cleverops', 'sources', 'internal');
  s.git(cache, ['remote', 'set-url', 'origin', 'file:///origin-estraneo.git']);
  write(join(cache, 'skills', 'alpha', 'SKILL.md'), 'cache non attendibile');
  ok(s.run(['--all', '--target', 'claude']));
  assert.equal(s.git(cache, ['remote', 'get-url', 'origin']), spec.url);
  assert.match(fs.readFileSync(join(s.claude, 'alpha', 'SKILL.md'), 'utf8'), /Contenuto internal/);
});

test('GIT_SSH_COMMAND e core.sshCommand rispettati, opzioni e ambiente non interattivi', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src); sources(s, [spec]);
  const log = gitWrapper(s);
  ok(s.run(['--list'], { GIT_SSH_COMMAND: 'ssh -i /dev/null -o IdentitiesOnly=yes' }));
  let probe = log().find(e => e.args.includes('ls-remote'));
  assert.equal(probe.ssh, 'ssh -i /dev/null -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=5');
  assert.equal(probe.prompt, '0'); assert.equal(probe.interactive, 'never');
  ok(s.run(['--list'], { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.sshCommand', GIT_CONFIG_VALUE_0: 'ssh -F /dev/null' }));
  probe = log().filter(e => e.args.includes('ls-remote')).at(-1);
  assert.equal(probe.ssh, 'ssh -F /dev/null -o BatchMode=yes -o ConnectTimeout=5');
  ok(s.run(['--list'], { GIT_SSH_COMMAND: 'ssh -i custom', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.sshCommand', GIT_CONFIG_VALUE_0: 'ssh -F ignored' }));
  probe = log().filter(e => e.args.includes('ls-remote')).at(-1); assert.match(probe.ssh, /^ssh -i custom /);
});

test('SSH seguito da HTTPS, --no-private evita ogni probe privato', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src);
  const ssh = 'git@example.test:fixture.git', https = 'https://example.test/fixture.git';
  sources(s, [{ id: 'internal', url: ssh, https }]);
  const log = gitWrapper(s, `if(args.includes(${JSON.stringify(ssh)})) process.exit(2);\nargs=args.map(a=>a===${JSON.stringify(https)}?${JSON.stringify(spec.url)}:a);`);
  ok(s.run(['--list']));
  const probes = log().filter(e => e.args.includes('ls-remote'));
  assert.equal(probes.length, 2); assert(probes[0].args.includes(ssh)); assert(probes[1].args.includes(https));
  const previous = log().length; ok(s.run(['--list', '--no-private']));
  assert(!log().slice(previous).some(e => e.args.includes('ls-remote')));
});

test('collisione di nomi: public vince anche quando arriva dopo internal', t => {
  const s = sandbox(t), internal = fixture(s, 'internal'), pub = fixture(s);
  sources(s, [{ id: 'internal', path: internal }, { id: 'public', path: pub }]);
  const r = s.run(['--all', '--target', 'claude']); ok(r); assert.match(r.stderr, /Collisione/);
  assert.equal(read(s.registry).entries[0].source, 'public'); assert.match(fs.readFileSync(join(s.claude, 'alpha', 'SKILL.md'), 'utf8'), /Contenuto public/);
});

test('schema futuro: sorgente saltata con invito ad aggiornare', t => {
  const s = sandbox(t), src = fixture(s);
  const file = join(src, 'cleverops.json'), m = read(file); m.schemaVersion = 2; write(file, JSON.stringify(m));
  sources(s, [{ id: 'public', path: src }]);
  const r = s.run(['--list', '--json']); ok(r); assert.match(r.stderr, /aggiorna/); assert.equal(JSON.parse(r.stdout).items.length, 0);
});

test('lock sorgente: cache intatta, fallimento esplicito per sorgente richiesta', t => {
  const s = sandbox(t), src = fixture(s, 'internal'); const spec = bareSource(s, src); sources(s, [spec]);
  ok(s.run(['--list']));
  const dir = join(s.env.XDG_CACHE_HOME, 'cleverops', 'sources'); write(join(dir, 'internal.lock'), 'occupato');
  const before = snapshot(dir), r = s.run(['--list', '--source', 'internal']); assert.equal(r.status, 3); assert.deepEqual(snapshot(dir), before);
});

test('probe bloccato: timeout e sorgente saltata senza cache', t => {
  const s = sandbox(t);
  sources(s, [{ id: 'internal', url: 'file:///fixture-timeout.git' }]);
  gitWrapper(s, "if(args.includes('ls-remote')) await new Promise(resolve => setTimeout(resolve, 60000));");
  const start = Date.now(), r = s.run(['--list', '--json']);
  ok(r); assert(Date.now() - start < 25000); assert.equal(JSON.parse(r.stdout).items.length, 0);
  assert(!fs.existsSync(join(s.env.XDG_CACHE_HOME, 'cleverops')));
});


test('askpass disabilitati in probe, clone e fetch; GIT_SSH precede core.sshCommand', t => {
  const s = sandbox(t), src = fixture(s, 'internal');
  sources(s, [bareSource(s, src)]);
  const log = gitWrapper(s);
  const env = { GIT_ASKPASS: 'askpass-da-non-usare', SSH_ASKPASS: 'ssh-askpass-da-non-usare',
    GIT_SSH: '/tmp/wrapper ssh', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.sshCommand', GIT_CONFIG_VALUE_0: 'ssh -F ignorato' };
  ok(s.run(['--list'], env));
  ok(s.run(['--list'], env));
  const operations = log().filter(e => e.args.some(a => ['ls-remote', 'clone', 'fetch'].includes(a)));
  assert(operations.some(e => e.args.includes('clone')));
  assert(operations.some(e => e.args.includes('fetch')));
  for (const operation of operations) {
    assert.equal(operation.gitAskpass, ''); assert.equal(operation.sshAskpass, '');
    assert.equal(operation.ssh, "'/tmp/wrapper ssh' -o BatchMode=yes -o ConnectTimeout=5");
  }
  ok(s.run(['--list'], { ...env, GIT_SSH_COMMAND: 'ssh -i prioritario' }));
  assert.match(log().filter(e => e.args.includes('ls-remote')).at(-1).ssh, /^ssh -i prioritario /);
});

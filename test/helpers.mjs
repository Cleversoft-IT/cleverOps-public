import fs from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(ROOT, 'bin', 'cleverops.mjs');
// File descriptor reali: compatibile anche con sandbox che limitano le pipe.
export function captured(command, args, options = {}) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'cleverops-output-'));
  const out = fs.openSync(join(dir, 'stdout'), 'w'), err = fs.openSync(join(dir, 'stderr'), 'w');
  try {
    const result = spawnSync(command, args, { ...options, stdio: ['ignore', out, err] });
    return { ...result, stdout: fs.readFileSync(join(dir, 'stdout'), 'utf8'), stderr: fs.readFileSync(join(dir, 'stderr'), 'utf8') };
  } finally { fs.closeSync(out); fs.closeSync(err); fs.rmSync(dir, { recursive: true, force: true }); }
}
export const write = (path, text) => { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); };
export const json = (path, value) => write(path, JSON.stringify(value, null, 2) + '\n');
export const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
export function sandbox(t) {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'cleverops-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'); fs.mkdirSync(home);
  const env = { ...process.env, PATH: process.env.PATH, HOME: home, USERPROFILE: home, TMPDIR: join(root, 'tmp'),
    XDG_CACHE_HOME: join(home, 'cache'), XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state'), XDG_RUNTIME_DIR: join(home, 'run'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'), CODEX_HOME: join(home, '.codex'),
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
    GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', CLEVEROPS_SOURCES: '[]',
    npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'npmrc'), npm_config_globalconfig: join(root, 'global-npmrc'),
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.GIT_SSH_COMMAND;
  delete env.GIT_SSH;
  fs.mkdirSync(env.TMPDIR);
  const s = { root, home, env, state: join(env.XDG_STATE_HOME, 'cleverops'),
    registry: join(env.XDG_STATE_HOME, 'cleverops', 'installed.json'),
    claude: join(env.CLAUDE_CONFIG_DIR, 'skills'), codex: join(home, '.agents', 'skills'),
    run(args, extra = {}) { return captured(process.execPath, [CLI, ...args], { env: { ...env, ...extra }, cwd: root, encoding: 'utf8', timeout: 40000 }); },
    git(path, args) { return execFileSync('git', ['-C', path, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); },
  };
  return s;
}
export function fixture(s, id = 'public', skills = { alpha: { category: 'Test' } }, agents = {}) {
  const root = join(s.root, `source-${id}`);
  json(join(root, 'cleverops.json'), { schemaVersion: 1, id, visibility: id === 'internal' ? 'private' : 'public', skills, agents });
  json(join(root, 'package.json'), { name: `fixture-${id}`, version: '1.0.0' });
  for (const name of Object.keys(skills)) write(join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: Skill sintetica.\n---\nContenuto ${id}/${name}.\n`);
  for (const name of Object.keys(agents)) write(join(root, 'agents', `${name}.md`), `---\nname: ${name}\ndescription: 'Agent sintetico. <example>esempio</example>'\nmodel: test\ncolor: blue\nmemory: user\n---\nUsa "virgolette", Unicode è e percorsi C:\\test.\n`);
  return root;
}
export function bareSource(s, root, id = 'internal') {
  s.git(root, ['init', '-b', 'main']);
  s.git(root, ['add', '.']); s.git(root, ['commit', '-m', 'Fixture iniziale']);
  const bare = join(s.root, `${id}.git`);
  s.git(s.root, ['clone', '--bare', root, bare]);
  return { id, visibility: id === 'internal' ? 'private' : 'public', url: pathToFileURL(bare).href, bare };
}
export function snapshot(path) {
  const out = {};
  const visit = (dir, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name, file = join(dir, entry.name);
      out[name] = entry.isSymbolicLink() ? `link:${fs.readlinkSync(file)}` : entry.isDirectory() ? 'dir' : fs.readFileSync(file).toString('base64');
      if (entry.isDirectory()) visit(file, name + '/');
    }
  };
  visit(path); return out;
}
export function backupEntries(s) {
  const dir = join(s.state, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(name => read(join(dir, name, 'manifest.json')).entries.map(e => ({ ...e, folder: join(dir, name) })));
}

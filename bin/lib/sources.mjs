import fs from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ID, object, readJSON, readManifest, SourceError, UsageError } from './manifest.mjs';
import { lock } from './registry.mjs';

const exec = promisify(execFile);
const TIMEOUT = 15000;
export async function git(args, options = {}) {
  const r = await exec('git', args, { encoding: 'utf8', timeout: TIMEOUT, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, ...options });
  return r.stdout.trim();
}
export async function gitEnvironment(env = process.env) {
  const safeEnv = { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    GIT_ASKPASS: '', SSH_ASKPASS: '' };
  let ssh = env.GIT_SSH_COMMAND;
  if (!ssh) {
    try { ssh = await git(['config', '--get', 'core.sshCommand'], { env: safeEnv }); }
    catch { /* Nessun comando personalizzato. */ }
  }
  // GIT_SSH segue core.sshCommand ed è un eseguibile: preserva spazi e apici.
  if (!ssh && env.GIT_SSH) ssh = `'${env.GIT_SSH.replace(/'/g, `'\\''`)}'`;
  return { ...safeEnv, GIT_SSH_COMMAND: `${ssh || 'ssh'} -o BatchMode=yes -o ConnectTimeout=5` };
}

function validSourceSpec(spec) {
  if (!object(spec)) return false;
  if (spec.id !== undefined && (typeof spec.id !== 'string' || !ID.test(spec.id))) return false;
  if (!spec.path && (!spec.id || !spec.url)) return false;
  if (spec.path !== undefined && (typeof spec.path !== 'string' || !spec.path)) return false;
  if (spec.url !== undefined && (typeof spec.url !== 'string' || !spec.url || spec.url.startsWith('-'))) return false;
  if (spec.https !== undefined && (typeof spec.https !== 'string' || !spec.https.startsWith('https://'))) return false;
  return true;
}
export function sourceSpecs(root, options = {}) {
  let specs;
  if (options.from) specs = [{ path: resolve(options.from) }];
  else if (process.env.CLEVEROPS_SOURCES !== undefined) {
    try { specs = JSON.parse(process.env.CLEVEROPS_SOURCES); } catch { throw new UsageError('CLEVEROPS_SOURCES deve essere un array JSON.'); }
  } else specs = [
    { id: 'public', path: root },
    { id: 'internal', visibility: 'private', url: 'git@github.com:Cleversoft-IT/cleverOps-internal.git', https: 'https://github.com/Cleversoft-IT/cleverOps-internal.git' },
  ];
  if (!Array.isArray(specs) || !specs.every(validSourceSpec)) {
    throw new UsageError('Configurazione sorgenti non valida.');
  }
  const ids = specs.filter(s => s.id).map(s => s.id);
  if (new Set(ids).size !== ids.length) throw new UsageError('ID sorgente duplicato.');
  return specs;
}
async function describe(root, spec, warn) {
  const manifest = readManifest(root, warn);
  if (spec.id && spec.id !== manifest.id) throw new Error('ID manifest diverso dalla sorgente attesa.');
  let commit = null;
  if (fs.existsSync(join(root, '.git'))) commit = await git(['-C', root, 'rev-parse', 'HEAD']);
  const pkg = join(root, 'package.json');
  const version = fs.existsSync(pkg) ? readJSON(pkg).version : '0.0.0';
  if (typeof version !== 'string') throw new Error('Versione sorgente non valida.');
  return { id: manifest.id, root, manifest, commit, version };
}
export async function loadSources(root, options = {}) {
  const specs = sourceSpecs(root, options);
  const sources = [], statuses = [], releases = [];
  const warn = options.warn || (() => {});
  const release = () => { for (const unlock of releases.reverse()) unlock(); releases.length = 0; };
  const cacheRoot = join(process.env.XDG_CACHE_HOME || join(os.homedir(), '.cache'), 'cleverops', 'sources');
  const env = options.readOnly ? null : await gitEnvironment();
  try {
    for (const spec of specs) {
      if ((options.noPrivate && (spec.visibility === 'private' || spec.id === 'internal')) || (options.source && spec.id && spec.id !== options.source)) continue;
      let dir = spec.path && resolve(spec.path);
      let status = 'disponibile';
      try {
        if (!dir) {
          dir = join(cacheRoot, spec.id);
          const urls = [spec.url, spec.https].filter(Boolean);
          if (options.readOnly) {
            if (!fs.existsSync(dir)) throw new Error('Cache assente; doctor non scarica sorgenti.');
            if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('Cache symlink non attendibile.');
            const origin = await git(['-C', dir, 'remote', 'get-url', 'origin']);
            if (!urls.includes(origin)) throw new Error('Origin della cache inatteso.');
            status = 'cache (non aggiornata da doctor)';
          } else {
            let url;
            for (const candidate of urls) {
              try { await git(['ls-remote', '--exit-code', candidate, 'refs/heads/main'], { env }); url = candidate; break; }
              catch { /* Il fallback HTTPS segue il tentativo SSH. */ }
            }
            if (!url) throw new Error('Accesso non disponibile.');
            fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
            fs.chmodSync(cacheRoot, 0o700);
            releases.push(lock(join(cacheRoot, `${spec.id}.lock`)));
            let valid = false;
            if (fs.existsSync(dir) && !fs.lstatSync(dir).isSymbolicLink()) {
              try { valid = (await git(['-C', dir, 'remote', 'get-url', 'origin'], { env })) === url; } catch { /* Cache da ricreare. */ }
            }
            if (valid) {
              fs.chmodSync(dir, 0o700);
              await git(['-C', dir, 'fetch', '--depth', '1', 'origin', 'refs/heads/main'], { env });
              await git(['-C', dir, 'reset', '--hard', 'FETCH_HEAD'], { env });
              await git(['-C', dir, 'clean', '-fdx'], { env });
            } else {
              const tmp = join(cacheRoot, `.cleverops-tmp-${randomUUID()}`);
              try {
                fs.mkdirSync(tmp, { mode: 0o700 });
                await git(['clone', '--depth', '1', '--branch', 'main', '--', url, tmp], { env });
                fs.chmodSync(tmp, 0o700);
                fs.rmSync(dir, { recursive: true, force: true });
                fs.renameSync(tmp, dir);
              } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
            }
          }
        }
        const source = await describe(dir, spec, warn);
        if (options.noPrivate && source.manifest.visibility === 'private') continue;
        if (options.source && source.id !== options.source) continue;
        sources.push(source);
        statuses.push({ id: source.id, status });
      } catch (e) {
        statuses.push({ id: spec.id || 'locale', status: 'saltata', reason: e.message });
        if (e.unsupported) warn(e.message);
        else if (spec.path) throw e;
        else if (options.verbose) warn(`Sorgente ${spec.id} saltata: ${e.message}`);
      }
    }
    if (options.source && !sources.some(s => s.id === options.source)) throw new SourceError(`Sorgente ${options.source} non disponibile.`);
    return { sources, statuses, release };
  } catch (e) { release(); throw e; }
}

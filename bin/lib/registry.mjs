// Registro e transazioni: i file originali restano ripristinabili fino al commit.
import fs from 'node:fs';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ID, NAME, object } from './manifest.mjs';
import { treeHash } from './treehash.mjs';

export const stateDir = () => join(process.env.XDG_STATE_HOME || join(os.homedir(), '.local', 'state'), 'cleverops');
export const registryPath = () => join(stateDir(), 'installed.json');
export const lstat = path => fs.lstatSync(path, { throwIfNoEntry: false });
export function lock(file) {
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new Error(`Operazione già in corso (lock: ${file}). Se interrotta, verifica il processo prima di rimuovere il lock.`); throw e; }
  try { fs.writeFileSync(fd, `${process.pid}\n`); }
  catch (e) { fs.closeSync(fd); fs.unlinkSync(file); throw e; }
  return () => { fs.closeSync(fd); fs.unlinkSync(file); };
}
export function targetDirs(target, project = process.cwd()) {
  if (target === 'claude') {
    const root = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude');
    return { skills: resolve(root, 'skills'), agents: resolve(root, 'agents') };
  }
  if (target === 'codex') return { skills: join(os.homedir(), '.agents', 'skills'), agents: resolve(process.env.CODEX_HOME || join(os.homedir(), '.codex'), 'agents') };
  if (target === 'project') return { skills: resolve(project, '.claude', 'skills'), agents: resolve(project, '.claude', 'agents') };
  throw new Error('Destinazione non valida.');
}
export function destination(item, harness, project) {
  return join(targetDirs(harness, project)[`${item.kind}s`], item.name + (item.kind === 'agent' ? (harness === 'codex' ? '.toml' : '.md') : ''));
}
function validEntry(entry) {
  if (!object(entry)) return false;
  if (typeof entry.source !== 'string' || !ID.test(entry.source)) return false;
  if (typeof entry.name !== 'string' || !NAME.test(entry.name)) return false;
  if (!['skill', 'agent'].includes(entry.kind)) return false;
  if (!['claude', 'codex', 'project'].includes(entry.harness)) return false;
  if (!['copy', 'link'].includes(entry.mode) || typeof entry.version !== 'string') return false;
  if (entry.commit !== null && (typeof entry.commit !== 'string'
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.commit))) return false;
  if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
  if (typeof entry.dest !== 'string' || !isAbsolute(entry.dest) || resolve(entry.dest) !== entry.dest) return false;
  if (entry.mode === 'link' && typeof entry.linkTarget !== 'string') return false;
  return true;
}
export function readRegistry() {
  const file = registryPath();
  if (!lstat(file)) return { schemaVersion: 1, entries: [] };
  try {
    if (lstat(file).isSymbolicLink()) throw new Error('symlink inatteso');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!object(data) || data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('schema non valido');
    const seen = new Set();
    for (const e of data.entries) {
      if (!validEntry(e)) throw new Error('voce non valida');
      const expected = e.harness === 'project'
        ? join(dirname(dirname(dirname(e.dest))), '.claude', `${e.kind}s`, e.name + (e.kind === 'agent' ? '.md' : ''))
        : join(dirname(e.dest), e.name + (e.kind === 'agent' ? (e.harness === 'codex' ? '.toml' : '.md') : ''));
      if (basename(dirname(e.dest)) !== `${e.kind}s`) throw new Error('cartella di destinazione non valida');
      if (e.dest !== expected || seen.has(e.dest)) throw new Error('destinazione non valida o duplicata');
      seen.add(e.dest);
    }
    return data;
  } catch (e) { throw new Error(`Registro corrotto: ${e.message}. Ripristina ${file} prima di continuare; nessuna installazione è stata rimossa.`); }
}
export function writeRegistry(data) {
  const tmp = join(stateDir(), `.installed-${randomUUID()}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, registryPath());
  } finally { fs.rmSync(tmp, { force: true }); }
}
export function intact(entry) {
  const stat = lstat(entry.dest);
  if (!stat) return false;
  if (entry.mode === 'link') return stat.isSymbolicLink() && fs.readlinkSync(entry.dest) === entry.linkTarget;
  if (stat.isSymbolicLink()) return false;
  try { return treeHash(entry.dest) === entry.sha256; } catch { return false; }
}
export function move(from, to, saved = () => {}) {
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e;
    try { fs.cpSync(from, to, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false }); }
    catch (copyError) { fs.rmSync(to, { recursive: true, force: true }); throw copyError; }
    // Registra la copia completa prima di una rimozione che può fallire a metà.
    saved();
    fs.rmSync(from, { recursive: true });
    return;
  }
  saved();
}
export function linkSnapshot(path) {
  let resolved = null;
  try { resolved = fs.realpathSync(path); } catch { /* Link rotto: conserva il testo originale. */ }
  return { path, linkTarget: fs.readlinkSync(path), resolved };
}
function restoreDestinationAllowed(path) {
  const parent = dirname(path);
  const roots = [
    ...Object.values(targetDirs('claude')),
    ...Object.values(targetDirs('codex')),
    resolve(process.env.CODEX_HOME || join(os.homedir(), '.codex'), 'skills'),
  ];
  const projectRoot = ['skills', 'agents'].some(kind => parent.endsWith(`${sep}.claude${sep}${kind}`));
  if (!roots.includes(parent) && !projectRoot) return false;
  // Solo risorse intere, compresi agent e vecchi backup: mai file al loro interno.
  const name = basename(path).replace(/\.bak-.+$/s, '').replace(/\.(md|toml)$/, '');
  return !path.includes('\0') && NAME.test(name);
}
export function restoreBackup(folder) {
  const root = fs.realpathSync(folder);
  const backups = join(stateDir(), 'backups');
  if (!fs.existsSync(backups) || !root.startsWith(fs.realpathSync(backups) + sep)) {
    throw new Error('Ripristino rifiutato: la cartella deve trovarsi nei backup dello stato di cleverOps.');
  }
  const data = JSON.parse(fs.readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (!object(data) || data.schemaVersion !== 1 || !Array.isArray(data.entries)) {
    throw new Error('Manifest del backup non valido.');
  }
  const paths = new Set();
  // Verifica l'intero backup prima di iniziare un ripristino parziale.
  for (const entry of data.entries) {
    if (!object(entry) || typeof entry.path !== 'string' || !isAbsolute(entry.path)
      || resolve(entry.path) !== entry.path || paths.has(entry.path)
      || !restoreDestinationAllowed(entry.path)) {
      throw new Error('Destinazione nel manifest del backup non valida.');
    }
    paths.add(entry.path);
    if (entry.linkTarget !== undefined) {
      if (typeof entry.linkTarget !== 'string' || !entry.linkTarget || entry.stored !== undefined) {
        throw new Error('Symlink nel manifest del backup non valido.');
      }
    } else {
      if (typeof entry.stored !== 'string' || !entry.stored || basename(entry.stored) !== entry.stored
        || ['.', '..'].includes(entry.stored)) throw new Error('Percorso nel backup non valido.');
      const stored = lstat(join(root, entry.stored));
      if (!stored || stored.isSymbolicLink()) throw new Error(`Originale nel backup assente o non valido: ${entry.stored}`);
    }
    if (lstat(entry.path)) throw new Error(`Ripristino rifiutato: destinazione occupata (${entry.path}).`);
  }
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const unlock = lock(join(stateDir(), 'installed.lock'));
  const restored = [];
  try {
    for (const entry of data.entries) {
      if (lstat(entry.path)) throw new Error(`Ripristino rifiutato: destinazione occupata (${entry.path}).`);
      fs.mkdirSync(dirname(entry.path), { recursive: true });
      if (entry.linkTarget !== undefined) fs.symlinkSync(entry.linkTarget, entry.path);
      else move(join(root, entry.stored), entry.path);
      restored.push(entry);
    }
    return restored.map(entry => `✓ ripristinato: ${entry.path}`);
  } catch (e) {
    const errors = [];
    for (const entry of restored.reverse()) {
      try {
        if (entry.linkTarget !== undefined) fs.unlinkSync(entry.path);
        else move(entry.path, join(root, entry.stored));
      } catch (error) { errors.push(error.message); }
    }
    if (errors.length) throw new Error(`${e.message}; ripristino parziale: ${errors.join('; ')}`);
    throw e;
  } finally { unlock(); }
}
export class Transaction {
  constructor() { this.changes = []; this.temps = []; this.backups = []; this.backupDir = null; }
  backupFolder() {
    if (!this.backupDir) {
      this.backupDir = join(stateDir(), 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
      fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o700 });
    }
    return this.backupDir;
  }
  take(dest, backup) {
    const stat = lstat(dest);
    const change = { dest, old: null, link: null, placed: false, backedUp: false };
    this.changes.push(change);
    if (!stat) return change;
    if (stat.isSymbolicLink()) {
      change.link = linkSnapshot(dest);
      if (backup) { this.backupFolder(); this.backups.push(change.link); change.backedUp = true; }
      fs.unlinkSync(dest);
    } else {
      const old = backup
        ? join(this.backupFolder(), `${this.backups.length}-${basename(dest)}`)
        : join(dirname(dest), `.cleverops-tmp-${randomUUID()}`);
      move(dest, old, () => {
        change.old = old;
        change.backedUp = backup;
        if (backup) this.backups.push({ path: dest, stored: basename(old) });
      });
    }
    return change;
  }
  replace(dest, producer, backup) {
    fs.mkdirSync(dirname(dest), { recursive: true });
    const temp = join(dirname(dest), `.cleverops-tmp-${randomUUID()}`);
    this.temps.push(temp);
    producer(temp);
    const change = this.take(dest, backup);
    fs.renameSync(temp, dest);
    change.placed = true;
  }
  remove(dest, backup) { this.take(dest, backup); }
  writeBackupManifest(entries = this.backups) {
    if (!this.backupDir) return;
    fs.writeFileSync(join(this.backupDir, 'manifest.json'),
      JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n', { mode: 0o600 });
  }
  commit(registry) {
    this.writeBackupManifest();
    writeRegistry(registry);
    // Il registro è già committato: una pulizia fallita non può annullare il commit.
    for (const c of this.changes) if (c.old && !c.backedUp) this.cleanup(c.old);
    this.temps.forEach(p => this.cleanup(p));
  }
  cleanup(path) {
    try { fs.rmSync(path, { recursive: true, force: true }); }
    catch { process.stderr.write(`Avviso: pulizia temporaneo non riuscita (${path}).\n`); }
  }
  rollback() {
    const errors = [];
    // Anche un rollback interrotto deve lasciare istruzioni per recuperare gli originali.
    try { this.writeBackupManifest(); } catch (e) { errors.push(e.message); }
    for (const c of [...this.changes].reverse()) {
      try {
        // Dopo una rimozione parziale preserva la copia completa per il recupero.
        if (c.old && !c.placed && lstat(c.dest)) throw new Error(`Rimozione dell'originale incompleta (${c.dest})`);
        if (c.placed) fs.rmSync(c.dest, { recursive: true, force: true });
        if (c.old) move(c.old, c.dest);
        else if (c.link && !lstat(c.dest)) fs.symlinkSync(c.link.linkTarget, c.dest);
      } catch (e) {
        c.rollbackFailed = true;
        const recovery = c.old ? `; originale di ${c.dest} conservato in ${c.old}`
          : c.link ? `; link da ricreare: ${c.dest} → ${JSON.stringify(c.link.linkTarget)}` : '';
        errors.push(e.message + recovery);
      }
    }
    this.temps.forEach(p => this.cleanup(p));
    if (!errors.length && this.backupDir) this.cleanup(this.backupDir);
    if (errors.length) {
      const pending = this.backups.filter(entry => this.changes.some(c => c.dest === entry.path && c.rollbackFailed));
      try { this.writeBackupManifest(pending); } catch (e) { errors.push(e.message); }
      throw new Error(`Rollback incompleto, originali conservati: ${errors.join('; ')}`);
    }
  }
}
export function withRegistry(fn) {
  // Validazione prima di creare lock o directory dello stato.
  readRegistry();
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const unlock = lock(join(stateDir(), 'installed.lock'));
  const tx = new Transaction();
  try {
    const registry = readRegistry();
    const result = fn(registry, tx);
    tx.commit(registry);
    return result;
  } catch (e) {
    try { tx.rollback(); } catch (rollback) { throw new AggregateError([e, rollback], `${e.message}; ${rollback.message}`); }
    throw e;
  } finally { unlock(); }
}

// Un unico algoritmo per copie installate e versioni storiche Git.
import fs from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const excluded = path => path.split('/').some(p => p === '.cleverops.json' || p === '__pycache__' || p === '.DS_Store' || p.endsWith('.pyc'));
export function hashEntries(entries) {
  return sha256([...entries].filter(([path]) => !excluded(path))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, data]) => `${path}\0${sha256(data)}\n`).join(''));
}
export function treeHash(path, { allowRootLink = false } = {}) {
  if (!allowRootLink && fs.lstatSync(path).isSymbolicLink()) {
    throw new Error(`Symlink alla radice della risorsa non consentito: ${basename(path)}`);
  }
  const root = fs.realpathSync(path);
  const entries = [];
  const visit = (file, name, ancestors = new Set()) => {
    if (excluded(name)) return;
    const real = fs.realpathSync(file);
    if (real !== root && !real.startsWith(root + sep)) throw new Error(`Symlink esterno alla risorsa: ${name}`);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      if (ancestors.has(real)) throw new Error(`Ciclo di symlink: ${name}`);
      const next = new Set([...ancestors, real]);
      for (const child of fs.readdirSync(file)) visit(join(file, child), name ? `${name}/${child}` : child, next);
    } else if (stat.isFile()) entries.push([name, fs.readFileSync(file)]);
    else throw new Error(`Tipo di file non supportato: ${name}`);
  };
  visit(root, fs.statSync(root).isDirectory() ? '' : basename(path));
  return hashEntries(entries);
}

// La copia dereferenzia solo i link interni, già verificati da treeHash.
export function copyTree(src, dest) {
  treeHash(src);
  const root = resolve(src);
  fs.cpSync(src, dest, { recursive: true, dereference: true,
    filter: file => !excluded(relative(root, file).split(sep).join('/')) });
}

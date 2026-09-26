import fs from 'node:fs';
import os from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { parse } from 'smol-toml';
import { readJSON, UsageError } from './manifest.mjs';
import { copyTree, hashEntries, treeHash } from './treehash.mjs';
import { codexAgent } from './codex-agent.mjs';
import { destination, intact, lstat, readRegistry, withRegistry } from './registry.mjs';
import { applyMigrations, scanMigrations } from './migrate.mjs';

export function detectHarness() {
  return { claude: fs.existsSync(process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude')),
    codex: fs.existsSync(process.env.CODEX_HOME || join(os.homedir(), '.codex')) || fs.existsSync(join(os.homedir(), '.agents', 'skills')) };
}
export function resolveTargets(requested) {
  const targets = requested || Object.entries(detectHarness()).filter(([, on]) => on).map(([name]) => name);
  if (!targets.length) throw new UsageError('Nessun harness rilevato: specifica --target claude,codex oppure --target project.');
  if (targets.some(t => !['claude', 'codex', 'project'].includes(t))) throw new UsageError('Target non valido: usa claude, codex o project.');
  return [...new Set(targets)];
}
export function selectItems(items, options) {
  if (options.all) return items;
  const selected = [];
  for (const kind of ['skill', 'agent']) for (const raw of options[`${kind}s`] || []) {
    const name = kind === 'agent' ? raw.replace(/\.(md|toml)$/, '') : raw;
    const item = items.find(i => i.kind === kind && i.name === name);
    if (!item) throw new UsageError(`${kind} inesistente: ${raw}. Usa --list.`);
    selected.push(item);
  }
  return selected;
}
function validateSourceItem(item) {
  const stat = lstat(item.path);
  if (!stat) throw new Error(`Risorsa mancante nella sorgente: ${item.kind}/${item.name}`);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink alla radice della risorsa non consentito: ${item.kind}/${item.name}`);
  }
  const sourceRoot = fs.realpathSync(item.source.root);
  if (!fs.realpathSync(item.path).startsWith(sourceRoot + sep)) {
    throw new Error(`Risorsa esterna alla sorgente: ${item.kind}/${item.name}`);
  }
  if (item.kind === 'agent' ? !stat.isFile() : !stat.isDirectory()) {
    throw new Error(`Tipo di risorsa non valido: ${item.kind}/${item.name}`);
  }
}

function readPluginConfig(file, codex) {
  if (!codex) return readJSON(file);
  try { return parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    throw new Error(`Configurazione Codex non valida (${file}): correggi il TOML prima di installare o sincronizzare. ${e.message}`);
  }
}
// Il catalogo generato fornisce i nomi effettivi; il fallback copre i bundle
// cleverops-public/internal in attesa della fase marketplace.
export function pluginActive(item, harness, project = process.cwd()) {
  const codex = harness === 'codex';
  const configFiles = codex
    ? [join(process.env.CODEX_HOME || join(os.homedir(), '.codex'), 'config.toml')]
    : [join(process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude'), 'settings.json')];
  if (harness === 'project') configFiles.push(join(project, '.claude', 'settings.json'), join(project, '.claude', 'settings.local.json'));
  const enabled = {};
  for (const file of configFiles) {
    if (!fs.existsSync(file)) continue;
    const data = readPluginConfig(file, codex);
    Object.assign(enabled, codex ? Object.fromEntries(Object.entries(data.plugins || {}).map(([k, v]) => [k, v?.enabled])) : data.enabledPlugins || {});
  }
  const bundle = `cleverops-${item.source.id}`;
  const keys = [`${bundle}@${bundle}`, `${item.name}@${bundle}`];
  const file = item.source.root && join(item.source.root, codex ? '.agents/plugins/marketplace.json' : '.claude-plugin/marketplace.json');
  if (file && fs.existsSync(file)) {
    const catalog = readJSON(file);
    for (const plugin of catalog.plugins || []) if ([item.name, bundle, 'cleverops'].includes(plugin.name)) keys.push(`${plugin.name}@${catalog.name}`);
  }
  return keys.some(key => enabled[key] === true);
}
function entrySelected(e, options) {
  if (!options.targets.includes(e.harness) || (options.source && options.source !== e.source) || (options.noPrivate && e.source === 'internal')) return false;
  if (e.dest !== destination(e, e.harness, options.project)) return false;
  return options.all || options[`${e.kind}s`]?.some(n => n.replace(/\.(md|toml)$/, '') === e.name);
}
function removeEntry(entry, tx, warn) {
  const stat = lstat(entry.dest);
  if (!stat) return;
  if (entry.mode === 'link' && (!stat.isSymbolicLink() || fs.readlinkSync(entry.dest) !== entry.linkTarget)) {
    warn(`Link cambiato dall'utente: lasciato invariato (${entry.dest}).`);
    return;
  }
  tx.remove(entry.dest, !intact(entry));
}
export function uninstall(options) {
  const current = readRegistry();
  if (!current.entries.some(e => entrySelected(e, options))) throw new UsageError('Niente da disinstallare nel registro per questa selezione.');
  return withRegistry((registry, tx) => {
    const selected = registry.entries.filter(e => entrySelected(e, options));
    for (const entry of selected) removeEntry(entry, tx, options.warn || (() => {}));
    registry.entries = registry.entries.filter(e => !selected.includes(e));
    return selected.map(e => `✓ rimosso dal registro [${e.harness}] ${e.name}`);
  });
}
export function install({ sources, items, selected, ...options }) {
  if (options.mode === 'link' && !options.from) throw new UsageError('--link richiede --from <path> verso un checkout stabile.');
  const warn = options.warn || (() => {});
  const before = readRegistry();
  const migrations = scanMigrations({ sources, items, registry: before, ...options });
  const jobKey = (source, kind, name, harness) => `${source}:${kind}:${name}:${harness}`;
  const syncKeys = new Set();
  if (options.sync) {
    for (const entry of before.entries.filter(e => entrySelected(e, { ...options, all: true }))) {
      syncKeys.add(jobKey(entry.source, entry.kind, entry.name, entry.harness));
    }
    for (const candidate of migrations.filter(c => c.known && !c.backup)) {
      for (const item of candidate.replacements) {
        syncKeys.add(jobKey(item.source.id, item.kind, item.name, candidate.harness));
      }
    }
  }
  const jobs = [];
  for (const item of options.sync ? items : selected) {
    for (const harness of options.targets) {
      if (!item.targets.includes(harness === 'codex' ? 'codex' : 'claude')) continue;
      if (options.sync && !syncKeys.has(jobKey(item.source.id, item.kind, item.name, harness))) continue;
      jobs.push({ item, harness, dest: destination(item, harness, options.project),
        plugin: pluginActive(item, harness, options.project) });
    }
  }
  if (!options.sync && !jobs.length && !options.hasExtras) throw new UsageError('Niente da installare: seleziona --all o --skills/--agents compatibili con i target.');
  // Nessuna lettura del contenuto prima della verifica del confine della sorgente.
  for (const { item, plugin } of jobs) if (!plugin) validateSourceItem(item);
  const messages = withRegistry((registry, tx) => {
    const results = [];
    const currentMigrations = scanMigrations({ sources, items, registry, ...options });
    // Cambio canale solo per sorgenti disponibili, harness e scope selezionati.
    for (const entry of [...registry.entries]) {
      const item = items.find(i => i.source.id === entry.source && i.kind === entry.kind && i.name === entry.name)
        || { ...entry, source: { id: entry.source, root: null } };
      if (item && entrySelected(entry, { ...options, all: true }) && pluginActive(item, entry.harness, options.project)) {
        removeEntry(entry, tx, warn);
        registry.entries = registry.entries.filter(e => e !== entry);
        results.push(`✓ [${entry.harness}] ${entry.name}: ora gestito dal plugin`);
      }
    }
    for (const { item, harness, dest, plugin } of jobs) {
      if (plugin) { warn(`Installazione [${harness}] ${item.name} rifiutata: plugin abilitato. Disabilitalo per tornare alle copie.`); continue; }
      const previous = registry.entries.find(e => e.dest === dest);
      if (!previous && currentMigrations.some(c => c.path === dest && !c.known)) {
        warn(`Migrazione dubbia: ${dest}; contenuto lasciato invariato.`);
        continue;
      }
      const legacy = currentMigrations.find(c => c.path === dest && c.known);
      const isOwnedLink = lstat(dest)?.isSymbolicLink() && (() => { try { return fs.realpathSync(dest) === fs.realpathSync(item.path); } catch { return false; } })();
      const backup = !!lstat(dest) && !(previous && intact(previous)) && !legacy && !isOwnedLink;
      // Per la catena legacy si conserva sempre il testo del symlink nel backup.
      const keepBackup = backup || (!!legacy && lstat(dest)?.isSymbolicLink());
      let mode = options.mode || 'copy';
      if (item.kind === 'agent' && harness === 'codex') mode = 'copy';
      let expected;
      let generated;
      if (item.kind === 'agent' && harness === 'codex') {
        generated = codexAgent(fs.readFileSync(item.path, 'utf8'), item.name);
        expected = hashEntries([[basename(dest), Buffer.from(generated)]]);
      } else {
        if (item.kind === 'skill') {
          const skillFile = join(item.path, 'SKILL.md');
          if (!fs.existsSync(skillFile)) throw new Error(`SKILL.md mancante: ${item.name}`);
          if (!fs.statSync(skillFile).isFile()) throw new Error(`SKILL.md non è un file: ${item.name}`);
        }
        expected = treeHash(item.path);
      }
      const entry = { source: item.source.id, kind: item.kind, name: item.name, harness, dest, mode,
        ...(mode === 'link' ? { linkTarget: resolve(item.path) } : {}), version: item.source.version, commit: item.source.commit, sha256: expected };
      tx.replace(dest, tmp => {
        if (mode === 'link') fs.symlinkSync(entry.linkTarget, tmp);
        else if (generated !== undefined) fs.writeFileSync(tmp, generated);
        else copyTree(item.path, tmp);
        // I file agent temporanei hanno un nome diverso: si verifica col nome finale.
        const actual = item.kind === 'agent'
          ? hashEntries([[basename(dest), fs.readFileSync(tmp)]])
          : treeHash(mode === 'link' ? item.path : tmp);
        if (actual !== expected) throw new Error(`Hash di copia non coincidente: ${item.name}`);
        if (item.kind === 'skill' && mode === 'copy') fs.writeFileSync(join(tmp, '.cleverops.json'), JSON.stringify(entry, null, 2) + '\n');
      }, keepBackup);
      if (!intact(entry)) throw new Error(`Verifica installazione fallita: ${item.name}`);
      registry.entries = registry.entries.filter(e => e.dest !== dest);
      registry.entries.push(entry);
      results.push(`✓ [${harness}] ${item.kind}/${item.name}${keepBackup ? ' (originale nei backup dello stato)' : ''}`);
      if (item.requires?.path) {
        const required = item.requires.path.replace(/^~(?=\/|$)/, os.homedir());
        if (!fs.existsSync(required)) warn(`Prerequisito assente per ${item.name}: ${item.requires.path}`);
      }
    }
    results.push(...applyMigrations(currentMigrations, registry, tx, options.project, warn));
    return results;
  });
  return { messages, blocked: !options.sync && jobs.some(j => j.plugin) };
}
export function doctor({ sources, items, ...options }) {
  const registry = readRegistry();
  const issues = new Set();
  // La diagnosi deve rilevare anche una configurazione errata senza installazioni.
  if (options.targets.includes('codex')) {
    const config = join(process.env.CODEX_HOME || join(os.homedir(), '.codex'), 'config.toml');
    if (fs.existsSync(config)) {
      try { readPluginConfig(config, true); } catch (e) { issues.add(e.message); }
    }
  }
  const entries = registry.entries.filter(e => entrySelected(e, { ...options, all: true })).map(e => {
    const item = items.find(i => i.source.id === e.source && i.kind === e.kind && i.name === e.name)
      || { ...e, source: { id: e.source, root: null } };
    let plugin = null;
    try { plugin = pluginActive(item, e.harness, options.project); }
    catch (error) { issues.add(error.message); }
    return { ...e, status: !lstat(e.dest) ? 'assente' : !intact(e) ? 'modificata' : e.mode === 'link' && !fs.existsSync(e.dest) ? 'link rotto' : 'integra', plugin };
  });
  const migrations = scanMigrations({ sources, items, registry, ...options }).map(({ replacements, ...c }) => ({ ...c, replacements: replacements.map(i => i.name) }));
  return { entries, migrations, issues: [...issues] };
}

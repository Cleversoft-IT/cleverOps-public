#!/usr/bin/env node
// cleverOps — installer multi-sorgente per Claude Code e Codex.
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { catalog, NAME, ID, UsageError } from './lib/manifest.mjs';
import { loadSources } from './lib/sources.mjs';
import { detectHarness, doctor, install, resolveTargets, selectItems, uninstall } from './lib/install.mjs';
import { readRegistry, restoreBackup } from './lib/registry.mjs';
import { isEntryPoint } from './lib/entry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
export const HELP = `cleverOps — skill, agent e tool per Claude Code e Codex

Uso:
  cleverops                                  wizard (terminale interattivo)
  cleverops --all --target claude,codex        installa e riconcilia
  cleverops uninstall --all --target codex    disinstalla offline dal registro
  cleverops doctor [--json]                   diagnosi senza scritture o download
  cleverops sync --target claude,codex         migrazioni e cambio canale plugin
  cleverops restore <cartella-backup>         ripristina originali e link, offline

Flag (qualunque flag disabilita il wizard):
  --target claude,codex,project   default: harness rilevati; project usa .claude/
  --project PATH                progetto (default: directory corrente)
  --all                         tutte le risorse compatibili
  --skills a,b --agents x,y      nomi del manifest (agent anche con .md)
  --copy                        copia autonoma, modalità predefinita
  --from PATH --link             symlink solo da sorgente locale esplicita
  --source ID                    una sorgente; se inaccessibile esce con 3
  --no-private                   esclude il privato senza probe
  --list [--json]                catalogo delle sorgenti accessibili
  --verbose                     include i motivi delle sorgenti saltate
  --ccstatusline --impeccable   extra esterni opzionali
  --no-ccstatusline              non avvia l'extra ccstatusline
  -y, --yes                     modalità non interattiva
  -h, --help                    mostra questo aiuto

Exit: 0 riuscito; 1 errore operativo; 2 uso/selezione non valida;
      3 sorgente richiesta esplicitamente non disponibile.
`;
export function parseArgs(argv) {
  const options = { command: 'install', mode: 'copy', project: process.cwd() };
  let modeSet = false, commandSet = false, projectSet = false;
  const values = new Map([['--target', 'targets'], ['--project', 'project'], ['--skills', 'skills'], ['--agents', 'agents'], ['--source', 'source'], ['--from', 'from']]);
  const flags = new Map([['--all', 'all'], ['--no-private', 'noPrivate'], ['--list', 'list'], ['--json', 'json'], ['--verbose', 'verbose'], ['--ccstatusline', 'ccstatusline'], ['--impeccable', 'impeccable'], ['-y', 'yes'], ['--yes', 'yes'], ['-h', 'help'], ['--help', 'help']]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (values.has(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new UsageError(`Valore mancante per ${arg}.`);
      const key = values.get(arg);
      if (key === 'project') projectSet = true;
      options[key] = ['targets', 'skills', 'agents'].includes(key) ? value.split(',').map(s => s.trim()) : value;
    } else if (flags.has(arg)) options[flags.get(arg)] = true;
    else if (arg === '--no-ccstatusline') options.ccstatusline = false;
    else if (arg === '--toolbelt') throw new UsageError('--toolbelt è stato rimosso: installa rg, fd, ast-grep e gh con il gestore di pacchetti del sistema.');
    else if (['--copy', '--link'].includes(arg)) {
      if (modeSet && options.mode !== arg.slice(2)) throw new UsageError('--copy e --link sono alternativi.');
      options.mode = arg.slice(2); modeSet = true;
    } else if (!commandSet && ['install', 'uninstall', 'remove', 'doctor', 'sync', 'restore'].includes(arg)) {
      options.command = arg === 'remove' ? 'uninstall' : arg; commandSet = true;
    } else if (options.command === 'restore' && !options.backup && !arg.startsWith('-')) {
      if (arg === 'restore') throw new UsageError('Comando restore ripetuto: indica la cartella del backup (./restore se omonima).');
      options.backup = resolve(arg);
    } else throw new UsageError(`Argomento sconosciuto: ${arg}. Usa --help.`);
  }
  if (options.command === 'restore') {
    if (!options.backup && !options.help) throw new UsageError('Uso: cleverops restore <cartella-backup>');
    const allowed = new Set(['command', 'mode', 'project', 'backup', 'help', 'verbose']);
    if (modeSet || projectSet || Object.keys(options).some(key => !allowed.has(key))) {
      throw new UsageError('restore accetta soltanto la cartella del backup, --help e --verbose.');
    }
  }
  if (options.command === 'sync' && (options.all || options.skills || options.agents)) {
    throw new UsageError('sync non accetta selezioni: ometti --all, --skills e --agents.');
  }
  if (options.targets) resolveTargets(options.targets);
  for (const kind of ['skills', 'agents']) if (options[kind]?.some(n => !NAME.test(kind === 'agents' ? n.replace(/\.(md|toml)$/, '') : n))) throw new UsageError(`Nomi non validi per --${kind}.`);
  if (options.source && !ID.test(options.source)) throw new UsageError('ID --source non valido.');
  if (options.mode === 'link' && !options.from) throw new UsageError('--link richiede --from <path>.');
  if (options.json && !options.list && options.command !== 'doctor') throw new UsageError('--json richiede --list oppure doctor.');
  if (options.list && options.command !== 'install') throw new UsageError('--list si usa senza altri comandi.');
  if (options.command !== 'install' && (options.ccstatusline || options.impeccable)) throw new UsageError('Gli extra si usano solo durante install.');
  options.interactive = !argv.some(a => a.startsWith('-')) && ['install', 'uninstall'].includes(options.command);
  if (options.command === 'install' && !options.list && !options.interactive && !options.help && !options.all && !options.skills?.length && !options.agents?.length && !options.ccstatusline && !options.impeccable) throw new UsageError('Niente da installare: usa --all oppure --skills/--agents.');
  options.project = resolve(options.project);
  return options;
}
// Wizard con soli extra: nessuna risorsa da installare, quindi nessun target da risolvere.
export function wizardInstall(execute, options, pick) {
  if (!pick.skills.length && !pick.agents.length) {
    if (!pick.extras.length) throw new UsageError('Niente da installare: seleziona almeno una skill, un agent o un extra.');
    return [];
  }
  return execute({ ...options, ...pick, targets: resolveTargets(pick.targets), hasExtras: pick.extras.length > 0 });
}
export function runExtras(options) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const extras = [
    [options.ccstatusline, 'ccstatusline', npx, ['-y', 'ccstatusline-gradient@latest', '--onboard']],
    [options.impeccable, 'impeccable', npx, ['-y', 'impeccable', 'install']],
  ];
  for (const [enabled, name, cmd, args] of extras) if (enabled) {
    const result = spawnSync(cmd, args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`Extra ${name} non completato (${result.error?.message || result.status || result.signal}).`);
  }
}
async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) { console.log(HELP); return; }
  if (options.interactive && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new UsageError('Terminale non interattivo: usa --all --target claude,codex oppure --help.');
  options.warn = message => process.stderr.write(`Avviso: ${message}\n`);
  if (options.command === 'restore') {
    console.log(restoreBackup(options.backup).join('\n'));
    return;
  }
  // Il wizard di installazione risolve i target dopo la scelta delle risorse.
  if (!options.list && !(options.interactive && options.command === 'install')) options.targets = resolveTargets(options.targets);
  // Un registro illeggibile blocca ogni modifica, anche della cache.
  if (!options.list) readRegistry();
  if (options.command === 'uninstall') {
    if (options.interactive) {
      const { runWizard } = await import('./tui.mjs');
      const entries = readRegistry().entries;
      let results = [];
      const menu = kind => [...new Set(entries.filter(e => e.kind === kind).map(e => e.name))].map(name => ({ value: name, label: name, tag: [] }));
      const pick = await runWizard({ skills: menu('skill'), agents: menu('agent'), det: detectHarness(), version: VERSION, uninstall: true,
        sources: [{ id: 'registro locale', status: 'offline' }],
        install: p => (results = uninstall({ ...options, ...p, targets: resolveTargets(p.targets) })) });
      console.log(pick ? results.join('\n') : 'Annullato.');
      return;
    }
    if (!options.skills && !options.agents) options.all = true;
    console.log(uninstall(options).join('\n')); return;
  }
  let tui;
  if (options.interactive) tui = await import('./tui.mjs');
  const load = () => loadSources(ROOT, { ...options, readOnly: options.command === 'doctor' });
  const loaded = tui ? await tui.probeSources(load) : await load();
  try {
    const items = catalog(loaded.sources, options.warn);
    if (options.list) {
      const list = items.map(({ source, path, ...item }) => ({ ...item, source: source.id, visibility: source.manifest.visibility }));
      if (options.json) console.log(JSON.stringify({ sources: loaded.statuses, items: list }, null, 2));
      else console.log(list.map(i => `${i.kind}\t${i.name}\t${i.source}\t${i.targets.join(',')}${i.visibility === 'private' ? ' ⟨interno⟩' : ''}`).join('\n'));
      return;
    }
    if (options.command === 'doctor') {
      const report = { sources: loaded.statuses, ...doctor({ sources: loaded.sources, items, ...options }) };
      console.log(options.json ? JSON.stringify(report, null, 2) : [
        ...report.sources.map(s => `sorgente ${s.id}: ${s.status}`),
        ...report.issues.map(issue => `Problema: ${issue}`),
        ...report.entries.map(e => `[${e.harness}] ${e.name}: ${e.status}${e.plugin ? '; plugin attivo: esegui sync' : ''}`),
        ...report.migrations.map(c => `legacy ${c.name}: ${c.reason}${!c.removed && !c.backup && !c.replacements.length ? '; sostituta non disponibile' : ''}`),
        !report.entries.length && !report.migrations.length ? 'Nessuna installazione o migrazione rilevata.' : '',
      ].filter(Boolean).join('\n'));
      return;
    }
    let results = [];
    const execute = chosen => {
      const result = install({ sources: loaded.sources, items, selected: selectItems(items, chosen), ...chosen,
        sync: chosen.command === 'sync', hasExtras: chosen.hasExtras || chosen.ccstatusline || chosen.impeccable });
      if (result.blocked) process.exitCode = 1;
      results = result.messages;
      return results;
    };
    if (tui) {
      const menu = kind => items.filter(i => i.kind === kind).map(i => ({ value: i.name, label: i.name, hint: i.category,
        tag: [...(i.source.manifest.visibility === 'private' ? ['interno'] : []), ...(i.targets.length === 1 ? [i.targets[0] === 'codex' ? 'Codex' : 'Claude Code'] : []), ...(i.legacy ? ['legacy'] : [])] }));
      const pick = await tui.runWizard({ skills: menu('skill'), agents: menu('agent'), det: detectHarness(), isDev: false, version: VERSION, sources: loaded.statuses,
        install: p => wizardInstall(execute, options, p) });
      if (!pick) { console.log('Annullato.'); return; }
      if (results.length) console.log(results.join('\n'));
      runExtras(Object.fromEntries(pick.extras.map(name => [name, true])));
    } else {
      console.log(execute(options).join('\n'));
      if (options.command === 'install') runExtras(options);
    }
  } finally { loaded.release(); }
}
if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(`Errore: ${e.message}`); process.exitCode = e.exitCode || 1; });
}

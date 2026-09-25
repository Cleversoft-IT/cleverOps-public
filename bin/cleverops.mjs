#!/usr/bin/env node
// cleverOps — installer TUI per le skill/agent DevOps·AI di Cleversoft IT.
// Distribuito come pacchetto npm: `npx github:Cleversoft-IT/cleverOps-public`
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
// La TUI interattiva è in Ink (bin/tui.mjs), importata dinamicamente solo quando serve.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const SKILLS_DIR = join(PKG_ROOT, 'skills');
const AGENTS_DIR = join(PKG_ROOT, 'agents');
const HOME = os.homedir();

// Eseguito da un checkout git (dev) o dalla cache npx (effimera)?
// I symlink hanno senso solo da un checkout stabile; via npx vanno in copia.
const IS_DEV_CHECKOUT = fs.existsSync(join(PKG_ROOT, '.git'));

const listSkills = () => fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : [];

// Harness di destinazione della skill: frontmatter `targets: claude|codex` (assente = entrambi).
function skillTargets(name) {
  try {
    const md = fs.readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
    const m = fm.match(/^targets:\s*(.+)$/m);
    if (!m) return ['claude', 'codex'];
    const t = m[1].trim().replace(/^["']|["']$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    return t.length ? t : ['claude', 'codex'];
  } catch { return ['claude', 'codex']; }
}
const HARNESS_LABEL = { claude: 'Claude Code', codex: 'Codex' };
const listAgents = () => fs.existsSync(AGENTS_DIR)
  ? fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).sort() : [];

// Home configurabili via env (come fa skills.sh): rispetta installazioni non standard.
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR?.trim() || join(HOME, '.claude');
const CODEX_HOME  = process.env.CODEX_HOME?.trim() || join(HOME, '.codex');

const TARGET_DIRS = {
  claude:  { skills: join(CLAUDE_HOME, 'skills'),  agents: join(CLAUDE_HOME, 'agents') },
  codex:   { skills: join(CODEX_HOME, 'skills'),   agents: join(CODEX_HOME, 'agents') },
};
const projectDirs = (p) => ({ skills: join(p, '.claude', 'skills'), agents: join(p, '.claude', 'agents') });

// Detection harness installati: basta controllare i path noti (ispirato a skills.sh).
const detectHarness = () => ({
  claude: fs.existsSync(CLAUDE_HOME),
  codex:  fs.existsSync(CODEX_HOME),
});

// Versione del pacchetto (mostrata nel banner della TUI Ink).
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version; } catch { return ''; } })();

// ---------- arg parsing (non interattivo) ----------
function parseArgs(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--copy') a.flags.mode = 'copy';
    else if (t === '--link') a.flags.mode = 'link';
    else if (t === '--all') a.flags.all = true;
    else if (t === '-y' || t === '--yes') a.flags.yes = true;
    else if (t === '--ccstatusline') a.flags.cc = true;
    else if (t === '--no-ccstatusline') a.flags.cc = false;
    else if (t === '--toolbelt') a.flags.toolbelt = true;
    else if (t === '--impeccable') a.flags.impeccable = true;
    else if (t === '--target') a.flags.target = argv[++i];
    else if (t === '--project') a.flags.project = argv[++i];
    else if (t === '--skills') a.flags.skills = argv[++i];
    else if (t === '--agents') a.flags.agents = argv[++i];
    else if (t === '-h' || t === '--help') a.flags.help = true;
    else a._.push(t);
  }
  return a;
}

const HELP = `cleverOps installer

Uso:
  npx github:Cleversoft-IT/cleverOps-public                       # TUI interattiva
  cleverops uninstall                                             # rimozione guidata

Flag (provisioning non interattivo — basta passarne uno):
  --target claude,codex,project   dove installare (default skill: claude,codex)
                                  le skill con harness dedicato (frontmatter targets:)
                                  vengono installate solo nei target compatibili
  --project PATH                  cartella progetto (per target project; default cwd)
  --copy | --link                 copia (default via npx) o symlink (solo da checkout git)
  --all                           tutte le skill e gli agent
  --skills a,b   --agents x.md    selezione specifica
  --ccstatusline                  installa anche ccstatusline-gradient (npx)
  --toolbelt                      installa il toolbelt CLI (rg, fd, tree, ast-grep, gh)
  --impeccable                    installa impeccable (design system, esterno via npx)
`;

// ---------- core install ----------
function backupIfNeeded(dst) {
  if (fs.existsSync(dst) && !fs.lstatSync(dst).isSymbolicLink()) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const bak = `${dst}.bak-${stamp}`;
    fs.renameSync(dst, bak);
    return basename(bak);
  }
  fs.rmSync(dst, { recursive: true, force: true });
  return null;
}

function place(src, dst, mode) {
  fs.mkdirSync(dirname(dst), { recursive: true });
  const bak = backupIfNeeded(dst);
  if (mode === 'link') fs.symlinkSync(src, dst);
  else fs.cpSync(src, dst, { recursive: true });
  return bak;
}

function doInstall({ targets, project, mode, skills, agents }) {
  const results = [];
  for (const t of targets) {
    const dirs = t === 'project' ? projectDirs(project) : TARGET_DIRS[t];
    for (const s of skills) {
      const src = join(SKILLS_DIR, s);
      if (!fs.existsSync(src)) { results.push(`✗ skill inesistente: ${s}`); continue; }
      // Il target 'project' è la .claude/ del progetto → harness Claude Code.
      const harness = t === 'codex' ? 'codex' : 'claude';
      const st = skillTargets(s);
      if (!st.includes(harness)) {
        results.push(`↷ [${t}] skills/${s} saltata — solo ${st.map(x => HARNESS_LABEL[x] || x).join(' & ')}`);
        continue;
      }
      const bak = place(src, join(dirs.skills, s), mode);
      results.push(`✓ [${t}] skills/${s}${bak ? `  (backup: ${bak})` : ''}`);
    }
    for (const ag of agents) {
      const src = join(AGENTS_DIR, ag);
      if (!fs.existsSync(src)) { results.push(`✗ agent inesistente: ${ag}`); continue; }
      const bak = place(src, join(dirs.agents, ag), mode);
      results.push(`✓ [${t}] agents/${ag}${bak ? `  (backup: ${bak})` : ''}`);
    }
  }
  return results;
}

function doUninstall({ targets, project, skills, agents }) {
  const results = [];
  for (const t of targets) {
    const dirs = t === 'project' ? projectDirs(project) : TARGET_DIRS[t];
    for (const s of skills) {
      const dst = join(dirs.skills, s);
      if (fs.existsSync(dst) || fs.lstatSync(dst, { throwIfNoEntry: false })) {
        fs.rmSync(dst, { recursive: true, force: true }); results.push(`✓ rimossa [${t}] ${s}`);
      }
    }
    for (const ag of agents) {
      const dst = join(dirs.agents, ag);
      if (fs.existsSync(dst)) { fs.rmSync(dst, { recursive: true, force: true }); results.push(`✓ rimosso [${t}] ${ag}`); }
    }
  }
  return results;
}

function runCcstatusline() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log('\n› Avvio onboarding ccstatusline-gradient…');
  const r = spawnSync(npx, ['-y', 'ccstatusline-gradient@latest', '--onboard'], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('ccstatusline: onboarding non completato.');
}

function runToolbelt() {
  if (process.platform === 'win32') { console.warn('Toolbelt: script non supportato su Windows; vedi skill ai-dev-toolbelt.'); return; }
  const script = join(PKG_ROOT, 'extras', 'toolbelt', 'install.sh');
  if (!fs.existsSync(script)) { console.warn('Toolbelt: install.sh non trovato.'); return; }
  console.log('\n› Installo il toolbelt CLI (rg · fd · tree · ast-grep · gh)…');
  const r = spawnSync('bash', [script], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('Toolbelt: installazione non completata (vedi output sopra).');
}

function runImpeccable() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log('\n› Installo impeccable (design system, dipendenza esterna)…');
  const r = spawnSync(npx, ['-y', 'impeccable', 'install'], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('impeccable: installazione non completata.');
}

// ---------- non interattivo ----------
function nonInteractive(args, uninstall) {
  const f = args.flags;
  const targets = (f.target || 'claude').split(',').map(s => s.trim()).filter(Boolean);
  const project = f.project || process.cwd();
  const mode = f.mode || 'copy';
  const allSkills = listSkills(), allAgents = listAgents();
  const skills = f.all ? allSkills : (f.skills ? f.skills.split(',').map(s => s.trim()) : []);
  const agents = f.all ? allAgents : (f.agents ? f.agents.split(',').map(s => s.trim()) : []);
  const results = uninstall
    ? doUninstall({ targets, project, skills, agents })
    : doInstall({ targets, project, mode, skills, agents });
  console.log(results.join('\n'));
  if (!uninstall && f.cc) runCcstatusline();
  if (!uninstall && f.toolbelt) runToolbelt();
  if (!uninstall && f.impeccable) runImpeccable();
}

// Hint per i menu: prima frase della description in SKILL.md.
function skillHint(name) {
  try {
    const md = fs.readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const m = md.match(/^description:\s*(.+)$/m);
    if (!m) return undefined;
    let d = m[1].trim().replace(/^["']|["']$/g, '').replace(/^\[LEGACY[^\]]*\]\s*/i, '');
    d = d.split(/(?<=[.!?])\s/)[0];
    return d.length > 64 ? d.slice(0, 61) + '…' : d;
  } catch { return undefined; }
}

// ---------- interattivo (TUI Ink → bin/tui.mjs) ----------
async function interactive(uninstall) {
  const det = detectHarness();
  const skills = listSkills().map((s) => {
    const st = skillTargets(s);
    // Tag mostrato solo per le skill con harness dedicato (default: entrambi, niente rumore).
    return { value: s, label: s, tag: st.length === 1 ? HARNESS_LABEL[st[0]] : undefined, hint: skillHint(s) };
  });
  const agents = listAgents().map((a) => ({ value: a, label: a.replace(/\.md$/, '') }));

  const project = process.cwd();
  // L'install di skill/agent avviene DENTRO la TUI (step con spinner): passiamo la callback.
  const install = (pick) => uninstall
    ? doUninstall({ targets: pick.targets, project, skills: pick.skills, agents: pick.agents })
    : doInstall({ targets: pick.targets, project, mode: pick.mode, skills: pick.skills, agents: pick.agents });

  const { runWizard } = await import('./tui.mjs');
  const pick = await runWizard({ skills, agents, det, isDev: IS_DEV_CHECKOUT, version: VERSION, uninstall, install });
  if (!pick) { console.log('Annullato.'); return; }

  if (!uninstall && pick.skills.includes('transcribe') && !fs.existsSync(join(HOME, '.whisper-env'))) {
    console.log("⚠ La skill 'transcribe' richiede l'env Python ~/.whisper-env con Whisper (assente).");
  }

  if (!uninstall) {
    if (pick.extras.includes('toolbelt')) runToolbelt();
    if (pick.extras.includes('ccstatusline')) runCcstatusline();
    if (pick.extras.includes('impeccable')) runImpeccable();
  }

  console.log('\n✓ Fatto. Riavvia Claude Code / Codex per caricare le novità.');
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
if (args.flags.help) { console.log(HELP); process.exit(0); }
const uninstall = args._[0] === 'uninstall' || args._[0] === 'remove';
const hasFlags = args.flags.all || args.flags.skills || args.flags.agents || args.flags.target || args.flags.toolbelt || args.flags.impeccable;
// Flag di selezione espliciti → modalità non interattiva (anche senza -y).
// Nessun flag → TUI interattiva.
if (hasFlags) {
  nonInteractive(args, uninstall);
} else {
  interactive(uninstall).catch(e => { console.error(e); process.exit(1); });
}

// TUI Ink (React per CLI) dell'installer cleverOps. Scritta senza JSX (React.createElement)
// così gira diretta via `npx github:` senza step di build.
// runWizard(ctx) renderizza il wizard e risolve con le scelte (o null se annullato).

import React, { useState, useMemo, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import { BRAND, SPLASH, ART_SLANT, ART_SMALL, lerpHex } from './style.mjs';

const h = React.createElement;

// ------------------------------------------------------------------ Banner
function Banner({ det, version, sources = [] }) {
  const cols = process.stdout.columns || 80;
  const art = cols >= 50 ? ART_SLANT : ART_SMALL;
  const W = Math.max(...art.map((l) => l.length), 1);
  const H = Math.max(art.length - 1, 1);
  const lines = art.map((line, y) =>
    h(Text, { key: y }, [...line].map((ch, x) =>
      ch === ' ' ? ch : h(Text, { key: x, color: lerpHex(SPLASH, ((x / W) + (y / H)) / 2) }, ch)
    ))
  );
  const chip = (on, label) =>
    on
      ? h(Text, null, h(Text, { color: BRAND }, '● '), label)
      : h(Text, { dimColor: true }, '○ ' + label);
  return h(Box, { flexDirection: 'column', marginTop: 1, marginBottom: 1, paddingX: 1 },
    ...lines,
    h(Text, { dimColor: true }, sources.map(s => `${s.id}: ${s.status}`).join(' · ')),
    h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, `skill · agent · tool  ·  Claude Code & Codex${version ? '  ·  v' + version : ''}`)),
    h(Box, null,
      h(Text, { dimColor: true }, 'rilevati  '),
      chip(det.claude, 'Claude Code'),
      h(Text, null, '   '),
      chip(det.codex, 'Codex'),
    ),
  );
}

// ------------------------------------------------------------- MultiSelect
function MultiSelect({ title, items, initial = [], filterable = false, minSelected = 0, onSubmit }) {
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(() => new Set(initial));
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((it) => (it.label + ' ' + (it.tag || []).join(' ') + ' ' + (it.hint || '')).toLowerCase().includes(q)) : items;
  }, [filter, items]);

  const cur = filtered.length ? Math.min(cursor, filtered.length - 1) : 0;

  useInput((input, key) => {
    if (key.return) {
      if (selected.size < minSelected) return setError('Seleziona almeno una destinazione con spazio.');
      return onSubmit([...selected]);
    }
    if (key.upArrow) return setCursor(() => Math.max(0, cur - 1));
    if (key.downArrow) return setCursor(() => Math.min(filtered.length - 1, cur + 1));
    if (input === ' ') {
      setError('');
      const it = filtered[cur];
      if (it) setSelected((s) => { const n = new Set(s); n.has(it.value) ? n.delete(it.value) : n.add(it.value); return n; });
      return;
    }
    if (key.backspace || key.delete) { if (filterable) { setFilter((f) => f.slice(0, -1)); setCursor(0); } return; }
    if (filterable && input && input.length === 1 && !key.ctrl && !key.meta && input >= ' ') {
      setFilter((f) => f + input); setCursor(0);
    }
  });

  const MAX = 9;
  let start = 0;
  if (filtered.length > MAX) start = Math.min(Math.max(cur - 4, 0), filtered.length - MAX);
  const view = filtered.slice(start, start + MAX);

  return h(Box, { flexDirection: 'column', paddingX: 1 },
    h(Text, { bold: true }, title),
    error ? h(Text, { color: 'red' }, error) : null,
    filterable ? h(Text, { dimColor: true }, filter ? `filtro: ${filter}` : 'digita per filtrare…') : null,
    h(Box, { flexDirection: 'column', marginTop: filterable ? 0 : 1 },
      ...(filtered.length === 0
        ? [h(Text, { dimColor: true }, '  nessun risultato')]
        : view.map((it, i) => {
            const idx = start + i;
            const active = idx === cur;
            const on = selected.has(it.value);
            return h(Text, { key: it.value },
              h(Text, { color: BRAND }, active ? '› ' : '  '),
              h(Text, { color: on ? BRAND : undefined, dimColor: !on }, on ? '◼ ' : '◻ '),
              h(Text, { bold: active, color: on ? BRAND : undefined }, it.label),
              ...(it.tag || []).map(tag => h(Text, { key: tag, color: 'cyan' }, ' ⟨' + tag + '⟩')),
              it.hint ? h(Text, { dimColor: true }, '  ' + it.hint) : null,
            );
          })),
      start + MAX < filtered.length ? h(Text, { dimColor: true }, `  … altri ${filtered.length - (start + MAX)}`) : null,
    ),
    h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, `↑↓ muovi · spazio seleziona${filterable ? ' · digita filtra' : ''} · ⏎ conferma`)),
  );
}

// ------------------------------------------------------------------ Select
function Select({ title, items, initialIndex = 0, onSubmit }) {
  const [cursor, setCursor] = useState(initialIndex);
  useInput((input, key) => {
    if (key.return) return onSubmit(items[cursor].value);
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
  });
  return h(Box, { flexDirection: 'column', paddingX: 1 },
    h(Text, { bold: true }, title),
    h(Box, { flexDirection: 'column', marginTop: 1 },
      ...items.map((it, i) => h(Text, { key: it.value },
        h(Text, { color: BRAND }, i === cursor ? '› ' : '  '),
        h(Text, { bold: i === cursor }, it.label),
        it.hint ? h(Text, { dimColor: true }, '  ' + it.hint) : null,
      )),
    ),
    h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, '↑↓ muovi · ⏎ conferma')),
  );
}

// ----------------------------------------------------------------- Confirm
function Confirm({ message, recap = [], initial = true, onSubmit }) {
  const [val, setVal] = useState(initial);
  useInput((input, key) => {
    if (key.return) return onSubmit(val);
    if (key.leftArrow || key.rightArrow || input === '\t') return setVal((v) => !v);
    const c = (input || '').toLowerCase();
    if (c === 'y' || c === 's') return onSubmit(true);
    if (c === 'n') return onSubmit(false);
  });
  return h(Box, { flexDirection: 'column', paddingX: 1 },
    recap.length
      ? h(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'gray', paddingX: 1, marginBottom: 1 },
          ...recap.map((r, i) => h(Text, { key: i }, r)))
      : null,
    h(Text, null,
      h(Text, { bold: true }, message + '   '),
      h(Text, { color: val ? BRAND : undefined, bold: val }, val ? '› Sì' : '  Sì'),
      h(Text, null, '    '),
      h(Text, { color: !val ? BRAND : undefined, bold: !val }, !val ? '› No' : '  No'),
    ),
    h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, '←→ cambia · y/n · ⏎ conferma')),
  );
}

// ----------------------------------------------------------------- Spinner
function Spinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  return h(Text, { color: BRAND }, frames[i]);
}

// Gli errori asincroni arrivano al chiamante e all'exit code della CLI.
function Installing({ label, run, onDone, onError }) {
  useEffect(() => {
    let active = true;
    Promise.resolve().then(run).then(() => { if (active) onDone(); }, e => { if (active) onError(e); });
    return () => { active = false; };
  }, []);
  return h(Box, { paddingX: 1 }, h(Spinner), h(Text, null, '  ' + label));
}

export async function probeSources(load) {
  const app = render(h(Box, null, h(Spinner), h(Text, null, '  Verifica delle sorgenti…')));
  // Ink deve registrare l'attesa prima dell'unmount, altrimenti perde l'evento.
  const exited = app.waitUntilExit();
  try { return await load(); } finally { app.unmount(); await exited; }
}

// --------------------------------------------------------------------- App
function App({ skills, agents, det, isDev, version, uninstall, install, onDone, onError, sources }) {
  const [step, setStep] = useState('skills');
  const [pick, setPick] = useState({ skills: [], agents: [], extras: [], targets: [], mode: 'copy' });
  const upd = (patch) => setPick((p) => ({ ...p, ...patch }));

  const extrasItems = [
    { value: 'ccstatusline', label: 'ccstatusline', hint: 'statusline per Claude Code' },
    { value: 'impeccable', label: 'impeccable', hint: 'design system (npx)' },
  ];
  const targetItems = [
    { value: 'claude', label: 'Claude Code', hint: det.claude ? '~/.claude · rilevato' : '~/.claude · non rilevato' },
    { value: 'codex', label: 'Codex', hint: det.codex ? '~/.agents/skills · rilevato' : '~/.agents/skills · non rilevato' },
    { value: 'project', label: 'Progetto', hint: 'cartella corrente → .claude/' },
  ];
  const targetInit = ['claude', 'codex'].filter((t) => det[t]);
  const modeItems = [
    { value: 'link', label: 'Symlink', hint: 'si aggiorna col repo (dev)' },
    { value: 'copy', label: 'Copia', hint: 'file autonomi' },
  ];

  const frame = (child) => h(Box, { flexDirection: 'column' }, h(Banner, { det, version, sources }), child);

  if (step === 'skills')
    return frame(h(MultiSelect, {
      key: 'skills',
      title: uninstall ? 'Quali skill rimuovere?' : 'Quali skill installare?', items: skills, filterable: true,
      onSubmit: (v) => { upd({ skills: v }); setStep(agents.length ? 'agents' : (uninstall ? 'where' : 'extras')); },
    }));

  if (step === 'agents')
    return frame(h(MultiSelect, {
      key: 'agents',
      title: uninstall ? 'Quali agent rimuovere?' : 'Quali agent installare?', items: agents,
      onSubmit: (v) => { upd({ agents: v }); setStep(uninstall ? 'where' : 'extras'); },
    }));

  if (step === 'extras')
    return frame(h(MultiSelect, {
      key: 'extras',
      title: 'Extra — dipendenze esterne (opzionale)', items: extrasItems,
      onSubmit: (v) => {
        upd({ extras: v });
        setStep((pick.skills.length || pick.agents.length) ? 'where' : 'confirm');
      },
    }));

  if (step === 'where')
    return frame(h(MultiSelect, {
      key: 'where',
      minSelected: 1,
      title: uninstall ? 'Da dove rimuovo?' : 'Dove installo skill e agent?', items: targetItems, initial: targetInit,
      onSubmit: (v) => {
        const tv = v;
        upd({ targets: tv });
        setStep((!uninstall && isDev) ? 'mode' : 'confirm');
      },
    }));

  if (step === 'mode')
    return frame(h(Select, {
      key: 'mode',
      title: 'Modalità', items: modeItems, initialIndex: 0,
      onSubmit: (m) => { upd({ mode: m }); setStep('confirm'); },
    }));

  // confirm
  const recap = [];
  const np = pick.skills.length || pick.agents.length;
  if (np) {
    recap.push(`skill   ${pick.skills.length ? pick.skills.join(', ') : '—'}`);
    recap.push(`agent   ${pick.agents.length ? pick.agents.map((a) => a.replace(/\.md$/, '')).join(', ') : '—'}`);
    recap.push(`dove    ${pick.targets.join(', ')}${uninstall ? '' : '  ·  ' + pick.mode}`);
  }
  if (pick.extras.length) recap.push(`extra   ${pick.extras.join(', ')}`);
  if (!recap.length) recap.push('niente selezionato');

  if (step === 'installing')
    return frame(h(Installing, {
      key: 'installing',
      label: uninstall ? 'Rimozione…' : 'Installazione…',
      run: () => install(pick),
      onDone: () => onDone(pick),
      onError,
    }));

  return frame(h(Confirm, {
    key: 'confirm',
    message: uninstall ? 'Rimuovo?' : 'Procedo?', recap,
    onSubmit: (yes) => {
      if (!yes) return onDone(null);
      if (install) return setStep('installing');
      return onDone(pick);
    },
  }));
}

export async function runWizard(ctx, renderOptions = {}) {
  let result = null;
  let error;
  const app = render(h(App, { ...ctx, onError: e => { error = e; app.unmount(); }, onDone: (r) => { result = r; app.unmount(); } }), { exitOnCtrlC: true, ...renderOptions });
  await app.waitUntilExit();
  if (error) throw error;
  return result;
}

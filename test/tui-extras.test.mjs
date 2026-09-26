import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { runWizard } from '../bin/tui.mjs';
import { wizardInstall } from '../bin/cleverops.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('TUI propaga il fallimento della callback di installazione', async () => {
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  stdin.isTTY = true; stdin.setRawMode = () => {}; stdin.ref = () => {}; stdin.unref = () => {};
  stdout.columns = 80; stdout.rows = 30; stdout.isTTY = true;
  let text = ''; stdout.on('data', data => { text += data; }); stderr.resume();
  const failure = new Error('installazione sintetica fallita');
  const result = runWizard({ skills: [{ value: 'alpha', label: 'alpha', tag: ['interno', 'Codex'] }], agents: [], det: { claude: true }, version: 'test',
    sources: [{ id: 'public', status: 'disponibile' }], install: async () => { throw failure; } }, { stdin, stdout, stderr, debug: true, exitOnCtrlC: false });
  const rejected = assert.rejects(result, /installazione sintetica fallita/);
  for (const input of [' ', '\r', '\r', '\r', '\r']) { await delay(80); stdin.write(input); }
  await rejected;
  assert.match(text, /public: disponibile/); assert.match(text, /⟨interno⟩/); assert.match(text, /⟨Codex⟩/);
  stdin.end(); stdout.end(); stderr.end();
});

test('TUI mantiene il menu e mostra un messaggio per target vuoti', async () => {
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  stdin.isTTY = true; stdin.setRawMode = () => {}; stdin.ref = () => {}; stdin.unref = () => {};
  stdout.columns = 80; stdout.rows = 30; stdout.isTTY = true;
  let text = '', calls = 0;
  stdout.on('data', data => { text += data; }); stderr.resume();
  const result = runWizard({ skills: [{ value: 'alpha', label: 'alpha' }], agents: [], det: { claude: true },
    install: () => { calls++; return []; } }, { stdin, stdout, stderr, debug: true, exitOnCtrlC: false });
  for (const input of [' ', '\r', '\r', ' ', '\r']) { await delay(80); stdin.write(input); }
  await delay(80);
  assert.equal(calls, 0); assert.match(text, /Seleziona almeno una destinazione/);
  for (const input of [' ', '\r', '\r']) { await delay(80); stdin.write(input); }
  const pick = await result; assert.deepEqual(pick.targets, ['claude']); assert.equal(calls, 1);
  stdin.end(); stdout.end(); stderr.end();
});

test('wizard con soli extra: nessuna installazione e nessun target richiesto', () => {
  let calls = 0; const execute = () => { calls++; return ['installato']; };
  assert.deepEqual(wizardInstall(execute, {}, { skills: [], agents: [], extras: ['impeccable'], targets: [] }), []);
  assert.equal(calls, 0);
  assert.deepEqual(wizardInstall(execute, {}, { skills: ['alpha'], agents: [], extras: [], targets: ['claude'] }), ['installato']);
  assert.equal(calls, 1);
});

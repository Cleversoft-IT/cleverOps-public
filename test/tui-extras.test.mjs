import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runWizard } from '../bin/tui.mjs';
import { wizardInstall } from '../bin/cleverops.mjs';
import { captured, CLI, sandbox, snapshot, write } from './helpers.mjs';

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

test('wizard rifiuta la conferma vuota senza chiamare install', () => {
  assert.throws(() => wizardInstall(() => assert.fail('install non deve partire'), {},
    { skills: [], agents: [], extras: [], targets: [] }), error => error.exitCode === 2 && /Niente da installare/.test(error.message));
});

for (const extra of [true, false]) {
  test(`CLI interattiva senza harness: ${extra ? 'solo extra riuscito' : 'selezione vuota rifiutata'}`, t => {
    const s = sandbox(t), preload = join(s.root, 'terminale.cjs'), bin = join(s.root, 'bin'), log = join(s.root, 'extra.json');
    write(join(bin, 'npx'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));\n`);
    fs.chmodSync(join(bin, 'npx'), 0o755);
    // Terminale sintetico: gli input attendono le schermate, senza tempi di avvio fissi.
    write(preload, `const { PassThrough } = require('node:stream');
const stdin = new PassThrough();
stdin.isTTY = true; stdin.setRawMode = () => {}; stdin.ref = () => {}; stdin.unref = () => {};
Object.defineProperty(process, 'stdin', { value: stdin });
process.stdout.isTTY = true; process.stdout.columns = 80; process.stdout.rows = 30;
const steps = [['Quali skill installare?', ['\\r']], ['Extra — dipendenze esterne', ${JSON.stringify(extra ? [' ', '\r'] : ['\r'])}], ['Procedo?', ['\\r']]];
const output = process.stdout.write.bind(process.stdout);
let seen = '', step = 0;
process.stdout.write = (chunk, ...args) => {
  const result = output(chunk, ...args);
  seen += chunk;
  if (steps[step] && seen.includes(steps[step][0])) {
    const inputs = steps[step++][1]; seen = '';
    inputs.forEach((key, i) => setTimeout(() => stdin.write(key), 30 * (i + 1)));
  }
  return result;
};
`);
    const before = snapshot(s.home);
    const result = captured(process.execPath, ['--require', preload, CLI], {
      cwd: s.root, env: { ...s.env, CI: 'false', PATH: `${bin}:${s.env.PATH}` }, timeout: 15000,
    });
    assert.equal(result.status, extra ? 0 : 2, result.stdout + result.stderr);
    if (extra) {
      assert(fs.existsSync(log), result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(fs.readFileSync(log, 'utf8')), ['-y', 'ccstatusline-gradient@latest', '--onboard']);
    }
    else { assert.match(result.stderr, /Niente da installare/); assert(!fs.existsSync(log)); }
    assert.deepEqual(snapshot(s.home), before);
  });
}

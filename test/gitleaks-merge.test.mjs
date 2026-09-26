import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { captured, ROOT, sandbox, write } from './helpers.mjs';

const available = captured('gitleaks', ['version'], { encoding: 'utf8' });
const skip = available.error?.code === 'ENOENT' ? 'gitleaks non disponibile: regressione con scanner reale saltata' : false;
const zero = '0'.repeat(40);

function mergeFixture(t) {
  const s = sandbox(t);
  const repo = join(s.root, 'repo');
  fs.mkdirSync(repo);
  const git = args => s.git(repo, args);
  git(['init', '-b', 'main']);
  fs.copyFileSync(join(ROOT, '.gitleaks.toml'), join(repo, '.gitleaks.toml'));
  write(join(repo, 'config.txt'), 'risoluzione=iniziale\n');
  git(['add', '.']);
  git(['commit', '-m', 'Base sintetica']);
  git(['checkout', '-b', 'work/laterale']);
  write(join(repo, 'config.txt'), 'risoluzione=laterale\n');
  git(['commit', '-am', 'Modifica laterale']);
  const side = git(['rev-parse', 'HEAD']);
  git(['checkout', 'main']);
  write(join(repo, 'config.txt'), 'risoluzione=principale\n');
  git(['commit', '-am', 'Modifica principale']);
  const base = git(['rev-parse', 'HEAD']);
  git(['update-ref', 'refs/remotes/origin/main', base]);

  const guards = join(s.root, 'guards');
  fs.mkdirSync(guards);
  fs.copyFileSync(join(ROOT, '.gitleaks.toml'), join(guards, '.gitleaks.toml'));

  const runner = join(s.root, 'runner');
  fs.mkdirSync(runner);
  // Usa il binario reale nel PATH, senza eseguire il download previsto dalla CI.
  write(join(runner, 'gitleaks'), '#!/usr/bin/env bash\nexec gitleaks "$@"\n');
  fs.chmodSync(join(runner, 'gitleaks'), 0o755);
  const env = { ...s.env, RUNNER_TEMP: runner };
  const run = (command, args, extraEnv = {}) => captured(command, args, {
    cwd: repo, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000,
  });
  // Isola le istruzioni gitleaks effettive dell'hook, inclusa la selezione del range.
  const hook = fs.readFileSync(join(ROOT, '.githooks', 'pre-push'), 'utf8');
  const pushBlock = hook.match(/^  if \[ "\$remote_sha" = "\$zero" \]; then\n[\s\S]*?(?=^done$)/m);
  assert.ok(pushBlock, 'Blocco gitleaks del pre-push non trovato');
  // Le chiamate allo scanner dei contenuti riservati non fanno parte di questa regressione.
  const pushScript = pushBlock[0].replace(/^    node "\$guards\/check-public\.mjs"[^\n]*\n/gm, '');
  const prePush = (head, remoteSha) => {
    return run('bash', ['-e', '-u', '-o', 'pipefail', '-c', `status=0\n${pushScript}\nexit $status`], {
      local_sha: head, remote_sha: remoteSha, zero, remote: 'origin', guards, root: repo, noignore: runner,
    });
  };

  // Esegue il blocco effettivo del workflow: una regressione nella CI deve fallire qui.
  const workflow = fs.readFileSync(join(ROOT, '.github', 'workflows', 'guards.yml'), 'utf8');
  const block = workflow.match(/^      - name: Segreti su tutta la storia\n        run: \|\n((?:          .*\n?)+)/m);
  assert.ok(block, 'Blocco gitleaks del workflow non trovato');
  const ci = event => {
    const expressions = {
      'github.event.pull_request.base.sha || github.sha': event === 'pull_request' ? base : git(['rev-parse', 'HEAD']),
    };
    const script = block[1].replace(/^          /gm, '').replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => {
      assert.ok(Object.hasOwn(expressions, expression), `Espressione CI non simulata: ${expression}`);
      return expressions[expression];
    });
    return run('bash', ['-e', '-o', 'pipefail', '-c', script]);
  };
  const scan = logOpts => run('gitleaks', ['git', '--redact', '--no-banner', '--ignore-gitleaks-allow',
    '--config', join(guards, '.gitleaks.toml'), '--gitleaks-ignore-path', runner, `--log-opts=${logOpts}`, repo]);
  return { repo, git, run, prePush, ci, scan, base, side };
}

function expectScan(result, leaks) {
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  assert.equal(result.status, leaks ? 1 : 0, output);
  assert.match(output, leaks ? /leaks found: [1-9]\d*/ : /no leaks found/, output);
}

test('gitleaks: merge con segreto sintetico, anche rimosso in seguito', { skip }, async t => {
  assert.ifError(available.error);
  assert.equal(available.status, 0, available.stderr);
  const f = mergeFixture(t);
  const guards = head => [
    ['pre-push: branch esistente', () => f.prePush(head, f.base)],
    ['pre-push: branch nuovo', () => f.prePush(head, zero)],
    ['CI: pull_request', () => f.ci('pull_request')],
    ['CI: push', () => f.ci('push')],
  ];

  for (const [label, run] of guards(f.base)) {
    await t.test(`${label}, genitori senza segreti`, () => expectScan(run(), false));
  }

  const merge = f.run('git', ['merge', '--no-ff', '--no-commit', 'work/laterale']);
  assert.equal(merge.status, 1, merge.stdout + merge.stderr);
  assert.match(f.git(['status', '--porcelain']), /^UU config\.txt$/m);
  // Token inventato, costruito a runtime: nel repository pubblico non compare una credenziale.
  const token = ['ghp', createHash('sha256').update('fixture merge gitleaks').digest('base64')
    .replace(/[+/]/g, 'a').slice(0, 36)].join('_');
  for (const parent of [f.base, f.side]) {
    assert.ok(!f.git(['show', `${parent}:config.txt`]).includes(token));
  }
  write(join(f.repo, 'config.txt'), `token=${token} # gitleaks:allow\n`);
  f.git(['add', 'config.txt']);
  f.git(['commit', '-m', 'Risoluzione sintetica del conflitto']);
  const mergeSha = f.git(['rev-parse', 'HEAD']);
  assert.equal(f.git(['show', '-s', '--format=%P', mergeSha]), `${f.base} ${f.side}`);

  for (const removed of [false, true]) {
    if (removed) {
      write(join(f.repo, 'config.txt'), 'risoluzione=bonificata\n');
      f.git(['commit', '-am', 'Rimozione del token sintetico']);
      assert.ok(!f.git(['show', 'HEAD:config.txt']).includes(token));
    }
    const head = f.git(['rev-parse', 'HEAD']);
    const state = removed ? 'token rimosso dopo il merge' : 'token solo nel merge';
    // Dimostra il punto cieco originario, sia nel range locale sia nella storia completa.
    await t.test(`senza diff dei merge: ${state}`, () => {
      expectScan(f.scan(`-m ${f.base}..${head}`), true);
      expectScan(f.scan(`${f.base}..${head}`), false);
      expectScan(f.scan('--full-history --all'), false);
    });
    for (const [label, run] of guards(head)) {
      await t.test(`${label}, ${state}`, () => expectScan(run(), true));
    }
  }

  // Un merge già remoto non deve allargare il range dei commit in uscita.
  const head = f.git(['rev-parse', 'HEAD']);
  f.git(['update-ref', 'refs/remotes/origin/main', mergeSha]);
  await t.test('pre-push: il range esclude il merge già remoto', () => expectScan(f.prePush(head, mergeSha), false));
  await t.test('pre-push: il branch nuovo esclude i commit remoti', () => expectScan(f.prePush(head, zero), false));

  // La CI deve conservare --all: il merge resta raggiungibile da main, ma non da HEAD.
  f.git(['checkout', '--detach', f.base]);
  for (const event of ['pull_request', 'push']) {
    await t.test(`CI: ${event}, storia anche fuori HEAD`, () => expectScan(f.ci(event), true));
  }
});

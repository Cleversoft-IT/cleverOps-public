import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentGate } from '../scripts/deploy-site-gate.mjs';

const sha = 'a'.repeat(40), base = 'b'.repeat(40), newer = 'c'.repeat(40);
function scenario(event = 'pull_request') {
  const repo = { id: 1, full_name: 'example/public' };
  const pr = { number: 7, state: 'open', head: { sha, repo, ref: 'work/site' }, base: { sha: base, repo, ref: 'main' } };
  const run = (name, id) => ({ id, name, path: `.github/workflows/${name}.yml`, run_attempt: 1, repository: repo, head_repository: repo, head_sha: sha,
    event, head_branch: event === 'push' ? 'main' : 'work/site', status: 'completed', conclusion: 'success', pull_requests: event === 'push' ? [] : [structuredClone(pr)] });
  const ci = run('ci', 20), guards = run('guards', 21);
  const state = {
    event: { repository: repo, workflow_run: structuredClone(ci) }, pr, ref: { object: { sha } },
    runs: { ci: [ci], guards: [guards] },
    jobs: { 20: [{ name: 'site', status: 'completed', conclusion: 'success' }], 21: ['provenance', 'public-guard', 'gitleaks'].map(name => ({ name, status: 'completed', conclusion: 'success' })) },
    artifacts: [{ id: 30, name: 'site-20-1', expired: false, workflow_run: { id: 20, head_sha: sha } }],
  };
  const calls = [];
  const get = async path => {
    calls.push(path);
    if (path.endsWith('/git/ref/heads/main')) return state.ref;
    if (path.endsWith('/pulls/7')) return state.pr;
    const workflow = path.match(/\/workflows\/(ci|guards)\.yml\/runs\?/);
    if (workflow) return { workflow_runs: state.runs[workflow[1]] };
    const jobs = path.match(/\/runs\/(\d+)\/attempts\/\d+\/jobs\?/);
    if (jobs) return { jobs: state.jobs[jobs[1]] };
    if (path.includes('/runs/20/artifacts?')) return { artifacts: state.artifacts };
    throw new Error(`API inattesa nel test: ${path}`);
  };
  return { state, calls, check: () => deploymentGate(state.event, get) };
}

test('deploy: produzione push main e anteprima PR del repository, ordine di completamento indifferente', async () => {
  for (const event of ['push', 'pull_request']) for (const trigger of ['ci', 'guards']) {
    const { state, check } = scenario(event);
    state.event.workflow_run = structuredClone(state.runs[trigger][0]);
    assert.deepEqual(await check(), { ready: true, branch: event === 'push' ? 'main' : 'pr-7', runId: 20, artifactId: 30, sha });
  }
});

for (const [label, mutate] of [
  ['fork', s => { s.event.workflow_run.head_repository = { id: 2 }; }],
  ['evento diverso', s => { s.event.workflow_run.event = 'workflow_dispatch'; }],
  ['workflow fallito', s => { s.event.workflow_run.conclusion = 'failure'; }],
  ['SHA non valido', s => { s.event.workflow_run.head_sha = 'invalid'; }],
  ['PR assente', s => { s.event.workflow_run.pull_requests = []; }],
  ['PR chiusa', s => { s.pr.state = 'closed'; }],
  ['PR da fork in API', s => { s.pr.head.repo = { id: 2 }; }],
  ['PR con nuova testa', s => { s.pr.head.sha = newer; }],
  ['PR con altro repository base', s => { s.pr.base.repo = { id: 2 }; }],
  ['CI mancante', s => { s.runs.ci = []; }],
  ['guardie in corso', s => { s.runs.guards[0].status = 'in_progress'; }],
  ['guardie saltate', s => { s.runs.guards[0].conclusion = 'skipped'; }],
  ['guardie fallite', s => { s.runs.guards[0].conclusion = 'failure'; }],
  ['guardie su altro SHA', s => { s.runs.guards[0].head_sha = newer; }],
  ['guardie su altro repository base', s => { s.runs.guards[0].pull_requests[0].base.repo = { id: 2 }; }],
  ['guardie su altra testa PR', s => { s.runs.guards[0].pull_requests[0].head.sha = newer; }],
  ['guardie su altro repository testa', s => { s.runs.guards[0].pull_requests[0].head.repo = { id: 2 }; }],
  ['guardie su altra PR', s => { s.runs.guards[0].pull_requests[0].number = 8; }],
  ['workflow con nome simile', s => { s.runs.guards[0].path = '.github/workflows/altro.yml'; }],
  ['workflow da altro repository', s => { s.runs.guards[0].repository = { id: 2 }; }],
  ['guardia non eseguita', s => { s.jobs[21][0].conclusion = 'skipped'; }],
  ['guardia assente', s => { s.jobs[21].pop(); }],
  ['build sito non eseguita', s => { s.jobs[20][0].conclusion = 'skipped'; }],
  ['artifact assente', s => { s.artifacts = []; }],
  ['artifact scaduto', s => { s.artifacts[0].expired = true; }],
  ['artifact ambiguo', s => { s.artifacts.push(structuredClone(s.artifacts[0])); }],
  ['artifact altro run', s => { s.artifacts[0].workflow_run.id = 99; }],
  ['artifact altro SHA', s => { s.artifacts[0].workflow_run.head_sha = newer; }],
  ['artifact tentativo precedente', s => { s.runs.ci[0].run_attempt = 2; s.event.workflow_run.run_attempt = 2; }],
  ['evento tentativo precedente', s => { s.runs.ci[0].run_attempt = 2; }],
  ['nuovo run fallito prevale sul vecchio verde', s => { s.runs.guards.push({ ...s.runs.guards[0], id: 25, conclusion: 'failure' }); }],
]) test(`deploy saltato: ${label}`, async () => {
  const { state, check } = scenario();
  mutate(state);
  assert.equal((await check()).ready, false);
});

test('deploy: un push fuori main o superato non arriva agli artifact', async () => {
  for (const mutate of [s => { s.event.workflow_run.head_branch = 'work/site'; }, s => { s.ref.object.sha = newer; }]) {
    const { state, calls, check } = scenario('push');
    mutate(state);
    assert.equal((await check()).ready, false);
    assert(!calls.some(path => path.includes('/artifacts')));
  }
});

test('deploy: avanzamenti della base non invalidano la stessa testa della PR', async () => {
  const { state, check } = scenario();
  state.pr.base.sha = newer;
  state.runs.guards[0].pull_requests[0].base.sha = 'd'.repeat(40);
  assert.equal((await check()).ready, true);
});

test('deploy: nessun job omonimo fallito o annullato può essere nascosto da un successo', async () => {
  for (const [id, names] of [[20, ['site']], [21, ['provenance', 'public-guard', 'gitleaks']]]) {
    for (const name of names) for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
      const { state, check } = scenario();
      state.jobs[id].push({ name, status: 'completed', conclusion });
      assert.equal((await check()).ready, false, `${name}: ${conclusion}`);
    }
  }
});

test('deploy: tra job omonimi non falliti deve essercene almeno uno riuscito', async () => {
  const { state, check } = scenario();
  state.jobs[20].push({ name: 'site', status: 'completed', conclusion: 'skipped' });
  assert.equal((await check()).ready, true);
  state.jobs[20][0].conclusion = 'neutral';
  assert.equal((await check()).ready, false);
  state.jobs[20][0] = { name: 'site', status: 'in_progress', conclusion: null };
  state.jobs[20][1].conclusion = 'success';
  assert.equal((await check()).ready, false);
});

test('deploy: errori delle API bloccano il controllo', async () => {
  const { state } = scenario();
  await assert.rejects(deploymentGate(state.event, async () => { throw new Error('API indisponibile'); }), /API indisponibile/);
});

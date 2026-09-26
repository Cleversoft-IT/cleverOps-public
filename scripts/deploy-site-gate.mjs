// Eseguito dal workflow fidato su main; le API sono sostituibili nei test offline.
import fs from 'node:fs';
import { isEntryPoint } from '../bin/lib/entry.mjs';

const SHA = /^[a-f0-9]{40}$/;
const skip = reason => ({ ready: false, reason });
const sameRepository = (run, id) => run.repository?.id === id && run.head_repository?.id === id;
const prSnapshot = (run, pr) => run.pull_requests?.some(item => item.number === pr.number &&
  item.head?.sha === pr.head.sha &&
  item.head?.repo?.id === pr.head.repo.id && item.base?.repo?.id === pr.base.repo.id);

export async function deploymentGate(event, get) {
  const trigger = event.workflow_run, repository = event.repository;
  if (!trigger || !repository || !SHA.test(trigger.head_sha) || !sameRepository(trigger, repository.id)) return skip('Evento esterno al repository: deploy saltato.');
  if (!['push', 'pull_request'].includes(trigger.event)) return skip('Evento non pubblicabile.');
  if (trigger.status !== 'completed' || trigger.conclusion !== 'success') return skip('Il workflow di origine non è riuscito.');
  const api = `/repos/${repository.full_name}`;
  let branch, pr;
  if (trigger.event === 'push') {
    if (trigger.head_branch !== 'main') return skip('Produzione consentita solo per push a main.');
    const ref = await get(`${api}/git/ref/heads/main`);
    if (ref.object.sha !== trigger.head_sha) return skip('Push superato da una revisione più recente.');
    branch = 'main';
  } else {
    const candidates = trigger.pull_requests?.filter(item => Number.isSafeInteger(item.number) && item.number > 0) || [];
    if (candidates.length !== 1) return skip('PR non identificabile in modo univoco.');
    pr = await get(`${api}/pulls/${candidates[0].number}`);
    if (pr.state !== 'open' || pr.head.repo?.id !== repository.id || pr.base.repo?.id !== repository.id ||
        pr.head.sha !== trigger.head_sha || !prSnapshot(trigger, pr)) return skip('PR da fork, chiusa o superata: deploy saltato.');
    branch = `pr-${pr.number}`;
  }

  const runs = {};
  for (const workflow of ['ci', 'guards']) {
    // Nessun filtro success: un tentativo nuovo fallito/in corso invalida il verde precedente.
    const query = new URLSearchParams({ head_sha: trigger.head_sha, event: trigger.event, per_page: '100' });
    const data = await get(`${api}/actions/workflows/${workflow}.yml/runs?${query}`);
    const candidates = data.workflow_runs.filter(run => run.path === `.github/workflows/${workflow}.yml` &&
      sameRepository(run, repository.id) && run.head_sha === trigger.head_sha &&
      run.event === trigger.event && run.head_branch === trigger.head_branch);
    const run = candidates.sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
    if (!run || run.status !== 'completed' || run.conclusion !== 'success') return skip(`In attesa del successo di ${workflow} sulla stessa revisione.`);
    if (pr && !prSnapshot(run, pr)) return skip('CI e guardie non corrispondono al repository e alla testa attuali della PR.');
    runs[workflow] = run;
  }
  if (!Object.values(runs).some(run => run.id === trigger.id && run.run_attempt === trigger.run_attempt)) return skip('Evento di un tentativo superato.');

  for (const [workflow, required] of [['ci', ['site']], ['guards', ['provenance', 'public-guard', 'gitleaks']]]) {
    const run = runs[workflow];
    const data = await get(`${api}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    if (required.some(name => {
      const matches = data.jobs.filter(job => job.name === name);
      // Un omonimo riuscito non nasconde un job fallito, annullato o incompleto.
      return matches.some(job => job.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(job.conclusion)) ||
        !matches.some(job => job.status === 'completed' && job.conclusion === 'success');
    })) {
      return skip(`Job richiesti di ${workflow} mancanti, saltati o falliti.`);
    }
  }
  const ci = runs.ci;
  const artifactName = `site-${ci.id}-${ci.run_attempt}`;
  const data = await get(`${api}/actions/runs/${ci.id}/artifacts?per_page=100`);
  const artifacts = data.artifacts.filter(item => item.name === artifactName && !item.expired &&
    item.workflow_run?.id === ci.id && item.workflow_run?.head_sha === trigger.head_sha);
  if (artifacts.length !== 1) return skip('Artifact della build verificata assente, ambiguo o scaduto.');
  return { ready: true, branch, runId: ci.id, artifactId: artifacts[0].id, sha: trigger.head_sha };
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const get = async path => {
    const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30000),
    });
    // Non stampare risposte API, token o dati del repository.
    if (!response.ok) throw new Error(`Verifica GitHub non riuscita (HTTP ${response.status}).`);
    return response.json();
  };
  const decision = await deploymentGate(event, get);
  if (!decision.ready) {
    console.log(decision.reason);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${decision.reason}\n`);
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(decision).filter(([key]) => key !== 'reason').map(([key, value]) => `${key}=${value}\n`).join(''));
}

if (isEntryPoint(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

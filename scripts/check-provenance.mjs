#!/usr/bin/env node
// Provenienza della storia: ogni commit raggiungibile da <rev> deve discendere dal commit seed
// del repo pubblico. Una radice diversa (anche entrata con un merge) significa storia estranea,
// per esempio quella del vecchio repo interno: in quel caso il push o la PR vanno bloccati.
//
//   node scripts/check-provenance.mjs [<rev>]    (default HEAD)
//
// Seed: $SEED_SHA (in CI: variabile di repository impostata dall'admin, mai ricavata dalla storia
// che si sta verificando) oppure `git config cleverops.seed` (in locale, via scripts/setup-hooks.sh).
import { execFileSync } from 'node:child_process';

const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = msg => { console.error(`✗ check-provenance: ${msg}`); process.exit(1); };

let seed = process.env.SEED_SHA || '';
if (!seed) { try { seed = git(['config', '--get', 'cleverops.seed']); } catch { /* assente */ } }
if (!/^[0-9a-f]{40}$/.test(seed)) {
  fail('SHA del seed mancante o non valido (SEED_SHA o git config cleverops.seed)');
}

if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
  fail('storia incompleta (clone shallow): serve la storia completa, es. fetch-depth: 0');
}

const rev = process.argv[2] || 'HEAD';
const roots = git(['rev-list', '--max-parents=0', rev]).split('\n').filter(Boolean);
const foreign = roots.filter(r => r !== seed);
if (!roots.includes(seed) || foreign.length) {
  fail(`${rev} contiene storia estranea: radici ${foreign.map(r => r.slice(0, 7)).join(', ') || '(seed assente)'} `
    + `≠ seed ${seed.slice(0, 7)}. Non pubblicare: vedi README → Sicurezza.`);
}
console.log(`✓ check-provenance: ${rev} discende solo dal seed ${seed.slice(0, 7)}`);

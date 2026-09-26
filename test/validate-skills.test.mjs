import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, validateSkills } from '../scripts/validate-skills.mjs';
import { captured, fixture, json, ROOT, sandbox, write } from './helpers.mjs';

const document = (frontmatter, body = '') => `---\n${frontmatter}\n---\n${body}`;
const header = 'name: alpha\ndescription: Una skill sintetica.';
function source(t) {
  const s = sandbox(t), root = fixture(s);
  json(join(root, 'legacy-hashes.json'), { schemaVersion: 1, skills: {}, agents: {} });
  return root;
}

test('frontmatter: stringhe YAML, commenti, metadata e liste standard', () => {
  const fm = parseFrontmatter(document('name: alpha # commento\ndescription: "Test: con \\"virgolette\\""\nlicense: \'MIT\'\nallowed-tools: [Read, "Bash(a,b)"]\nmetadata:\n  author: \'L\'\'autore\'\n  version: "1"'));
  assert.equal(fm.name, 'alpha');
  assert.equal(fm.description, 'Test: con "virgolette"');
  assert.deepEqual(fm['allowed-tools'], ['Read', 'Bash(a,b)']);
  assert.equal(fm.metadata.author, "L'autore");
});

test('frontmatter: blocchi folded/literal, CRLF e liste su più righe', () => {
  for (const [style, expected] of [['>-', 'Prima riga seconda riga'], ['|', 'Prima riga\nseconda riga\n']]) {
    const fm = parseFrontmatter(document(`name: alpha\ndescription: ${style}\n  Prima riga\n  seconda riga\nallowed-tools:\n  - Read\n  - Bash(git status)`).replaceAll('\n', '\r\n'));
    assert.equal(fm.description, expected);
    assert.deepEqual(fm['allowed-tools'], ['Read', 'Bash(git status)']);
  }
  assert.equal(parseFrontmatter(document('name: alpha\ndescription: Prima riga\n  seconda riga')).description, 'Prima riga seconda riga');
  assert.equal(parseFrontmatter(document('name: alpha\ndescription: >-\n  Primo paragrafo\n\n  Secondo paragrafo')).description, 'Primo paragrafo\nSecondo paragrafo');
});

test('frontmatter: compatibility è una stringa standard opzionale', () => {
  assert.equal(parseFrontmatter(document(header)).compatibility, undefined);
  assert.equal(parseFrontmatter(document(`${header}\ncompatibility: Richiede Node 18 o superiore.`)).compatibility, 'Richiede Node 18 o superiore.');
  assert.equal(parseFrontmatter(document(`${header}\ncompatibility: >-\n  Richiede una shell Unix\n  e Python 3.`)).compatibility, 'Richiede una shell Unix e Python 3.');
  assert.throws(() => parseFrontmatter(document(`${header}\ncompatibility: true`)));
});

for (const [label, yaml] of [
  ['chiave proprietaria', `${header}\ntargets: [codex]`],
  ['chiave duplicata', `${header}\nname: alpha`],
  ['nome non valido', 'name: Alpha\ndescription: Test'],
  ['nome troppo lungo', `name: ${'a'.repeat(65)}\ndescription: Test`],
  ['descrizione assente', 'name: alpha'],
  ['descrizione vuota', 'name: alpha\ndescription: "   "'],
  ['descrizione booleana', 'name: alpha\ndescription: true'],
  ['descrizione numerica', 'name: alpha\ndescription: 123'],
  ['descrizione lunga', `name: alpha\ndescription: ${'x'.repeat(1025)}`],
  ['virgolette aperte', 'name: alpha\ndescription: "Test'],
  ['due scalari', 'name: alpha\ndescription: "Test" garbage'],
  ['mappa nello scalare', 'name: alpha\ndescription: Test: errato'],
  ['lista non chiusa', `${header}\nallowed-tools: [Read, Bash`],
  ['lista vuota interna', `${header}\nallowed-tools: [Read,,Bash]`],
  ['commento che nasconde la chiusura', `${header}\nallowed-tools: [Read # commento, Write]`],
  ['metadata scalari', `${header}\nmetadata: testo`],
  ['metadata duplicati', `${header}\nmetadata:\n  author: Uno\n  author: Due`],
  ['metadata numerici', `${header}\nmetadata:\n  version: 1`],
  ['indentazione tab', 'name: alpha\ndescription: >\n\tTest'],
  ['indentazione blocco', 'name: alpha\ndescription: >\n    Test\n  Errato'],
  ['alias', 'name: alpha\ndescription: *descrizione'],
  ['tag', 'name: alpha\ndescription: !!str Test'],
]) test(`frontmatter rifiuta ${label}`, () => assert.throws(() => parseFrontmatter(document(yaml))));

test('frontmatter: delimitatori obbligatori e limite inclusivo di 1024 caratteri', () => {
  assert.throws(() => parseFrontmatter(header));
  assert.throws(() => parseFrontmatter(`---\n${header}`));
  assert.equal(parseFrontmatter(document(`name: alpha\ndescription: ${'è'.repeat(1024)}`)).description.length, 1024);
});

test('validazione standalone senza dipendenze: fixture valida e CLI con exit code', t => {
  const root = source(t);
  assert.deepEqual(validateSkills(root), { errors: [], warnings: [] });
  const run = () => captured(process.execPath, [join(ROOT, 'scripts/validate-skills.mjs'), root], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  write(join(root, 'skills/alpha/SKILL.md'), document(header + '\ntargets: [codex]'));
  assert.equal(run().status, 1);
});

test('manifest e cartelle devono corrispondere in entrambe le direzioni', t => {
  const root = source(t);
  fs.renameSync(join(root, 'skills/alpha'), join(root, 'skills/beta'));
  const errors = validateSkills(root).errors.join('\n');
  assert.match(errors, /nel manifest ma cartella assente/);
  assert.match(errors, /cartella assente dal manifest/);
  assert.match(errors, /name diverso/);
});

test('SKILL.md mancante, YAML annidato e symlink vengono controllati', t => {
  const root = source(t);
  fs.unlinkSync(join(root, 'skills/alpha/SKILL.md'));
  write(join(root, 'skills/alpha/nested/SKILL.md'), document(header));
  fs.symlinkSync('nested', join(root, 'skills/alpha/link'));
  const errors = validateSkills(root).errors.join('\n');
  assert.match(errors, /SKILL.md assente/);
  assert.match(errors, /name diverso/);
  assert.match(errors, /symlink non ammesso/);
});

test('oltre 500 righe è solo un avviso; esattamente 500 è ammesso', t => {
  const root = source(t), file = join(root, 'skills/alpha/SKILL.md');
  write(file, document(header, 'riga\n'.repeat(496)));
  assert.equal(validateSkills(root).warnings.length, 0);
  fs.appendFileSync(file, 'riga\n');
  const result = validateSkills(root);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings[0], /501 righe/);
});

test('percorsi fissi vietati anche in riferimenti e script, percorsi relativi ammessi', t => {
  const root = source(t);
  write(join(root, 'skills/alpha/references/paths.md'), '.claude/skills\n.agents/skills\n.codex/skills\n${CODEX_HOME:-x}/skills');
  write(join(root, 'skills/alpha/install.sh'), 'echo "$SKILL_DIR/scripts/run.py"');
  assert.equal(validateSkills(root).errors.filter(error => error.includes('percorso di installazione fisso')).length, 4);
});

test('manifest invalidi sono bloccati usando il contratto runtime', t => {
  const root = source(t), file = join(root, 'cleverops.json');
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const bad of [null, { ...base, schemaVersion: 2 }, { ...base, skills: { alpha: { category: 'Test', targets: ['invalid'] } } }, { ...base, skills: { alpha: { category: '' } } }]) {
    json(file, bad);
    assert.match(validateSkills(root).errors.join('\n'), /cleverops.json/);
  }
  json(file, { ...base, future: 'campo consentito dallo schema' });
  assert.equal(validateSkills(root).errors.length, 0);
  assert.equal(validateSkills(root).warnings.length, 1);
});

test('hash legacy: fixture pubbliche, schema, SHA-256, unicità e ordinamento', t => {
  const root = source(t), file = join(root, 'legacy-hashes.json');
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  const base = { schemaVersion: 1, skills: { alpha: [a, b] }, agents: {} };
  json(file, base);
  assert.equal(validateSkills(root).errors.length, 0);
  for (const bad of [
    { ...base, schemaVersion: 2 }, { ...base, extra: true }, { ...base, agents: [] },
    { ...base, skills: { beta: [a], alpha: [b] } }, { ...base, skills: { alpha: [b, a] } },
    { ...base, skills: { alpha: [a, a] } }, { ...base, skills: { alpha: ['ABC'] } },
  ]) {
    json(file, bad);
    assert.match(validateSkills(root).errors.join('\n'), /legacy-hashes.json/);
  }
});

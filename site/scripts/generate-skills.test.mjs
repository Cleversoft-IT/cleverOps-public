// Test del generatore del catalogo: `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ManifestError, buildCatalog, repoSlug, validateManifest } from "./generate-skills.mjs";

const base = () => ({
  schemaVersion: 1,
  id: "public",
  visibility: "public",
  skills: { "demo-skill": { category: "Demo" } },
  agents: {},
});

// Manifest valido con una modifica applicata; restituisce gli errori della validazione.
function errorsFor(mutate) {
  const m = base();
  mutate(m);
  return validateManifest(m).errors;
}

function assertOneError(errors, re) {
  assert.ok(
    errors.some((e) => re.test(e)),
    `atteso un errore che corrisponda a ${re}, trovati:\n${errors.join("\n") || "(nessuno)"}`
  );
}

test("manifest valido: nessun errore né avviso", () => {
  const { errors, warnings } = validateManifest(base());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("campi di primo livello: assenti e invalidi sono distinti", () => {
  assertOneError(errorsFor((m) => delete m.id), /^manca "id"$/);
  assertOneError(errorsFor((m) => (m.id = "Public")), /^"id" non valido/);
  assertOneError(errorsFor((m) => delete m.visibility), /^manca "visibility"$/);
  assertOneError(errorsFor((m) => (m.visibility = "secret")), /^"visibility" non valida/);
  assertOneError(errorsFor((m) => delete m.schemaVersion), /^manca "schemaVersion"$/);
  assertOneError(errorsFor((m) => (m.schemaVersion = "1")), /^"schemaVersion" non valido/);
  assertOneError(errorsFor((m) => delete m.skills), /^manca "skills"$/);
  assertOneError(errorsFor((m) => (m.skills = [])), /^"skills" non valido: atteso oggetto/);
});

test("agents: null o array non diventano {} in silenzio; assente è ammesso", () => {
  assertOneError(errorsFor((m) => (m.agents = null)), /^"agents" non valido: atteso oggetto.*null/);
  assertOneError(errorsFor((m) => (m.agents = [])), /^"agents" non valido/);
  assert.deepEqual(errorsFor((m) => delete m.agents), []);
});

test("schemaVersion futura: un solo errore con l'invito ad aggiornare", () => {
  const errors = errorsFor((m) => {
    m.schemaVersion = 2;
    delete m.id;
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /schemaVersion 2 non supportata/);
});

test("category: assente e vuota sono distinte", () => {
  assertOneError(errorsFor((m) => delete m.skills["demo-skill"].category), /manca "category"/);
  assertOneError(errorsFor((m) => (m.skills["demo-skill"].category = " ")), /"category" non valida/);
  assertOneError(errorsFor((m) => (m.skills["demo-skill"].category = 3)), /"category" non valida/);
});

test("targets: stringa, vuoto, valori ignoti e duplicati", () => {
  const set = (t) => errorsFor((m) => (m.skills["demo-skill"].targets = t));
  assertOneError(set("claude"), /"targets" non valido: atteso array/);
  assertOneError(set([]), /"targets" non valido: la lista è vuota/);
  assertOneError(set(["vscode"]), /"targets" non valido: valori ammessi/);
  assertOneError(set(["claude", "claude"]), /"targets" non valido: duplicati claude/);
  assert.deepEqual(set(["codex"]), []);
});

test("legacy, replaces e requires", () => {
  const skill = (f) => errorsFor((m) => f(m.skills["demo-skill"]));
  assertOneError(skill((s) => (s.legacy = "yes")), /"legacy" non valido: atteso booleano/);
  assertOneError(skill((s) => (s.replaces = "old-name")), /"replaces" non valido: atteso array/);
  assertOneError(skill((s) => (s.replaces = ["Old Name"])), /"replaces" non valido: nomi non conformi/);
  assertOneError(skill((s) => (s.replaces = ["a", "a"])), /"replaces" non valido: duplicati a/);
  assertOneError(skill((s) => (s.requires = 42)), /"requires" non valido: atteso oggetto/);
  assertOneError(skill((s) => (s.requires = { path: 3 })), /"requires.path" non valido/);
  assert.deepEqual(skill((s) => Object.assign(s, { legacy: true, replaces: ["old-name"], requires: { path: "~/.env" } })), []);
});

test("voce non oggetto e nome non valido", () => {
  assertOneError(errorsFor((m) => (m.skills["demo-skill"] = "Demo")), /la voce deve essere un oggetto/);
  assertOneError(errorsFor((m) => (m.skills["Bad_Name"] = { category: "X" })), /skill "Bad_Name": nome non valido/);
});

test("tutti gli errori vengono raccolti insieme", () => {
  const errors = errorsFor((m) => {
    delete m.id;
    m.agents = null;
    m.skills["demo-skill"].targets = "claude";
    m.skills["demo-skill"].requires = 42;
  });
  assert.equal(errors.length, 4, errors.join("\n"));
});

test("campi sconosciuti: avviso, non errore", () => {
  const m = base();
  m.extra = true;
  m.skills["demo-skill"].color = "red";
  const { errors, warnings } = validateManifest(m);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 2);
});

test("repoSlug: url https, ssh e forma breve", () => {
  assert.equal(repoSlug({ repository: { url: "https://github.com/Org/repo.git" } }), "Org/repo");
  assert.equal(repoSlug({ repository: { url: "git@github.com:Org/repo.git" } }), "Org/repo");
  assert.equal(repoSlug({ repository: "github:Org/repo" }), "Org/repo");
  assert.throws(() => repoSlug({ repository: { url: "https://gitlab.com/o/r.git" } }), ManifestError);
  assert.throws(() => repoSlug({}), ManifestError);
});

// ---------------------------------------------------------------------------
// buildCatalog su una sorgente fittizia in una cartella temporanea
// ---------------------------------------------------------------------------

function fixture(t, { manifest = base(), skills = { "demo-skill": skillMd("demo-skill") }, agents = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleverops-site-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "cleverops.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ repository: { url: "https://github.com/Org/repo.git" } }));
  for (const [name, md] of Object.entries(skills)) {
    fs.mkdirSync(path.join(root, "skills", name), { recursive: true });
    fs.writeFileSync(path.join(root, "skills", name, "SKILL.md"), md);
  }
  for (const [name, md] of Object.entries(agents)) {
    fs.mkdirSync(path.join(root, "agents"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", `${name}.md`), md);
  }
  return root;
}

function skillMd(name, description = "Usala quando serve: descrizione di prova.") {
  return `---\nname: ${name}\ndescription: >\n  ${description}\n---\n\n# ${name}\n`;
}

test("buildCatalog: catalogo e comandi dal manifest", (t) => {
  const manifest = base();
  manifest.skills["demo-skill"].targets = ["codex"];
  manifest.agents = { "demo-agent": { category: "Agenti", targets: ["claude"] } };
  const root = fixture(t, {
    manifest,
    agents: { "demo-agent": "---\nname: demo-agent\ndescription: |\n  Intro breve.\n  <example>lungo</example>\n---\nbody\n" },
  });
  const data = buildCatalog(root);
  assert.equal(data.repo, "Org/repo");
  assert.deepEqual(data.categories, ["Demo"]);
  assert.equal(data.skills[0].description, "Usala quando serve: descrizione di prova.");
  assert.equal(data.skills[0].command, "npx github:Org/repo --target codex --skills demo-skill");
  assert.equal(data.agents[0].description, "Intro breve.");
  assert.equal(data.agents[0].command, "npx github:Org/repo --target claude --agents demo-agent");
});

test("buildCatalog: targets stringa → ManifestError, non TypeError", (t) => {
  const manifest = base();
  manifest.skills["demo-skill"].targets = "claude";
  const root = fixture(t, { manifest });
  assert.throws(() => buildCatalog(root), (err) => err instanceof ManifestError && /"targets" non valido/.test(err.message));
});

test("buildCatalog: manifest e cartelle non coincidono, errori in un solo messaggio", (t) => {
  const manifest = base();
  manifest.skills["ghost-skill"] = { category: "Demo" };
  manifest.id = 42;
  const root = fixture(t, { manifest, skills: { "demo-skill": skillMd("demo-skill"), "extra-skill": skillMd("extra-skill") } });
  assert.throws(
    () => buildCatalog(root),
    (err) =>
      err instanceof ManifestError &&
      /"id" non valido/.test(err.message) &&
      /nel manifest ma assenti in skills\/: ghost-skill/.test(err.message) &&
      /in skills\/ ma assenti dal manifest: extra-skill/.test(err.message)
  );
});

test("buildCatalog: name del frontmatter diverso dalla cartella", (t) => {
  const root = fixture(t, { skills: { "demo-skill": skillMd("altro-nome") } });
  assert.throws(() => buildCatalog(root), /il frontmatter ha name/);
});

test("buildCatalog: solo voci pubbliche", (t) => {
  const manifest = base();
  manifest.skills["hidden-skill"] = { category: "Demo", visibility: "private" };
  const root = fixture(t, { manifest, skills: { "demo-skill": skillMd("demo-skill"), "hidden-skill": skillMd("hidden-skill") } });
  assert.deepEqual(buildCatalog(root).skills.map((s) => s.name), ["demo-skill"]);

  const priv = base();
  priv.visibility = "private";
  const root2 = fixture(t, { manifest: priv });
  assert.throws(() => buildCatalog(root2), /nessuna skill pubblica/);
});

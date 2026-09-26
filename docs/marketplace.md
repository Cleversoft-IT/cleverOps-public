# Marketplace Claude Code e Codex

Ogni repository distribuisce un marketplace: `cleverops-public` per
`Cleversoft-IT/cleverOps-public`, `cleverops-internal` per
`Cleversoft-IT/cleverOps-internal`. Il nome dopo `@` è quello del catalogo,
in minuscolo, non il nome GitHub. Il marketplace privato richiede accesso Git
già configurato sulla macchina; non contiene credenziali di accesso.

Le procedure CLI sono verificate con **codex-cli 0.157.0** (versione minima
collaudata) e **Claude Code 2.1.283**, in una home isolata; vedi [7].

## Struttura e identificatori

Un plugin per skill, con lo stesso nome della skill. Per gli agent compatibili
con Claude, un plugin per agent. La categoria resta un'etichetta del catalogo:
cambiarla non cambia gli identificatori né l'abilitazione nell'installer.

```text
.claude-plugin/marketplace.json
.agents/plugins/marketplace.json
plugins/
  README.md                         # marker della directory generata
  drupal-local-env/
    plugin.json                      # formato portabile per le skill Codex
    skills/drupal-local-env/
      SKILL.md
      references/...
```

I pacchetti contengono copie generate delle sole risorse elencate in
`cleverops.json`, inclusi script e asset, mantenendo eseguibili gli script.
Non dipendono da percorsi esterni al plugin. Questo rende il contenuto autonomo
anche dopo la copia nella cache degli host. Le copie sono necessarie per usare
la struttura documentata `skills/<nome>/SKILL.md` su entrambi gli host senza
affidarsi al trattamento dei symlink esterni da parte di Codex.
Non modificare `plugins/` a mano: il generatore ne elimina i file obsoleti.

Claude non richiede un manifest per plugin: usa nome, versione e metadati
dell'entry nel catalogo e scopre `skills/` o `agents/`. Per Codex generiamo
il manifest portabile `plugin.json` alla radice del plugin, con
`$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` e metadati
dell'interfaccia in `extensions.com.openai.interface`. Il formato è descritto
con esempi completi in [4], “Create a plugin manually”, “Plugin structure” e
“Add OpenAI-specific metadata”, ed è quello raccomandato per i nuovi pacchetti.
`skills/` viene scoperta automaticamente: non serve un campo `skills`.
`defaultPrompt` è un array di una stringa, come nell'esempio di “Add
OpenAI-specific metadata”; `capabilities` è omesso perché non necessario.
La rigenerazione elimina i vecchi `.codex-plugin/plugin.json`, mantenuti dagli
host solo come fallback. Non servono manifest Claude duplicati, hook o MCP.
Vedi anche [1], [2].

La descrizione del marketplace Claude proviene da `package.json.description`
(con una descrizione generica se assente), secondo [2], “Top-level fields”.
Per ogni skill, `parseFrontmatter` di `scripts/validate-skills.mjs` legge la
description di `SKILL.md`: la prima frase diventa la descrizione dell'entry
Claude e del manifest Codex. In Codex `shortDescription` usa quella frase,
abbreviata a un massimo di 120 caratteri al confine di parola con `…` se tagliata;
se una singola parola supera il limite, il taglio rispetta i caratteri Unicode.
`longDescription` conserva l'intera description del frontmatter.
Si normalizzano gli spazi; la frase termina su `.`, `!` o `?` seguiti da spazio
o fine testo, ammettendo virgolette di chiusura. I punti interni a versioni e
percorsi non la interrompono. Per gli agent Claude resta la descrizione
nome/categoria, perché non hanno un `SKILL.md`.

`repository` proviene dalla stringa o da `repository.url` di `package.json`,
se presente: va nelle entry Claude e nel manifest portabile Codex, dove è
documentato. Il catalogo Codex continua a contenere solo i campi previsti da
“Marketplace metadata”; descrizioni e repository risiedono nel plugin.
Fonti: [2], “Plugin entries” e “Fields”; [4], “Manifest fields”.

I `targets` sono tradotti dal generatore in due liste distinte: gli host non
interpretano quel campo. Se omessi, valgono entrambi. Nel pubblico ci sono
11 plugin per host: `plan-auditor` compare solo in Codex,
`subagent-dev-with-codex` solo in Claude; le altre 10 skill compaiono in entrambi.

Gli identificatori hanno forma `nome@cleverops-public` o
`nome@cleverops-internal`, già riconosciuta da `sync` e `doctor`. Per esempio:
`drupal-local-env@cleverops-public`. Il caricamento tramite plugin cambia il
namespace: in Claude la skill si invoca come
`/drupal-local-env:drupal-local-env`, invece di `/drupal-local-env` per la copia
standalone. La ripetizione rende identici nome della risorsa e nome del plugin,
senza mapping aggiuntivi nell'installer. In Codex usare `/skills` oppure `$`
e scegliere la skill del plugin: non presumere che la sintassi slash di Claude
sia valida anche lì. Vedi [1], [3], [5].

**Agent Codex:** i riferimenti forniti non descrivono un campo plugin per agent
personalizzati. Il generatore li esclude dal catalogo Codex con un avviso;
l'installer continua a convertirli in `${CODEX_HOME:-~/.codex}/agents/*.toml`.
Non vengono convertiti in skill. Gli agent destinati a Claude sono invece
impacchettati in `plugins/<nome>/agents/<nome>.md`. La verifica dell'agent privato
in una sessione Codex resta un passo di collaudo del canale file.

## Da file a plugin: Claude Code

Esempio per una skill, nello scope utente. Ripetere installazione e abilitazione
per ogni plugin desiderato; il solo `marketplace add` non installa le skill.

1. Nella shell, indicare esplicitamente lo scope utente:

   ```sh
   claude plugin marketplace add Cleversoft-IT/cleverOps-public --scope user
   claude plugin install drupal-local-env@cleverops-public --scope user
   claude plugin list
   ```

   `list` deve mostrarlo abilitato. La chiave nei settings Claude è
   `enabledPlugins["drupal-local-env@cleverops-public"]: true`.
   In alternativa usare il pannello `/plugin`, selezionando esplicitamente
   lo scope **user** durante l'installazione. Non affidarsi all'auto-detect:
   nel collaudo, senza `--scope`, il comando lanciato dalla home ha scelto
   lo scope project [7].

2. Nella shell, riconciliare le copie precedenti e diagnosticare:

   ```sh
   npx github:Cleversoft-IT/cleverOps-public sync --source public --target claude
   npx github:Cleversoft-IT/cleverOps-public doctor --source public --target claude
   ```

   `sync` è obbligatorio: rimuove solo le copie registrate coperte dai plugin
   abilitati per Claude, salvando quelle modificate nei backup dell'installer.
   Le altre skill e le installazioni Codex rimangono sul proprio canale.

3. Dopo un `doctor` pulito, aprire una **nuova sessione** Claude e provare
   `/drupal-local-env:drupal-local-env`. Verificare che la vecchia skill
   standalone non compaia una seconda volta. Add, install e namespace: [1].

Per lo scope progetto, usare `--scope project` al posto di `--scope user`
nei comandi Claude di aggiunta, installazione e disabilitazione, oppure
selezionarlo esplicitamente nel pannello del plugin. Usare
`--target project --project /percorso/progetto` sia per `sync` sia per `doctor`.
L'abilitazione del progetto non sostituisce una copia globale: per migrare anche
quella occorre un plugin abilitato nello scope utente e `sync --target claude`.

## Da file a plugin: Codex

1. Aggiungere il marketplace dalla shell:

   ```sh
   codex plugin marketplace add Cleversoft-IT/cleverOps-public --sparse .agents/plugins --sparse plugins
   codex plugin marketplace list
   ```

   Il checkout sparso include il catalogo Codex e i payload, escludendo la
   directory `.claude-plugin` dalla copia Git. La ripetizione di `--sparse` è
   documentata in [4], “Add a marketplace from the CLI”, ed è ammessa soltanto
   per sorgenti Git. Eseguire il collaudo da una directory esterna al checkout
   di sviluppo, che contiene entrambi i cataloghi: vedere i controlli sotto.

2. Installare e abilitare il plugin dalla CLI, poi controllare l'elenco:

   ```sh
   codex plugin add drupal-local-env@cleverops-public
   codex plugin list
   ```

   La forma equivalente è
   `codex plugin add drupal-local-env --marketplace cleverops-public`.
   Questi comandi sono disponibili e verificati con codex-cli 0.157.0 [7].
   L'aggiunta del marketplace rende il plugin disponibile, ma non equivale
   all'installazione: occorre anche `plugin add`.

   In alternativa aprire la **Plugins Directory** nell'app che ospita Codex,
   scegliere la sorgente `cleverops-public`, installare `drupal-local-env` e
   abilitarlo. Se la sorgente non appare, riavviare l'app. Questa alternativa
   è descritta in [4], “Build your own curated plugin list” e “How local
   marketplaces work”.

3. Per il passaggio delle copie **utente** gestite dall'installer, verificare
   l'abilitazione in `${CODEX_HOME:-$HOME/.codex}/config.toml`:

   ```toml
   [plugins."drupal-local-env@cleverops-public"]
   enabled = true
   ```

   Nel collaudo `plugin add` ha scritto questa abilitazione e installato i file
   in `$CODEX_HOME/plugins/cache/cleverops-public/drupal-local-env/0.2.0` [7].
   Conservare le altre impostazioni durante l'eventuale controllo manuale.
   La chiave segue il formato documentato in [4], “Enable or disable a plugin
   for a repo”. Quella sezione mostra anche `.codex/config.toml` del progetto:
   l'adattatore cleverOps legge invece il config **utente** per il target
   `codex`, che installa file utente. Un'abilitazione solo di progetto non basta
   per questa migrazione; non usarla per rimuovere copie necessarie altrove.
   La configurazione non sostituisce `plugin add` o l'installazione nell'interfaccia.

4. Riconciliare e diagnosticare dalla shell:

   ```sh
   npx github:Cleversoft-IT/cleverOps-public sync --source public --target codex
   npx github:Cleversoft-IT/cleverOps-public doctor --source public --target codex
   ```

5. Dopo un `doctor` pulito, avviare una **nuova sessione** Codex. Usare `/skills`
   o `$` per verificare disponibilità e assenza di doppioni. Gli agent Codex
   eventualmente installati restano file TOML.

## Da plugin a file

Disabilitare o disinstallare **prima** il plugin nell'host interessato.
Finché il plugin è attivo, install rifiuta di crearne la copia sullo stesso
harness, con exit 1 e messaggio esplicito. Non è necessario rimuovere tutto il
marketplace se si vuole cambiare canale per una sola skill.

Per Claude, disabilitare dalla shell con scope esplicito:

```sh
claude plugin disable drupal-local-env@cleverops-public --scope user
npx github:Cleversoft-IT/cleverOps-public install --source public --skills drupal-local-env --target claude
npx github:Cleversoft-IT/cleverOps-public doctor --source public --target claude
```

In alternativa usare `/plugin` selezionando lo scope **user**.
Per Codex, rimuovere il plugin con la CLI prima di reinstallare i file:

```sh
codex plugin remove drupal-local-env@cleverops-public
codex plugin list
npx github:Cleversoft-IT/cleverOps-public install --source public --skills drupal-local-env --target codex
npx github:Cleversoft-IT/cleverOps-public doctor --source public --target codex
```

In alternativa disabilitare o disinstallare nella **Plugins Directory**,
verificando che il config utente non dichiari più il plugin attivo. Per
disabilitarlo conservandone i file, la tabella può avere `enabled = false` [4].

Aprire una **nuova sessione** dopo `doctor`. Per tornare ai file per tutte le
risorse, disabilitare tutti i rispettivi plugin e usare `--all` al posto di
`--skills drupal-local-env`. In un terminale interattivo si può omettere `install`
e la selezione per usare il wizard. Disabilitazione Claude: [3]; Codex: [4], [7].

## Stessa procedura per cleverOps-internal

Generare e pubblicare i cataloghi nel repository privato prima di aggiungerlo.
Chi ha accesso aggiunge **separatamente** quel marketplace:

```sh
claude plugin marketplace add Cleversoft-IT/cleverOps-internal --scope user
claude plugin install nome-skill@cleverops-internal --scope user
claude plugin list
```

`nome-skill` è un segnaposto: sostituirlo con un nome del catalogo privato.
Completare installazione e abilitazione nello scope scelto. Per Codex:

```sh
codex plugin marketplace add Cleversoft-IT/cleverOps-internal --sparse .agents/plugins --sparse plugins
codex plugin marketplace list
codex plugin add nome-skill@cleverops-internal
codex plugin list
```

In alternativa installare e abilitare la skill dalla sorgente
`cleverops-internal` nella **Plugins Directory**. La chiave del config utente
è `nome-skill@cleverops-internal`. L'installer resta quello **pubblico**:

```sh
npx github:Cleversoft-IT/cleverOps-public sync --source internal --target claude,codex
npx github:Cleversoft-IT/cleverOps-public doctor --source internal --target claude,codex
```

Limitare `--target` all'harness di cui si è cambiato il canale. Dopo `doctor`
pulito, nuova sessione. Per tornare ai file, disabilitare o rimuovere prima
i plugin su ciascun host interessato, poi installare:

```sh
claude plugin disable nome-skill@cleverops-internal --scope user
codex plugin remove nome-skill@cleverops-internal
codex plugin list
npx github:Cleversoft-IT/cleverOps-public install --source internal --skills nome-skill --target claude,codex
npx github:Cleversoft-IT/cleverOps-public doctor --source internal --target claude,codex
```

Si possono usare anche i pannelli dei due host, con scope **user** esplicito
in Claude; per Codex verificare l'assenza dell'abilitazione nel config utente.

Per un agent Claude usare il suo nome plugin e `--agents nome-agent` al ritorno
ai file. Per installare l'agent Codex usare direttamente
`install --source internal --agents nome-agent --target codex`: il suo caricamento
come agent va controllato in una nuova sessione Codex. Non si dichiara verificata
la distribuzione di agent Codex tramite plugin. Accesso privato: [6].

## Generazione, versioni e aggiornamenti

Node ≥18, senza nuove dipendenze, senza rete e senza configurare gli host:

```sh
node scripts/gen-marketplace.mjs
node scripts/gen-marketplace.mjs --check
# Equivalenti: npm run marketplace:generate / npm run marketplace:check
```

La radice predefinita è quella del repository dello script, indipendentemente
dalla directory corrente. Per il privato, da un checkout pubblico completo:

```sh
node /percorso/cleverOps-public/scripts/gen-marketplace.mjs /percorso/cleverOps-internal
node /percorso/cleverOps-public/scripts/gen-marketplace.mjs /percorso/cleverOps-internal --check
```

Lo script legge esclusivamente manifest, versione e risorse della radice indicata;
non scarica né modifica l'altro repository. La directory `plugins/` è riservata
al generatore; una directory preesistente priva del suo marker viene rifiutata.
Sono esclusi marker dell'installer, cache Python e `.DS_Store`. I link interni
alle singole risorse sono dereferenziati; quelli esterni sono rifiutati.

`plugins/` resta nel repository Git, dal quale i client installano i plugin,
ma è esclusa dal tarball npm usato da `npx`: l'installer legge solo i cataloghi.
Il tarball include entrambi i cataloghi, il generatore, il parser del frontmatter
e la guida. Il generatore può ricostruire i payload dalle skill incluse anche
senza `node_modules`. Il punto d'ingresso usa `isEntryPoint` condiviso con
l'installer e funziona anche quando lo script è invocato tramite symlink.

`--check` non scrive e termina con exit 1 per output mancanti, diversi o obsoleti,
compresi payload e manifest per plugin. Gli argomenti errati producono exit 2.
Il job `skills` di `.github/workflows/ci.yml` esegue `npm run marketplace:check`
senza `npm ci`: generatore e parser usano solo Node. `npm test` verifica anche
risorse pubbliche reali, formato portabile, descrizioni, migrazione dei manifest
legacy, invocazione tramite symlink e packaging senza `plugins/`.

Per ogni rilascio che cambia una risorsa, incrementare `version` nel
`package.json` **di quel repository**, rigenerare e includere tutti i derivati
nel rilascio. Tutti i plugin della sorgente condividono quella versione:
si evita una gestione manuale di versioni per skill. Nel catalogo Claude
`version` sta nell'entry; per Codex nel `plugin.json` alla radice del plugin.
Non viene duplicata in un manifest Claude. Modificare soltanto gli originali senza rigenerare lascia
vecchi contenuti nei pacchetti; rigenerare senza bump può lasciare la cache
Claude sulla vecchia versione. Vedi [6], “Release a new version”.

Claude: l'aggiornamento automatico dei marketplace aggiunti è disattivato per
default. In `/plugin` → **Marketplaces** → `cleverops-public` (o
`cleverops-internal`) scegliere **Enable auto-update**. Il catalogo non può
abilitarlo per conto dell'utente. Aggiornamento manuale:

```text
/plugin marketplace update cleverops-public
/plugin marketplace update cleverops-internal
```

Codex: i riferimenti forniti non garantiscono una cadenza di auto-update dei
marketplace Git. Documentano il refresh esplicito:

```sh
codex plugin marketplace upgrade cleverops-public
codex plugin marketplace upgrade cleverops-internal
```

Verificare il plugin aggiornato nell'interfaccia e riavviare l'app o aprire una
nuova sessione. Per sorgenti locali la documentazione chiede di aggiornare i file
del plugin e riavviare l'app. Un refresh può aggiornare i file anche di un plugin
disabilitato: `enabled = false` continua a controllarne l'uso. Vedi [4].

## Collaudo e significato di doctor pulito

Il collaudo del maintainer del 26 settembre 2026 [7], con `HOME`,
`CLAUDE_CONFIG_DIR` e `CODEX_HOME` temporanei, ha verificato:

- **Claude Code 2.1.283:** validazione del marketplace e di tutti i 12 plugin;
  aggiunta del marketplace locale, installazione e abilitazione di
  `drupal-local-env` 0.2.0; successivo rifiuto della copia dell'installer.
- **codex-cli 0.157.0:** dopo l'aggiunta della radice locale, `codex plugin list`
  indica `.agents/plugins/marketplace.json` in testa all'elenco e non mostra
  `subagent-dev-with-codex`. `plugin add` installa e abilita il plugin;
  `cleverops sync` rimuove la copia registrata coperta dal plugin.
- **Ritorno ai file:** `codex plugin remove` e `claude plugin disable`, seguiti
  da install, ripristinano le copie; `doctor` risulta pulito. Sono accettati
  anche `--ref` e `--sparse <PATH>` ripetibile per il marketplace Codex.

Un `doctor` pulito non ha `issues`, migrazioni pendenti, copie assenti/modificate
o voci registrate con `plugin: true`. Dopo `sync` le copie passate al plugin
escono dal registro; le copie rimaste devono essere integre. L'exit 0 di
`doctor` da solo non prova che il client abbia caricato il plugin: leggere il
report, eventualmente con `--json`, e verificare la nuova sessione.

I test offline coprono cataloghi, targets, payload, determinismo, versioni,
`--check` e i due ordini installer↔plugin con settings sintetici per entrambi
gli harness e le sorgenti. Verificano backup delle modifiche, preservazione
delle risorse estranee e isolamento dello scope progetto Claude.

**Scelta del catalogo in Codex:** [4], “How local marketplaces work”, elenca
anche `.claude-plugin/marketplace.json` come sorgente legacy compatibile.
La precedenza rispetto a `.agents/plugins/marketplace.json` quando hanno lo
stesso `name` non è specificata nei riferimenti scaricati. Il collaudo con
0.157.0 ha confermato l'uso del catalogo `.agents` anche con entrambi i file
presenti e l'assenza delle skill solo Claude. Mantenere il controllo sulle
versioni future. I comandi Git con `--sparse` riportati sopra
escludono il catalogo Claude dalla copia configurata, ma non determinano la
precedenza di eventuali altre sorgenti locali o di vecchie copie complete.
Il flag non è disponibile per `marketplace add /percorso/locale`.

Per ripetere il collaudo, anche sulle versioni future, prima di installare
o eseguire `sync`:

1. Da una directory esterna al checkout di sviluppo, eseguire
   `codex plugin marketplace list`: controllare tutte le sorgenti e le radici
   effettivamente risolte, comprese quelle locali predefinite. Il comando è
   descritto in [4], “Add a marketplace from the CLI”.
2. Nella copia Git sparsa risolta verificare la presenza di
   `.agents/plugins/marketplace.json` e `plugins/`, e l'assenza di
   `.claude-plugin/marketplace.json`. Una sorgente già aggiunta senza `--sparse`
   o una radice locale può contenere entrambi i cataloghi: controllare in quel
   caso il percorso effettivo mostrato da `codex plugin list`.
3. Con `codex plugin list`, oppure nella **Plugins Directory**, controllare
   i nomi mostrati sotto `cleverops-public`,
   non soltanto il conteggio: devono coincidere con il catalogo Codex generato.
   Nel catalogo attuale devono esserci 11 voci, con `plan-auditor` presente e
   `subagent-dev-with-codex` assente. Per il privato confrontare allo stesso modo
   l'elenco con il suo catalogo Codex, escludendo skill solo Claude e agent.
4. Se compaiono voci solo Claude o doppioni, il collaudo non è superato:
   non procedere al cambio canale. Verificare quale sorgente completa o locale
   viene caricata; il solo filtro nel JSON non prova quale file il client usa.

Il collaudo riportato copre i comandi nei client reali sulla skill pubblica
`drupal-local-env`. Per completare il punto 7 end-to-end restano il controllo
di attivazione e doppioni nelle nuove sessioni e la verifica dell'agent privato
in Codex sul canale file. I test con fixture non sostituiscono queste prove
e non richiedono accesso al repository privato.

## Riferimenti e collaudo

Snapshot forniti in `docs-ref/`, scaricati il 26 settembre 2026. Le sezioni e i
nomi file seguenti identificano precisamente la fonte; i link portano alle
pagine ufficiali, senza richiedere rete per generare o testare i cataloghi.

1. `code.claude.com_docs_en_plugin-marketplaces.md`, **Create a marketplace**
   (Add the marketplace and install the plugin; Confirm the plugin loaded),
   **Keep the entry name and the manifest name the same**:
   [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces).
2. `code.claude.com_docs_en_plugins-reference.md`, **Manifest file**,
   **Fields**, **Standard layout**, **Path rules**, **Marketplace entries and the manifest**; e
   `code.claude.com_docs_en_plugins_marketplace-reference.md`,
   **Top-level fields**, **Plugin entries**, **How an entry combines with plugin.json**:
   [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference),
   [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference).
3. `code.claude.com_docs_en_plugins.md`, **Understand what a plugin is** e
   **Decide whether you need a plugin**:
   [Plugins](https://code.claude.com/docs/en/plugins).
4. `developers.openai.com_codex_plugins_build.md`, **Create a plugin manually**,
   **Plugin structure**, **Add OpenAI-specific metadata**,
   **Build your own curated plugin list**, **Add a marketplace from the CLI**,
   **Install a local plugin manually**, **Enable or disable a plugin for a repo**,
   **Marketplace metadata**, **How local marketplaces work**, **Manifest fields**,
   **Path rules**:
   [Package your plugin](https://developers.openai.com/codex/plugins/build).
5. `learn.chatgpt.com_docs_build-skills.md`, **How ChatGPT and Codex use skills**,
   **Where Codex loads local skills**:
   [Build skills](https://learn.chatgpt.com/docs/build-skills).
6. `code.claude.com_docs_en_plugins_host-marketplace.md`, **Grant access to a
   private marketplace**, **Turn on auto-update**, **Release a new version**,
   **Share files within a marketplace with symlinks**:
   [Host and maintain a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace).
7. Collaudo in home isolata comunicato dal maintainer il **26 settembre 2026**,
   con **Claude Code 2.1.283** e **codex-cli 0.157.0**. È la fonte delle
   procedure CLI Codex `plugin add`, `plugin list`, `plugin remove`, del
   comportamento osservato nella scelta del catalogo e della necessità di
   specificare lo scope Claude. Integra gli snapshot ufficiali precedenti.

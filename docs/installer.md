# Installer multi-sorgente

Richiede Node ≥18; la versione minima supportata di codex-cli è 0.155. Non esegue setup delle skill, né installa i prerequisiti indicati
in `requires.path`: li segnala. Gli extra partono solo se selezionati esplicitamente.

```sh
npx github:Cleversoft-IT/cleverOps-public --all --target claude,codex
npx github:Cleversoft-IT/cleverOps-public --list --json
npx github:Cleversoft-IT/cleverOps-public doctor --target claude,codex
npx github:Cleversoft-IT/cleverOps-public sync --target claude,codex
npx github:Cleversoft-IT/cleverOps-public uninstall --all --target claude,codex
```

Qualunque flag seleziona la modalità non interattiva. Install e uninstall senza
flag richiedono un TTY; doctor, sync e restore funzionano anche senza TTY.
Nel wizard è obbligatorio selezionare almeno una destinazione.
I target predefiniti sono gli harness rilevati; senza harness occorre `--target`.
`project` usa `.claude/{skills,agents}` nella directory corrente o in `--project`.
Le skill Codex vanno in `~/.agents/skills`, gli agent in `${CODEX_HOME:-~/.codex}/agents`.
Claude rispetta `CLAUDE_CONFIG_DIR`. Il manifest determina la compatibilità dei target;
`targets:` nel frontmatter non viene letto.

Exit code: **0** completato, **1** errore operativo (compresi extra e conflitti con
plugin abilitati), **2** argomenti o selezione non validi, **3** sorgente richiesta
con `--source` non disponibile. Il privato inaccessibile viene saltato silenziosamente;
`--verbose` mostra il motivo. Uno schema futuro produce sempre l'invito ad aggiornare.

## Sorgenti e sviluppo locale

La sorgente pubblica è il pacchetto in esecuzione: funziona anche senza `.git`.
La sorgente `internal` prova SSH e poi HTTPS; `--no-private` evita il probe.
`--from PATH` usa soltanto il manifest in quella directory ed è obbligatorio per
`--link`. I link non ricevono marker e gli agent Codex vengono comunque convertiti
in copie TOML.

Per fixture e provisioning, `CLEVEROPS_SOURCES` sostituisce entrambe le sorgenti
predefinite con un array JSON:

```json
[
  { "id": "public", "path": "/tmp/fixture-public" },
  { "id": "internal", "visibility": "private", "url": "file:///tmp/fixture-internal.git" }
]
```

Per una sorgente Git, `id` e `url` sono obbligatori; `https` è il fallback HTTPS
opzionale. Il branch è `main`. Per una sorgente locale `path` è obbligatorio e `id`,
se presente, deve coincidere col manifest. `visibility: private` permette di
escludere anche sorgenti private con ID personalizzati prima del download.
In caso di collisione dello stesso nome e tipo prevale `public`, con avviso.

Ogni operazione Git ha timeout 15 secondi. Il probe conserva la precedenza
`GIT_SSH_COMMAND` → `GIT_SSH` → `core.sshCommand` → `ssh`, aggiungendo
`BatchMode=yes` e `ConnectTimeout=5`. `GIT_SSH` è un percorso eseguibile, anche
con spazi. Probe, clone e fetch impostano `GIT_TERMINAL_PROMPT=0`,
`GCM_INTERACTIVE=never`, `GIT_ASKPASS=''` e `SSH_ASKPASS=''` per evitare prompt.
La cache è in `${XDG_CACHE_HOME:-~/.cache}/cleverops/sources/<id>`, con permessi
0700, controllo di origin e lock esclusivo. Un fetch fallito rende la sorgente
indisponibile per quella esecuzione, anche se esiste una copia precedente.

## Registro, backup e migrazioni

`${XDG_STATE_HOME:-~/.local/state}/cleverops/installed.json` è la fonte di proprietà.
Ogni voce registra sorgente, tipo, nome, harness, destinazione, modalità, target
originale del link, versione, commit e hash. `harness: project` identifica lo scope
Claude del progetto; la destinazione assoluta distingue i progetti. Per un pacchetto
senza Git il commit è `null`. Non si ricostruisce la proprietà dai soli marker.

Installazione, riconciliazione e disinstallazione usano un lock globale. Le copie
vengono preparate e verificate in `.cleverops-tmp-*` accanto alla destinazione;
un errore prima del commit ripristina gli originali e lascia invariato il registro.
Gli originali modificati o estranei vanno in `state/cleverops/backups/<timestamp-id>/`;
un `manifest.json` associa ogni elemento alla destinazione originale. I link sono
salvati come `{path, linkTarget, resolved}` e ricreati col target grezzo, senza
spostarli. Per ripristinarli offline:

```sh
cleverops restore "$HOME/.local/state/cleverops/backups/<timestamp-id>"
```

Indicare una cartella contenente `manifest.json` il cui percorso reale sia sotto
`${XDG_STATE_HOME:-~/.local/state}/cleverops/backups/`. Il comando verifica tutte le
voci prima di iniziare: accetta solo risorse intere nelle radici skills/agents
degli harness configurati, nella vecchia `$CODEX_HOME/skills` o nelle directory
`.claude/skills` e `.claude/agents` dei progetti. I nomi devono essere validi,
con eventuale estensione `.md`/`.toml` e suffisso legacy `.bak-*`.
Rifiuta file interni a una skill, destinazioni occupate e percorsi `stored` esterni
al backup; non sovrascrive file. Ricrea i link con il target grezzo identico, anche
se rotto, e riporta i file originali alle loro destinazioni. Il registro resta
invariato: il ripristino non assegna automaticamente proprietà all'installer.
Se la destinazione era assente ma ancora registrata, al prossimo install il
contenuto ripristinato diverso dall'hash registrato viene trattato come modificato
e salvato in un nuovo backup prima della sostituzione.
In caso di errore, tenta di riportare nel backup le voci già ripristinate.
Anche un rollback dell'installazione fallito conserva un manifest per recuperare
i backup rimasti, tramite questo comando dopo aver liberato le destinazioni.
Per gli originali conservati nei temporanei invece che nei backup, l'errore di
rollback indica il percorso da cui recuperarli manualmente.

Il lock non viene rimosso automaticamente dopo un arresto forzato: verificare che
il processo indicato sia terminato prima di eliminarlo. Il rollback copre gli errori
rilevati durante l'esecuzione; non è un journal di ripristino dopo un'interruzione
improvvisa del sistema. I temporanei rimasti sono nascosti agli harness.

`uninstall` funziona offline dal solo registro. Ricalcola gli hash delle copie,
salva quelle modificate e preserva le risorse estranee. Un link viene rimosso soltanto
se il target grezzo coincide col registro, anche quando è rotto; un link sostituito
dall'utente viene lasciato e rimosso soltanto dal registro.

Le migrazioni sono individuate a ogni installazione e da `sync`. Le rinomine
usano esclusivamente `replaces` e gli hash della rispettiva sorgente; lo stesso
nome viene usato per cambiare directory. La sola rimozione senza sostituta
predefinita è frontend-design, se riconosciuta e senza un replaces esplicito. Una risorsa dubbia viene lasciata invariata
con un avviso. Una risorsa nota viene rimossa solo dopo la verifica di tutte le
sostitute compatibili. `sync` aggiorna le risorse già registrate sul rispettivo
harness e installa le sostitute solo sull'harness del legacy. La chiave dei job è
`(source, kind, name, harness)`: indicare due target non crea copie su un harness
che non aveva l'installazione o il legacy. Lo scope project resta distinto.
`sync` non accetta selezioni `--all`, `--skills` o `--agents`: restituisce exit 2.
Tutti i backup legacy `.bak-*` vengono spostati fuori da `skills/`, anche con
hash o nome sconosciuto e senza sorgenti disponibili; contenuti e target dei link
restano recuperabili nel backup. La catena di symlink Drupal viene risolta prima
del confronto degli hash delle sole installazioni legacy.

`doctor` legge registro, installazioni e migrazioni senza scaricare, aggiornare,
creare lock o scrivere file. Per le sorgenti remote legge solo cache con origin
valido, dichiarandole non aggiornate. Senza cache non può diagnosticare migrazioni
specifiche di quella sorgente; si può usare `--from` per indicare un checkout.
Un `config.toml` Codex malformato produce un messaggio esplicito e blocca install
e sync. Doctor continua invece la diagnosi: nel JSON riporta il problema in
`issues` e usa `plugin: null` quando non può determinare l'abilitazione.

## Hash storici

`legacy-hashes.json` appartiene a ciascuna sorgente; quello pubblico contiene solo
nomi pubblici. Non contiene testi, commit, URL o percorsi dei repository originali.

```sh
node scripts/gen-legacy-hashes.mjs \
  --repo /tmp/repo-storico --repo /tmp/suite-standalone \
  --names skill-a,skill-b > /tmp/legacy-hashes.json
```

Il generatore legge tutti i branch e tag dei repository locali, esclusivamente per
i nomi ammessi, e supporta sia `skills/<nome>` sia `<nome>` per suite standalone.
Legge anche `agents/<nome>.md`. Non esporta file estranei all'allowlist. Ricostruisce ciascuna versione in uno
snapshot temporaneo, eliminato dopo l'hash. I symlink interni sono risolti dallo
stesso algoritmo runtime; quelli esterni alla risorsa vengono rifiutati.

L'algoritmo condiviso calcola SHA-256 dell'elenco ordinato
`path\0sha256(file)\n`; per un agent il path è il nome del file. Esclude
`.cleverops.json`, `__pycache__/`, `*.pyc`, `.DS_Store`. I symlink alla radice di
una risorsa sorgente sono rifiutati prima di leggere skill o agent, anche se
puntano dentro il repository. Il percorso reale deve inoltre rimanere dentro
la sorgente, per bloccare symlink nelle directory superiori. Solo la scansione
delle migrazioni risolve i link alla radice delle installazioni legacy.
Le copie dereferenziano soltanto link figli interni alla risorsa, rifiutando
cicli e riferimenti esterni. Chiavi di skills/agents e array degli hash sono ordinati.

## Agent Codex e passaggio ai plugin

`smol-toml` genera `name`, `description` senza blocchi `<example>` e
`developer_instructions`. I campi Claude `model`, `color`, `memory` sono scartati.
Il lettore del frontmatter supporta scalari semplici, quotati e blocchi `>`/`|` per
nome e descrizione; il corpo delle istruzioni non viene reinterpretato.

Il rilevamento legge `enabledPlugins` nei settings Claude e
`[plugins."nome@marketplace"].enabled` nel config TOML Codex. Per `project` applica
anche settings e settings.local del progetto; un plugin locale non elimina le copie
globali o quelle di altri progetti. Formati di riferimento:
[settings Claude](https://code.claude.com/docs/en/settings) e
[configurazione plugin Codex](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo).

I cataloghi generati `.claude-plugin/marketplace.json` e
`.agents/plugins/marketplace.json` usano un plugin per risorsa:
`nome-skill@cleverops-public` oppure `nome-skill@cleverops-internal`, identificatori
già riconosciuti dall'adattatore anche senza catalogo disponibile. Per compatibilità
restano riconosciuti i bundle `cleverops-public`/`cleverops-internal` (oppure
`cleverops` nel catalogo); i nuovi cataloghi non li generano.
Non si deduce un'abilitazione dalla sola presenza della cache del plugin.

Dopo aver aggiunto il marketplace **e installato/abilitato il plugin**, eseguire
`sync`: le sole installazioni registrate per quel canale vengono rimosse (modificate
in backup), poi l'harness viene saltato. Anche install riconcilia il canale e rifiuta
nuove copie coperte da un plugin attivo. Per tornare ai file, disabilitare il plugin
prima di installare. I test coprono entrambi i passaggi con configurazioni sintetiche;
la [guida marketplace](marketplace.md) documenta installazione, aggiornamenti e
collaudo nei client. Il target `codex` legge il config utente, non quello del
progetto. Gli agent Codex restano sul canale file: nei riferimenti disponibili
non è documentato un formato per includerli nei plugin.

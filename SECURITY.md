# Sicurezza

Per segnalare una vulnerabilità usa [la segnalazione privata di GitHub](https://github.com/Cleversoft-IT/cleverOps-public/security/advisories/new).
Se non disponibile, contatta i maintainer tramite un canale privato già concordato.
Indica versione o commit, impatto e passi minimi per riprodurre il problema; non
inserire segreti o dati riservati in issue, PR, log o allegati pubblici.

Una pubblicazione accidentale di dati riservati è un incidente:

1. Avvisa subito i maintainer in privato, indicando le revisioni coinvolte senza
   ricopiare i dati. Interrompi ulteriori pubblicazioni e conserva le informazioni
   necessarie all'analisi in uno spazio privato.
2. Revoca e ruota subito eventuali credenziali esposte; valuta contenuti, accessi
   e possibili conseguenze. Considera i dati già diffusi.
3. Concorda la rimozione di branch, artifact e deployment coinvolti e contatta
   GitHub Support per le ref e le viste in cache. Cancellare un branch o correggere
   l'ultimo commit non ritira copie, cache o commit ancora raggiungibili.
4. Verifica la bonifica e i controlli di prevenzione prima di riprendere i rilasci.

Le guardie `provenance`, `public-guard` e `gitleaks` restano obbligatorie. Le PR da
fork seguono la procedura sostitutiva descritta nel [README](README.md).

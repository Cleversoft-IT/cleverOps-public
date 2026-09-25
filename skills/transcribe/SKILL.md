---
name: transcribe
description: Trascrive file audio (mp3, wav, m4a, mp4...) in testo con Whisper locale, ripulendo e formattando il risultato in paragrafi leggibili. Usa quando l'utente vuole trascrivere un file audio, una registrazione vocale o una call con un cliente.
argument-hint: <percorso-file-audio> [--format md] [--timestamps]
allowed-tools: Bash, Read, Write
---

# Transcribe

Trascrive un file audio in testo usando Whisper in locale e ne restituisce
una versione **già ripulita e impaginata** (paragrafi, punteggiatura
normalizzata, filler rimossi), non un blob di testo grezzo.

## Quando usarla

- "trascrivi questa registrazione / questa call / questo vocale"
- conversione di un mp3/m4a/mp4 in appunti testuali
- preparazione di un verbale o di una sintesi a partire da un audio

## Come eseguire

Lo script vive in `scripts/transcribe.py` dentro questa skill e gira con
l'interprete dedicato `~/.whisper-env/bin/python` (Whisper preinstallato).

1. Verifica che il file in `$ARGUMENTS` esista.
2. Esegui (sostituisci `<SKILL_DIR>` con la cartella di questa skill, es.
   `~/.claude/skills/transcribe` o `~/.codex/skills/transcribe`):

   ```bash
   ~/.whisper-env/bin/python "<SKILL_DIR>/scripts/transcribe.py" "$ARGUMENTS"
   ```

3. Mostra all'utente il percorso del file generato e un'anteprima delle
   prime righe.

## Opzioni utili

| Opzione | Effetto |
|---|---|
| `--format md` | output Markdown con intestazione (file, modello, durata) |
| `--timestamps` | prefissa ogni paragrafo con `[mm:ss]` |
| `--model turbo` | **consigliato**: qualità quasi-`large` ma leggero (alias di `large-v3-turbo`), niente download da 2.88 GB |
| `--model MODELLO` | `tiny`/`base`/`small`/`medium`/`large`/`large-v2`/`large-v3`/`turbo`. Default `medium`. `large` è il più accurato ma pesante (download ~2.88 GB) |
| `--list-models` | elenca i modelli disponibili segnando quali sono già in cache, ed esce |
| `--language en` | lingua diversa dall'italiano (default `it`) |
| `--raw` | testo grezzo Whisper senza pulizia/segmentazione |
| `--output PATH` | percorso file di output personalizzato |
| `--device cuda` | forza la GPU (errore se non disponibile, niente fallback su CPU) |
| `--device cpu` | forza la CPU |

**Scelta del modello:** se non sai quale usare, parti da `turbo` — è quasi
alla pari di `large` in qualità ma molto più leggero da scaricare e veloce.
Usa `large`/`large-v3` solo se serve la massima accuratezza e sei disposto al
download grande. Controlla cosa è già pronto in locale con `--list-models`.

Lo `stdout` dello script è **solo il path** del file prodotto (i messaggi
di avanzamento vanno su stderr), così è componibile in pipeline.

Di default (`--device auto`) lo script usa la GPU NVIDIA se disponibile,
altrimenti la CPU, e **stampa sempre su stderr il device scelto** prima di
iniziare — così si verifica a colpo d'occhio se sta girando su GPU.

## Note

- Formati audio/video supportati: tutto ciò che `ffmpeg` sa decodificare
  (mp3, wav, m4a, ogg, mp4, mov...).
- La pulizia è **conservativa**: rimuove spazi doppi, filler isolati
  ("ehm", "uhm"...), ripetizioni immediate e sistema la punteggiatura,
  senza riscrivere o riassumere il contenuto. Per una sintesi, trascrivi
  e poi chiedi esplicitamente un riassunto.
- Per call con più interlocutori Whisper non separa gli speaker: se serve
  la diarizzazione, segnalalo all'utente (richiede un tool dedicato).
- **Download dei modelli protetto da timeout/anti-stallo:** se il modello
  richiesto non è già nella cache (`~/.cache/whisper`, rispettando
  `XDG_CACHE_HOME`) lo script lo scarica con timeout di connessione e un
  watchdog che aborta se la connessione si pianta o resta troppo lenta
  (sotto ~50 KiB/s per oltre 30s, o nessun dato per 30s). Così un download
  lento non lascia più il processo appeso per ore. Il file viene scritto su
  `.part` e rinominato solo a download completo e verificato (SHA256).
- Se il download fallisce, lo script **non** ripiega silenziosamente su un
  altro modello: esce con un errore che elenca i modelli già in cache e ne
  suggerisce uno (es. `--model turbo`). Usa `--list-models` per vedere cosa è
  già scaricato prima di lanciare una trascrizione lunga.

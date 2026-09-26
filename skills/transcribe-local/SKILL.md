---
name: transcribe-local
description: "Trascrizione offline/locale di file audio (mp3, wav, m4a, mp4...) con Whisper, senza servizi esterni né chiavi API — ripulendo e formattando il risultato in paragrafi leggibili. Usa quando l'utente vuole trascrivere un audio generico, una nota vocale o un video: per le riunioni del team, se disponibile, usa invece transcribe-pro."
---

# Transcribe Local

Trascrive un file audio in testo **in locale** con Whisper — nessun upload,
nessun servizio esterno, nessuna chiave API — e ne restituisce una versione
**già ripulita e impaginata** (paragrafi, punteggiatura normalizzata, filler
rimossi), non un blob di testo grezzo.

## Quando usarla

- "trascrivi questa registrazione / questo vocale / questo video"
- conversione di un mp3/m4a/mp4 in appunti testuali
- audio generici (note vocali, appunti, contenuti non aziendali) da
  trascrivere offline, senza mandare nulla a servizi esterni

Per le **riunioni del team**, se hai accesso alla skill privata, usa
`transcribe-pro` invece di questa: è pensata per quel caso d'uso e non è
inclusa in questo repository pubblico.

## Setup dell'ambiente (una tantum)

Whisper richiede un ambiente Python dedicato (pesante: PyTorch + i pesi del
modello) e `ffmpeg` di sistema per decodificare l'audio. Non fa parte
dell'installazione della skill: va creato una volta sola, prima del primo
utilizzo.

```bash
# 1. ffmpeg di sistema (richiesto da Whisper per decodificare l'audio)
#    Fedora/RHEL:   sudo dnf install ffmpeg-free   (repo ufficiali; copre i
#                   formati comuni: mp3/wav/m4a/mp4). Per il pacchetto
#                   ffmpeg completo con tutti i codec, abilita RPM Fusion e
#                   installa "ffmpeg" al suo posto.
#    Debian/Ubuntu: sudo apt install ffmpeg
#    macOS (brew):  brew install ffmpeg

# 2. Ambiente Python dedicato (default: ~/.whisper-env)
python3 -m venv ~/.whisper-env
source ~/.whisper-env/bin/activate

# 3. PyTorch — scegli UNA delle due righe seguenti
pip install torch --index-url https://download.pytorch.org/whl/cpu   # solo CPU
# pip install torch                                                  # build di default (include supporto CUDA su GPU NVIDIA)

# 4. Whisper
pip install -U openai-whisper

deactivate
```

Se preferisci un percorso diverso da `~/.whisper-env`, crea l'ambiente dove
vuoi e imposta `TRANSCRIBE_LOCAL_PYTHON` di conseguenza (vedi sotto).

## Interprete Python

Lo script gira con l'interprete dell'ambiente dedicato creato sopra. Il
percorso è configurabile con la variabile d'ambiente
`TRANSCRIBE_LOCAL_PYTHON`; se non è impostata, il default è
`~/.whisper-env/bin/python`.

## Come eseguire

Lo script vive in `scripts/transcribe.py`, **dentro la directory base di
questa skill** — quella comunicata al caricamento (es. "Base directory for
this skill: ...", valida sia in Claude Code sia in Codex sia da
installazione come plugin marketplace). Non assumere un percorso fisso:
usa quel valore così come viene fornito.

1. Verifica che il file audio indicato dall'utente esista.
2. Esegui, sostituendo `SKILL_BASE_DIR` con la directory base indicata al
   caricamento di questa skill e `AUDIO_PATH` con il percorso del file da
   trascrivere (più eventuali opzioni, vedi sotto):

   ```bash
   PY="${TRANSCRIBE_LOCAL_PYTHON:-$HOME/.whisper-env/bin/python}"
   "$PY" "$SKILL_BASE_DIR/scripts/transcribe.py" "AUDIO_PATH"
   ```

3. Mostra all'utente il percorso del file generato e un'anteprima delle
   prime righe.

## Opzioni utili

| Opzione | Effetto |
|---|---|
| `--format md` | output Markdown con intestazione (file, modello, durata) |
| `--timestamps` | prefissa ogni paragrafo con `[mm:ss]` |
| `--model turbo` | **default**: qualità quasi-`large` ma leggero (alias di `large-v3-turbo`), niente download da 2.88 GB |
| `--model MODELLO` | `tiny`/`base`/`small`/`medium`/`large`/`large-v2`/`large-v3`/`turbo` |
| `--list-models` | elenca i modelli disponibili segnando quali sono già in cache, ed esce |
| `--language en` | lingua diversa dall'italiano (default `it`) |
| `--raw` | testo grezzo Whisper senza pulizia/segmentazione |
| `--output PATH` | percorso file di output personalizzato |
| `--device cuda` | forza la GPU (errore se non disponibile, niente fallback su CPU) |
| `--device cpu` | forza la CPU |

**Scelta del modello:** se non sai quale usare, resta sul default `turbo` —
è quasi alla pari di `large` in qualità ma molto più leggero da scaricare e
veloce. Usa `large`/`large-v3` solo se serve la massima accuratezza e sei
disposto al download grande. Controlla cosa è già pronto in locale con
`--list-models`.

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
- Per audio con più interlocutori Whisper non separa gli speaker: se serve
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

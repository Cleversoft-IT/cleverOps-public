#!/usr/bin/env python3
"""Trascrizione audio con Whisper locale + pulizia leggera del testo.

Trasforma un file audio (mp3, wav, m4a, mp4, ...) in un .txt o .md
leggibile: il testo grezzo di Whisper viene segmentato in paragrafi,
ripulito da spazi e filler comuni e con la punteggiatura normalizzata.

Uso:
    python transcribe.py <file-audio> [opzioni]

Opzioni:
    --model    MODELLO   Modello Whisper. Default: medium.
                         Disponibili: tiny|base|small|medium|large|large-v2|
                         large-v3|turbo (alias di large-v3-turbo). Usa
                         --list-models per vedere quali sono già in cache.
    --language LINGUA    Codice lingua ISO (it, en, ...). Default: it
    --format   FORMATO   txt | md. Default: txt
    --output   PATH      Percorso file di output (default: stesso nome dell'audio)
    --device   DEVICE    auto | cuda | cpu. Default: auto (usa la GPU se disponibile)
    --raw                Salva il testo grezzo senza pulizia/segmentazione
    --timestamps         Aggiunge i timestamp [mm:ss] a inizio di ogni paragrafo
    --list-models        Elenca i modelli disponibili (segnando quelli in cache) ed esce

Il device usato viene sempre stampato prima di iniziare. Con --device cuda lo
script si interrompe se la GPU non è disponibile (niente fallback silenzioso su CPU).

Download protetto dei modelli: se il modello richiesto non è già nella cache
(~/.cache/whisper, rispettando XDG_CACHE_HOME) viene scaricato con timeout e
watchdog anti-stallo. Se la connessione si pianta o resta troppo lenta il
download viene abortito con un errore chiaro invece di restare appeso per ore;
in tal caso lo script suggerisce un modello già presente in cache. Non c'è mai
un fallback silenzioso a un modello diverso da quello richiesto.
"""

import argparse
import hashlib
import os
import re
import sys
import time
import urllib.request

# Filler/intercalari italiani da rimuovere quando isolati (pulizia conservativa)
FILLERS = {
    "ehm", "ehmm", "uhm", "uhmm", "mmh", "mmm", "eh", "ah", "boh",
    "cioè cioè", "tipo tipo",
}

# Soglia (secondi) di pausa tra due segmenti oltre la quale si apre un paragrafo
PARAGRAPH_GAP = 2.0
# Lunghezza massima (caratteri) di un paragrafo prima di forzare l'a capo
PARAGRAPH_MAX_CHARS = 600


def resolve_device(requested: str) -> str:
    """Risolve e verifica il device, esplicitandolo prima dello start.

    requested: "auto" | "cuda" | "cpu".
    - "auto": usa cuda se disponibile, altrimenti cpu (con avviso).
    - "cuda": fallisce se non c'è una GPU CUDA (niente fallback silenzioso).
    - "cpu": forza la CPU.
    """
    try:
        import torch
    except ImportError:
        sys.exit("Errore: 'torch' non disponibile. Usa l'env ~/.whisper-env")

    has_cuda = torch.cuda.is_available()

    if requested == "cuda" and not has_cuda:
        sys.exit("Errore: --device cuda richiesto ma nessuna GPU CUDA disponibile.")

    if requested == "cpu":
        device = "cpu"
    elif requested == "cuda" or (requested == "auto" and has_cuda):
        device = "cuda"
    else:
        device = "cpu"

    if device == "cuda":
        print(f"✓ GPU: {torch.cuda.get_device_name(0)} → uso CUDA", file=sys.stderr)
    else:
        print("⚠ Uso la CPU (più lento). GPU CUDA non disponibile o non richiesta.", file=sys.stderr)
    return device


def default_download_root() -> str:
    """Cartella cache modelli Whisper, rispettando XDG_CACHE_HOME.

    Replica la logica di whisper.load_model(download_root=...): la default è
    $XDG_CACHE_HOME/whisper oppure ~/.cache/whisper.
    """
    xdg = os.getenv("XDG_CACHE_HOME")
    base = xdg if xdg else os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(base, "whisper")


def model_cache_path(model_name: str, download_root: str):
    """Restituisce (url, expected_sha256, dst_path) per un modello noto.

    Il file dst è dove Whisper si aspetta di trovarlo in cache. Per i modelli
    noti l'URL è in whisper._MODELS e contiene lo SHA256 atteso nel path
    (subito dopo l'ultimo '/'), come nella _download() originale di Whisper.
    Ritorna None se il modello non è un modello noto di Whisper.
    """
    import whisper

    models = getattr(whisper, "_MODELS", {})
    if model_name not in models:
        return None
    url = models[model_name]
    # whisper._download: lo SHA256 è il penultimo segmento dell'URL, il nome
    # file è l'ultimo segmento.
    expected_sha256 = url.split("/")[-2]
    dst = os.path.join(download_root, os.path.basename(url))
    return url, expected_sha256, dst


def model_in_cache(model_name: str, download_root: str) -> bool:
    """True se il modello noto è già presente e integro in cache.

    Verifica anche lo SHA256: un file presente ma corrotto/parziale non conta
    come "in cache" (Whisper lo riscaricherebbe comunque).
    """
    info = model_cache_path(model_name, download_root)
    if info is None:
        return False
    _, expected_sha256, dst = info
    if not os.path.isfile(dst):
        return False
    try:
        with open(dst, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return False
    return digest == expected_sha256


def cached_models(download_root: str):
    """Lista dei modelli noti di Whisper già presenti (integri) in cache."""
    import whisper

    return [m for m in whisper.available_models() if model_in_cache(m, download_root)]


def download_model_with_watchdog(
    url: str,
    dst: str,
    expected_sha256: str,
    *,
    connect_timeout: float = 30.0,
    stall_timeout: float = 30.0,
    min_speed_kib: float = 50.0,
    min_speed_window: float = 30.0,
    chunk_size: int = 1 << 20,
):
    """Scarica un modello con timeout e rilevamento di stallo.

    Scrive su <dst>.part e fa rename atomico solo a download completato e
    verificato (SHA256). Aborta — sollevando RuntimeError e rimuovendo il
    .part — se:
      - non arrivano dati per più di `stall_timeout` secondi, oppure
      - la velocità media resta sotto `min_speed_kib` KiB/s per più di
        `min_speed_window` secondi.

    Mostra l'avanzamento (MB scaricati / totali, velocità) su STDERR.
    """
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    tmp = dst + ".part"
    if os.path.exists(tmp):
        try:
            os.remove(tmp)
        except OSError:
            pass

    min_speed_bps = min_speed_kib * 1024.0

    try:
        resp = urllib.request.urlopen(url, timeout=connect_timeout)
    except Exception as e:
        raise RuntimeError(f"impossibile aprire la connessione ({e})") from e

    try:
        total = int(resp.headers.get("Content-Length", 0)) or 0
    except (TypeError, ValueError):
        total = 0

    downloaded = 0
    start_time = time.monotonic()
    last_data_time = start_time
    # Finestra per la velocità media minima: traccia un punto di riferimento e
    # lo aggiorna solo quando la velocità torna accettabile.
    slow_since = None
    last_print = 0.0

    try:
        with open(tmp, "wb") as out:
            while True:
                t0 = time.monotonic()
                try:
                    chunk = resp.read(chunk_size)
                except Exception as e:
                    raise RuntimeError(f"errore di lettura dal server ({e})") from e
                now = time.monotonic()

                if not chunk:
                    break

                out.write(chunk)
                downloaded += len(chunk)
                last_data_time = now

                # Stallo: nessun dato per troppo tempo (read che impiega troppo).
                if now - t0 > stall_timeout:
                    raise RuntimeError(
                        f"nessun dato per oltre {stall_timeout:.0f}s (connessione bloccata)"
                    )

                # Velocità media minima sostenuta.
                elapsed = now - start_time
                avg_bps = downloaded / elapsed if elapsed > 0 else 0
                if avg_bps < min_speed_bps and elapsed > 5:
                    if slow_since is None:
                        slow_since = now
                    elif now - slow_since > min_speed_window:
                        raise RuntimeError(
                            f"velocità media troppo bassa "
                            f"({avg_bps / 1024:.1f} KiB/s < {min_speed_kib:.0f} KiB/s) "
                            f"per oltre {min_speed_window:.0f}s"
                        )
                else:
                    slow_since = None

                # Avanzamento su stderr, throttle ~1/s.
                if now - last_print >= 1.0:
                    last_print = now
                    mb = downloaded / (1024 * 1024)
                    speed = (avg_bps / 1024) if avg_bps else 0
                    if total:
                        tot_mb = total / (1024 * 1024)
                        pct = downloaded * 100 / total
                        print(
                            f"\r  download modello: {mb:6.1f}/{tot_mb:.1f} MB "
                            f"({pct:3.0f}%)  {speed:6.0f} KiB/s   ",
                            end="",
                            file=sys.stderr,
                            flush=True,
                        )
                    else:
                        print(
                            f"\r  download modello: {mb:6.1f} MB  {speed:6.0f} KiB/s   ",
                            end="",
                            file=sys.stderr,
                            flush=True,
                        )

        print("", file=sys.stderr)  # newline dopo la barra

        # Verifica integrità.
        with open(tmp, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        if digest != expected_sha256:
            raise RuntimeError(
                f"SHA256 non corrispondente (atteso {expected_sha256[:12]}…, "
                f"ottenuto {digest[:12]}…): download corrotto"
            )

        os.replace(tmp, dst)  # rename atomico
    except BaseException:
        # Pulisci sempre il .part su qualunque fallimento (incluso KeyboardInterrupt).
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
        raise
    finally:
        try:
            resp.close()
        except Exception:
            pass


def ensure_model_available(model_name: str, download_root: str):
    """Garantisce che il modello richiesto sia in cache prima di caricarlo.

    Se è un modello noto di Whisper non ancora in cache, lo scarica con
    download_model_with_watchdog. Se il download fallisce, esce con un
    messaggio chiaro che elenca i modelli già in cache e ne suggerisce uno —
    senza fallback silenzioso a un modello diverso da quello richiesto.

    Se il nome non è un modello noto di Whisper non fa nulla qui: la
    validazione del nome avviene a monte in main().
    """
    info = model_cache_path(model_name, download_root)
    if info is None:
        return  # non è un modello noto: lascia decidere a whisper/validazione
    url, expected_sha256, dst = info
    if model_in_cache(model_name, download_root):
        return

    print(
        f"Modello '{model_name}' non in cache: download protetto da {url}",
        file=sys.stderr,
    )
    try:
        download_model_with_watchdog(url, dst, expected_sha256)
    except BaseException as e:
        in_cache = cached_models(download_root)
        lines = [
            "",
            f"Errore: download del modello '{model_name}' fallito: {e}",
            "",
        ]
        if in_cache:
            suggestion = "turbo" if "turbo" in in_cache else in_cache[0]
            lines.append("Modelli già presenti in cache (nessun download necessario):")
            for m in in_cache:
                lines.append(f"  - {m}")
            lines.append("")
            lines.append(
                f"Suggerimento: riprova con un modello già in cache, es. "
                f"--model {suggestion}"
            )
        else:
            lines.append(
                "Nessun modello presente in cache. Verifica la connessione e riprova, "
                "oppure scarica manualmente un modello più leggero (es. --model turbo)."
            )
        sys.exit("\n".join(lines))


def print_models_list(download_root: str):
    """Stampa i modelli disponibili segnando quelli già in cache."""
    import whisper

    print("Modelli Whisper disponibili (✓ = già in cache):")
    for m in whisper.available_models():
        mark = "✓" if model_in_cache(m, download_root) else " "
        print(f"  [{mark}] {m}")
    print(f"\nCache: {download_root}")


def install_audio_progress_bar():
    """Rende leggibile la barra di avanzamento di Whisper.

    Whisper mostra di default una barra tqdm che conta i *frame* del mel
    spectrogram (poco parlanti). Questo aggancio la riformatta per mostrare
    i **secondi di audio** processati sul totale, con percentuale ed ETA:

        Trascrizione |█████████-------| 52%  2070/3981s audio [02:23<02:12]

    Difensivo: se l'aggancio non riesce (versione di Whisper diversa), la
    trascrizione prosegue con la barra nativa.
    """
    try:
        import tqdm as _tqdm_mod
        import whisper.transcribe as _wt
        from whisper.audio import HOP_LENGTH, SAMPLE_RATE

        factor = HOP_LENGTH / SAMPLE_RATE  # frame del mel -> secondi di audio
        _BaseTqdm = _tqdm_mod.tqdm

        class _AudioTqdm(_BaseTqdm):
            def __init__(self, *a, **k):
                if k.get("total"):
                    k["total"] = k["total"] * factor
                k["bar_format"] = (
                    "Trascrizione |{bar}| {percentage:3.0f}%  "
                    "{n:.0f}/{total:.0f}s audio [{elapsed}<{remaining}]"
                )
                super().__init__(*a, **k)

            def update(self, n=1):
                return super().update(n * factor)

        _wt.tqdm.tqdm = _AudioTqdm
    except Exception:
        pass  # fallback silenzioso: resta la barra nativa in frame


def fmt_ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def clean_text(text: str) -> str:
    """Pulizia leggera: spazi, punteggiatura, filler, maiuscole."""
    t = text.strip()
    # normalizza spazi multipli
    t = re.sub(r"\s+", " ", t)
    # niente spazio prima della punteggiatura, uno spazio dopo
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"([,.;:!?])(?=[^\s\d])", r"\1 ", t)
    # rimuovi filler isolati
    for filler in sorted(FILLERS, key=len, reverse=True):
        t = re.sub(rf"(?<!\w){re.escape(filler)}(?!\w)[,.]?\s*", "", t, flags=re.IGNORECASE)
    # rimuovi ripetizioni immediate della stessa parola ("la la", "che che")
    t = re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    # maiuscola a inizio frase
    t = re.sub(r"(^|[.!?]\s+)([a-zà-ù])", lambda m: m.group(1) + m.group(2).upper(), t)
    return t


def segments_to_paragraphs(segments, with_timestamps: bool):
    """Raggruppa i segmenti Whisper in paragrafi su pause e lunghezza."""
    paragraphs = []
    buf, buf_start, prev_end = [], None, None
    for seg in segments:
        start, end, text = seg["start"], seg["end"], seg["text"].strip()
        if not text:
            continue
        if buf_start is None:
            buf_start = start
        gap = (start - prev_end) if prev_end is not None else 0
        cur_len = sum(len(x) for x in buf)
        if buf and (gap > PARAGRAPH_GAP or cur_len > PARAGRAPH_MAX_CHARS):
            paragraphs.append((buf_start, " ".join(buf)))
            buf, buf_start = [], start
        buf.append(text)
        prev_end = end
    if buf:
        paragraphs.append((buf_start, " ".join(buf)))

    out = []
    for start, raw in paragraphs:
        clean = clean_text(raw)
        if not clean:
            continue
        if with_timestamps:
            out.append(f"[{fmt_ts(start)}] {clean}")
        else:
            out.append(clean)
    return out


def main():
    ap = argparse.ArgumentParser(description="Trascrizione audio con Whisper + pulizia")
    ap.add_argument("audio", nargs="?", help="file audio da trascrivere")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--language", default="it")
    ap.add_argument("--format", default="txt", choices=["txt", "md"])
    ap.add_argument("--output")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--raw", action="store_true")
    ap.add_argument("--timestamps", action="store_true")
    ap.add_argument(
        "--list-models",
        action="store_true",
        help="elenca i modelli disponibili (segnando quelli in cache) ed esce",
    )
    args = ap.parse_args()

    try:
        import whisper
    except ImportError:
        sys.exit("Errore: modulo 'whisper' non disponibile. Usa l'env ~/.whisper-env")

    download_root = default_download_root()

    if args.list_models:
        print_models_list(download_root)
        return

    if not args.audio:
        sys.exit("Errore: specificare un file audio da trascrivere (oppure usa --list-models).")

    if not os.path.exists(args.audio):
        sys.exit(f"Errore: file non trovato: {args.audio}")

    # Valida il nome del modello: accetta qualsiasi nome ma se non è un modello
    # noto di Whisper dà un messaggio utile (niente choices rigide).
    available = whisper.available_models()
    if args.model not in available:
        sys.exit(
            f"Errore: modello '{args.model}' non riconosciuto.\n"
            f"Modelli disponibili: {', '.join(available)}\n"
            f"Usa --list-models per vedere quali sono già in cache."
        )

    device = resolve_device(args.device)

    base = os.path.splitext(args.audio)[0]
    out_path = args.output or f"{base}.{args.format}"

    # Garantisce la presenza del modello in cache con download protetto da
    # timeout/watchdog (evita il download infinito di Whisper su rete lenta).
    ensure_model_available(args.model, download_root)

    print(f"Caricamento modello Whisper '{args.model}' su {device}...", file=sys.stderr)
    model = whisper.load_model(args.model, device=device, download_root=download_root)
    print(f"Trascrizione in corso: {args.audio}", file=sys.stderr)
    install_audio_progress_bar()
    # fp16 solo su GPU; su CPU va disattivato per evitare il warning di Whisper.
    result = model.transcribe(
        args.audio, language=args.language, verbose=False, fp16=(device == "cuda")
    )

    if args.raw:
        body = result["text"].strip()
    else:
        paragraphs = segments_to_paragraphs(result.get("segments", []), args.timestamps)
        body = "\n\n".join(paragraphs) if paragraphs else clean_text(result["text"])

    if args.format == "md":
        title = os.path.basename(base).replace("_", " ").replace("-", " ").strip().capitalize()
        duration = result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0
        header = (
            f"# Trascrizione — {title}\n\n"
            f"- **File:** `{os.path.basename(args.audio)}`\n"
            f"- **Modello:** Whisper `{args.model}` · **Lingua:** {args.language}\n"
            f"- **Durata:** {fmt_ts(duration)}\n\n---\n\n"
        )
        body = header + body

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(body + "\n")

    print(f"\n✓ Trascrizione salvata: {out_path}", file=sys.stderr)
    preview = body[:500]
    print(f"\nAnteprima:\n{'-' * 40}\n{preview}{'...' if len(body) > 500 else ''}", file=sys.stderr)
    # stdout = solo il path, così è componibile in pipeline
    print(out_path)


if __name__ == "__main__":
    main()

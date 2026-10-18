# Phase 0 spike: Deepgram filler words (partial)

Date: 2026-10-18. Raw clips and responses are in the git-ignored `spike/` folder; this file is the record.

## What ran

`python spike/run_matrix.py` against one synthetic clip, `tts-raw.wav` (Windows SAPI text-to-speech, 10.05 s, 16-bit WAV). The script said "um" twice and "uh" twice.

| Model | `smart_format` | Fillers returned | Turnaround |
|---|---|---|---|
| nova-3 | on | uh ×2, um ×1 | 2.3 s |
| nova-3 | off | uh ×2, um ×1 | 2.6 s |
| nova-2 | on | um ×2, uh ×2 | 2.2 s |
| nova-2 | off | um ×2, uh ×2 | 2.3 s |

- `filler_words=true` keeps fillers with both models, with or without `smart_format`.
- `mip_opt_out=true` is accepted (200).
- Decision rule winner (provisional): **nova-3, `smart_format=true`, `filler_words=true`, `language=en`**.

## Response shape

`metadata.duration` (seconds), and `results.channels[0].alternatives[0]` with `transcript`, `confidence`, `words[]` (`word`, `start`, `end`, `confidence`, `punctuated_word`) and `paragraphs`. With `smart_format`, `transcript` is punctuated and capitalised; `words[].word` stays lower-case.

## Not done yet

- Real browser recordings (Chrome, processing on vs. off), so browser mimeTypes, `getUserMedia` constraint support and filler retention on real speech are **not verified**.
- The ~10-minute turnaround measurement.
- `mip_opt_out` pricing.

These need the user's voice: record at `http://127.0.0.1:8765/` (`python spike/server.py`), then re-run `python spike/run_matrix.py` and update this file. If nova-3 misses fillers on real speech while nova-2 keeps them, switch `DEEPGRAM_MODEL` in `backend/app/config.py`.

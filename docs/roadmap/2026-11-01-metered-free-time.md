# Roadmap: free time by the minute, and a server-side length check

Date: 2026-11-01 · Status: approved 2026-11-01 ("do whatever you feel good"); built, ready to ship

## Goal

1. **The free trial becomes 90 minutes** (3 × 30 min) of time, not 3 transcriptions of any length. Every transcription deducts exactly the seconds spoken: free minutes first, then paid time. Paid packs (₹49 = 60 min, ₹199 = 300 min) work the same way.
2. **Close the open tap.** Before calling Deepgram, the server measures the recording itself and refuses, with no Deepgram call:
   - audio it can't read;
   - recordings over **10 minutes** (the app's recording limit);
   - recordings longer than the time left.

   Today "1 second of paid time left + a 25 MB upload" (1–2 hours) costs the user 1 second and costs you the whole Deepgram call, and each free account gets 3 transcriptions of any length.
3. Unchanged: only transcripts are saved (OCI bucket), never audio; a transcript with no words is free.

Done when:
- a 1-minute take deducts 60 s from the free minutes, or from paid time once the free minutes are gone;
- the three refusals happen before Deepgram is called (tests prove Deepgram wasn't called);
- existing users' remaining free transcriptions became 30 minutes each;
- every screen and policy says "90 free minutes";
- all tests pass, including CI's contract fuzzing.

## Decisions (owner delegated them, 2026-11-01)

| Question | Decision | Why |
|---|---|---|
| Longest single recording | **10 minutes** (the app's existing limit) | Caps the worst case per transcription; the UI already stops at 10:00 |
| Existing users' free transcriptions | each remaining one becomes **30 minutes** | Fair, and matches the new trial (3 left = 90 min) |
| How the length is measured | **PyAV 19.0.2** reading packet timestamps (no decoding) | Works for webm (Chrome writes no duration header), ogg, mp4, wav and mp3; 3–20 ms per file on the server (tested 2026-11-01); a pip wheel, no system packages |
| What is charged | the **measured** seconds, rounded up | The same number the check used, so a check that passes can always be paid |
| When the length is measured | only on metered servers (billing on) | Local and e2e use (no payments) has nothing to protect |

## Phases

### Phase 1: Contract (S)
- `Account.free_transcriptions_left` is replaced by `free_seconds_left`.
- `createTranscription`:
  - 400 `unreadable_audio` and 400 `recording_too_long`, both refused before Deepgram;
  - 402 now explains how much time is left;
  - the description covers per-second charging, free first.
- Decisions-log line; regenerate the API client.

### Phase 2: Backend (M)
- `packs.py`: `FREE_SECONDS = 90 * 60` replaces `FREE_TRANSCRIPTIONS`; `MAX_RECORDING_SECONDS = 600`.
- `app/transcription/duration.py`: measure with PyAV. A test double for fake audio.
- Router order:
  1. content type;
  2. per-user lock and hourly cap;
  3. read the body;
  4. **measure** (400s);
  5. **balance ≥ length** (402);
  6. Deepgram;
  7. charge the measured seconds.
- Store: `Balance(free_seconds_left, seconds_left)`. `charge()` takes free seconds first, then paid, and sets `last_paid_use_at` only when paid time is used. Both stores; the MySQL one locks the row.
- Migration `0007`: adds `accounts.free_seconds_left` (new accounts 5400), filled with remaining free transcriptions × 1800. The old column stays (migrations only add) and is written as 0 for new accounts; it's dropped in a later release.
- `app/admin/move_user.py` moves free seconds.

### Phase 3: Frontend and copy (S–M)
- Practice time reads "1 h 30 min free" (and "+ 1 h" paid).
- The out-of-time logic uses free + paid seconds.
- The practice screen shows the server's 402 / 400 messages.
- The pricing page, FAQ, terms, refund policy ("free minutes don't count") and the Billing tab all say 90 free minutes.

### Phase 4: Ship
PR → `ci-passed` → merge → automatic deploy (migration 0007 runs on start) → smoke test. Then a live check: a new account shows 1 h 30 min free, and a short take deducts its exact length.

## Progress

<!-- One entry per finished phase: date, what was done, results. -->

- 2026-11-01: **Phases 1–3 done (not deployed).**
  - Contract:
    - `free_seconds_left` replaces the free-transcription count;
    - `unreadable_audio` and `recording_too_long` (400) are new;
    - the 402 explains how long the recording is and how much time is left.
  - Backend:
    - `duration.py` (PyAV 19.0.2) measures from packet timestamps;
    - the router measures, checks, calls Deepgram, then charges exactly;
    - `split_charge` takes free seconds first, in both stores; the MySQL charge locks the row;
    - migration 0007 converts each remaining free transcription to 1800 s; `move_user` moves free seconds.
  - Frontend:
    - "1 h 30 min free" labels, and seconds under a minute;
    - the out-of-time banner and the Billing tab use free + paid seconds;
    - the practice screen shows the 402 numbers and the new errors;
    - the pricing page, FAQ, terms, refund policy and meta description say 90 free minutes.
  - Tests:
    - backend 659 with MySQL and Redis, including every audio format, Chrome-style WebM without a duration header, the 3 refusals before Deepgram, exact free→paid charging and the migration conversion;
    - frontend 482, lint and build clean.


# umless: product requirements (v1)

Sources: `docs/design/` (approved 2026-10-19), `docs/roadmap/2026-10-18-umless-mvp.md`, decisions log in `docs/BUILD.md`.

## Problem

People rehearsing for interviews, presentations, oral exams or language practice can't easily hear their own verbal habits. Fillers ("um", "uh") and long pauses are hard to notice while speaking, and ordinary speech-to-text tools strip them out. umless records a spoken answer and returns a transcript that keeps the fillers, marks the pauses, and counts both, so the user can see how the answer went.

## Users

One person practising alone on their own computer (or phone browser pointed at their own machine). They bring their own questions. No coach, no sharing, no accounts.

## v1 scope

1. A question list the user builds and edits (stored on the local backend).
2. Recording a spoken answer to one question in the browser (up to 10 minutes).
3. Transcription through Deepgram nova-3 with filler words kept and pauses of 1 s or more shown as dots.
4. A summary: length, words per minute, per-filler counts, fillers per minute, long-pause count, longest pause.
5. Playback, and downloads of the audio and a `.txt` transcript, generated in the browser.
6. Desktop and mobile web layouts, light and dark mode.

## Non-goals (v1)

- Accounts, login, multiple users, sharing.
- A database, attempt history, or any server-side copy of recordings or transcripts (nothing about a take is stored on the server).
- Deployment, HTTPS, Docker, CI, multiple server workers.
- Streaming or live transcription, languages other than English.
- Scoring, AI feedback on content, or coaching.
- Fixing Chrome's missing WebM duration metadata (needs ffmpeg).

## Features and acceptance criteria

Screen IDs refer to `docs/design/screens.md`; flow and edge-case numbers to `docs/design/flows.md`.

### P1. Question list (F1, F2, `questions*`, `delete-confirm`)

- [ ] Opening `/` loads the questions from `GET /api/questions` and shows them in their stored order, oldest first, with the count ("3 questions").
- [ ] With no questions, `questions-empty` shows the intro and three suggestion chips; clicking a chip creates that question.
- [ ] While loading, skeleton rows show; after 10 s without a response, or on a network error, `questions-error` shows with Retry and the "How to start it" hint, and the New question field is disabled.
- [ ] Add is disabled while the trimmed field is empty.
- [ ] A question longer than 500 characters (counted in Unicode code points after trimming) can't be saved; the inline error names the current length. The counter appears from 450 characters.
- [ ] The server rejects text that is empty after trimming or longer than 500 characters with 422 `validation_error`, and stores the text trimmed.
- [ ] A question whose text matches an existing one (case-insensitive, whitespace-collapsed) shows the "You already have this question" warning with **Add anyway**; Add anyway saves it. The server accepts duplicates.
- [ ] A new question is appended at the end of the list and the field clears.
- [ ] If saving fails (network or 5xx), the typed text is kept and the inline save error shows.
- [ ] Editing a question inline saves with `PATCH /api/questions/{id}`; Enter saves, Esc cancels; the same validation applies. A 404 shows the toast "This question was deleted" and reloads the list.
- [ ] Deleting asks for confirmation; after `DELETE` succeeds the row disappears and a 5-second Undo toast shows. Undo re-creates the question with the same text at the same position (`POST` with `position`). The re-created question gets a new id.
- [ ] A delete that returns 404 is treated as already deleted; a network failure keeps the row and shows "Couldn't delete. Try again."
- [ ] Deleting the last question shows `questions-empty`.
- [ ] With more than 10 questions, a filter field narrows the list client-side (case-insensitive substring).
- [ ] Questions survive a backend restart.

### P2. Practice: record (F3, E1–E7, E15, E18, E23)

- [ ] `/practice/:id` loads the list with `GET /api/questions` and finds the question by id; an id not in the list shows `not-found`. The same read gives the "2 of 5" position and the next question.
- [ ] `practice-ready` shows the question, the tip, the privacy note and the "2 of 5" position.
- [ ] If `GET /api/health` fails on `practice-ready`, a banner says "Server offline; you can record but not transcribe", and recording still works.
- [ ] Browsers without `MediaRecorder` or a secure context show `practice-unsupported`.
- [ ] Mic permission denied shows `practice-denied`; no input device shows `practice-nomic`; Try again re-requests.
- [ ] While recording: timer, level meter, "● Recording · umless" tab title; Space and Stop stop it; a second Stop is ignored.
- [ ] From 9:00 the countdown shows; at 10:00 recording stops automatically with the "Stopped at the 10-minute limit" notice.
- [ ] A mic lost mid-recording keeps what was recorded and shows the warning on `practice-review`.
- [ ] An empty take shows `practice-empty` with only Record again.
- [ ] A flat level meter for 5 s shows the quiet-input hint.
- [ ] Cancel take and navigating away while recording show `leave-confirm-recording`.
- [ ] With reduced motion preferred, no pulsing or animated meter is shown.

### P3. Transcribe (F3.7–8, E8–E12)

- [ ] Transcribe sends the recording as the raw body of `POST /api/transcriptions` with the recorder's `Content-Type`; Transcribe is disabled until it returns.
- [ ] The server forwards the audio to Deepgram nova-3 with `filler_words=true`, `smart_format=true`, `language=en` and `mip_opt_out=true`, and stores nothing.
- [ ] Each error maps to its message on `practice-transcribe-error`: network → "Can't reach the umless server", 502 → "Transcription failed. Try again in a moment.", 503 → the DEEPGRAM_API_KEY message, 413 → the 25 MB message. 400 (empty audio) shows `practice-empty`. The recording is kept in all cases.
- [ ] A response with no words shows `result-empty`.
- [ ] Each pause of 1 s or more between two words appears as one dot per full second, in both `text` and the rendered transcript. Silence before the first word and after the last is not marked.

### P4. Result and summary (F4, E12–E14)

- [ ] The result shows the question, the summary, the transcript with fillers highlighted (amber and bold) and pause dots muted, and the player.
- [ ] Summary values come from the response's `summary`: length (`duration_seconds`), words per minute, each filler with its count ("um ×4, uh ×2"), fillers per minute, long-pause count and longest pause. Values the server returns as `null` are shown as "—".
- [ ] Fillers are the words Deepgram tags as fillers: um, uh, mhmm, mm-mm, uh-uh, uh-huh, nuh-uh. Three deliberate "um"s show as `um ×3`.
- [ ] Download transcript saves `<slug>-<yyyymmdd>-<hhmmss>.txt`: question, blank line, transcript text, blank line, summary line. A slug with no Latin letters or digits falls back to `practice-<date>-<time>`.
- [ ] Download audio saves the same base name with the recording's extension (`.webm`, `.ogg` or `.m4a`).
- [ ] Copy transcript shows "Copied"; a blocked clipboard shows "Select and copy the text instead".
- [ ] Practise again, Next question (hidden on the last question) and Back to questions work; leaving with nothing downloaded shows `leave-confirm`, and closing or refreshing the tab shows the browser's native prompt.
- [ ] A 10-minute transcript scrolls inside its card (max 60vh) with the summary still visible.

## Non-functional requirements

### Performance
- `GET /api/questions` responds in under 100 ms at the 95th percentile with 1,000 questions on a typical laptop.
- Question mutations persist to disk before the response returns.
- Transcription overhead added by the backend (excluding Deepgram) is under 200 ms for a 10-minute recording; the Deepgram call times out after 60 s.
- Request bodies over 25 MB are rejected with 413 without reading the rest of the body.

### Security and privacy
- The backend binds to `127.0.0.1` only and accepts only `localhost`/`127.0.0.1` Host headers (DNS-rebinding guard).
- No CORS headers are sent; the frontend reaches the API through the Vite proxy (same origin).
- Question writes require `Content-Type: application/json`, so a cross-site form post can't create or change questions.
- The Deepgram key lives only in the backend environment and never appears in responses or logs.
- Audio and transcripts are never written to disk on the server; Deepgram is called with `mip_opt_out=true`.
- Error responses never include stack traces, file paths or upstream response bodies.

### Accessibility
- WCAG 2.1 AA: text contrast ≥ 4.5:1 in both themes (verified in `docs/design/tokens.md`), colour never the only signal.
- Every action reachable by keyboard; visible focus ring; Space toggles recording on the practice screen.
- State changes (recording started/stopped, countdown at 1:00 and 0:10, transcribing, errors, toasts) are announced through `aria-live`.
- Touch targets at least 48 px; reduced motion respected.

### Browser support
- Target: current desktop Chrome and Edge. Firefox when installed. Safari best-effort.
- Mobile: current Chrome on Android at 375 px width and up.
- Requires a secure context (`localhost` counts).

## Screen action → API coverage

Every action in `docs/design/screens.md`, with the one operation it calls, or why it needs none. Each operation's `x-screen` in `docs/api/openapi.yaml` lists the same actions in reverse.

| Screen | Action | Operation |
|---|---|---|
| `questions`, `questions-loading` | (load) list questions | `listQuestions` |
| `questions-error` | retry loading questions | `listQuestions` |
| `questions`, `questions-empty` | create question | `createQuestion` |
| `questions-empty` | add suggested question | `createQuestion` |
| `questions-invalid` | fix and create question, add anyway, retry save | `createQuestion` (or `updateQuestion` when the error came from edit mode) |
| `questions` | edit question | client-only: switches the row to an inline field |
| `questions` | update question | `updateQuestion` |
| `questions` | delete question | client-only: opens `delete-confirm` |
| `delete-confirm` | delete question | `deleteQuestion` |
| `delete-confirm` | cancel | client-only: closes the dialog |
| `questions-deleted` | undo delete | `createQuestion` with `position` |
| `questions`, `questions-deleted` | start practice | `listQuestions` (practice route finds the question by id in the list) |
| `questions` | filter questions | client-only: filters the loaded list |
| `practice-ready` | (load) question, "2 of 5" | `listQuestions` |
| `practice-ready` | (load) health check | `getHealth` |
| `practice-ready` | start recording | client-only: `getUserMedia` + `MediaRecorder` |
| `practice-ready`, `practice-denied`, `practice-nomic`, `practice-unsupported`, `result`, `not-found` | back to questions | client-only: navigation; `questions` then calls `listQuestions` |
| `practice-permission` | allow / block | client-only: browser permission prompt |
| `practice-denied`, `practice-nomic` | retry microphone | client-only: re-requests `getUserMedia` |
| `practice-recording`, `practice-countdown` | stop recording | client-only: `MediaRecorder.stop()` |
| `practice-recording`, `practice-countdown` | cancel take | client-only: opens `leave-confirm-recording` |
| `practice-review` | transcribe recording | `createTranscription` |
| `practice-transcribe-error` | retry transcription | `createTranscription` |
| `practice-review`, `practice-empty`, `practice-transcribe-error` | record again | client-only: discards the take in memory |
| `practice-review`, `practice-transcribing`, `result` | play recording | client-only: `<audio>` with an object URL |
| `practice-review`, `practice-transcribe-error`, `result`, `result-empty`, `leave-confirm` | download audio | client-only: object URL download |
| `result` | download transcript | client-only: `.txt` built in the browser |
| `result` | copy transcript | client-only: Clipboard API |
| `result`, `result-empty` | practise again | client-only: same question snapshot, back to `practice-ready` |
| `result` | next question | `listQuestions` (next index in the list) |
| `leave-confirm` | leave, stay | client-only: navigation guard |
| `leave-confirm-recording` | keep recording, stop & review, discard | client-only: recorder control |

Every operation serves at least one action: `getHealth`, `listQuestions`, `createQuestion`, `updateQuestion`, `deleteQuestion`, `createTranscription`.

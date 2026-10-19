# umless: screens

Screen IDs match the anchors in `wireframes/index.html` and the steps in `flows.md`. States of one route are listed as separate rows because each needs its own design.

## Routes

| Route | Screen IDs |
|---|---|
| `/` | `questions`, `questions-empty`, `questions-loading`, `questions-error`, `questions-invalid`, `delete-confirm`, `questions-deleted` |
| `/practice/:questionId` | `practice-ready`, `practice-permission`, `practice-denied`, `practice-nomic`, `practice-unsupported`, `practice-recording`, `practice-countdown`, `practice-review`, `practice-empty`, `practice-transcribing`, `practice-transcribe-error`, `result`, `result-empty`, `leave-confirm`, `leave-confirm-recording` |
| `*` | `not-found` |

The result is a state of the practice route, not a route of its own. It lives only in memory in v1, so a URL to it would show nothing after a refresh.

## Screens

| Screen | Route | Purpose | Data shown | Actions | Flows |
|---|---|---|---|---|---|
| `questions` | `/` | Manage the question list and choose one to practise | questions (text, created date), count; filter field when more than 10 | create question, edit question, update question, delete question, start practice, filter questions | F1, F2, F3.1 |
| `questions-empty` | `/` | First visit: explain the app and get the first question in | one-line intro, three example questions as suggestion chips | create question, add suggested question | F1.1–2 |
| `questions-loading` | `/` | Wait for the list | 3 skeleton rows | none | F1 (loading) |
| `questions-error` | `/` | Backend unreachable | error message, how to start the server | retry loading questions | F1 (error), E8 |
| `questions-invalid` | `/` | Inline validation and save errors on the add or edit field | field error or warning, character counter | fix and create question, add anyway (duplicate), retry save | F1.5–7, F2.2 |
| `delete-confirm` | `/` (dialog) | Confirm a destructive action | question text | delete question, cancel | F2.3–5 |
| `questions-deleted` | `/` | The list just after a delete | the remaining questions, an "Undo" toast for 5 s | undo delete (re-create the question in place), start practice | F2.3 |
| `practice-ready` | `/practice/:id` | Get ready to answer | question, tip, privacy note, previous/next question position ("2 of 5") | start recording, back to questions | F3.1, F4.6–7 |
| `practice-permission` | `/practice/:id` | Explain the browser prompt | arrow hint toward the address bar | (browser prompt) allow / block | F3.2 |
| `practice-denied` | `/practice/:id` | Mic blocked | how to re-allow, per browser | retry microphone, back to questions | E1 |
| `practice-nomic` | `/practice/:id` | No input device | troubleshooting hint | retry microphone, back to questions | E2 |
| `practice-unsupported` | `/practice/:id` | Browser can't record | supported browsers | back to questions | E3 |
| `practice-recording` | `/practice/:id` | Recording in progress | timer, level meter, quiet-input hint (E6), question | stop recording, cancel take | F3.3, E6, E7, E18 |
| `practice-countdown` | `/practice/:id` | Final minute of the 10-minute cap | "Time left m:ss" in the warning colour | stop recording, cancel take | F3.4 |
| `practice-review` | `/practice/:id` | Check the take before transcribing | audio player and duration, auto-stop or mic-lost notice, not-saved reminder | transcribe recording, record again, download audio, play recording | F3.5–6, E4 |
| `practice-empty` | `/practice/:id` | Nothing was captured | explanation | record again | E5 |
| `practice-transcribing` | `/practice/:id` | Waiting for Deepgram | spinner, expected wait, player still usable | play recording (Transcribe disabled) | F3.7 |
| `practice-transcribe-error` | `/practice/:id` | Transcription failed; the recording is kept | error message for the specific cause (offline, 502, 503, 413) | retry transcription, download audio, record again | E8–E11 |
| `result` | `/practice/:id` | See how the answer went, and keep it | question, summary (duration, words per minute, filler counts, pause count and longest pause), transcript with highlights, audio player | play recording, download transcript, download audio, copy transcript, practise again, next question, back to questions | F4, E13 |
| `result-empty` | `/practice/:id` | Transcript has no words | explanation | practise again, download audio | E12 |
| `leave-confirm` | any (dialog) | Prevent losing an unsaved take | what would be lost | download audio, leave, stay | E14, F4.6, F4.8 |
| `leave-confirm-recording` | `/practice/:id` (dialog) | Leaving or cancelling while still recording | elapsed time | keep recording, stop & review, discard | E15, F3.3 (cancel take) |
| `not-found` | `*` or an unknown `:id` | Bad link or deleted question | message | back to questions | E16 |

## Actions → API (input for phase 2, `/kit:contract`)

| Action | Kind | Endpoint (proposed) | Error states |
|---|---|---|---|
| list questions (also retry) | server | `GET /api/questions` | network down → `questions-error` |
| create question / add suggested / add anyway | server | `POST /api/questions` `{text}` → 201 | 422 empty or over 500 characters → `questions-invalid`; network → `questions-invalid` (save error) |
| update question | server | `PATCH /api/questions/{id}` `{text}` → 200 | 404 → toast "This question was deleted" and refresh the list; 422 → inline; network → inline |
| delete question (and Undo) | server | `DELETE /api/questions/{id}` → 204; Undo = `POST /api/questions` with `position` | 404 → treat as deleted; network → toast |
| start practice / next question | server | `GET /api/questions/{id}` (or taken from the cached list) | 404 → `not-found` |
| transcribe recording | server | `POST /api/transcriptions` (exists) → `{text, words, duration_seconds, fillers, pauses}` | 0/network, 400 empty, 413, 415, 502, 503 → `practice-transcribe-error` / `practice-empty` |
| health check before practice | server | `GET /api/health` (exists) | failure → banner on `practice-ready`: "Server offline; you can record but not transcribe" |
| filter questions | client | none | none |
| start / stop recording, cancel take, record again | client (MediaRecorder) | none | E1–E7 |
| play recording | client | none | none |
| download transcript / download audio | client (object URL) | none | none: generated locally |
| copy transcript | client (Clipboard API) | none | clipboard blocked → "Select and copy the text instead" toast |
| retry microphone | client | none | still denied → stays on `practice-denied` |

New server work implied by the design: question CRUD (planned as roadmap Phase 3), `PATCH` for editing, a `position` field for Undo, and `fillers`/`pauses` summary fields in the transcription response (roadmap Phase 4).

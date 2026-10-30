# umless: user flows

Each step is `screen → action → screen`. Screen IDs (in backticks) match `screens.md` and the anchors in `wireframes/index.html`.

There is no login in v1, so there is no "unauthorized" state. When accounts arrive, every screen gains one: an expired session sends the user to sign-in and brings them back to the same question afterwards.

## Jobs

1. **Build a question list.** Collect the questions I want to practise.
2. **Practise an answer.** Record myself answering one question, see the transcript with my fillers and pauses, and see a summary.
3. **Review and keep it.** Replay the recording, then download the audio and the transcript.

---

## F1: First visit and building the list (job 1)

1. `questions-empty` → read the one-line intro → focus the **New question** field (it is already focused on desktop).
2. `questions-empty` → **create question** ("Tell me about yourself") → `questions`. The new question is appended and the field clears, ready for the next one.
3. `questions` → **create question** ×N → `questions` (list grows; newest at the bottom; a count shows "3 questions").
4. `questions` → **create question** with a blank field → the Add button stays disabled. There is no error message for an empty field, because there is nothing to fix.
5. `questions` → **create question** with more than 500 characters → `questions-invalid`: an inline error ("Keep questions under 500 characters, 512 now"). A live counter appears from 450 characters.
6. `questions` → **create question** with the same text as an existing one (case and space insensitive) → `questions-invalid`: an inline warning ("You already have this question") with **Add anyway**. Duplicates are allowed; some people want the same prompt twice.
7. **create question** fails because the server is unreachable → `questions-invalid`: "Couldn't save. Check that the backend is running." The typed text is kept and Add is enabled again for a retry.

**Loading:** on page load, `questions-loading` shows three skeleton rows for at most 300 ms before the list. If loading takes longer than 10 s, it shows `questions-error`.

**Error:** `questions-error`: "Can't reach the umless server" with **Retry** and a "How to start it" hint (`python run.py`). The New question field is disabled, because questions can't be saved.

## F2: Managing questions (job 1)

1. `questions` → **edit question** (pencil, or double-click the text) → the row becomes an inline field with **Save** and **Cancel** (Esc cancels, Enter saves). The same validation as F1 steps 4–6 applies.
2. **update question** succeeds → `questions` with a brief "Saved" tick. On failure, the row stays in edit mode with an inline error, and the text is kept.
3. `questions` → **delete question** → `delete-confirm` dialog ("Delete 'Tell me about yourself'? This can't be undone.") → **Delete** → `questions` with the row gone and a 5-second **Undo** toast. Undo re-creates the question in the same position.
4. `delete-confirm` → **Cancel** / Esc / click outside → `questions` unchanged.
5. **delete question** fails → the dialog closes and the row stays, with a toast: "Couldn't delete. Try again."
6. Deleting the last question → `questions-empty`.

## F3: Practising an answer (job 2)

1. `questions` → **start practice** on a question → `practice-ready` (`/practice/<id>`): the question in large type, an "Answer out loud as if it were real" tip, the privacy note, and a big **Start recording** button.
2. `practice-ready` → **start recording** → the browser permission prompt, shown as `practice-permission` with the hint "Allow microphone access in the browser bar". The first time only; after that it goes straight to step 3.
3. Permission granted → `practice-recording`:
   - a pulsing red dot with "Recording", a timer (0:00 counting up) and a live input-level meter
   - **Stop** (also Space) and **Cancel take** (discards it after a confirmation)
   - the tab title shows "● Recording · umless"
4. At 9:00 → `practice-countdown`: the timer reads "Time left 0:59" in the warning colour, and a polite screen-reader announcement plays at 1:00 and 0:10.
5. `practice-recording` → **stop recording** → `practice-review`. At 10:00 it stops automatically → `practice-review` with the notice "Stopped at the 10-minute limit".
6. `practice-review` shows:
   - the audio player with the duration
   - **Transcribe** (primary)
   - **Record again**
   - **Download audio**
   - a reminder that the recording is not saved anywhere yet
7. `practice-review` → **transcribe recording** → `practice-transcribing`: a spinner, "Transcribing… usually a few seconds", and the player still usable. Transcribe is disabled and a second click is ignored.
8. Success → `result` (F4).

## F4: Reviewing and keeping it (job 3)

1. `result` shows:
   - the question
   - a **summary bar**: total time, words per minute, a count for each filler ("um ×4, uh ×2"), long pauses ("3 pauses, longest 4 s")
   - the transcript card, with fillers highlighted (amber) and pause dots in muted text
   - the audio player
2. `result` → **play recording** (in the player).
3. `result` → **download transcript** → saves `tell-me-about-yourself-20261019-101502.txt`. Line 1 is the question, then a blank line, then the transcript, then the summary line.
4. `result` → **download audio** → saves `tell-me-about-yourself-20261019-101502.webm` (`.ogg` or `.m4a` depending on the browser).
5. `result` → **copy transcript** → a "Copied" toast.
6. `result` → **practise again** → `practice-ready` for the same question. If neither file was downloaded, the `leave-confirm` dialog appears first.
7. `result` → **next question** → `practice-ready` for the next question in the list. It is hidden on the last question.
8. `result` → **back to questions** → `questions` (with `leave-confirm` if nothing was downloaded).

---

## Edge and corner cases

| # | Situation | Where | What the user sees | Way out |
|---|---|---|---|---|
| E1 | Mic permission denied, now or earlier | `practice-ready` → start | `practice-denied`: "umless needs your microphone", with steps to re-allow it (lock icon → Microphone → Allow) | **Try again** re-requests permission |
| E2 | No microphone connected | start | `practice-nomic`: "No microphone found. Plug one in or check your system sound settings." | **Try again** |
| E3 | Browser can't record (no MediaRecorder, or not a secure context) | page load of `/practice/<id>` | `practice-unsupported`: "Your browser can't record audio. Use a current Chrome, Edge or Firefox." | **Back to questions** |
| E4 | Mic unplugged or permission revoked mid-recording | `practice-recording` | `practice-review` with the warning "Recording stopped: the microphone was disconnected. We kept the 1:42 you recorded." | normal review actions |
| E5 | Stop pressed straight away (empty audio) | stop | `practice-empty`: "Nothing was recorded. Check that the right microphone is selected." Transcribe and Download audio are hidden | **Record again** |
| E6 | Very quiet input (level meter flat for 5 s) | `practice-recording` | Inline hint under the meter: "We can't hear you. Is the right mic selected?" Recording continues | keep going or Stop |
| E7 | Double-click on Stop, or Stop at the same moment as the auto-stop | recording | One recording; the second click is ignored | — |
| E8 | Backend offline when transcribing | `practice-transcribing` | `practice-transcribe-error`: "Can't reach the umless server." The recording is kept | **Try again**, **Download audio** |
| E9 | Deepgram failed (502) | transcribing | Same screen: "Transcription failed. Try again in a moment." | **Try again** |
| E10 | No Deepgram key on the server (503) | transcribing | Same screen: "Transcription isn't set up: add DEEPGRAM_API_KEY to the backend .env." | **Download audio** |
| E11 | Recording too large (413) | transcribing | Same screen: "This recording is over 25 MB. Record a shorter answer." The 10-minute cap normally prevents this | **Record again**, **Download audio** |
| E12 | Transcript comes back empty (silence) | `result` | `result-empty`: "We couldn't hear any words. Speak closer to the mic and try again." The summary is hidden | **Practise again** |
| E13 | Very long transcript (10 minutes ≈ 1,500 words) | `result` | The transcript card scrolls inside itself (max height 60vh), and the summary stays visible above it | — |
| E14 | Leaving with an un-downloaded recording or transcript (back, close tab, refresh, nav link) | `practice-review`, `result` | In-app navigation shows `leave-confirm`: "Leave without saving? Your recording isn't stored anywhere." [Download audio] [Leave] [Stay]. Closing the tab or refreshing shows the browser's native "Leave site?" prompt | choose |
| E15 | Leaving while recording | `practice-recording` | `leave-confirm` with the variant "Stop and discard this recording?" | [Stop & review] [Discard] [Stay] |
| E16 | Opening `/practice/<id>` for a deleted or unknown question | direct URL or bookmark | `not-found`: "That question doesn't exist any more." | **Back to questions** |
| E17 | The question is edited or deleted in another tab while practising | `practice-*` | The question text on screen is a snapshot; downloads use the snapshot | — |
| E18 | Tab hidden while recording | recording | Recording continues; the tab title shows "● Recording" | — |
| E19 | Question longer than 120 characters | lists, headings | List rows clamp to 2 lines with an ellipsis (full text in a tooltip and on the practice screen). Practice heading wraps freely | — |
| E20 | Question with emoji, non-Latin script or only punctuation | file names | File-name slug falls back to `practice-<date>-<time>` | — |
| E21 | Narrow phone (375px) | all | Single column, sticky bottom action bar for Start/Stop/Transcribe, 48px touch targets | — |
| E22 | Keyboard-only or screen-reader user | all | Every action reachable by Tab; Space toggles recording on the practice screen; state changes announced via `aria-live` | — |
| E23 | Reduced motion preferred | recording | No pulsing dot or animated meter; a static "Recording" badge instead | — |
| E24 | Very many questions (100+) | `questions` | Plain scrolling list, plus a filter field once there are more than 10 | — |
| E25 | A second transcription while one is still running (409), e.g. another tab | transcribing | Same screen: "Another recording is still being transcribed. Wait for it to finish, then try again." The recording is kept | **Try again**, **Download audio** |
| E26 | Over the hourly transcription cap, 30 by default (429) | transcribing | Same screen: "You've made a lot of recordings this hour. Take a short break, then try again." The recording is kept | **Try again**, **Download audio** |

## F5–F9: the v2 app (ADR 0005)

The redesign added these flows. Each screen's states are in its `docs/design/v2/` page; the behaviour is in the code named.

- **F5 Sign up and sign in** (`auth.html`): Clerk's `<SignIn>`/`<SignUp>` on `/sign-in` and `/sign-up`, themed. An app URL while signed out goes to `/sign-in?redirect=…` and comes back after (`src/app/access.ts`).
- **F6 Dashboard** (`app-dashboard.html`, `/dashboard`, the signed-in home): before the first take, a 3-step checklist with quick-add; after, a streak, "Practise next", this week against last week, an 8-week trend and recent takes (`src/features/dashboard`, numbers in `src/features/progress`).
- **F7 History** (`app-history.html`): all takes by question and period (`/history`), one question's progress (`/history/:questionId`), one take with delete (`/takes/:takeId`) (`src/features/history`).
- **F8 Buying practice time** (`app-settings.html` billing states, `/settings/billing`): packs, Razorpay Checkout, then "Payment worked" or "The payment didn't go through" with Try again; out of time shows a banner on Billing and the Dashboard; a 402 while transcribing offers Buy practice time (`src/features/billing`).
- **F9 Settings** (`/settings`): theme, and Clerk's profile embedded (name, email, password, delete account).


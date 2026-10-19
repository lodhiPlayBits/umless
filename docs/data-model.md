# umless: data model (v1)

v1 has one persisted entity, `Question`, kept in a JSON file on the backend. Everything about a take (the recording, the transcript and its summary) is transient: it exists only in the API response and in browser memory, and is gone on refresh.

```mermaid
erDiagram
    QUESTION ||--o{ TAKE : "practised in (browser only)"
    TAKE ||--o| TRANSCRIPT : "transcribed into (response only)"
    TRANSCRIPT ||--|{ WORD : contains
    TRANSCRIPT ||--|| TRANSCRIPT_SUMMARY : has
    TRANSCRIPT_SUMMARY ||--o{ FILLER_COUNT : lists

    QUESTION {
        uuid id PK
        string text "1-500 code points, trimmed"
        datetime created_at "UTC"
    }
    TAKE {
        blob audio "browser memory"
        string mime_type
        uuid question_id "snapshot of question text too"
    }
    TRANSCRIPT {
        string text "with pause dots"
        number duration_seconds "nullable"
    }
    WORD {
        string word
        string punctuated_word
        number start
        number end
        number confidence
        boolean is_filler
        number pause_before_seconds
    }
    TRANSCRIPT_SUMMARY {
        int word_count
        int filler_count
        number words_per_minute "nullable"
        number fillers_per_minute "nullable"
        int pause_count
        number longest_pause_seconds "nullable"
    }
    FILLER_COUNT {
        string word "enum"
        int count
    }
```

## Question (persisted)

| Field | Type | Constraints | Set by |
|---|---|---|---|
| `id` | UUID v4 string | primary key, unique, immutable | server on create |
| `text` | string | after trimming leading/trailing whitespace: 1–500 Unicode code points; request value also limited to 500 code points before trimming; internal whitespace kept as typed; duplicates allowed | client on create/update |
| `created_at` | RFC 3339 date-time, UTC with `Z` | immutable | server on create |

**Order.** The list has an explicit order: the order of the array in the file. New questions are appended. `POST /api/questions` with `position` inserts at that 0-based index (clamped to the list length), which is how Undo puts a deleted question back. There is no stored `position` field; the index is the position. Re-created questions get a new `id` and `created_at`.

**Length.** Python's `len()` (code points) is the authority. The frontend counter must count code points (`[...text].length`), not UTF-16 units, or emoji would count twice.

**Duplicates** are detected only by the client (case-insensitive, whitespace collapsed) to show a warning; the server never rejects them.

### Storage

- File: `backend/data/questions.json` (already git-ignored), path overridable with `UMLESS_DATA_FILE`. Created on the first write; a missing file means an empty list.
- Format:
  ```json
  {
    "version": 1,
    "questions": [
      {"id": "3f2c8a9e-6b1d-4c0e-9a57-2d8e1f4b7c10", "text": "Tell me about yourself", "created_at": "2026-10-19T10:15:02Z"}
    ]
  }
  ```
- Access goes through a `QuestionRepository` Protocol (`list`, `get`, `add(text, position=None)`, `update(id, text)`, `delete(id)`). v1 implementation: `JsonFileQuestionRepository`, loaded once at startup, every mutation under a `threading.Lock`, written through a temp file plus `os.replace` with up to 5 retries on Windows `PermissionError`.
- **Indexes:** none on disk. In memory the repository keeps the ordered list plus a dict from `id` to question for O(1) `get`, `update` and `delete`.
- A file that exists but can't be parsed, or has an unknown `version`, stops startup with a clear error naming the file. The app never overwrites it, so a hand-edited or corrupted list isn't lost.
- Later (out of v1): `SqlQuestionRepository` on SQLite via SQLAlchemy + Alembic, with an integer `position` column and an index on it, passing the same repository contract tests.

### Who reads and writes it

| Screen / action | Operation | Access |
|---|---|---|
| `questions`, `questions-loading`, `questions-error` → list / retry | `listQuestions` | read all |
| `questions`, `questions-deleted` → start practice; `practice-ready` (direct URL, refresh, "2 of 5"); `result` → next question | `listQuestions` | read all, then find by id |
| `questions`, `questions-empty`, `questions-invalid` → create, add suggested, add anyway, retry save | `createQuestion` | append |
| `questions-deleted` → undo delete | `createQuestion` with `position` | insert at index |
| `questions` (edit mode) → update question | `updateQuestion` | update `text` |
| `delete-confirm` → delete question | `deleteQuestion` | remove |

## Transient entities (never stored on the server)

### Take (browser only)

The recording a user made in one attempt: an audio `Blob`, its MIME type (`audio/webm;codecs=opus` in Chrome, `audio/ogg` in Firefox, `audio/mp4` in Safari), a snapshot of the question text at the time of recording (E17), and whether each file was downloaded (drives `leave-confirm`). Written by start/stop recording, read by playback, transcribe and downloads. Lost on refresh by design.

### Transcript (response of `createTranscription`)

| Field | Type | Constraints |
|---|---|---|
| `text` | string | may be empty; punctuated words joined by single spaces, with a run of N dots inserted for each gap of N full seconds (N ≥ 1) between consecutive words |
| `words` | array of Word | in spoken order; empty when no speech |
| `duration_seconds` | number or null | ≥ 0; audio length reported by Deepgram; null if Deepgram omits it |
| `summary` | TranscriptSummary | always present |

### Word

| Field | Type | Constraints |
|---|---|---|
| `word` | string | non-empty; Deepgram's lowercase, unpunctuated form |
| `punctuated_word` | string | non-empty; display form; falls back to `word` |
| `start`, `end` | number (seconds) | 0 ≤ start ≤ end ≤ 86,400; out-of-range timings make the whole request a 502 |
| `confidence` | number | 0–1 |
| `is_filler` | boolean | `word` is in the filler set below |
| `pause_before_seconds` | number | ≥ 0; this word's `start` minus the previous word's `end`, floored at 0; 0 for the first word; rounded to 0.01 s |

### TranscriptSummary

| Field | Type | Rule |
|---|---|---|
| `word_count` | integer ≥ 0 | words with `is_filler = false` |
| `filler_count` | integer ≥ 0 | words with `is_filler = true` |
| `fillers` | array of FillerCount | one entry per filler that occurred; sorted by `count` descending, then `word` ascending |
| `words_per_minute` | number or null | `word_count / (duration_seconds / 60)`, rounded to a whole number; null when `duration_seconds` is null or 0 |
| `fillers_per_minute` | number or null | `filler_count / (duration_seconds / 60)`, rounded to 0.1; null under the same condition |
| `pause_count` | integer ≥ 0 | words whose gap gives at least one dot: `floor(pause_before_seconds + 0.001) ≥ 1` (same rule as the dots) |
| `longest_pause_seconds` | number or null | largest such gap, rounded to 0.1; null when `pause_count` is 0 |

### FillerCount

| Field | Type | Constraints |
|---|---|---|
| `word` | string enum | `um`, `uh`, `mhmm`, `mm-mm`, `uh-uh`, `uh-huh`, `nuh-uh` (the set Deepgram emits with `filler_words=true`) |
| `count` | integer | ≥ 1 |

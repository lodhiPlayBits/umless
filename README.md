# umless

Speech practice app: type a practice question, record your answer in the browser, get a Deepgram transcript that keeps the filler words ("um", "uh"), and download the transcript and the raw audio.

FastAPI backend in `backend/`, React (Vite + TypeScript) frontend in `frontend/`. Locally it runs single-user with a JSON file; the deployed site (`deploy/`) adds Clerk sign-in and MySQL, so each user has their own questions (`docs/adr/0003-clerk-auth.md`).

## Setup (once)

1. Put your Deepgram key in a git-ignored env file, either `backend/.env` or `.env` in the repo root (see `backend/.env.example`):
   ```
   DEEPGRAM_API_KEY=your-key
   ```
   Set `UMLESS_TRANSCRIBER=fake` instead to run without a key (canned transcript, no cost).
   Questions are saved to `backend/data/questions.json`; set `UMLESS_DATA_FILE` to use another file.
   To store them in MySQL instead (as the deployed site does), set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`, then run `alembic upgrade head` from `backend/`. MySQL needs sign-in too: set `CLERK_PUBLISHABLE_KEY` and `CLERK_AUTHORIZED_PARTIES` in `backend/.env` and `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` (see the `.env.example` files).
2. Backend (Windows PowerShell):
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\python -m pip install -r requirements-dev.txt
   ```
3. Frontend:
   ```powershell
   cd frontend
   npm install
   ```

## Run

Two terminals:

```powershell
cd backend; .venv\Scripts\python run.py
```

```powershell
cd frontend; npm run dev
```

Open http://localhost:5173. The dev server forwards `/api` to the backend on 127.0.0.1:8000.

From WSL, call the Windows venv's Python: `cd /mnt/d/umless/backend && .venv/Scripts/python.exe run.py`.

## Tests

```powershell
cd backend; .venv\Scripts\python -m pytest -q
cd frontend; npm test; npm run build; npm run lint
```

`pytest --run-live` also runs one real Deepgram call when `DEEPGRAM_API_KEY` is set in the shell.

The MySQL store's tests run when `UMLESS_TEST_DATABASE_URL` names a throwaway database (they drop its tables), for example `mysql+pymysql://umless:password@127.0.0.1:3307/umless_test?charset=utf8mb4`; otherwise they're skipped.

## Manual microphone checklist

Automated tests use a fake recorder, so the real microphone path is checked by hand in Chrome (and Firefox, if installed). Record the result per browser as pass, fail or "not verified".

1. Click **Start recording** and allow the microphone.
2. Record about 15 seconds, saying "um" and "uh" on purpose.
3. Click **Stop recording**: the browser's microphone indicator turns off.
4. The audio player plays the recording back.
5. Click **Transcribe**: the transcript shows the "um" and "uh".
6. **Download transcript** and **Download audio** both save files that open.
7. Block the microphone in site settings and click **Start recording**: an error is shown, not a blank screen.
8. Click **Start recording** then **Stop recording** immediately: **Transcribe** is disabled with "Recording is empty", or the transcript is empty; never a server error.

## Deploy: bucket access

The backend reaches the OCI bucket as its VM (instance principal), so there are no storage keys. In the OCI console:

1. Identity → Domains → Default → Dynamic groups → create `umless-vm` with the rule `instance.id = '<the VM's OCID>'`.
2. Identity → Policies (root compartment) → create a policy:
   ```
   Allow dynamic-group umless-vm to manage objects in tenancy where target.bucket.name='bucket-20261024-1540'
   ```
3. Set `OCI_NAMESPACE`, `OCI_BUCKET` and `OCI_REGION` in `backend/.env` and rebuild the backend. Policies take a minute or two to apply.

## Known limitations

- Chrome's WebM recordings have no duration or seek metadata, so players may show an unknown length. Fixing it needs ffmpeg, which is out of scope for the MVP.
- Recordings are capped at 10 minutes (countdown in the final minute) and 25 MB.
- Recordings aren't stored on the server: refreshing the page loses the current recording. Transcripts are saved per user and question ("Past takes"), in OCI Object Storage on the deployed site.

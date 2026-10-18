# umless

Speech practice app: type a practice question, record your answer in the browser, get a Deepgram transcript that keeps the filler words ("um", "uh"), and download the transcript and the raw audio.

FastAPI backend in `backend/`, React (Vite + TypeScript) frontend in `frontend/`. No accounts and no database yet; see `docs/roadmap/`.

## Setup (once)

1. Put your Deepgram key in a git-ignored env file, either `backend/.env` or `.env` in the repo root (see `backend/.env.example`):
   ```
   DEEPGRAM_API_KEY=your-key
   ```
   Set `UMLESS_TRANSCRIBER=fake` instead to run without a key (canned transcript, no cost).
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

## Known limitations

- Chrome's WebM recordings have no duration or seek metadata, so players may show an unknown length. Fixing it needs ffmpeg, which is out of scope for the MVP.
- Recordings are capped at 10 minutes (countdown in the final minute) and 25 MB.
- Nothing is stored on the server: refreshing the page loses the current recording.

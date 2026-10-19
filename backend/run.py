"""Start the backend: python run.py (from the backend folder, with the venv's python)."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

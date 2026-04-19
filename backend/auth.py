# User authentication and analysis history storage

from __future__ import annotations
import hashlib
import json
import time
import uuid
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "users.json"


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"users": {}, "history": {}}
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def _save(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)


def _hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


# Auth

def register_user(username: str, password: str) -> tuple[dict | None, str | None]:
    data = _load()
    if username in data["users"]:
        return None, "Username already taken"
    user_id = str(uuid.uuid4())
    data["users"][username] = {
        "id": user_id,
        "password": _hash_password(password),
        "created": time.time(),
    }
    data["history"][user_id] = []
    _save(data)
    return {"id": user_id, "username": username}, None


def login_user(username: str, password: str) -> tuple[dict | None, str | None]:
    data = _load()
    user = data["users"].get(username)
    if not user or user["password"] != _hash_password(password):
        return None, "Invalid username or password"
    return {"id": user["id"], "username": username}, None


# History
def save_analysis(user_id: str, portfolio: dict, result_summary: dict) -> dict:
    data = _load()
    if user_id not in data["history"]:
        data["history"][user_id] = []

    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": time.time(),
        "portfolio": portfolio,
        "summary": result_summary,
    }
    data["history"][user_id].insert(0, entry)
    data["history"][user_id] = data["history"][user_id][:50]
    _save(data)
    return entry


def get_history(user_id: str) -> list:
    data = _load()
    return data["history"].get(user_id, [])

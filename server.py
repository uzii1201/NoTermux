import json
import os
import re
import threading
import uuid
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "sessions"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR.mkdir(parents=True, exist_ok=True)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}

VALID_NAME = re.compile(r"^[a-zA-Z0-9_-]{2,60}$")

# Un lock por sesion para evitar condiciones de carrera en escrituras concurrentes
_session_locks: dict = {}
_locks_mutex = threading.Lock()


def get_lock(name: str) -> threading.Lock:
    with _locks_mutex:
        if name not in _session_locks:
            _session_locks[name] = threading.Lock()
        return _session_locks[name]


def now_iso():
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def load_session(name):
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_session(data):
    path = DATA_DIR / f"{data['name']}.json"
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(
        path
    )  # escritura atomica: evita archivos corruptos si el proceso muere a mitad


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silenciar logs de requests

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def err(self, code, msg):
        self.send_json(code, {"error": msg})

    def body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        # ── API ──────────────────────────────────────────────────────────────

        if path == "/api/sessions":
            sessions = []
            for f in sorted(
                DATA_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True
            ):
                try:
                    with open(f, "r", encoding="utf-8") as fh:
                        s = json.load(fh)
                    sessions.append(
                        {
                            "name": s["name"],
                            "created_by": s["created_by"],
                            "created_at": s["created_at"],
                            "note_count": len(s.get("notes", [])),
                            "todo_count": len(s.get("todos", [])),
                            "todo_pending": sum(
                                1 for t in s.get("todos", []) if not t.get("done")
                            ),
                        }
                    )
                except Exception:
                    pass
            self.send_json(200, sessions)
            return

        parts = path.split("/")  # ['', 'api', 'sessions', name, ...]

        if len(parts) >= 4 and parts[1] == "api" and parts[2] == "sessions":
            session = load_session(parts[3])
            if session is None:
                return self.err(404, "Sesión no encontrada")
            if len(parts) == 4:
                self.send_json(200, session)
                return

        # ── Static files ─────────────────────────────────────────────────────

        if path == "/":
            path = "/index.html"
        file_path = STATIC_DIR / path.lstrip("/")
        if file_path.is_file():
            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header(
                "Content-Type", MIME.get(file_path.suffix, "application/octet-stream")
            )
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.err(404, "No encontrado")

    def do_POST(self):
        path = urlparse(self.path).path
        parts = path.split("/")
        data = self.body()

        # POST /api/sessions — crear sesión
        if path == "/api/sessions":
            name = data.get("name", "").strip()
            created_by = data.get("created_by", "").strip()
            if not name or not created_by:
                return self.err(400, "Se requiere nombre y usuario")
            if not VALID_NAME.match(name):
                return self.err(400, "Nombre de sesión inválido")
            with get_lock(name):
                if (DATA_DIR / f"{name}.json").exists():
                    return self.err(409, "La sesión ya existe")
                session = {
                    "name": name,
                    "created_by": created_by,
                    "created_at": now_iso(),
                    "notes": [],
                    "todos": [],
                }
                save_session(session)
            self.send_json(201, session)
            return

        if len(parts) < 5 or parts[2] != "sessions":
            return self.err(404, "No encontrado")

        sname = parts[3]

        # POST /api/sessions/{name}/notes
        if parts[4] == "notes":
            note = {
                "id": str(uuid.uuid4()),
                "title": data.get("title", "Sin título").strip() or "Sin título",
                "content": data.get("content", ""),
                "created_by": data.get("created_by", ""),
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "updated_by": data.get("created_by", ""),
            }
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                session["notes"].insert(0, note)
                save_session(session)
            self.send_json(201, note)
            return

        # POST /api/sessions/{name}/todos
        if parts[4] == "todos":
            text = data.get("text", "").strip()
            if not text:
                return self.err(400, "El texto no puede estar vacío")
            todo = {
                "id": str(uuid.uuid4()),
                "text": text,
                "done": False,
                "created_by": data.get("created_by", ""),
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "updated_by": data.get("created_by", ""),
            }
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                session["todos"].insert(0, todo)
                save_session(session)
            self.send_json(201, todo)
            return

        self.err(404, "No encontrado")

    def do_PUT(self):
        path = urlparse(self.path).path
        parts = path.split("/")
        data = self.body()

        if len(parts) < 6 or parts[2] != "sessions":
            return self.err(404, "No encontrado")

        sname = parts[3]
        item_id = parts[5]
        updated_by = data.get("updated_by", "")

        # PUT /api/sessions/{name}/notes/{id}
        if parts[4] == "notes":
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                for note in session["notes"]:
                    if note["id"] == item_id:
                        note["title"] = (
                            data.get("title", note["title"]).strip() or "Sin título"
                        )
                        note["content"] = data.get("content", note["content"])
                        note["updated_at"] = now_iso()
                        note["updated_by"] = updated_by
                        save_session(session)
                        return self.send_json(200, note)
            return self.err(404, "Nota no encontrada")

        # PUT /api/sessions/{name}/todos/{id}
        if parts[4] == "todos":
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                for todo in session["todos"]:
                    if todo["id"] == item_id:
                        if "text" in data:
                            todo["text"] = data["text"].strip()
                        if "done" in data:
                            todo["done"] = bool(data["done"])
                        todo["updated_at"] = now_iso()
                        todo["updated_by"] = updated_by
                        save_session(session)
                        return self.send_json(200, todo)
            return self.err(404, "Tarea no encontrada")

        self.err(404, "No encontrado")

    def do_DELETE(self):
        path = urlparse(self.path).path
        parts = path.split("/")

        # DELETE /api/sessions/{name} — eliminar sesión completa
        if len(parts) == 4 and parts[2] == "sessions":
            sname = parts[3]
            with get_lock(sname):
                file_path = DATA_DIR / f"{sname}.json"
                if not file_path.exists():
                    return self.err(404, "Sesión no encontrada")
                file_path.unlink()
            return self.send_json(200, {"ok": True})

        if len(parts) < 6 or parts[2] != "sessions":
            return self.err(404, "No encontrado")

        sname = parts[3]
        item_id = parts[5]

        if parts[4] == "notes":
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                before = len(session["notes"])
                session["notes"] = [n for n in session["notes"] if n["id"] != item_id]
                if len(session["notes"]) == before:
                    return self.err(404, "Nota no encontrada")
                save_session(session)
            return self.send_json(200, {"ok": True})

        if parts[4] == "todos":
            with get_lock(sname):
                session = load_session(sname)
                if session is None:
                    return self.err(404, "Sesión no encontrada")
                before = len(session["todos"])
                session["todos"] = [t for t in session["todos"] if t["id"] != item_id]
                if len(session["todos"]) == before:
                    return self.err(404, "Tarea no encontrada")
                save_session(session)
            return self.send_json(200, {"ok": True})

        self.err(404, "No encontrado")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Servidor iniciado en http://localhost:{port}")
    print("Ctrl+C para detener")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido")

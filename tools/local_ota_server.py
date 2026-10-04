#!/usr/bin/env python3
"""HTTP server ho tro HTTP Range — dung de test resume OTA o local (10.0.2.2:8000).
Chay: python tools/local_ota_server.py  (phuc vu file tu goc repo)
"""
import http.server
import os
import re
import socketserver


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return
        size = os.path.getsize(path)
        m = re.match(r"bytes=(\d+)-", self.headers.get("Range", "") or "")
        start = int(m.group(1)) if m else 0
        if size > 0 and start >= size:
            self.send_error(416)
            return
        with open(path, "rb") as f:
            f.seek(start)
            data = f.read()
        if m:
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{size - 1}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Type", "application/octet-stream")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print("[ota-server]", self.address_string(), fmt % args, flush=True)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print("serving repo at :8000 (Range OK)")
    Server(("0.0.0.0", 8000), Handler).serve_forever()

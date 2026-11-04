"""Loopback-only PDF service for local Flux development."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import tempfile
from pink_pdf import build, ROOT

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/pink/pdf':
            self.send_error(404)
            return
        if self.headers.get('Origin', '') not in {'http://127.0.0.1:5173', 'http://localhost:5173'}:
            self.send_error(403)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 500000:
                raise ValueError('문서 크기는 500KB 이하여야 합니다.')
            data = json.loads(self.rfile.read(length))
            (ROOT / 'tmp/pdfs').mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=ROOT / 'tmp/pdfs') as tmp:
                pdf = build(data, Path(tmp) / 'worksheet.pdf').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Length', str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)
        except Exception as error:
            content = str(error).encode('utf-8')
            self.send_response(422)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(content)

if __name__ == '__main__':
    print('Flux PDF service: http://127.0.0.1:4179', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4179), Handler).serve_forever()

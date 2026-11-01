"""Local preview of exported files only. No app API or financial write endpoints."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=3000)
parser.add_argument('--directory', default='out')
args = parser.parse_args()
root = Path(args.directory).resolve()
if not (root / 'index.html').is_file():
    raise SystemExit('Static export missing. Run npm run build first.')

class StaticPreviewServer(ThreadingHTTPServer):
    # Browsers request many chunks concurrently. Python 3.11's default queue of
    # five can stall cold loads in multiple tabs, even when every file exists.
    request_queue_size = 128
    daemon_threads = True

handler = partial(SimpleHTTPRequestHandler, directory=str(root))
with StaticPreviewServer(('127.0.0.1', args.port), handler) as server:
    print(f'Static Budget Tracker preview: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

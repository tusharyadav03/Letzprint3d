#!/usr/bin/env python3
"""
Tap Studio dev server.

`python3 -m http.server` is not usable for this project. Browsers cache ES
modules hard, and `index.html` revalidates while `js/*.js` quietly does not —
so you edit a builder, reload, and get the previous build back with no error
and no clue. That is exactly what happened once already: the page showed a new
UI field while still running week-old geometry code.

This serves the same tree with caching switched off, so a reload always gets
what is on disk.
"""

import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the window readable: only complain about failures.
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Tap Studio  →  http://localhost:{PORT}/index.html")
        print("Caching is disabled; every reload gets the current files.")
        print("Ctrl-C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")

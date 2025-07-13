#!/usr/bin/env python3
"""
Simple HTTP Server for A Lo Cubano Boulder Fest
"""

import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class SimpleHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    with socketserver.TCPServer(("", PORT), SimpleHTTPRequestHandler) as httpd:
        print(f"🎵 A Lo Cubano Boulder Fest Server")
        print(f"🌐 Serving at http://localhost:{PORT}")
        print(f"📁 Directory: {DIRECTORY}")
        print(f"⌨️  Press Ctrl+C to stop\n")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")

if __name__ == "__main__":
    main()
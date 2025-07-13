#!/usr/bin/env python3
"""
A Lo Cubano Boulder Fest Development Server
Serves the minimalist festival website with proper MIME types and routing
"""

import http.server
import socketserver
import os
import mimetypes
from urllib.parse import urlparse

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class FestivalHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with proper MIME types and routing"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_GET(self):
        # Parse the URL
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Handle root path
        if path == '/':
            self.path = '/index.html'
        
        # Handle paths without .html extension
        elif not path.endswith(('.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf')):
            # Check if it's a directory
            full_path = os.path.join(DIRECTORY, path.lstrip('/'))
            if os.path.isdir(full_path):
                # Look for index.html in the directory
                index_path = os.path.join(full_path, 'index.html')
                if os.path.exists(index_path):
                    self.path = path.rstrip('/') + '/index.html'
            else:
                # Try adding .html extension
                html_path = full_path + '.html'
                if os.path.exists(html_path):
                    self.path = path + '.html'
        
        # Call parent class method
        return super().do_GET()
    
    def guess_type(self, path):
        """Ensure proper MIME types for all file types"""
        mimetype, _ = mimetypes.guess_type(path)
        if mimetype:
            return mimetype
        
        # Additional MIME types
        ext = os.path.splitext(path)[1].lower()
        mime_types = {
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.html': 'text/html',
            '.svg': 'image/svg+xml',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
        }
        
        return mime_types.get(ext, 'application/octet-stream')

def run_server():
    """Start the development server"""
    with socketserver.TCPServer(("", PORT), FestivalHTTPRequestHandler) as httpd:
        print(f"🎵 A Lo Cubano Boulder Fest Development Server")
        print(f"🌐 Serving at http://localhost:{PORT}")
        print(f"📁 Serving directory: {DIRECTORY}")
        print(f"⌨️  Press Ctrl+C to stop the server\n")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")
            return

if __name__ == "__main__":
    run_server()
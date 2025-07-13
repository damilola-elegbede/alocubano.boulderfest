#!/usr/bin/env python3

import http.server
import socketserver
import os
import sys

def main():
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    PORT = 8080
    
    class CustomHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            print(f"[{self.address_string()}] {format % args}")
    
    print("🎵 A Lo Cubano Boulder Fest Server")
    print("=" * 40)
    print(f"📁 Serving directory: {script_dir}")
    print(f"🌐 URL: http://localhost:{PORT}")
    print(f"📄 Landing page: http://localhost:{PORT}/index.html")
    print("⌨️  Press Ctrl+C to stop")
    print("=" * 40)
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            print(f"✅ Server started successfully on port {PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {PORT} is already in use")
            print("Try running: lsof -i :8080 to see what's using it")
        else:
            print(f"❌ Error starting server: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
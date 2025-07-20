#!/usr/bin/env python3
"""
A Lo Cubano Boulder Fest Development Server
Serves the minimalist festival website with proper MIME types and routing
"""

import http.server
import socketserver
import os
import mimetypes
import json
import re
from urllib.parse import urlparse
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Load environment variables at startup
load_dotenv('.env.local')

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
        
        # Handle API endpoints
        if path == '/api/featured-photos':
            self.handle_featured_photos_api()
            return
        elif path.startswith('/api/image-proxy/'):
            self.handle_image_proxy_api(path)
            return
        
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

    def handle_featured_photos_api(self):
        """Handle /api/featured-photos endpoint"""
        try:
            # Get featured photos from Captured_Moments folder
            photos = get_featured_photos()
            
            # Send JSON response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            response_data = {
                'items': photos,
                'total': len(photos)
            }
            
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            # Send error response
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'items': [],
                'total': 0
            }
            
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def handle_image_proxy_api(self, path):
        """Handle /api/image-proxy/<file_id> endpoint"""
        try:
            # Extract file_id from path
            match = re.match(r'/api/image-proxy/([a-zA-Z0-9_-]+)', path)
            if not match:
                self.send_error(400, "Invalid file ID")
                return
            
            file_id = match.group(1)
            print(f"🖼️ Proxying image for file ID: {file_id}")
            
            # Get image data from Google Drive
            image_data, content_type = get_image_from_drive(file_id)
            
            if image_data is None:
                self.send_error(404, "Image not found")
                return
            
            # Send image response with proper headers
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Content-length', str(len(image_data)))
            
            # Add caching headers (24 hours)
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.send_header('ETag', f'"{file_id}"')
            
            self.end_headers()
            self.wfile.write(image_data)
            
        except Exception as e:
            print(f"❌ Error in image proxy: {e}")
            self.send_error(500, f"Internal server error: {str(e)}")

def get_featured_photos():
    """Fetch photos from Captured_Moments Google Drive folder"""
    try:
        print("🔍 Starting get_featured_photos...")
        
        # Google Drive setup using environment variables
        service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        project_id = os.getenv('GOOGLE_PROJECT_ID')
        
        print(f"📧 Service account email: {service_account_email}")
        print(f"🔧 Project ID: {project_id}")
        print(f"🔑 Private key present: {'Yes' if private_key else 'No'}")
        
        if not service_account_email or not private_key or not project_id:
            raise Exception('Missing Google Service Account credentials in environment variables')
        
        print("🔑 Creating credentials from environment variables...")
        credentials = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": service_account_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
        
        print("🌐 Building Google Drive service...")
        service = build('drive', 'v3', credentials=credentials)
        
        # Get parent folder ID from environment variables
        parent_folder_id = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
        print(f"📁 Parent folder ID from env: {parent_folder_id}")
        
        if not parent_folder_id:
            raise Exception('GOOGLE_DRIVE_FOLDER_ID not set in environment variables')
        
        # Find the Captured_Moments subfolder
        print("🔍 Searching for Captured_Moments subfolder...")
        folder_query = f"'{parent_folder_id}' in parents and name='Captured_Moments' and mimeType='application/vnd.google-apps.folder'"
        print(f"📝 Query: {folder_query}")
        
        folder_results = service.files().list(q=folder_query, fields="files(id, name)").execute()
        folders = folder_results.get('files', [])
        print(f"📂 Found {len(folders)} Captured_Moments subfolders")
        
        if not folders:
            print("❌ No Captured_Moments subfolder found!")
            raise Exception('Captured_Moments subfolder not found')
        
        folder_id = folders[0]['id']
        print(f"✅ Using Captured_Moments folder ID: {folder_id}")
        
        # First, let's see ALL files in the folder
        print("📋 Checking ALL files in folder...")
        all_query = f"'{folder_id}' in parents"
        all_results = service.files().list(
            q=all_query,
            fields="files(id, name, mimeType, size, createdTime)",
            orderBy='createdTime desc'
        ).execute()
        
        all_files = all_results.get('files', [])
        print(f"📂 Found {len(all_files)} total files in folder")
        
        if all_files:
            print("📋 All files:")
            for i, file in enumerate(all_files[:5]):
                print(f"  {i+1}. {file['name']} (MIME: {file['mimeType']})")
        
        # Get images from folder
        print("🖼️ Searching for images in folder...")
        query = f"'{folder_id}' in parents and (mimeType contains 'image/')"
        print(f"📝 Image query: {query}")
        
        results = service.files().list(
            q=query,
            fields="files(id, name, size, createdTime)",
            orderBy='createdTime desc'
        ).execute()
        
        files = results.get('files', [])
        print(f"🖼️ Found {len(files)} image files")
        
        if files:
            print("📋 First few files:")
            for i, file in enumerate(files[:3]):
                print(f"  {i+1}. {file['name']} (ID: {file['id']})")
        
        # Format response
        photos = []
        for file in files:
            file_id = file['id']
            photos.append({
                'id': file_id,
                'name': file['name'],
                'thumbnailUrl': f"/api/image-proxy/{file_id}",
                'viewUrl': f"/api/image-proxy/{file_id}",
                'size': int(file.get('size', 0)),
                'createdAt': file.get('createdTime', '')
            })
        
        print(f"✅ Returning {len(photos)} formatted photos")
        return photos
        
    except Exception as e:
        print(f"Error fetching featured photos: {e}")
        return []

def get_image_from_drive(file_id):
    """Fetch image binary data from Google Drive"""
    try:
        print(f"🔍 Fetching image data for file ID: {file_id}")
        
        # Google Drive setup using environment variables
        service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        project_id = os.getenv('GOOGLE_PROJECT_ID')
        
        if not service_account_email or not private_key or not project_id:
            raise Exception('Missing Google Service Account credentials in environment variables')
        
        # Create credentials
        credentials = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": service_account_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
        
        # Build Google Drive service
        service = build('drive', 'v3', credentials=credentials)
        
        # First, get file metadata to determine content type
        try:
            file_metadata = service.files().get(fileId=file_id, fields='name,mimeType').execute()
            print(f"📄 File metadata: {file_metadata['name']} (MIME: {file_metadata['mimeType']})")
            content_type = file_metadata['mimeType']
        except HttpError as e:
            if e.resp.status == 404:
                print(f"❌ File not found: {file_id}")
                return None, None
            raise
        
        # Get the file content
        try:
            request = service.files().get_media(fileId=file_id)
            image_data = request.execute()
            print(f"✅ Successfully fetched {len(image_data)} bytes of image data")
            
            return image_data, content_type
            
        except HttpError as e:
            if e.resp.status == 404:
                print(f"❌ File content not found: {file_id}")
                return None, None
            raise
        
    except Exception as e:
        print(f"❌ Error fetching image from Drive: {e}")
        return None, None

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
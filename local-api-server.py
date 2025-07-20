#!/usr/bin/env python3
"""
Local API server for development
Serves both static files and handles /api/gallery endpoint
"""

import os
import sys
import json
import asyncio
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from datetime import datetime

# Load environment variables from .env.local
env_file = Path('.env.local')
if env_file.exists():
    load_dotenv(env_file)
    print(f"✓ Loaded environment variables from {env_file}")
else:
    print(f"❌ ERROR: No .env.local file found!")
    print(f"   Please create one from .env.example and add your Google credentials")
    sys.exit(1)

# Check required environment variables
required_vars = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_PROJECT_ID', 'GOOGLE_DRIVE_FOLDER_ID']
missing_vars = [var for var in required_vars if not os.getenv(var)]

if missing_vars:
    print(f"❌ ERROR: Missing required environment variables: {', '.join(missing_vars)}")
    print(f"   Please add them to your .env.local file")
    sys.exit(1)

class APIRequestHandler(SimpleHTTPRequestHandler):
    """HTTP request handler with API endpoint and CORS support"""
    
    extensions_map = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
    }
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle preflight requests"""
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        
        # Handle API endpoints
        if parsed_path.path == '/api/gallery':
            self.handle_gallery_api()
        elif parsed_path.path == '/api/featured-photos':
            self.handle_featured_photos_api()
        else:
            # Serve static files
            super().do_GET()
    
    def handle_gallery_api(self):
        """Handle the /api/gallery endpoint"""
        try:
            # Parse query parameters
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            year = query_params.get('year', ['2025'])[0]  # Default to 2025
            
            # Initialize Google Drive client
            credentials = service_account.Credentials.from_service_account_info({
                "type": "service_account",
                "project_id": os.getenv('GOOGLE_PROJECT_ID'),
                "private_key_id": "key-id",
                "private_key": os.getenv('GOOGLE_PRIVATE_KEY').replace('\\n', '\n'),
                "client_email": os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
                "client_id": "client-id",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')}"
            })
            
            service = build('drive', 'v3', credentials=credentials)
            
            # First, find the year folder (e.g., ALoCubano_BoulderFest_2025)
            root_folder_id = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
            year_folder_name = f"ALoCubano_BoulderFest_{year}"
            
            # Search for the year folder
            year_results = service.files().list(
                q=f"'{root_folder_id}' in parents and name = '{year_folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="files(id, name)"
            ).execute()
            
            year_folders = year_results.get('files', [])
            if not year_folders:
                self.send_error_response(404, {'error': f'Year folder {year_folder_name} not found'})
                return
            
            year_folder_id = year_folders[0]['id']
            
            # Find Workshops and Socials folders within the year folder
            subfolders_results = service.files().list(
                q=f"'{year_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="files(id, name)"
            ).execute()
            
            subfolders = subfolders_results.get('files', [])
            workshops_folder_id = None
            socials_folder_id = None
            
            for folder in subfolders:
                if folder['name'] == 'Workshops':
                    workshops_folder_id = folder['id']
                elif folder['name'] == 'Socials':
                    socials_folder_id = folder['id']
            
            # Collect media items from both folders
            media_items = []
            
            # Function to get media from a folder
            def get_media_from_folder(folder_id, folder_name):
                if not folder_id:
                    return []
                
                results = service.files().list(
                    q=f"'{folder_id}' in parents and trashed = false",
                    pageSize=100,
                    fields="files(id, name, mimeType, size, createdTime)",
                    orderBy="createdTime desc"
                ).execute()
                
                files = results.get('files', [])
                items = []
                
                for file in files:
                    mime_type = file.get('mimeType', '')
                    
                    # Only include images and videos
                    if mime_type.startswith('image/') or mime_type.startswith('video/'):
                        item_type = 'image' if mime_type.startswith('image/') else 'video'
                        file_id = file['id']
                        
                        items.append({
                            'id': file_id,
                            'name': file['name'],
                            'type': item_type,
                            'mimeType': mime_type,
                            'thumbnailUrl': f"https://lh3.googleusercontent.com/d/{file_id}=w400",
                            'viewUrl': f"https://lh3.googleusercontent.com/d/{file_id}=w1600",
                            'downloadUrl': f"https://drive.google.com/uc?export=download&id={file_id}",
                            'size': int(file.get('size', 0)),
                            'createdAt': file.get('createdTime', ''),
                            'category': folder_name  # Add category to identify source folder
                        })
                
                return items
            
            # Get media from both Workshops and Socials folders
            if workshops_folder_id:
                media_items.extend(get_media_from_folder(workshops_folder_id, 'Workshops'))
            if socials_folder_id:
                media_items.extend(get_media_from_folder(socials_folder_id, 'Socials'))
            
            # Sort by creation date (newest first)
            media_items.sort(key=lambda x: x['createdAt'], reverse=True)
            # Get year folder info for response
            year_folder = service.files().get(fileId=year_folder_id, fields="id,name,createdTime,modifiedTime").execute()
            
            # Prepare response
            response_data = {
                'folder': {
                    'id': year_folder['id'],
                    'name': year_folder['name'],
                    'year': year,
                    'createdAt': year_folder.get('createdTime', ''),
                    'modifiedAt': year_folder.get('modifiedTime', '')
                },
                'items': media_items,
                'count': len(media_items),
                'categories': {
                    'workshops': len([item for item in media_items if item.get('category') == 'Workshops']),
                    'socials': len([item for item in media_items if item.get('category') == 'Socials'])
                }
            }
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            # Disable caching in development
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            
        except HttpError as error:
            print(f"HttpError in gallery API: {error}")
            print(f"Error status: {error.resp.status if error.resp else 'No response'}")
            print(f"Error details: {error.content if hasattr(error, 'content') else 'No content'}")
            if error.resp.status == 404:
                self.send_error_response(404, {'error': 'Folder not found'})
            elif error.resp.status == 403:
                self.send_error_response(403, {'error': 'Access denied. Please check folder permissions.', 'details': str(error)})
            else:
                self.send_error_response(500, {'error': 'Failed to fetch gallery data', 'details': str(error)})
        except Exception as error:
            print(f"Error in gallery API: {error}")
            print(f"Error type: {type(error)}")
            import traceback
            traceback.print_exc()
            self.send_error_response(500, {'error': 'Internal server error', 'details': str(error)})
    
    def handle_featured_photos_api(self):
        """Handle the /api/featured-photos endpoint for Captured_Moments folder"""
        try:
            # Initialize Google Drive client
            credentials = service_account.Credentials.from_service_account_info({
                "type": "service_account",
                "project_id": os.getenv('GOOGLE_PROJECT_ID'),
                "private_key_id": "key-id",
                "private_key": os.getenv('GOOGLE_PRIVATE_KEY').replace('\\n', '\n'),
                "client_email": os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
                "client_id": "client-id",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')}"
            })
            
            service = build('drive', 'v3', credentials=credentials)
            
            # First, find the Captured_Moments folder
            root_folder_id = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
            
            # Search for Captured_Moments folder
            results = service.files().list(
                q=f"'{root_folder_id}' in parents and name = 'Captured_Moments' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="files(id, name)"
            ).execute()
            
            folders = results.get('files', [])
            if not folders:
                self.send_error_response(404, {'error': 'Captured_Moments folder not found'})
                return
            
            captured_moments_id = folders[0]['id']
            
            # Get all images from Captured_Moments folder
            results = service.files().list(
                q=f"'{captured_moments_id}' in parents and mimeType contains 'image/' and trashed = false",
                pageSize=100,
                fields="files(id, name, mimeType, size, createdTime)",
                orderBy="createdTime desc"
            ).execute()
            
            files = results.get('files', [])
            featured_photos = []
            
            for file in files:
                file_id = file['id']
                featured_photos.append({
                    'id': file_id,
                    'name': file['name'],
                    'type': 'image',
                    'mimeType': file.get('mimeType', ''),
                    'thumbnailUrl': f"https://lh3.googleusercontent.com/d/{file_id}=w800",
                    'viewUrl': f"https://lh3.googleusercontent.com/d/{file_id}=w1600",
                    'downloadUrl': f"https://drive.google.com/uc?export=download&id={file_id}",
                    'size': int(file.get('size', 0)),
                    'createdAt': file.get('createdTime', '')
                })
            
            # Prepare response
            response_data = {
                'folder': {
                    'id': captured_moments_id,
                    'name': 'Captured_Moments'
                },
                'items': featured_photos,
                'count': len(featured_photos)
            }
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            # Disable caching in development
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            
        except HttpError as error:
            print(f"HttpError in featured photos API: {error}")
            if error.resp.status == 404:
                self.send_error_response(404, {'error': 'Folder not found'})
            elif error.resp.status == 403:
                self.send_error_response(403, {'error': 'Access denied. Please check folder permissions.', 'details': str(error)})
            else:
                self.send_error_response(500, {'error': 'Failed to fetch featured photos', 'details': str(error)})
        except Exception as error:
            print(f"Error in featured photos API: {error}")
            import traceback
            traceback.print_exc()
            self.send_error_response(500, {'error': 'Internal server error', 'details': str(error)})
    
    def send_error_response(self, status_code, error_data):
        """Send JSON error response"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(error_data).encode())
    
    def guess_type(self, path):
        """Guess the MIME type of a file"""
        base, ext = os.path.splitext(path)
        if ext in self.extensions_map:
            return self.extensions_map[ext]
        return super().guess_type(path)

def main():
    port = 8000
    server_address = ('', port)
    
    # Create HTTP server
    httpd = HTTPServer(server_address, APIRequestHandler)
    
    print(f"\n🎉 A Lo Cubano Boulder Fest Development Server")
    print(f"📍 Server running at http://localhost:{port}")
    print(f"📁 Serving directory: {os.getcwd()}")
    print(f"\n✅ Google Drive API configured:")
    print(f"   - Service Account: {os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')}")
    print(f"   - Project ID: {os.getenv('GOOGLE_PROJECT_ID')}")
    print(f"   - Folder ID: {os.getenv('GOOGLE_DRIVE_FOLDER_ID')}")
    print(f"\n🏠 Home page: http://localhost:{port}")
    print(f"🖼️  Gallery page: http://localhost:{port}/pages/typographic/gallery.html")
    print(f"🔌 API endpoint: http://localhost:{port}/api/gallery")
    print(f"\nPress Ctrl+C to stop the server...\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n✋ Server stopped")
        sys.exit(0)

if __name__ == '__main__':
    # Install required packages if not available
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        print("Installing required packages...")
        os.system("pip install google-auth google-auth-httplib2 google-api-python-client")
        print("Please restart the server")
        sys.exit(1)
    
    main()
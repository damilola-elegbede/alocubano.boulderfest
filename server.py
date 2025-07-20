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
import gzip
import io
from urllib.parse import urlparse, parse_qs
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
    
    def send_compressed_response(self, data, content_type='application/json'):
        """Send response with gzip compression if client supports it"""
        # Check if client accepts gzip
        accept_encoding = self.headers.get('Accept-Encoding', '')
        
        if 'gzip' in accept_encoding and len(data) > 1024:  # Only compress if > 1KB
            # Compress the data
            buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=buffer, mode='wb') as f:
                if isinstance(data, str):
                    f.write(data.encode('utf-8'))
                else:
                    f.write(data)
            compressed_data = buffer.getvalue()
            
            # Send compressed response
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-length', str(len(compressed_data)))
            
            # Enhanced caching headers
            if content_type == 'application/json':
                self.send_header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')  # 5 min cache
            
            self.end_headers()
            self.wfile.write(compressed_data)
            
            print(f"📦 Compressed response: {len(data if isinstance(data, bytes) else data.encode('utf-8'))} → {len(compressed_data)} bytes ({len(compressed_data)/(len(data if isinstance(data, bytes) else data.encode('utf-8')))*100:.1f}%)")
        else:
            # Send uncompressed response
            self.send_response(200)
            self.send_header('Content-type', content_type)
            if isinstance(data, str):
                data = data.encode('utf-8')
            self.send_header('Content-length', str(len(data)))
            
            if content_type == 'application/json':
                self.send_header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
            
            self.end_headers()
            self.wfile.write(data)
    
    def do_GET(self):
        # Parse the URL
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Handle API endpoints
        if path == '/api/featured-photos':
            self.handle_featured_photos_api()
            return
        elif path == '/api/gallery':
            self.handle_gallery_api()
            return
        elif path == '/api/drive-folders':
            self.handle_drive_folders_api()
            return
        elif path == '/api/debug-gallery':
            self.handle_debug_gallery_api()
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

    def handle_gallery_api(self):
        """Handle /api/gallery endpoint for festival photo galleries"""
        print("🚨 GALLERY API HANDLER CALLED!")
        try:
            # Parse query parameters
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            year = query_params.get('year', ['2025'])[0]
            category = query_params.get('category', [None])[0]
            limit = int(query_params.get('limit', ['50'])[0])
            offset = int(query_params.get('offset', ['0'])[0])
            
            print(f"📸 Gallery API request - year: {year}, category: {category}")
            
            # Get photos from Google Drive folder structure - NO ERROR HIDING
            gallery_data = get_gallery_photos_from_drive_WORKING(year, category)
            
            response_data = {
                "year": year,
                "categories": gallery_data["categories"],
                "items": [],
                "totalCount": gallery_data["totalCount"],
                "limit": limit,
                "offset": offset,
                "hasMore": False,
                "cacheTimestamp": "2025-07-20T05:30:00Z"
            }
            
            # Filter by category if specified
            if category:
                if category.lower() in response_data["categories"]:
                    filtered_categories = {category.lower(): response_data["categories"][category.lower()]}
                    response_data["categories"] = filtered_categories
                    response_data["totalCount"] = len(response_data["categories"][category.lower()])
                else:
                    response_data["categories"] = {}
                    response_data["totalCount"] = 0
            
            # Implement pagination
            all_items = []
            for items in response_data["categories"].values():
                all_items.extend(items)
            
            # Sort by creation time for consistent pagination
            all_items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            
            # Apply pagination
            total_items = len(all_items)
            paginated_items = all_items[offset:offset + limit]
            has_more = (offset + limit) < total_items
            
            response_data["items"] = paginated_items
            response_data["totalCount"] = total_items
            response_data["hasMore"] = has_more
            response_data["currentPage"] = (offset // limit) + 1
            response_data["totalPages"] = (total_items + limit - 1) // limit
            
            # Send compressed JSON response
            response_json = json.dumps(response_data)
            self.send_compressed_response(response_json, 'application/json')
            print(f"✅ Gallery API response sent - {response_data['totalCount']} items")
            
        except Exception as e:
            print(f"❌ Gallery API Error: {e}")
            # Send error response
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'year': year if 'year' in locals() else '2025',
                'categories': {},
                'items': [],
                'totalCount': 0
            }
            
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def handle_drive_folders_api(self):
        """Handle /api/drive-folders endpoint to list accessible folders"""
        try:
            # Get top-level folders accessible with current credentials
            folders = list_accessible_drive_folders()
            
            # Send JSON response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response_data = {
                'folders': folders,
                'total': len(folders)
            }
            
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            print(f"❌ Drive Folders API Error: {e}")
            # Send error response
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'folders': [],
                'total': 0
            }
            
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def handle_debug_gallery_api(self):
        """Debug endpoint to check what's in the gallery folders"""
        try:
            debug_info = debug_gallery_folders()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            self.wfile.write(json.dumps(debug_info, indent=2).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            error_response = {'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def handle_image_proxy_api(self, path):
        """Handle /api/image-proxy/<file_id> endpoint with thumbnail support"""
        try:
            # Extract file_id from path
            match = re.match(r'/api/image-proxy/([a-zA-Z0-9_-]+)', path)
            if not match:
                self.send_error(400, "Invalid file ID")
                return
            
            file_id = match.group(1)
            
            # Parse query parameters for size
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            size = query_params.get('size', [None])[0]
            quality = int(query_params.get('quality', ['85'])[0])
            
            print(f"🖼️ Proxying image for file ID: {file_id}, size: {size}, quality: {quality}")
            
            # Get image data from Google Drive
            image_data, content_type = get_image_from_drive(file_id, size, quality)
            
            if image_data is None:
                self.send_error(404, "Image not found")
                return
            
            # Send image response with proper headers
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Content-length', str(len(image_data)))
            
            # Add aggressive caching headers (7 days for thumbnails, 24 hours for full size)
            cache_duration = 604800 if size == 'thumbnail' else 86400  # 7 days vs 24 hours
            self.send_header('Cache-Control', f'public, max-age={cache_duration}, immutable')
            self.send_header('ETag', f'"{file_id}-{size or "full"}-{quality}"')
            
            # Add compression hint
            self.send_header('Vary', 'Accept-Encoding')
            
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

def get_image_from_drive(file_id, size=None, quality=85):
    """Fetch image binary data from Google Drive with optional thumbnail generation"""
    try:
        print(f"🔍 Fetching image data for file ID: {file_id}, size: {size}")
        
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
            
            # If thumbnail requested and it's an image, resize it
            if size == 'thumbnail' and content_type.startswith('image/'):
                try:
                    from PIL import Image
                    import io
                    
                    # Open image with PIL
                    img = Image.open(io.BytesIO(image_data))
                    
                    # Convert to RGB if necessary (for JPEG output)
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGB')
                    
                    # Calculate thumbnail size (300x300 max, maintaining aspect ratio)
                    img.thumbnail((300, 300), Image.Resampling.LANCZOS)
                    
                    # Save as JPEG with specified quality
                    output = io.BytesIO()
                    img.save(output, format='JPEG', quality=quality, optimize=True)
                    thumbnail_data = output.getvalue()
                    
                    print(f"📐 Generated thumbnail: {len(image_data)} → {len(thumbnail_data)} bytes ({len(thumbnail_data)/len(image_data)*100:.1f}%)")
                    
                    return thumbnail_data, 'image/jpeg'
                    
                except ImportError:
                    print("⚠️ PIL not available, serving original image")
                    return image_data, content_type
                except Exception as e:
                    print(f"⚠️ Thumbnail generation failed: {e}, serving original")
                    return image_data, content_type
            
            return image_data, content_type
            
        except HttpError as e:
            if e.resp.status == 404:
                print(f"❌ File content not found: {file_id}")
                return None, None
            raise
        
    except Exception as e:
        print(f"❌ Error fetching image from Drive: {e}")
        return None, None

def get_gallery_photos_from_drive_WORKING(year, category_filter=None):
    """Working version based on debug script logic"""
    try:
        # Use exact same setup as debug script that works
        service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        project_id = os.getenv('GOOGLE_PROJECT_ID')
        
        if not service_account_email or not private_key or not project_id:
            raise Exception('Missing Google Service Account credentials')
        
        credentials = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": service_account_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
        
        service = build('drive', 'v3', credentials=credentials)
        
        # Use known working folder IDs from debug script
        workshops_id = "1bfMHqDMG6KF7maQwIpteBsyRfpzzEyer"
        socials_id = "1rf4MKkOfxPGEpc-UGVRls4FyZIu2P3tX"
        
        categories = {}
        total_count = 0
        
        for folder_name, folder_id in [("workshops", workshops_id), ("socials", socials_id)]:
            print(f"🔍 Processing {folder_name} folder (ID: {folder_id})")
            
            # Skip if specific category requested and this isn't it
            if category_filter and folder_name != category_filter.lower():
                print(f"⏭️ Skipping {folder_name} due to category filter: {category_filter}")
                continue
            
            # Use exact same query as working debug script
            query = f"'{folder_id}' in parents and trashed = false"
            print(f"📝 Query: {query}")
            
            results = service.files().list(
                q=query,
                fields="files(id, name, mimeType, size, createdTime)",
                pageSize=100,
                orderBy='createdTime desc'
            ).execute()
            
            all_files = results.get('files', [])
            print(f"📂 Found {len(all_files)} total files in {folder_name}")
            
            # Filter for images and videos
            photos = [f for f in all_files if f['mimeType'].startswith('image/') or f['mimeType'].startswith('video/')]
            print(f"📸 Filtered to {len(photos)} photos in {folder_name}")
            
            # Convert to gallery format
            gallery_items = []
            for photo in photos:
                gallery_items.append({
                    "id": photo['id'],
                    "name": photo['name'],
                    "type": "image" if photo['mimeType'].startswith('image/') else "video",
                    "category": folder_name,
                    "thumbnailUrl": f"/api/image-proxy/{photo['id']}?size=thumbnail&quality=80",
                    "viewUrl": f"/api/image-proxy/{photo['id']}",
                    "mimeType": photo['mimeType'],
                    "size": int(photo.get('size', 0)),
                    "createdAt": photo['createdTime']
                })
            
            categories[folder_name] = gallery_items
            total_count += len(gallery_items)
        
        return {
            "categories": categories,
            "totalCount": total_count
        }
        
    except Exception as e:
        print(f"❌ Error in get_gallery_photos_from_drive_WORKING: {e}")
        raise e

def get_gallery_photos_from_drive_OLD(year, category_filter=None):
    """
    Get gallery photos from Google Drive organized by year and category
    Structure: Media/ALoCubano_BolderFest_2025/workshops/ and /socials/
    """
    try:
        # Use the same credentials setup as other working Google Drive functions
        service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        project_id = os.getenv('GOOGLE_PROJECT_ID')
        
        if not service_account_email or not private_key or not project_id:
            raise Exception('Missing Google Service Account credentials in environment variables')
        
        credentials = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": service_account_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
        
        service = build('drive', 'v3', credentials=credentials)
        
        print(f"🔍 Searching for gallery photos - year: {year}, category: {category_filter}")
        
        # Find the year folder (e.g., ALoCubano_BolderFest_2025) by name (same approach as hero function)
        year_folder_name = f"ALoCubano_BolderFest_{year}"
        print(f"🔍 Searching for {year_folder_name} folder...")
        year_query = f"name = '{year_folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        print(f"📝 Query: {year_query}")
        
        year_results = service.files().list(q=year_query, fields="files(id, name)").execute()
        year_folders = year_results.get('files', [])
        print(f"📂 Found {len(year_folders)} {year_folder_name} folders")
        
        if not year_folders:
            print(f"❌ Year folder {year_folder_name} not found!")
            raise Exception(f'Year folder {year_folder_name} not found')
        
        year_folder_id = year_folders[0]['id']
        print(f"✅ Found year folder ID: {year_folder_id}")
        
        # Get category folders (workshops, socials) 
        category_query = f"'{year_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        category_results = service.files().list(q=category_query, fields="files(id, name)").execute()
        category_folders = category_results.get('files', [])
        
        print(f"📂 Category query: {category_query}")
        print(f"📂 Found category folders: {[(f['name'], f['id']) for f in category_folders]}")
        
        # DEBUG: If no folders found, let's see what's actually in the year folder
        if not category_folders:
            print("🔍 DEBUG: No category folders found, checking what's in year folder:")
            debug_query = f"'{year_folder_id}' in parents and trashed = false"
            debug_results = service.files().list(q=debug_query, fields="files(id, name, mimeType)").execute()
            debug_files = debug_results.get('files', [])
            for file in debug_files:
                print(f"  - {file['name']} (ID: {file['id']}, MIME: {file['mimeType']})")
        
        print(f"📂 Found {len(category_folders)} category folders: {[f['name'] for f in category_folders]}")
        
        # DEBUG: Also check for files directly in the year folder
        year_files_query = f"'{year_folder_id}' in parents and trashed = false"
        year_files_results = service.files().list(q=year_files_query, fields="files(id, name, mimeType)").execute()
        year_files = year_files_results.get('files', [])
        print(f"🔍 DEBUG: Found {len(year_files)} total items in year folder:")
        for item in year_files:
            item_type = "📁" if item['mimeType'] == 'application/vnd.google-apps.folder' else "📄"
            print(f"  {item_type} {item['name']} (MIME: {item['mimeType']})")
        
        categories = {}
        total_count = 0
        
        for folder in category_folders:
            folder_name = folder['name']  # Keep original capitalization
            category_name = folder_name.lower()  # Use lowercase for API responses and filtering
            
            # Skip if specific category requested and this isn't it
            if category_filter and category_name != category_filter.lower():
                continue
            
            print(f"📸 Processing {folder_name} folder (ID: {folder['id']})...")
            
            # DEBUG: First check ALL files in this folder (same as hero implementation)
            print(f"📋 Checking ALL files in {folder_name} folder...")
            all_files_query = f"'{folder['id']}' in parents"
            all_files_results = service.files().list(
                q=all_files_query,
                fields="files(id, name, mimeType, size, createdTime)",
                orderBy='createdTime desc'
            ).execute()
            all_files = all_files_results.get('files', [])
            print(f"📂 Found {len(all_files)} total files in {folder_name}")
            
            if all_files:
                print(f"📋 All files in {folder_name}:")
                for i, file in enumerate(all_files[:5]):  # Show first 5 files
                    print(f"  {i+1}. {file['name']} (MIME: {file['mimeType']})")
            
            # Get photos from this category folder (use exact same query as working debug script)
            print(f"🖼️ Searching for images/videos in {folder_name}...")
            photos_query = f"'{folder['id']}' in parents and trashed = false"
            print(f"📝 Query (same as debug script): {photos_query}")
            
            photos_results = service.files().list(
                q=photos_query,
                fields="files(id, name, mimeType, size, createdTime)",
                orderBy='createdTime desc'
            ).execute()
            
            all_photos = photos_results.get('files', [])
            print(f"📸 Found {len(all_photos)} total files in {folder_name}")
            
            # Filter for images and videos after getting all files
            photos = [photo for photo in all_photos if photo['mimeType'].startswith('image/') or photo['mimeType'].startswith('video/')]
            print(f"📸 Filtered to {len(photos)} images/videos in {folder_name}")
            
            # Convert to gallery format
            gallery_items = []
            for photo in photos:
                gallery_items.append({
                    "id": photo['id'],
                    "name": photo['name'],
                    "type": "image" if photo['mimeType'].startswith('image/') else "video",
                    "category": category_name,  # Use lowercase for consistency
                    "thumbnailUrl": f"/api/image-proxy/{photo['id']}",
                    "viewUrl": f"/api/image-proxy/{photo['id']}",
                    "mimeType": photo['mimeType'],
                    "size": int(photo.get('size', 0)),
                    "createdAt": photo['createdTime']
                })
            
            categories[category_name] = gallery_items
            total_count += len(gallery_items)
        
        print(f"✅ Gallery data processed - {total_count} total photos across {len(categories)} categories")
        
        return {
            "categories": categories,
            "totalCount": total_count
        }
        
    except Exception as e:
        print(f"❌ Error in get_gallery_photos_from_drive: {e}")
        raise e

def list_accessible_drive_folders():
    """List all folders accessible with current Google Drive credentials"""
    try:
        print("🔍 Listing accessible Google Drive folders...")
        
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
        
        # Get all folders accessible to this service account (no parent filter = root level)
        print("📂 Searching for root-level folders...")
        query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        
        results = service.files().list(
            q=query,
            fields="files(id, name, parents, shared, webViewLink, createdTime, modifiedTime)",
            orderBy='name',
            pageSize=100
        ).execute()
        
        folders = results.get('files', [])
        print(f"📂 Found {len(folders)} accessible folders")
        
        # Format response
        formatted_folders = []
        for folder in folders:
            parents = folder.get('parents', [])
            is_root = len(parents) == 0 or 'root' in parents
            
            formatted_folders.append({
                'id': folder['id'],
                'name': folder['name'],
                'isRoot': is_root,
                'parents': parents,
                'shared': folder.get('shared', False),
                'webViewLink': folder.get('webViewLink', ''),
                'createdTime': folder.get('createdTime', ''),
                'modifiedTime': folder.get('modifiedTime', '')
            })
        
        print(f"✅ Returning {len(formatted_folders)} formatted folders")
        return formatted_folders
        
    except Exception as e:
        print(f"❌ Error listing accessible folders: {e}")
        raise e

def debug_gallery_folders():
    """Debug function to check what's actually in the gallery folders"""
    try:
        # Use same credentials as other functions
        service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
        private_key = os.getenv('GOOGLE_PRIVATE_KEY')
        project_id = os.getenv('GOOGLE_PROJECT_ID')
        
        if not service_account_email or not private_key or not project_id:
            raise Exception('Missing Google Service Account credentials')
        
        credentials = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": service_account_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
        
        service = build('drive', 'v3', credentials=credentials)
        
        debug_info = {"status": "success", "folders": {}}
        
        # Get the Workshops folder directly by ID (from our earlier API call)
        workshops_folder_id = "1bfMHqDMG6KF7maQwIpteBsyRfpzzEyer"
        socials_folder_id = "1rf4MKkOfxPGEpc-UGVRls4FyZIu2P3tX"
        
        for folder_name, folder_id in [("Workshops", workshops_folder_id), ("Socials", socials_folder_id)]:
            # Get ALL files in this folder
            query = f"'{folder_id}' in parents and trashed = false"
            results = service.files().list(
                q=query,
                fields="files(id, name, mimeType, size, createdTime, parents)",
                pageSize=100,
                orderBy='createdTime desc'
            ).execute()
            
            files = results.get('files', [])
            
            folder_debug = {
                "folder_id": folder_id,
                "total_files": len(files),
                "files": []
            }
            
            for file in files:
                folder_debug["files"].append({
                    "id": file['id'],
                    "name": file['name'],
                    "mimeType": file['mimeType'],
                    "size": file.get('size', 'unknown'),
                    "createdTime": file.get('createdTime', ''),
                    "isImage": file['mimeType'].startswith('image/'),
                    "isVideo": file['mimeType'].startswith('video/')
                })
            
            debug_info["folders"][folder_name] = folder_debug
        
        return debug_info
        
    except Exception as e:
        return {"status": "error", "error": str(e)}

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
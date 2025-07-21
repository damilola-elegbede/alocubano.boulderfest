#!/usr/bin/env python3
"""
Debug script to check what photos exist in the Google Drive gallery folders
"""

import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build

# Load environment variables
load_dotenv('.env.local')

def main():
    # Setup credentials exactly like the server
    service_account_email = os.getenv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    private_key = os.getenv('GOOGLE_PRIVATE_KEY')
    project_id = os.getenv('GOOGLE_PROJECT_ID')
    
    print(f"Service account: {service_account_email}")
    print(f"Project ID: {project_id}")
    print(f"Private key present: {'Yes' if private_key else 'No'}")
    
    if not service_account_email or not private_key or not project_id:
        print("❌ Missing credentials")
        return
    
    # Create credentials
    credentials = service_account.Credentials.from_service_account_info({
        "type": "service_account",
        "project_id": project_id,
        "private_key": private_key,
        "client_email": service_account_email,
        "token_uri": "https://oauth2.googleapis.com/token"
    }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
    
    service = build('drive', 'v3', credentials=credentials)
    
    # Known folder IDs from our previous API call
    workshops_id = "1bfMHqDMG6KF7maQwIpteBsyRfpzzEyer"
    socials_id = "1rf4MKkOfxPGEpc-UGVRls4FyZIu2P3tX"
    
    for folder_name, folder_id in [("Workshops", workshops_id), ("Socials", socials_id)]:
        print(f"\n📂 Checking {folder_name} folder (ID: {folder_id})")
        
        # Get ALL files in this folder
        query = f"'{folder_id}' in parents and trashed = false"
        print(f"Query: {query}")
        
        try:
            results = service.files().list(
                q=query,
                fields="files(id, name, mimeType, size, createdTime, webViewLink)",
                pageSize=100,
                orderBy='createdTime desc'
            ).execute()
            
            files = results.get('files', [])
            print(f"Found {len(files)} files:")
            
            for i, file in enumerate(files):
                is_image = file['mimeType'].startswith('image/')
                is_video = file['mimeType'].startswith('video/')
                media_type = "🖼️" if is_image else "🎥" if is_video else "📄"
                
                print(f"  {i+1}. {media_type} {file['name']}")
                print(f"      MIME: {file['mimeType']}")
                print(f"      Size: {file.get('size', 'unknown')} bytes")
                print(f"      Created: {file.get('createdTime', 'unknown')}")
                print(f"      Link: {file.get('webViewLink', 'no link')}")
                print()
                
                if i >= 4:  # Limit to first 5 files for readability
                    if len(files) > 5:
                        print(f"  ... and {len(files) - 5} more files")
                    break
                    
        except Exception as e:
            print(f"❌ Error checking {folder_name}: {e}")

if __name__ == "__main__":
    main()
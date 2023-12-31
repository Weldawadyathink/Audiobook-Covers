import os
import requests
import urllib.parse
import mimetypes

# Define the directories
source_directory = './bdfr_downloads/AudiobookCovers'
failed_directory = os.path.join('./failed')
complete_directory = os.path.join('./complete')

# Ensure the failed and complete directories exist
if not os.path.exists(failed_directory):
    os.makedirs(failed_directory)
if not os.path.exists(complete_directory):
    os.makedirs(complete_directory)

# Function to get the MIME type of a file
def get_mime_type(file):
    mime_type, _ = mimetypes.guess_type(file)
    return mime_type

# Function to upload the file
def upload_file(file_path, post_id, extension, mime_type):
    source_url = f'https://www.reddit.com/{post_id}'
    encoded_source_url = urllib.parse.quote(source_url, safe='')

    # Generate S3 presigned URL
    presigned_url = f"https://dev.api.audiobookcovers.com/upload/cover?extension={extension}&source={encoded_source_url}&mime_type={mime_type}"
    response = requests.get(presigned_url)
    if response.status_code == 200:
        upload_url = response.json().get('url')
        if upload_url:
            with open(file_path, 'rb') as file:
                file_contents = file.read()
                upload_response = requests.put(upload_url, data=file_contents, headers={'Content-Type': mime_type})
                if upload_response.status_code == 200:
                    print(f"Successfully uploaded {file_path}. Moving to complete directory.")
                    # Move the file to the complete directory
                    os.rename(file_path, os.path.join(complete_directory, os.path.basename(file_path)))
                else:
                    print(f"Failed to upload {file_path}: {upload_response.text}")
        else:
            print(f"No upload URL received for {file_path}")
    else:
        print(f"Failed to get presigned URL for {file_path}: {response.text}")

# Process the files
for filename in os.listdir(source_directory):
    file_path = os.path.join(source_directory, filename)
    if os.path.isfile(file_path):
        mime_type = get_mime_type(file_path)
        if mime_type in ['image/jpeg', 'image/png', 'image/webp']:
            # Extract the reddit post ID and file extension
            post_id = filename[:7]
            extension = filename.split('.')[-1]
            upload_file(file_path, post_id, extension, mime_type)
        else:
            # Move non-image files to the failed directory
            os.rename(file_path, os.path.join(failed_directory, filename))
            print(f"Moved {file_path} to {failed_directory}")

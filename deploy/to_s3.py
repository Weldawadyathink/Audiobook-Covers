import boto3
import os
import sqlite3
import hashlib
import io
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

load_dotenv()

save_bucket_name = "audiobookcovers"
save_folder = "covers"

database_file = './covers.db'

s3 = boto3.resource('s3', endpoint_url=os.getenv("ENDPOINT_URL"),
                    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"))

def fetch_images_from_db(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT filename, image_data FROM reddit_image WHERE is_overview_image=0")
    return cursor.fetchall()

def get_remote_etag(filename):
    try:
        obj = s3.Object(save_bucket_name, f'{save_folder}/{filename}')
        response = obj.get()
        return response['ETag'].strip('"')
    except s3.meta.client.exceptions.ClientError:
        return None

def compute_md5_hash(data):
    md5 = hashlib.md5()
    md5.update(data)
    return md5.hexdigest()

def upload_image_to_r2(filename, image_data):
    s3.Object(save_bucket_name, f'{save_folder}/{filename}').put(Body=io.BytesIO(image_data))

def process_image(image):
    filename, image_data = image
    local_md5 = compute_md5_hash(image_data)
    remote_etag = get_remote_etag(filename)

    if remote_etag is None or remote_etag != local_md5:
        upload_image_to_r2(filename, image_data)
        return True
    else:
        return False

def file_exists_in_db(conn, filename):
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM reddit_image WHERE filename=? and is_overview_image=0", (filename,))
    return cursor.fetchone() is not None

def remove_stale_files_from_bucket(conn):
    print('[R2] Removing stale files from Cloudflare R2...')
    removed = 0
    for obj in s3.Bucket(save_bucket_name).objects.filter(Prefix=f'{save_folder}/'):
        filename = obj.key.split('/')[-1]
        if not file_exists_in_db(conn, filename):
            removed += 1
            obj.delete()
    print(f'[R2] Removed {removed} stale files.')

def main():
    print('[R2] Uploading images to Cloudflare R2...')
    conn = sqlite3.connect(database_file)
    images = fetch_images_from_db(conn)

    with ThreadPoolExecutor(max_workers=50) as executor:
        results = list(executor.map(process_image, images))

    upload_count = results.count(True)
    skip_count = results.count(False)
    
    print(f'[R2] Upload complete. Uploaded {upload_count} images and skipped {skip_count} images.')
    remove_stale_files_from_bucket(conn)
    conn.close()

if __name__ == '__main__':
    main()

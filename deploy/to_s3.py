import boto3
import os
import sqlite3
import hashlib
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
from keys import get_boto3_client
from db import get_covers_db
from fileinput import filename
from sqlalchemy import text

save_info = (
    {
        's3': get_boto3_client(),
        'save_bucket_name': 'audiobookcovers-v2',
        'save_folder': 'covers/fullres',
        'db': get_covers_db(),
        'table': 'Weldawadyathink$covers.image',
        'filename_column': 'filename',
        'image_data_column': 'image_data',
     },
    
    {
        's3': get_boto3_client(),
        'save_bucket_name': 'audiobookcovers-v2',
        'save_folder': 'covers/lowres',
        'db': get_covers_db(),
        'table': 'Weldawadyathink$covers.image',
        'filename_column': 'small_image_filename',
        'image_data_column': 'small_image_data',
    },
)

def fetch_images_from_db(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT filename, image_data FROM reddit_image WHERE is_overview_image=0")
    return cursor.fetchall()

def get_remote_etag(s3, save_bucket_name, save_folder, filename):
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

def upload_image_to_r2(s3, save_bucket_name, save_folder, filename, image_data):
    s3.Object(save_bucket_name, f'{save_folder}/{filename}').put(Body=BytesIO(image_data))

def process_image(image):
    filename, image_data = image
    local_md5 = compute_md5_hash(image_data)
    remote_etag = get_remote_etag(filename)

    if remote_etag is None or remote_etag != local_md5:
        upload_image_to_r2(filename, image_data)
        return True
    else:
        return False

def file_exists_in_db(db, table, filename_column, filename):
    results = db.execute(text(f"SELECT 1 FROM {table} WHERE {filename_column}='{filename}'"))
    return results.fetchone() is not None

def remove_stale_files_from_bucket(db, table, filename_column, s3, save_bucket_name, save_folder):
    print('[R2] Removing stale files from Cloudflare R2...')
    removed = 0
    for obj in s3.Bucket(save_bucket_name).objects.filter(Prefix=f'{save_folder}/'):
        filename = obj.key.split('/')[-1]
        if not file_exists_in_db(db, table, filename_column, filename):
            removed += 1
            obj.delete()
    print(f'[R2] Removed {removed} stale files.')

def send_to_s3(description):
    s3 = description['s3']
    db = description['db']
    save_bucket_name = description['save_bucket_name']
    save_folder = description['save_folder']
    filename_column = description['filename_column']
    image_data_column = description['image_data_column']
    table = description['table']
    
    print(f'Reading {image_data_column} from {table}...')

    query = text(f'SELECT {filename_column}, {image_data_column} FROM {table}')
    result = db.execute(query, execution_options={"stream_results": True})
    
    batch_size = 50
    while True:
        batch = result.fetchmany(batch_size)
        print(f'Loading batch of {50}')
        if not batch:
            break
        
        for filename, image_data in batch:
            local_md5 = compute_md5_hash(image_data)
            remote_etag = get_remote_etag(s3, save_bucket_name, save_folder, filename)

            if remote_etag is None or remote_etag != local_md5:
                upload_image_to_r2(s3, save_bucket_name, save_folder, filename, image_data)
                print(f'Uploaded {filename}')
            else:
                print(f'Skipped {filename}')
    
    remove_stale_files_from_bucket(db, table, filename_column, s3, save_bucket_name, save_folder)


if __name__ == '__main__':
    for description in save_info:
        send_to_s3(description)

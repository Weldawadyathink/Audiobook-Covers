import sqlite3
import subprocess
import os
import re
from PIL import Image
from image_processor import ImageProcessor, ImageHashMatch

def generate_excluded_ids_path(excluded_ids_path, database):
    try:
        os.remove(excluded_ids_path)
    except OSError:
        pass
    with sqlite3.connect(database) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT reddit_post_id FROM reddit_post')
        post_ids = cursor.fetchall()
        with open(excluded_ids_path, 'w') as f:
            for post in post_ids:
                f.write(f'{post[0]}\n')

def run_bdfr_command(excluded_ids_path, log_path):
    bdfr_command = ['bdfr', 'download', './downloader/', '--subreddit', 'audiobookcovers', '--sort', 'new', '--file-scheme', '{POSTID}', '--exclude-id-file', excluded_ids_path, '--log', log_path]
    subprocess.run(bdfr_command)

def extract_failed_ids(log_path):
    failed_ids = []

    patterns = [
        (r'Could not download submission (\S+)', 1),
        # (r'Failed to download resource (\S+)', 1),
        # (r'failed to download submission (\S+)', 1),
        # (r'Failed to write file (\S+)', 1),
        # (r'skipped due to disabled module (\S+)', 1),
    ]

    with open(log_path, 'r') as log_file:
        log_content = log_file.read()

        for pattern, group in patterns:
            matches = re.findall(pattern, log_content)
            for match in matches:
                failed_id = match.rstrip(':')
                failed_ids.append(failed_id)

    return failed_ids

def log_failed_ids(failed, database_path):
    with sqlite3.connect(database_path) as conn:
        cursor = conn.cursor()
        for failed_id in failed:
            cursor.execute(f'INSERT OR IGNORE INTO reddit_post (reddit_post_id, post_type) VALUES (?, ?)',
                           (failed_id, 'failed'))

def process_image_file(file, load_dir, database_file):
    reddit_post_id = file.split('_')[0]
    reddit_post_id = reddit_post_id.split('.')[0]
    extension = file.split('.')[-1]
    filepath = os.path.join(load_dir, file)
    
    with sqlite3.connect(database_file) as conn:
        cursor = conn.cursor()

        if extension == 'txt':
            print(f'Text post detected. Updating database with flag for post {reddit_post_id}.')
            cursor.execute('INSERT OR IGNORE INTO reddit_post(reddit_post_id, post_type) VALUES (?, ?)', (reddit_post_id, 'text'))
            conn.commit()
            os.remove(filepath)
            return

    ip = ImageProcessor()
    
    with Image.open(filepath) as image:
        try:
            ip.process_image(image, extension, reddit_post_id)
            print(f'Writing image data to database for {file}.')
            os.remove(filepath)
        except ImageHashMatch as e:
            print(f'{e} Removing {file}')
            os.remove(filepath)
            return

def main():
    database_path = './covers.db'
    excluded_ids_path = './downloader/excluded-ids.txt'
    log_path = './downloader/download-log.txt'
    generate_excluded_ids_path(excluded_ids_path, database_path)
    run_bdfr_command(excluded_ids_path, log_path)
    try:
        os.remove(excluded_ids_path)
    except OSError:
        pass
    failed = extract_failed_ids(log_path)
    log_failed_ids(failed, database_path)
    try:
        os.remove(log_path)
        os.remove(f'{log_path}.1')
    except OSError:
        pass
    load_dir = './downloader/AudiobookCovers'
    for file in os.listdir(load_dir):
        process_image_file(file, load_dir, database_path)

if __name__ == '__main__':
    main()

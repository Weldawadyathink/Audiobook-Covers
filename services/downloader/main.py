from dotenv import load_dotenv
if __name__ == "__main__":
    load_dotenv()

from downloader import download
from database import get_url_to_download, log_download_error, is_image_hash_unique, add_image_to_database, log_complete_download, log_invalid_url
from uuid import uuid4
from PIL import Image
from s3 import upload_image_variations
from image_tools import get_image_hash
from cloud_vision import get_image_text
import shutil
import os


base_download_folder = '.'


def process_one_image_file(file, reddit_post_id):
    with Image.open(file) as image:
        image_hash = get_image_hash(image)
        if is_image_hash_unique(image_hash):
            id = str(uuid4())
            print(f"Adding image id {id} to database")
            source = f"https://reddit.com/{reddit_post_id}"
            cloud_vision_text = get_image_text(file)
            extension = file.split(".")[-1]
            upload_image_variations(image, id, extension, file)
            add_image_to_database(id, source, extension, image_hash, cloud_vision_text)
        else:
            print("Image hash already in database")

            


def download_from_url():
    next_url = get_url_to_download()
    if next_url is None:
        return
    url_id, reddit_post_id, url = next_url
    if url[:4] != "http":
        log_invalid_url(url_id)

    download_folder = f'{base_download_folder}/{str(uuid4())}'
    try:
        print(f"Attempting to download {url_id}")
        download(url, download_folder)
    except Exception as e:
        print(f"Failed to download from id {url_id}, url: {url}")
        log_download_error(url_id)
        return
    
    for dirpath, dirnames, filenames in os.walk(download_folder):
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            process_one_image_file(file_path, reddit_post_id)
            
    log_complete_download(url_id)
    shutil.rmtree(download_folder)
    # TODO: add recursive call
        


if __name__ == "__main__":
    # print(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))
    download_from_url()

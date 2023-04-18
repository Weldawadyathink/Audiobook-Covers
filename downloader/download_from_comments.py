import sqlite3
import re
from imgur_downloader import ImgurDownloader
from image_processor import ImageProcessor
from dotenv import load_dotenv
import os

load_dotenv()

class CommentImageDownloader:
    def __init__(self, database_file = 'covers.db'):
        self._db = sqlite3.connect(database_file)
        self._ip = ImageProcessor(database_file)
        self._imgur = ImgurDownloader(os.getenv("IMGUR_CLIENT_ID"), os.getenv("IMGUR_CLIENT_SECRET"))
        print(self._imgur)
        print(os.getenv("IMGUR_CLIENT_ID"))
        print(os.getenv("IMGUR_CLIENT_SECRET"))
    
    @staticmethod
    def _extract_links(text):
        return re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', text)

    def _process_comment(self, comment_content, reddit_post_id):
        links = self._extract_links(comment_content)
        for link in links:
            self._download_image(link, reddit_post_id)
    
    def _download_image(self, url, reddit_post_id):
        if "imgur.com" in url:
            print(f'Downloading from imgur {url} for https://redd.it/{reddit_post_id}')
            images = self._imgur.download(url)
        else:
            print(f'No downloader found for {url}')
        for image_blob, extension in images:
            self._ip.process_image(image_blob, extension, reddit_post_id)
    
    def download_all(self):
        cursor = self._db.cursor()
        cursor.execute("SELECT content, reddit_post_id FROM reddit_comment")
        comments = cursor.fetchall()
        for comment, reddit_post_id in comments:
            self._process_comment(comment, reddit_post_id)


# def extract_links(text):
#     return re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', text)

# def process_comment(comment_content, reddit_post_id):
#     links = extract_links(comment_content)
#     for link in links:
#         image_downloader(link, reddit_post_id)

# def main(database_file = 'covers.db'):
#     conn = sqlite3.connect(database_file)
#     cursor = conn.cursor()
#     cursor.execute("SELECT content, reddit_post_id FROM reddit_comment")
#     comments = cursor.fetchall()
#     for comment, reddit_post_id in comments:
#         process_comment(comment, reddit_post_id)
#     conn.close()

# def image_downloader(url, reddit_post_id):
#     ip = ImageProcessor()
#     if "imgur.com" in url:
#         print(f'Downloading from imgur {url} for https://redd.it/{reddit_post_id}')
#         images = download_from_imgur(url)
#     else:
#         print(f'No downloader found for {url}')
#     for image_blob, extension in images:
#         ip.process_image(image_blob, extension, reddit_post_id)

if __name__ == '__main__':
    down = CommentImageDownloader()
    down.download_all()

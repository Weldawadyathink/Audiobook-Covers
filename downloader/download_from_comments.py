import sqlite3
import re
from imgur_downloader import ImgurDownloader
from image_processor import ImageProcessor, ImageHashMatch

class CommentImageDownloader:
    def __init__(self, database_file = 'covers.db'):
        self._db = sqlite3.connect(database_file)
        self._ip = ImageProcessor(database_file)
        self._imgur = ImgurDownloader()

    @staticmethod
    def _extract_links(text):
        return re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+(?<!\))', text)


    def _process_comment(self, comment_content, reddit_post_id):
        links = self._extract_links(comment_content)
        print(f'Extracted links: {links}')
        for link in links:
            images = self.download_image(link)
            if images is None:
                print(f'No images found for {link}')
                return
            
            for image, extension in images:
                try:
                    self._ip.process_image(image, extension, reddit_post_id)
                except ImageHashMatch as e:
                    pass

    def download_image(self, url):
        if "imgur.com" in url:
            print(f'Downloading from imgur {url}')
            return self._imgur.download(url)
        print(f'No downloader found for {url}')
        return

    def download_all(self):
        cursor = self._db.cursor()
        cursor.execute("SELECT content, reddit_post_id FROM reddit_comment")
        comments = cursor.fetchall()
        for comment, reddit_post_id in comments:
            self._process_comment(comment, reddit_post_id)


if __name__ == '__main__':
    # down = CommentImageDownloader()
    # images = down.download_image('https://imgur.com/a/Aq78fMU')
    # for image, extension in images:
    #     image.show()
    #     print(f"File extension: {extension}")
    
    down = CommentImageDownloader()
    down.download_all()

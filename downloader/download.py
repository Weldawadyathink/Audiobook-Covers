from imgur_download_provider import ImgurDownloader
import sqlite3
from image_processor import ImageProcessor, ImageHashMatch


def main(db_file = './covers.db'):
    domains = [
        ('imgur.com', ImgurDownloader())
    ]
    
    ip = ImageProcessor(db_file)
    
    db = sqlite3.connect(db_file)
    cursor = db.cursor()
    
    for domain, provider  in domains:
        cursor.execute('select url, reddit_comment_id, reddit_post_id from reddit_link where domain = ?', (domain,))
        for url, reddit_comment_id, reddit_post_id in cursor.fetchall():
            # print(f'Fetching {url} from {domain}...')
            try:
                images = provider.download(url)
            except Exception as e:
                if e == "Failed to find regex match in html":
                    print(f'Failed to download {url} from {domain}')
                    continue
            for image, extension in images:
                try:
                    # print(f'Processing {image}...')
                    ip.process_image(image, extension, reddit_post_id, reddit_comment_id)
                except ImageHashMatch:
                    pass


if __name__ == "__main__": 
    main()

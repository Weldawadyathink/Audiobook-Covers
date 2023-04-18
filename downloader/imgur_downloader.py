import requests
from imgurpython import ImgurClient
import os

class ImgurDownloader:
    def __init__(self, client_id, client_secret):
        self._client = ImgurClient(client_id, client_secret)
    
    @staticmethod
    def is_imgur_url(url):
        return 'imgur.com' in url
    
    def _download_imgur_album(self, url):
        album_id = url.split('/')[-1]
        images = self._client.get_album_images(album_id)
        output = []
        for image in images:
            response = requests.get(image.link)
            _, file_extension = os.path.splitext(image.link)
            output.append((response.content, file_extension))
        return output
    
    def download(self, url):
        if self.is_imgur_url(url):
            return self._download_imgur_album(url)
        return []

if __name__ == '__main__':
    from PIL import Image
    from io import BytesIO
    from dotenv import load_dotenv
    load_dotenv()
    imgur = ImgurDownloader(os.getenv("IMGUR_CLIENT_ID"), os.getenv("IMGUR_CLIENT_SECRET"))
    test_url = 'https://imgur.com/a/U448IOF'
    test_url = 'https://imgur.com/a/Aq78fMU'
    image_blobs = imgur.download(test_url)

    for image_blob, file_extension in image_blobs:
        img = Image.open(BytesIO(image_blob))
        img.show()
        print(f"File extension: {file_extension}")

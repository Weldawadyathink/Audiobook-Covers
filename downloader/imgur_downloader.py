import requests
from imgurpython import ImgurClient
import os
from PIL import Image
from io import BytesIO
from keys import imgur as secrets

class ImgurDownloader:
    def __init__(self):
        self._client = ImgurClient(secrets['client_id'], secrets['client_secret'])
    
    @staticmethod
    def is_imgur_url(url):
        return 'imgur.com' in url
    
    def _download_imgur_album(self, url):
        album_id = url.split('/')[-1]
        print(f'[Imgur Downloader] Getting photos from album with id: {album_id}')
        images = self._client.get_album_images(album_id)
        output = []
        for image in images:
            print(f'[Imgur Downloader] Downloading image with id: {image.id} Link: {image.link}')
            response = requests.get(image.link)
            _, file_extension = os.path.splitext(image.link)
            output.append((Image.open(BytesIO(response.content)), file_extension))
        return output
    
    def download(self, url):
        if self.is_imgur_url(url):
            return self._download_imgur_album(url)
        return []

if __name__ == '__main__':
    from PIL import Image
    from io import BytesIO
    imgur = ImgurDownloader()
    test_url = 'https://imgur.com/a/U448IOF'
    test_url = 'https://imgur.com/a/Aq78fMU'
    images = imgur.download(test_url)

    for image, file_extension in images:
        image.show()
        print(f"File extension: {file_extension}")

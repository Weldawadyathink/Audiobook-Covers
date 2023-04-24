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
    
    def _download_imgur_single_image(self, url):
        if "i.imgur.com" not in url:
            direct_link = self._get_direct_image_link(url)
        else:
            direct_link = url
        print(f'[Imgur Downloader] Downloading single image: {direct_link}')
        response = requests.get(direct_link)
        _, file_extension = os.path.splitext(direct_link)
        return [(Image.open(BytesIO(response.content)), file_extension)]
    
    def _get_direct_image_link(self, url):
        image_id = url.split('/')[-1]
        image = self._client.get_image(image_id)
        return image.link
    
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
    
    def _download_imgur_gallery(self, url):
        gallery_id = url.split('/')[-1]
        gallery_items = self._client.gallery_item(gallery_id)
        output = []
        for item in gallery_items:
            if item.is_album:
                output.extend(self._download_imgur_album(item.link))
            else:
                output.extend(self._download_imgur_single_image(item.link))
        return output
    
    def download(self, url):
        if 'imgur.com/a/' in url:
            return self._download_imgur_album(url)
        elif 'imgur.com/gallery/' in url:
            return self._download_imgur_gallery(url)
        elif self.is_imgur_url(url):
            return self._download_imgur_single_image(url)
        return []

if __name__ == '__main__':
    from PIL import Image
    from io import BytesIO
    imgur = ImgurDownloader()
    
    test_url_single = 'https://imgur.com/BqZN91q'
    # test_url_single = 'https://i.imgur.com/WGzt9Va.jpg'
    single = imgur.download(test_url_single)
    for image, file_extension in single:
        image.show()
        print(f"File extension: {file_extension}")

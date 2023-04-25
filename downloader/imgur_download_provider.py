import requests
from imgurpython import ImgurClient
import os
from PIL import Image
from io import BytesIO
from keys import imgur as secrets
from imgur_downloader import ImgurDownloader as Imgur

class ImgurDownloader:
    
    def __init__(self, tempdir = './temp/'):
        self._tempdir = tempdir

    def download(self, url):
        downloader = Imgur(url, self._tempdir)
        filenames, _ = downloader.save_images('./')
        output = []
        for filename in filenames:
            path = f'{self._tempdir}/{filename}'
            file_extension = filename.split('.')[-1]
            image = Image.open(path)
            output.append((image, file_extension))
            os.remove(path)
        return output
            
        

if __name__ == '__main__':
    from PIL import Image
    from io import BytesIO
    imgur = ImgurDownloader()
    
    tests = [
        'https://imgur.com/a/Y6Y9kSY',
        'https://i.imgur.com/WGzt9Va.jpg',
        'https://imgur.com/gallery/87X8yEQ',
    ]
    
    for test in tests:
        output = imgur.download(test)
        print(output)
        for image, extension in output:
            image.show()
            print(f"File extension: {extension}")

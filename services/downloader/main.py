from dotenv import load_dotenv
if __name__ == "__main__":
    load_dotenv()

from downloader import download
from database import get_url_to_download, log_download_error
from uuid import uuid4


base_download_folder = '.'


def download_from_url():
    url_id, reddit_post_id, url = get_url_to_download()
    download_folder = f'{base_download_folder}/{str(uuid4())}'
    print(download_folder)
    try:
        download(url, download_folder)
    except Exception as e:
        print(e)
        log_download_error(url_id)
        


if __name__ == "__main__":
    download_from_url()
    # test_urls = [
    #     "https://imgur.com/gallery/l9lg0Zl",
    # ]
    # for url in test_urls:
    #     download(url)


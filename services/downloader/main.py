from downloader import download
import psycopg
from psycopg import sql

if __name__ == "__main__":
    test_urls = [
        "https://imgur.com/gallery/l9lg0Zl",
    ]
    for url in test_urls:
        download(url)


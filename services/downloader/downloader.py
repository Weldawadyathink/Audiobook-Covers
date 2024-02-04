from gallery_dl import config, job

def download(url):
    config.set((), "base-directory", ".")
    job.DownloadJob(url).run()
    

if __name__ == "__main__":
    test_urls = [
        "https://imgur.com/gallery/l9lg0Zl",
    ]
    for url in test_urls:
        download(url)
from gallery_dl import config, job

def download(url, folder):
    config.set((), "base-directory", folder)
    job.DownloadJob(url).run()
    

if __name__ == "__main__":
    test_urls = [
        "https://imgur.com/gallery/l9lg0Zl",
    ]
    for url in test_urls:
        download(url, "./testdir")
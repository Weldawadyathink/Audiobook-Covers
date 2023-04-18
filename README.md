# Audiobook-Covers

Audiobook-Covers is a project that downloads and archives audiobook covers from [reddit.com/r/audiobookcovers](https://www.reddit.com/r/audiobookcovers/), stores them in a local database, and performs OCR using Google Cloud Vision API. The project also includes deployment scripts for Cloudflare R2, S3 compatible services, and Elasticsearch. The Cloudflare Worker serves as a serverless API for search, and Cloudflare Pages hosts a website for search functionality and API documentation.

The purpose of this project is to create a centralized and searchable archive of audiobook covers for enthusiasts, researchers, and developers.

The official host for this project is at [audiobookcovers.com](audiobookcovers.com)

## Prerequisites

* Python 3
* Node.js (for the Cloudflare worker)
* Cloudflare Wrangler (for deploying pages and the worker)
* Install the required Python packages with `pip install -r requirements.txt`

## Configuration

1. Set up the following configuration files and environment variables:
   * `./google.json`: Google Cloud project service account with permission to Google Cloud Vision API.
   * `./deploy/.env`:
     * `ELASTIC_URL`
     * `ENDPOINT_URL`
     * `AWS_ACCESS_KEY_ID`
     * `AWS_SECRET_ACCESS_KEY`
   * `./downloader/.env`:
     * `REDDIT_CLIENT_ID`
     * `REDDIT_CLIENT_SECRET`
     * `IMGUR_CLIENT_ID`
     * `IMGUR_CLIENT_SECRET`

## Usage

Use the Makefile to perform various tasks:

* `make download-reddit`: Download audiobook covers from Reddit.
* `make deploy`: Deploy the project, including the worker, pages, Elasticsearch, and files.
* `make deploy-worker`: Deploy the Cloudflare worker.
* `make deploy-pages`: Deploy the Cloudflare pages.
* `make deploy-elasticsearch`: Deploy the OCR text to Elasticsearch.
* `make deploy-files`: Deploy the covers to Cloudflare R2 or any S3 compatible service.
* `make curate-overview`: Curate overview images.

## Limitations and Future Improvements

* Currently, only downloads compatible with bdfr (bulk downloader for reddit) are supported. Planned improvements include downloading links to Google Drive, Imgur albums, and other photo links from within comments.

## Contributing

* Report issues or request features using GitHub Issues.
* Submit bug fixes or improvements via pull requests.

## License

This project is licensed under the GNU General Public License v3.

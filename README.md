# Audiobook-Covers

Audiobook-Covers is a project that downloads and archives audiobook covers from [reddit.com/r/audiobookcovers](https://www.reddit.com/r/audiobookcovers/), stores them in a local database, and performs OCR using Google Cloud Vision API. The project also includes deployment scripts for Cloudflare R2, S3 compatible services, and Elasticsearch. The Cloudflare Worker serves as a serverless API for search, and Cloudflare Pages hosts a website for search functionality and API documentation.

The purpose of this project is to create a centralized and searchable archive of audiobook covers for enthusiasts, researchers, and developers.

The official host for this project is at [audiobookcovers.com](https://audiobookcovers.com)

## Limitations and Future Improvements

* Currently, only downloads compatible with bdfr (bulk downloader for reddit) are supported. Planned improvements include downloading links to Google Drive, Imgur albums, and other photo links from within comments.

## Contributing

* Report issues or request features using GitHub Issues.
* Submit bug fixes or improvements via pull requests.

## License

This project is licensed under the GNU General Public License v3.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Weldawadyathink/Audiobook-Covers&type=Date)](https://star-history.com/#Weldawadyathink/Audiobook-Covers&Date)
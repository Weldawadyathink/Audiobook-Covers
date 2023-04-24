import sqlite3
import re
from urllib.parse import urlparse

class ExtractLinkUrls:
    def __init__(self, database_file='covers.db'):
        self._db = sqlite3.connect(database_file)

    @staticmethod
    def _extract_links(text):
        pattern = r'\((http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|(?:%[0-9a-fA-F][0-9a-fA-F])|[:])+)\)'
        return [match.group(1) for match in re.finditer(pattern, text)]

    @staticmethod
    def _clean_url(url):
        return re.sub(r'[!\\(\\)*]+', '', url)

    @staticmethod
    def _get_domain(url):
        domain =  urlparse(url).netloc
        parts = domain.split('.')
        if len(parts) > 2:
            return '.'.join(parts[-2:])
        return domain

    def _process_comment(self, comment_content, reddit_comment_id, reddit_post_id):
        links = self._extract_links(comment_content)
        cursor = self._db.cursor()
        for link in links:
            cleaned_link = self._clean_url(link)
            domain = self._get_domain(cleaned_link)
            print(f'{domain} | {cleaned_link}')
            cursor.execute("INSERT OR IGNORE INTO reddit_link (reddit_comment_id, reddit_post_id, url, domain) VALUES (?, ?, ?, ?)",
                           (reddit_comment_id, reddit_post_id, cleaned_link, domain))
        self._db.commit()

    def extract_all(self):
        cursor = self._db.cursor()
        cursor.execute("SELECT content, reddit_comment_id, reddit_post_id FROM reddit_comment")
        comments = cursor.fetchall()
        for comment, reddit_comment_id, reddit_post_id in comments:
            self._process_comment(comment, reddit_comment_id, reddit_post_id)

if __name__ == '__main__':
    extractor = ExtractLinkUrls()
    extractor.extract_all()

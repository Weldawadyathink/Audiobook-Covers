import praw
import sqlite3
import os
from keys import reddit as reddit_keys

class CommentDownloader:
    def __init__(self, database_file):
        self.reddit = praw.Reddit(client_id=reddit_keys.client_id,
                                  client_secret=reddit_keys.client_secret,
                                  user_agent="comment_scraper")
        self.db = sqlite3.connect(database_file)
    
    def __del__(self):
        self.db.close()
    
    def insert_comment(self, comment, post_id):
        cursor = self.db.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO reddit_comment (reddit_comment_id, reddit_post_id, parent_id, author, content)
            VALUES (?, ?, ?, ?, ?)
        """, (comment.id, post_id, comment.parent_id, str(comment.author), comment.body))
        self.db.commit()
    
    def fetch_comments_from_post(self, post_id):
        submission = self.reddit.submission(id=post_id)
        submission.comments.replace_more(limit=None)
        for comment in submission.comments.list():
            self.insert_comment(comment, post_id)
    
    def download_all_comments(self):
        print('Starting comment download.')
        cursor = self.db.cursor()
        cursor.execute("""
            SELECT reddit_post_id FROM reddit_post
        """)
        i = 1
        for post_id in cursor.fetchall():
            self.fetch_comments_from_post(post_id[0])
            if i % 25 == 0:
                print(f'Downloaded comments from {i} posts.')
            i += 1
        print(f'Downloaded comments from {i} posts.')

if __name__ == '__main__':
    database_file = 'covers.db'
    downloader = CommentDownloader(database_file)
    downloader.download_all_comments()

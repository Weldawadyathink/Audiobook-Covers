import praw
from time import sleep
import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import re

def add_url(db, url, post_id):
    username_pattern = r'^/u/[^\s/]+'
    if re.match(username_pattern, url):
        return
    cursor = db.cursor()
    cursor.execute(sql.SQL('''
        INSERT INTO public.reddit_url (reddit_post_id, url)
        VALUES (%s, %s)
        ON CONFLICT (url) DO NOTHING
        '''), [
            post_id,
            url,
        ])
    db.commit()


def index_comment(db, comment, post_id):
    soup = BeautifulSoup(comment.body_html, 'html.parser')
    urls = [a['href'] for a in soup.find_all('a', href=True)]
    for url in urls:
        add_url(db, url, post_id)
    
    

def index_submission(db, submission):
    id = submission.id
    print(f"Indexing post {id}")
    add_url(db, submission.url, id)
    submission.comments.replace_more(limit=None)
    for comment in submission.comments.list():
        index_comment(db, comment, id)


def index_new_submissions():
    db = psycopg2.connect(os.environ.get("DATABASE"))
    reddit = praw.Reddit(
        client_id = os.environ.get("PRAW_CLIENT_ID"),
        client_secret = os.environ.get("PRAW_CLIENT_SECRET"),
        user_agent = "AudiobookCovers.com",
    )
    print("---------- Indexing New Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").new():
        index_submission(db, submission)
    db.close()
        

def index_all_submissions():
    db = psycopg2.connect(os.environ.get("DATABASE"))
    reddit = praw.Reddit(
        client_id = os.environ.get("PRAW_CLIENT_ID"),
        client_secret = os.environ.get("PRAW_CLIENT_SECRET"),
        user_agent = "AudiobookCovers.com",
    )
    
    print("---------- Indexing New Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").new():
        index_submission(db, submission)
        
    print("---------- Indexing Hot Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").hot():
        index_submission(db, submission)
        
    print("---------- Indexing Rising Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").rising():
        index_submission(db, submission)
        
    print("---------- Indexing Controversial Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").controversial():
        index_submission(db, submission)
        
    print("---------- Indexing Gilded Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").gilded():
        index_submission(db, submission)
        
    print("---------- Indexing Random Rising Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").random_rising():
        index_submission(db, submission)
        
    print("---------- Indexing Top Posts ----------")
    for submission in reddit.subreddit("audiobookcovers").top():
        index_submission(db, submission)
    
    db.close()
    

if __name__ == "__main__":
    load_dotenv()
    index_new_submissions()

from flask import Flask, request, jsonify
from db import get_covers_db, get_log_db
import datetime
from sqlalchemy import text
import re

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello AudiobookCover Enthusiasts!"

@app.route('/cover/bytext')
def get_covers_by_text():
    user_given_params = request.args.get('q')
    search_text = user_given_params
    query = text("""
        SELECT
            source,
            CONCAT('https://download.audiobookcovers.com/covers/fullres/', filename) AS filename,
            CONCAT('https://download.audiobookcovers.com/covers/lowres/', small_image_filename) AS small_filename
        FROM Weldawadyathink$covers.searchable_images
        WHERE MATCH (search_text) AGAINST (:search_text)
    """)
    db = get_covers_db()
    covers = db.execute(query, {"search_text": f"{search_text}"}).fetchall()
    covers = [cover._asdict() for cover in covers]
    save_search_log('/cover/bytext', user_given_params, search_text, len(covers))
    return jsonify(covers)

@app.route('/cover/byredditpostid')
def get_covers_by_reddit_post_id():
    user_given_params = request.args.get('q')
    reddit_post_id = extract_reddit_post_id(user_given_params)
    query = text("""
        SELECT
            source,
            CONCAT('https://download.audiobookcovers.com/covers/fullres/', filename) AS filename,
            CONCAT('https://download.audiobookcovers.com/covers/lowres/', small_image_filename) AS small_filename
        FROM Weldawadyathink$covers.image
        WHERE reddit_post_id = :reddit_post_id
    """)
    db = get_covers_db()
    covers = db.execute(query, {"reddit_post_id": f"{reddit_post_id}"}).fetchall()
    covers = [cover._asdict() for cover in covers]
    save_search_log('/cover/byredditpostid', user_given_params, reddit_post_id, len(covers))
    return jsonify(covers)

def extract_reddit_post_id(input_str):
    reddit_post_id_regex = r'^[A-Za-z0-9_-]+$'
    
    if re.match(reddit_post_id_regex, input_str):
        return input_str

    reddit_url_regex = r'https?://(?:www\.)?reddit\.com/r/\w+/comments/(\w+)(?:/.*)?'
    match = re.search(reddit_url_regex, input_str)
    
    if match:
        return match.group(1)
    else:
        raise ValueError("Invalid Reddit URL or post ID")

def save_search_log(endpoint, user_given_params, query_params, num_results):
    db = get_log_db()
    try:
        db.execute(text("INSERT INTO search_log (date_time, endpoint, user_given_params, query_params, num_results) VALUES (:date_time, :endpoint, :user_given_params, :query_params, :num_results)"),
                   {'date_time': str(datetime.datetime.now()), 'endpoint': str(endpoint), 'user_given_params': str(user_given_params), 'query_params': str(query_params), 'num_results': str(num_results)})
        db.commit()
        print(f"Search for {user_given_params} returned {num_results} results. Saved in database.")
    except Exception as e:
        print(f"Database error: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    app.run()

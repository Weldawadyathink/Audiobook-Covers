from flask import Flask, request, jsonify
from db import get_covers_db
import datetime

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello AudiobookCover Enthusiasts!"

@app.route('/cover/bytext')
def get_covers_by_text():
    search_text = request.args.get('q')
    covers = get_covers_by_search_text(search_text)
    save_search_log(search_text, len(covers))
    return jsonify(covers)

@app.route('/cover/byredditpostid')
def get_covers_by_reddit_post_id():
    reddit_post_id = request.args.get('q')
    covers = get_covers_by_reddit_id(reddit_post_id)
    save_search_log(f"Reddit Post ID: {reddit_post_id}", len(covers))
    return jsonify(covers)

def save_search_log(search_text, numresults):
    session = get_covers_db()
    try:
        session.execute("INSERT INTO search_log (date_time, search_text, num_results) VALUES (?, ?, ?)", (datetime.datetime.now(), search_text, numresults))
        session.commit()
        print(f"Search for {search_text} returned {numresults} results. Saved in database.")
    except Exception as e:
        print(f"Database error: {e}")
    finally:
        session.close()

def get_covers_by_search_text(search_text):
    session = get_covers_db()
    try:
        results = session.execute("SELECT filename, reddit_post_id FROM Weldawadyathink$covers.image WHERE search_text LIKE ?", (f"%{search_text}%",)).fetchall()
        covers = [{
            "source": f"https://redd.it/{result['reddit_post_id']}",
            "filename": f"https://r2.audiobookcovers.com/covers/{result['filename']}"
        } for result in results]
        return covers
    finally:
        session.close()

def get_covers_by_reddit_id(reddit_post_id):
    session = get_covers_db()
    try:
        results = session.execute("SELECT filename, reddit_post_id FROM Weldawadyathink$covers.image WHERE reddit_post_id = ?", (reddit_post_id,)).fetchall()
        covers = [{
            "source": f"https://redd.it/{result['reddit_post_id']}",
            "filename": f"https://r2.audiobookcovers.com/covers/{result['filename']}"
        } for result in results]
        return covers
    finally:
        session.close()

if __name__ == '__main__':
    app.run()

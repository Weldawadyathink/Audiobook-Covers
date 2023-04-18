from elasticsearch import Elasticsearch, helpers
from dotenv import load_dotenv
import os
import re
import sqlite3

load_dotenv()

bonsai = os.environ['ELASTIC_URL']
auth = re.search('https\:\/\/(.*)\@', bonsai).group(1).split(':')
host = bonsai.replace('https://%s:%s@' % (auth[0], auth[1]), '')

match = re.search('(:\d+)', host)
if match:
    p = match.group(0)
    host = host.replace(p, '')
    port = int(p.split(':')[1])
else:
    port=443

es_header = [{
    'host': host,
    'port': port,
    'use_ssl': True,
    'http_auth': (auth[0],auth[1])
}]

es = Elasticsearch(es_header)

es.ping()

def sync_to_elasticsearch(index, data):
    print('[ES] Syncing data to Elasticsearch...')
    
    # Index new documents
    actions = [
        {
            "_op_type": "index",
            "_index": index,
            "_id": filename,
            "_source": {
                "reddit_post_id": reddit_post_id,
                "filename": filename,
                "cloud_vision_text": cloud_vision_text,
            },
        }
        for reddit_post_id, filename, cloud_vision_text in data
    ]

    success, _ = helpers.bulk(es, actions)
    print(f"[ES] Created {success} entries.")
    
    # Delete stale entries
    db_ids = set(image[1] for image in data)
    stale_ids = set()
    query = {"query": {"match_all": {}}}
    for page in helpers.scan(es, index=index, query=query):
        es_id = page['_id']
        if es_id not in db_ids:
            stale_ids.add(es_id)
    
    delete_actions = [
        {
            "_op_type": "delete",
            "_index": index,
            "_id": stale_id,
        }
        for stale_id in stale_ids
    ]
    
    success, _ = helpers.bulk(es, delete_actions)
    print(f"[ES] Deleted {success} stale entries.")
    print('[ES] Sync complete.')

def load_data(file):
    print('[ES] Loading local database data...')
    with sqlite3.connect(file) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT reddit_post_id, filename, cloud_vision_text FROM reddit_image WHERE is_overview_image=0
        """)
        print(f'[ES] Load complete.')
        return cursor.fetchall()

if __name__ == "__main__":
    index = 'covers'
    data = load_data('covers.db')
    sync_to_elasticsearch(index, data)

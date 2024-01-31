import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request, Response
import json
import numpy as np
import psycopg2
from psycopg2 import sql

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello, World!'


@app.route("/text")
def text_search():
    query = request.args.get("q")
    top_k = int(request.args.get("k"))
    db = psycopg2.connect(os.environ.get("DATABASE"))
    cursor = db.cursor()
    model = SentenceTransformer('./clip-ViT-B-32')
    vector = model.encode(query).tolist()
    query = sql.SQL("""
        SELECT id, extension, source
        FROM image
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """)
    cursor.execute(query, (vector, top_k))
    response = cursor.fetchall()
    # Response should match pinecode format for compatability with frontend
    modified_response = {'matches': [
        {
            'id': item[0],
            'metadata': {
                'extension': item[1],
                'source': item[2],
            }
        }
    for item in response]
    } # This is kinda cursed
    json_data = json.dumps(modified_response)
    return Response(json_data, content_type='application/json')


@app.route("/random")
def random():
    top_k = int(request.args.get("k"))
    vector = np.random.normal(size=512).tolist()
    db = psycopg2.connect(os.environ.get("DATABASE"))
    cursor = db.cursor()
    query = sql.SQL("""
        SELECT id, extension, source
        FROM image
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """)
    cursor.execute(query, (vector, top_k))
    response = cursor.fetchall()
    # Response should match pinecode format for compatability with frontend
    modified_response = {'matches': [
        {
            'id': item[0],
            'metadata': {
                'extension': item[1],
                'source': item[2],
            }
        }
    for item in response]
    } # This is kinda cursed
    json_data = json.dumps(modified_response)
    return Response(json_data, content_type='application/json')
 

if __name__ == "__main__":
    app.run(debug=True, host="*", port=int(os.environ.get("PORT")))

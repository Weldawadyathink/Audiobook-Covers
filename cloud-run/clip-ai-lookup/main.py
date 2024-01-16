import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request
import json
from pinecone import Pinecone

app = Flask(__name__)

def get_model():
    if os.environ.get("GOOGLE_CLOUD_RUN") is None:
        return SentenceTransformer('clip-ViT-B-32')
    # Use local model file if in google cloud run
    return SentenceTransformer('./clip-ViT-B-32')

model = get_model()

def pinecone_init():
    secret = json.loads(os.environ.get("PINECONE"))
    return Pinecone(
        api_key = secret["api_key"],
    )


@app.route("/text")
def text_search():
    query = request.args.get("q")
    pc = pinecone_init()
    index = pc.Index("covers")
    vector = model.encode(query).tolist()
    response = index.query(
        vector = vector,
        include_metadata = True,
        include_values = False,
        top_k = 50,
    )
    return json.dumps(response.to_dict())

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

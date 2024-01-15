import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request
import json
import pinecone

app = Flask(__name__)

def get_model():
    if os.environ.get("GOOGLE_CLOUD_RUN") is None:
        return SentenceTransformer('clip-ViT-B-32')
    # Use local model file if in google cloud run
    SentenceTransformer('./clip-ViT-B-32')

model = get_model()

def pinecone_init():
    secret_name = "PINECONE"
    secret = json.loads(os.environ.get(secret_name))
    pinecone.init(
        api_key = secret["api_key"],
        environment = secret["environment"],
    )


@app.route("/text")
def text_search():
    query = request.args.get("q")
    pinecone_init()
    index = pinecone.index("covers")
    vector = model.encode(query).tolist()
    return index.query(
        vector = vector,
        include_metadata = True,
        include_values = False,
        top_k = 50,
    )

def get_model():
    if os.environ.get("GOOGLE_CLOUD_RUN") is None:
        return SentenceTransformer('clip-ViT-B-32')
    # Use local model file if in google cloud run
    SentenceTransformer('./clip-ViT-B-32')


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

import os
from sentence_transformers import SentenceTransformer
from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello_world():
    print("Loading Model")
    model = SentenceTransformer('./clip-ViT-B-32')
    print("Running model")
    return model.encode("Hello world!")

def get_model():
    if os.environ.get("GOOGLE_CLOUD_RUN") is None:
        return SentenceTransformer('clip-ViT-B-32')
    # Use local model file if in google cloud run
    SentenceTransformer('./clip-ViT-B-32')


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

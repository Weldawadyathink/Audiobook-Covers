import os
from sentence_transformers import SentenceTransformer
from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello_world():
    model = SentenceTransformer('clip-ViT-B-32')
    return model.encode("Hello world!")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
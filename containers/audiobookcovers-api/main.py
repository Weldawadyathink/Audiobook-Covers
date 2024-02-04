import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request, Response
import json

app = Flask(__name__)

model = SentenceTransformer('./clip-ViT-B-32')

@app.route("/embedding/text")
def get_text_embedding():
    query = request.args.get('q')
    embedding = model.encode(query).tolist()
    return Response(json.dumps(embedding), content_type='application/json')

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

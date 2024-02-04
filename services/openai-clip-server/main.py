import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request, Response
import json
import numpy as np

app = Flask(__name__)

@app.route("/")
def status():
    return Response("Working!")

@app.route("/embedding/text")
def get_text_embedding():
    query = request.args.get('q')
    model = SentenceTransformer('./clip-ViT-B-32')
    vector = model.encode(query).tolist()
    unit_vector = vector / np.linalg.norm(vector)
    return Response(json.dumps(unit_vector.tolist()), content_type='application/json')

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

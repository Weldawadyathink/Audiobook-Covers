import os
from sentence_transformers import SentenceTransformer
from flask import Flask, request, Response
import json
import numpy as np
from functools import cache
import requests
from PIL import Image, UnidentifiedImageError

app = Flask(__name__)

@cache
def get_model():
    return SentenceTransformer('./clip-ViT-B-32')

@app.route("/")
def status():
    return Response("Working!")

@app.route("/embedding/text")
def get_text_embedding():
    query = request.args.get('q')
    model = get_model()
    vector = model.encode(query).tolist()
    unit_vector = vector / np.linalg.norm(vector)
    return Response(json.dumps(unit_vector.tolist()), content_type='application/json')

@app.route("/embedding/image/url")
def get_image_embedding():
    url = request.args.get('url')
    response = requests.get(url, stream=True)
    image = ''
    try:
        image = Image.open(response.raw)
    except UnidentifiedImageError as e:
        print(f"Error opening image {id}. Flagging in database. ")
        return Response("Could not open image url", status=422)
    model = get_model()
    vector = model.encode(image)
    unit_vector = vector / np.linalg.norm(vector)
    return Response(json.dumps(unit_vector.tolist()), content_type='application/json')

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

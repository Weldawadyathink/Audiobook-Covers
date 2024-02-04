import os
from sentence_transformers import SentenceTransformer
import requests
from PIL import Image, UnidentifiedImageError
import psycopg2
from psycopg2 import sql
import numpy as np


def index_one(model, db):
    cursor = db.cursor()
    cursor.execute(sql.SQL('''
        SELECT id
        FROM image
        WHERE embedding_reindex IS NOT TRUE AND index_error IS NOT TRUE
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    '''))
    response = cursor.fetchone()
    if not response:
        print("No more images to index")
        return False
    id = response[0]
    file_url = f"https://download.audiobookcovers.com/png/1000/{id}.png"
    response = requests.get(file_url, stream=True)
    image = ""
    try:
        image = Image.open(response.raw)
    except UnidentifiedImageError as e:
        print(f"Error opening image {id}. Flagging in database. ")
        cursor.execute(sql.SQL("UPDATE image SET index_error = TRUE WHERE id = %s"), [id])
        db.commit()
        return True
    vector = model.encode(image)
    unit_vector = vector / np.linalg.norm(vector)
    cursor.execute(sql.SQL("UPDATE image SET embedding = %s, embedding_reindex = TRUE WHERE id = %s"), (unit_vector.tolist(), id))
    db.commit()
    print(f"Added vector for {id}")
    return True


def main():
    model = SentenceTransformer('./clip-ViT-B-32')
    db = psycopg2.connect(os.environ.get("DATABASE"))
    while index_one(model, db):
        pass
    print("Index complete")


if __name__ == "__main__":
    main()

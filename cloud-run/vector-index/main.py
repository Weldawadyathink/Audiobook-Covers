import os
from sentence_transformers import SentenceTransformer
import json
from pinecone import Pinecone
from algoliasearch.search_client import SearchClient
import requests
from PIL import Image

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


def get_algolia_client():
    secret = json.loads(os.environ.get("ALGOLIA"))
    return SearchClient.create(secret['Application_ID'], secret['API_Key'])
    

def main():
    model = get_model()
    
    algolia = get_algolia_client()
    algolia_index = algolia.init_index('bookCoverIndex')
    
    pc = pinecone_init()
    pc_index = pc.Index("covers")
    num_added = 0
    
    for item in algolia_index.browse_objects():
        try:
            index_status = item['pinecone']
        except KeyError:
            index_status = 'not complete'
        if not index_status == 'complete':
            file_url = f"https://download.audiobookcovers.com/png/1000/{item['objectID']}.png"
            response = requests.get(file_url, stream=True)
            if not response.ok:
                print(f"Failed to download {file_url}")
                continue
            image = Image.open(requests.get(file_url, stream=True).raw)
            vectors = model.encode(image).tolist()
            pc_index.upsert([(
                item['objectID'],
                vectors,
                {
                    'source': item['source'],
                    'extension': item['extension'],
                }
            )])
            algolia_index.partial_update_object({
                'objectID': item['objectID'],
                'pinecone': 'complete',
            })
            num_added += 1
            print(f"Added {item['objectID']} to pinecone index")
    print(f"Index complete, added {num_added} items to pinecone")


if __name__ == "__main__":
    main()

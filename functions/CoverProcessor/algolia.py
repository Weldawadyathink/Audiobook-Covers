import boto3
from botocore.exceptions import ClientError
from algoliasearch.search_client import SearchClient
from algoliasearch.exceptions import RequestException
import json
import uuid




def save_to_algolia(cover_id: uuid, cloud_vision_text: str, file_extension: str, hash: str, dry_run = False) -> bool:
    """
    Saves an object to an Algolia search index.

    Args:
        cover_id (uuid): The ID of the cover object.
        cloud_vision_text (str): The text extracted from the cover image using cloud vision.
        file_extension (str): The file extension of the cover image.
        hash (str): The hash value of the cover image.
        dry_run (bool, optional): A flag indicating whether to perform a dry run or not. Defaults to False.

    Returns:
        bool: True if the object is saved to Algolia. False if the object ID already exists in the index.
    """
    object_id = str(cover_id)
    client = get_algolia_client()
    index = client.init_index('bookCoverIndex')
    
    # First check if object ID already exists
    try:
        index.get_object(object_id)
        # We want the object to not exist. If it does, it raises RequestException and continues. 
        # If not, we raise ValueError. 
        raise ValueError("Object ID already exists.")
    except RequestException as e:
        pass
    
    # Next check if image hash already exists
    res = index.search(hash, {
        'attributesToRetrieve': ['hash'],
        'restrictSearchableAttributes': ['hash'],
        'hitsPerPage': 1000,
        # ... rest of the code ...
    })
    for item in res['hits']:
        if item['hash'] == hash:
            print(f'Image hash already found in database: {hash}')
            return False


    if  not dry_run:
        index.save_object({
            'objectID': object_id,
            'cloudVisionText': cloud_vision_text,
            'extension': file_extension,
            'hash': hash
        })
        print(f"Saved {object_id} to algolia")
        return True
    else:
        print('Did not save to algolia because dry_run was set')
        return True
    




def get_algolia_client():
    secret_name = "audiobookcovers/algolia/key/write"
    region_name = "us-west-1"

    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        # For a list of exceptions thrown, see
        # https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
        raise e

    secret = json.loads(get_secret_value_response['SecretString'])
    return SearchClient.create(secret['Application_ID'], secret['API_Key'])


if __name__ == '__main__':
    save_to_algolia(uuid.uuid4(), 'Vision Text', '.tst',
                    '3fffffff1ffffffbfffffffc000ffffe0000000000007ffe00fffffe3ffffffd7ffffffe00001fff000000000000000000001fff01fffffe',
                    dry_run=True)
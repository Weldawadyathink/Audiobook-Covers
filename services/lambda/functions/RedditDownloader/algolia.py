import boto3
from botocore.exceptions import ClientError
from algoliasearch.search_client import SearchClient
from algoliasearch.exceptions import RequestException
import json
import uuid

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

def check_uuid_in_algolia(uuid):
    """
    Checks if a given UUID exists in the Algolia index.

    :param index: The Algolia index object.
    :param uuid: The UUID to check.
    :returns: True if the UUID is valid and usable, false if it is a duplicate.
    """
    client = get_algolia_client()
    index = client.init_index("bookCoverIndex")
    try:
        response = index.get_object(uuid, {
            'attributesToRetrieve': ['objectID'],
        })
    except Exception as error:
        if 'ObjectID does not exist' in str(error):
            # If it errors, uuid is not in index and therefore is valid
            return True
        else:
            # Rethrow the exception if it's not related to non-existence of the object
            raise
    # If error was not thrown, the uuid exists in the index, and therefore is not valid
    return False

def generate_unique_uuid():
    """
    Generates and returns a UUID that is confirmed to be unique in the Algolia index.

    :param index: The Algolia index object.
    :return: A unique UUID string.
    """
    while True:
        new_uuid = str(uuid.uuid1())
        if check_uuid_in_algolia(new_uuid):
            return new_uuid

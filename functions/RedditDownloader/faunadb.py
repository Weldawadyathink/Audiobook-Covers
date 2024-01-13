from fauna import fql
from fauna.client import Client
from fauna.encoding import QuerySuccess
from fauna.errors import FaunaException

import boto3
from botocore.exceptions import ClientError

import json

class NoMoreItems(Exception):
    pass

def get_fauna_client():
    secret_name = "audiobookcovers/fauna/key/write"
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

    secret = get_secret_value_response['SecretString']
    return Client(secret=secret)

def get_post_id_to_download():
    try:
        client = get_fauna_client()
        query = fql('RedditPost.where(.status == "new").take(1)')
        response = client.query(query)
        post_id = response.data.data[0]["postId"]
    except IndexError:
        raise NoMoreItems()

def mark_post_id_complete(post_id):
    client = get_fauna_client()
    query = fql(
        "RedditPost.where(.postId == ${post_id}).first().updateData({status: 'downloaded'})",
        post_id=post_id
    )
    print(query)
    response = client.query(query)
    return response

if __name__ == "__main__":
    print(get_post_id_to_download())
    print(mark_post_id_complete("1902fqd"))

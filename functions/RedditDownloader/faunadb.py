from fauna import fql
from fauna.client import Client
from fauna.encoding import QuerySuccess
from fauna.errors import FaunaException

import boto3
from botocore.exceptions import ClientError

import json

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
    return secret['Application_ID'], secret['API_Key']
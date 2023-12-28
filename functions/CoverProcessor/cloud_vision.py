from google.cloud import vision
from google.cloud.vision_v1 import types
import re
import boto3
from botocore.exceptions import ClientError
import os




def get_image_text(image_bytes):
    """
    Detects text in an image.
    :param image: image file bytes
    :return: string of detected text
    """
    setup_service_account()
    google_image = types.Image(content=image_bytes)
    client = vision.ImageAnnotatorClient()
    response = client.document_text_detection(image=google_image)
    texts = response.text_annotations
    if len(texts) == 0:
        return ""
    returnval = texts[0].description
    returnval = returnval.lower()
    returnval = re.sub(r'\n', ' ', returnval)
    print(f'Google Vision API Result: {returnval}')
    return returnval




def setup_service_account():

    secret_name = "google/api_key/cloud_vision"
    region_name = "us-west-1"
    
    service_account_file = '/tmp/google_credentials.json'

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
    
    credentials_json = get_secret_value_response['SecretString']
    with open(service_account_file, "w") as file:
        file.write(credentials_json)
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = service_account_file

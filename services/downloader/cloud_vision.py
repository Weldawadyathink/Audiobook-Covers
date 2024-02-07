from google.cloud import vision
from google.cloud.vision_v1 import types
import re
import boto3
from botocore.exceptions import ClientError
import os
from io import BytesIO




def get_image_text(image) -> str:
    """
    Detects text in an image.
    :param image: image file bytes
    :return: string of detected text
    """
    with BytesIO(image) as image_bytes:
        google_image = types.Image(content=image_bytes)
        client = vision.ImageAnnotatorClient()
        response = client.document_text_detection(image=google_image)
        texts = response.text_annotations
        if len(texts) == 0:
            return ""
        returnval = texts[0].description
        returnval = returnval.lower()
        returnval = re.sub(r'\n', ' ', returnval)
        return returnval

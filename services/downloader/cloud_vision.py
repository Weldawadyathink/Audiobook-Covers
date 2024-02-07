from google.cloud import vision
from google.cloud.vision_v1 import types
import re
import os
import io
import json
from google.oauth2 import service_account




def get_image_text(download_path) -> str:
    """
    Detects text in an image.
    :param image: image file bytes
    :return: string of detected text
    """
    service_account_info = json.loads(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON"))
    credentials = service_account.Credentials.from_service_account_info(service_account_info)
    
    with io.open(download_path, 'rb') as image_bytes:
        google_image = types.Image(content=image_bytes.read())
        client = vision.ImageAnnotatorClient(credentials=credentials)
        response = client.document_text_detection(image=google_image)
        texts = response.text_annotations
        if len(texts) == 0:
            return ""
        returnval = texts[0].description
        returnval = returnval.lower()
        returnval = re.sub(r'\n', ' ', returnval)
        return returnval

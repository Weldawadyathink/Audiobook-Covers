import boto3
import os
from io import BytesIO
from PIL import Image
from image_tools import get_all_image_versions

def upload_single_image(image, key, content_type):
    s3 = boto3.client('s3',
        region_name = os.environ.get("AWS_S3_REGION_NAME"),
        endpoint_url = os.environ.get("AWS_S3_ENDPOINT_URL"),
        aws_access_key_id = os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key = os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )
    with BytesIO(image) as file:
        s3.upload_fileobj(
            Fileobj = file,
            Bucket = os.environ.get("AWS_S3_BUCKET"),
            Key = key,
            ExtraArgs = {
                'ContentType': content_type,
            }
        )

def upload_image_variations(image: Image, image_id, file_extension):
    for img_format, size, bytes, content_type in get_all_image_versions(image):
        key = f'{img_format}/{size}/{str(image_id)}.{img_format}'
        upload_single_image(bytes, key, content_type)
    mime_types = MIME_TYPES = {
        'JPEG': 'image/jpeg',
        'PNG': 'image/png',
    }
    content_type = MIME_TYPES.get(image.format, 'application/octet-stream')
    key = f'original/{str(image_id)}.{file_extension}'
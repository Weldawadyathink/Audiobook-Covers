import boto3
import urllib
import io
from cloud_vision import get_image_text
from algolia import save_to_algolia
from uuid import uuid1
from hash import get_image_hash_from_image
from PIL import Image
from image_tools import reduce_image_size, get_jpeg_bytes, get_png_bytes, get_webp_bytes


def lambda_handler(event, context):

    s3 = boto3.client('s3')
    
    # Get bucket name and object key from the Lambda event
    source_bucket = event['Records'][0]['s3']['bucket']['name']
    source_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])
    
    destination_bucket = 'com-audiobookcovers-processed'
    failed_bucket = 'com-audiobookcovers-failed'
    
    file_extension, cover_id, source = source_key.split('|')

    new_s3_filename_base = cover_id
    download_path = f'/tmp/{source_key}'
    
    s3.download_file(source_bucket, source_key, download_path)
    
    # Cloud Vision Bytes
    with io.open(download_path, 'rb') as image_file:
        text_detected = get_image_text(image_file.read())
    
    with Image.open(download_path) as image:
        image_hash = get_image_hash_from_image(image)

        if save_to_algolia(cover_id, text_detected, file_extension, image_hash, source) is True:
            s3.copy_object(Bucket=destination_bucket, Key=f'original/{new_s3_filename_base}.{file_extension}', 
                        CopySource={'Bucket': source_bucket, 'Key': source_key})
            save_all_image_versions(image, s3, destination_bucket,new_s3_filename_base)
            print('Image successfully added to database and s3')
        else:
            s3.copy_object(Bucket=failed_bucket, Key=source_key, CopySource={'Bucket': source_bucket, 'Key': source_key})
            print('Image not added to database. Moved to failed s3 bucket.')
        s3.delete_object(Bucket=source_bucket, Key=source_key)





def save_all_image_versions(image: Image, s3: boto3.client, destination: str, filename_base: str):
    for size in ['original', 200, 500, 1000]:
        if size == 'original':
            resized_image = image
        else:
            resized_image = reduce_image_size(image, size)
        
        for format in ['jpg', 'png', 'webp']:
            match format:
                case 'jpg':
                    image_bytes = get_jpeg_bytes(resized_image)
                case 'png':
                    image_bytes = get_png_bytes(resized_image)
                case 'webp':
                    image_bytes = get_webp_bytes(resized_image)
                
            s3.upload_fileobj(
                Fileobj=io.BytesIO(image_bytes),
                Bucket=destination,
                Key=f'{format}/{size}/{filename_base}.{format}'
            )
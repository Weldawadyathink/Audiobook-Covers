import boto3
from botocore.exceptions import ClientError
import urllib
import io
from cloud_vision import get_image_text
from uuid import uuid1
from hash import get_image_hash_from_image
from PIL import Image
from image_tools import reduce_image_size, get_jpeg_bytes, get_png_bytes, get_webp_bytes
import psycopg2
from psycopg2 import sql
import os
import json

def lambda_handler(event, context):
    rollback_functions = [] # list of lambda functions to run if tasks errors
    s3 = boto3.client('s3')
    r2 = get_r2_client()
    source_bucket = event['Records'][0]['s3']['bucket']['name']
    source_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])
    try:
        destination_bucket = 'audiobookcovers-v4'
        file_extension, cover_id, source = source_key.split('|')
        new_s3_filename_base = cover_id
        download_path = f'/tmp/{uuid1()}'
        s3.download_file(source_bucket, source_key, download_path)
        
        # Cloud Vision Bytes
        with io.open(download_path, 'rb') as image_file:
            text_detected = get_image_text(image_file.read())
            
        with Image.open(download_path) as image:
            image_hash = get_image_hash_from_image(image)
            db = get_neon_db()
            
            cursor = db.cursor()
            cursor.execute(sql.SQL("SELECT COUNT(id) FROM image WHERE hash = %s"), [image_hash])
            if int(cursor.fetchone()[0]) != 0:
                raise Exception("Image hash already in database")
            
            cursor.execute(sql.SQL("SELECT COUNT(id) FROM image WHERE id = %s"), [cover_id])
            if int(cursor.fetchone()[0]) != 0:
                raise Exception("Image ID already in database")
            
            cursor.execute(sql.SQL("INSERT INTO image(id, source, extension, hash, cloud_vision_text) VALUES (%s, %s, %s, %s, %s)"),
                           (cover_id, source, file_extension, image_hash, text_detected))
            
            original_file_key = f'original/{new_s3_filename_base}.{file_extension}'
            rollback_functions.append(lambda: s3.delete_object(Bucket=destination_bucket, Key=original_file_key))
            r2.upload_file(download_path, Bucket=destination_bucket, Key=original_file_key)
            
            for img_format, size, bytes, content_type in get_all_image_versions(image):
                key = f'{img_format}/{size}/{new_s3_filename_base}.{img_format}'
                rollback_functions.append(lambda del_key=key: s3.delete_object(Bucket=destination_bucket, Key=del_key))
                with io.BytesIO(bytes) as file_obj:
                    r2.upload_fileobj(
                        Fileobj=file_obj,
                        Bucket=destination_bucket,
                        Key=f'{img_format}/{size}/{new_s3_filename_base}.{img_format}',
                        ExtraArgs={
                            'ContentType': content_type,
                        }
                    )
        db.commit()
        db.close()
    except Exception as e:
        for func in rollback_functions:
            func()
        print('Image not added to database. Moved to failed s3 bucket.')
        failed_bucket = 'com-audiobookcovers-failed'
        s3.copy_object(Bucket=failed_bucket, Key=source_key, CopySource={'Bucket': source_bucket, 'Key': source_key})
        if db is not None:
            db.rollback()
            db.close()
        try:
            os.remove(download_path)
        except:
            pass
        raise e





def get_neon_db():

    secret_name = "audiobookcovers/neon/write"
    region_name = "us-west-1"

    # Create a Secrets Manager client
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
    return psycopg2.connect(secret)
    
    
    



def get_r2_client():

    secret_name = "audiobookcovers/r2"
    region_name = "us-west-1"

    # Create a Secrets Manager client
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
    return boto3.client('s3',
                        region_name='auto',
                        endpoint_url=secret['ENDPOINT'],
                        aws_access_key_id=secret['ACCESS_KEY_ID'],
                        aws_secret_access_key=secret['SECRET_ACCESS_KEY'])





def get_all_image_versions(image: Image):
    for size in ['original', 200, 500, 1000]:
        if size == 'original':
            resized_image = image
        else:
            resized_image = reduce_image_size(image, size)
        
        for img_format in ['jpg', 'png', 'webp']:
            match img_format:
                case 'jpg':
                    image_bytes = get_jpeg_bytes(resized_image)
                    content_type = 'image/jpeg'
                case 'png':
                    image_bytes = get_png_bytes(resized_image)
                    content_type = 'image/png'
                case 'webp':
                    image_bytes = get_webp_bytes(resized_image)
                    content_type = 'image/webp'
            
            yield (img_format, size, image_bytes, content_type)


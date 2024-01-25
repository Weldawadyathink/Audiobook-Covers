import boto3
from botocore.exceptions import ClientError
import subprocess
import os
import sys
import shutil
from uuid import uuid1
import psycopg2
from psycopg2 import sql

include_file = "/tmp/include-id.txt"
download_folder = "/tmp/downloads"
bdfr_base_folder = '/opt/bdfr'
bdfr_run_folder = '/tmp/site-packages/bdfr'
original_config_file = "/var/task/config.cfg"
config_file = "/tmp/config.cfg"

class NoMoreItems(Exception):
    pass

def get_post_id_to_download():
    db = get_neon_db()
    cursor = db.cursor()
    cursor.execute(sql.SQL("SELECT post_id FROM reddit_post WHERE downloaded IS FALSE"))
    result = cursor.fetchone()
    if result is None:
        db.close()
        raise NoMoreItems
    db.close()
    return result[0]

def mark_post_id_complete(id):
    with get_neon_db() as db:
        cursor = db.cursor()
        cursor.execute(sql.SQL("UPDATE reddit_post SET downloaded = TRUE WHERE post_id = %s"), [id])
        db.commit()

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
    

def lambda_handler(event, context):
    prepare_environment()
    try:
        include_id = get_post_id_to_download()
    except NoMoreItems:
        print("No post id available, ending recursion")
        # Recursive lambda function exit point
        return
    
    with open(include_file, "w+") as f:
        f.write(include_id)
    subprocess.run(f"{sys.executable} -m bdfr download /tmp/downloads --config {config_file} --include-id-file {include_file} --file-scheme {{POSTID}}".split(" "))
    print(f"Downloaded files for post {include_id} with BDFR")
    process_all_files()
    mark_post_id_complete(include_id)
    boto3.client("lambda").invoke(
        FunctionName=context.function_name,
        InvocationType='Event',
    )
    

def prepare_environment():
    shutil.copy(original_config_file, config_file)
    if os.path.exists(bdfr_run_folder):
        print(f"{bdfr_run_folder} already exists.")
    else:
        shutil.copytree(bdfr_base_folder, bdfr_run_folder)
        print(f"Copied {bdfr_base_folder} to {bdfr_run_folder}.")
    
    if os.path.exists(include_file):
        os.remove(include_file)
        print(f"Deleted {include_file}")
    
    if os.path.exists(download_folder):
        for filename in os.listdir(download_folder):
            file_path = os.path.join(download_folder, filename)
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
                if os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                raise Exception(f'Failed to delete {file_path}. Reason: {e}')
        print(f"All contents of {download_folder} have been deleted.")
    else:
        os.makedirs(download_folder)


def process_file(directory_name, file_name):
    complete_file_path = os.path.join(directory_name, file_name)
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']
    image_bucket = "com-audiobookcovers-uploads"
    other_bucket = "com-audiobookcovers-other"
    
    s3 = boto3.client("s3")
    
    reddit_post_id = file_name.split(".")[0].split("_")[0]
    print(f"Processing {file_name}, post id {reddit_post_id}")
    
    if os.path.splitext(file_name)[1].lower() in image_extensions:
        # Process image file
        new_file_key = "|".join([
            os.path.splitext(file_name)[1].lower().replace(".", ""),
            str(uuid1()),
            f"https://reddit.com/{reddit_post_id}",
        ])
        s3.upload_file(complete_file_path, image_bucket, new_file_key)
        print(f"Uploaded {complete_file_path} to {image_bucket}/{new_file_key}")
    else:
        new_file_key = "|".join([
            str(uuid1()),
            file_name,
        ])
        s3.upload_file(complete_file_path, other_bucket, new_file_key)
        print(f"Uploaded {complete_file_path} to {other_bucket}/{new_file_key}")
    
    return reddit_post_id

    


def process_all_files():
    for dirpath, dirnames, filenames in os.walk(download_folder):
        for filename in filenames:
            process_file(dirpath, filename)
    

if __name__ == '__main__':
    lambda_handler(None, None)

from db import get_covers_db
from keys import get_boto3_client
import hashlib
from io import BytesIO
from sqlalchemy import text

class s3manager:
    
    def __init__(self, print_logs=True):
        self.log = print_logs
        self.save_info = (
            {
                's3': get_boto3_client,
                'save_bucket_name': 'audiobookcovers-v2',
                'save_folder': 'covers/fullres',
                'db': get_covers_db,
                'table': 'Weldawadyathink$covers.image',
                'filename_column': 'filename',
                'image_data_column': 'image_data',
            },
            
            {
                's3': get_boto3_client,
                'save_bucket_name': 'audiobookcovers-v2',
                'save_folder': 'covers/lowres',
                'db': get_covers_db,
                'table': 'Weldawadyathink$covers.image',
                'filename_column': 'small_image_filename',
                'image_data_column': 'small_image_data',
            },
        )
    
    
    def upload_to_s3_by_id_list(self, id_list):
        for id in id_list:
            self.upload_to_s3_by_id(id)

    
    def upload_to_s3_by_id(self, id):
        for config in self.save_info:
            s3 = config['s3']()
            bucket = config['save_bucket_name']
            folder = config['save_folder']
            db = config['db']()
            table = config['table']
            filename_column = config['filename_column']
            image_data_column = config['image_data_column']
            
            query = text(f'SELECT {filename_column}, {image_data_column} FROM {table} WHERE id = :id')
            result = db.execute(query, {"id": id})
            for filename, image_data in result:
                local_md5 = self.compute_md5_hash(image_data)
                remote_etag = self.get_remote_etag(s3, bucket, folder, filename)

                if remote_etag is None or remote_etag != local_md5:
                    s3.Object(bucket, f'{folder}/{filename}').put(Body=BytesIO(image_data))
                    print(f'Uploaded {filename}') if self.log else None
                else:
                    print(f'Skipped {filename}') if self.log else None
    
    
    @staticmethod
    def compute_md5_hash(image_data):
        md5 = hashlib.md5()
        md5.update(image_data)
        return md5.hexdigest()
    
    
    @staticmethod
    def get_remote_etag(s3, save_bucket_name, save_folder, filename):
        try:
            obj = s3.Object(save_bucket_name, f'{save_folder}/{filename}')
            response = obj.get()
            return response['ETag'].strip('"')
        except s3.meta.client.exceptions.ClientError:
            return None
            

if __name__ == '__main__':
    s3manager(print_logs=True).upload_to_s3_by_id_list(["00462bae-e83a-11ed-bbde-0a1261ea33eb", "00462bae-e83a-11ed-bbde-0a1261ea33eb", "00462bae-e83a-11ed-bbde-0a1261ea33eb"])
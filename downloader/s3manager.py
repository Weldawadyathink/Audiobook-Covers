from db import get_covers_db
from keys import get_boto3_client
import hashlib
from io import BytesIO
from sqlalchemy import text

class S3manager:
    
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
            db.close()
    
    
    def remove_stale_files(self):
        for config in self.save_info:
            s3 = config['s3']()
            bucket = config['save_bucket_name']
            folder = config['save_folder']
            db = config['db']()
            table = config['table']
            filename_column = config['filename_column']
            image_data_column = config['image_data_column']
            print(f"Removing stale files from {bucket}/{folder}")
            i = 0
            
            for obj in s3.Bucket(bucket).objects.filter(Prefix=f"{folder}/"):
                filename = obj.key.split('/')[-1]
                results = db.execute(text(f"SELECT 1 FROM {table} WHERE {filename_column} = :filename"), {"filename": filename})
                if results.fetchone() is None:
                    obj.delete()
                    i += 1
                    print(f'Removed {filename}') if self.log else None
            
            print(f"Removed {i} stale files from {bucket}/{folder}")
    
    
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
    db = get_covers_db()
    results = db.execute(text("SELECT id FROM image")).fetchall()
    ids = [row[0] for row in results]
    db.close()
    s3 = S3manager(print_logs=True)
    s3.upload_to_s3_by_id_list(ids)
    s3.remove_stale_files()

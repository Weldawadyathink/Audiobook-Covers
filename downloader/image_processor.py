import sqlite3
from PIL import Image
from google.cloud import vision
from google.cloud.vision_v1 import types
import os
import re
from io import BytesIO
import imagehash
from s3manager import S3manager
from db import get_covers_db

class ImageHashMatch(Exception):
    pass

class ImageProcessor:
    """
    Class to process images. Gathers necessary information from the image and saves it to a database.
    """
    
    def __init__(self, print_logs = True, db_file = "covers.db"):
        self.log = print_logs
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'google.json'
        # self.db = get_covers_db()
        self.s3 = S3manager()
    
    @staticmethod
    def _detect_text(image):
        """
        Detects text in an image.
        :param image: PIL image
        :return: string of detected text
        """
        # covert to compatible image type
        if image.mode == 'RGBA':
            image.load()
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        image = image.convert('RGB')
        with BytesIO() as output:
            image.save(output, format="JPEG")
            image_bytes = output.getvalue()
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
    
    @staticmethod
    def reduce_image_size(image, horizontal_pixels):
        """
        Reduces the size of an image.
        :param image: PIL image
        :param horizontal_pixels: number of horizontal pixels to reduce to
        :return:
        """
        width, height = image.size
        if width > horizontal_pixels:
            ratio = width / horizontal_pixels
            height = int(height / ratio)
            image = image.resize((horizontal_pixels, height), resample=Image.ANTIALIAS)
        return image
    
    @staticmethod
    def get_webp_bytes(image, quality=90):
        """
        Converts an image to webp format.
        :param image: PIL image
        :return: webp bytes
        """
        with BytesIO() as output:
            image.save(output, format="WEBP", quality=quality)
            webp_bytes = output.getvalue()
        return webp_bytes

    def process_image(self, image, extension, reddit_post_id, reddit_comment_id=None):
        """
        Processes an image and saves it to the database.
        :param image: PIL image
        :param extension: file extension
        :param reddit_post_id: reddit post id
        :return:
        """
        print(f'Processing image {image}') if self.log else None
        image_hash = self._image_hash(image)
        self._check_hash_match(image_hash)
        cloud_vision_text = self._detect_text(image)

        self._save_image_to_db(reddit_post_id, image_hash, image, cloud_vision_text, extension, reddit_comment_id)

    
    @staticmethod
    def _image_hash(image):
        return str(imagehash.colorhash(image, binbits=32))
    
    def _check_hash_match(self, image_hash):
        db = get_covers_db()
        result = db.execute('SELECT 1 FROM reddit_image WHERE hash=? LIMIT 1', [image_hash]).fetchall()
        if result:
            db.close()
            raise ImageHashMatch(f'Image already in database.')
        db.close()
    
    def _save_image_to_db(self, reddit_post_id, image_hash, image, cloud_vision_text, file_extension, reddit_comment_id):
        
        with BytesIO() as output:
            image.save(output, image.format)
            image_bytes = output.getvalue()
        
        small_image = self.reduce_image_size(image, 500)
        small_image_bytes = self.get_webp_bytes(small_image)
        
        db = get_covers_db()

        print(f'Adding image to database with hash: {image_hash}') if self.log else None
        db.execute('INSERT OR IGNORE INTO reddit_post(reddit_post_id, post_type) VALUES (?, "image")',
                        [reddit_post_id])
        db.execute("""INSERT INTO image (id, image_hash, image_data, file_extension, small_image_data, small_image_file_extension,
                        reddit_post_id, reddit_comment_id, cloud_vision_text, search_text) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        [image_hash, image_bytes, file_extension, small_image_bytes, "webp",
                        reddit_post_id, reddit_comment_id, cloud_vision_text, cloud_vision_text])
        db.commit()
        result = db.execute('SELECT id FROM image WHERE image_hash=? LIMIT 1', [image_hash]).fetchall()
        db.close()
        self.s3.upload_to_s3_by_id(result[0])

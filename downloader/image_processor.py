import sqlite3
from PIL import Image
from google.cloud import vision
from google.cloud.vision_v1 import types
import os
import re
from io import BytesIO
import uuid
import imagehash
from s3manager import s3manager

class ImageHashMatch(Exception):
    pass

class ImageProcessor:
    """
    Class to process images. Gathers necessary information from the image and saves it to a database.
    """
    
    def __init__(self, print_logs = True, db_file = "covers.db"):
        self.log = print_logs
        self.conn = sqlite3.connect(db_file)
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'google.json'
    
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
        new_file_name = f'{uuid.uuid4()}.{extension}'

        # Save the image data in the same format as the original image
        with BytesIO() as output:
            image.save(output, image.format)
            image_bytes = output.getvalue()

        self._save_image_to_db(reddit_post_id, image_hash, image_bytes, cloud_vision_text, new_file_name, reddit_comment_id)

    
    @staticmethod
    def _image_hash(image):
        return str(imagehash.colorhash(image, binbits=32))
    
    def _check_hash_match(self, image_hash):
        cursor = self.conn.cursor()
        cursor.execute('SELECT reddit_post_id FROM reddit_image WHERE hash=?', (image_hash,))
        matching_images = cursor.fetchall()
        if matching_images:
            raise ImageHashMatch(f'Image already in database.')
    
    def _save_image_to_db(self,  reddit_post_id, image_hash, image_bytes, cloud_vision_text, filename, reddit_comment_id):
        cursor = self.conn.cursor()
        print(f'Adding image to database {filename}') if self.log else None
        cursor.execute('INSERT OR IGNORE INTO reddit_post(reddit_post_id, post_type) VALUES (?, ?)',
                       (reddit_post_id, 'image'))
        cursor.execute("INSERT INTO reddit_image (reddit_post_id, hash, image_data, cloud_vision_text, filename, reddit_comment_id) VALUES (?, ?, ?, ?, ?, ?)",
                       (reddit_post_id, image_hash, image_bytes, cloud_vision_text, filename, reddit_comment_id))
        self.conn.commit()

from image_processor import ImageProcessor as IP
from PIL import Image
import MySQLdb
from keys import mysql
from io import BytesIO
from db import covers_db as db

def reduce_image_batch(data, cursor):
    """
    Reduce a batch of images.
    :param data: tuple format (id, image_data)
    :param cursor: cursor for mysql database
    :return:
    
    """
    image = Image.open(BytesIO(row[1]))
    image = IP.reduce_image_size(image, 500)
    image_bytes = IP.get_webp_bytes(image)
    cursor.execute("UPDATE image SET small_image_data = %s, small_image_file_extension = 'webp' WHERE id= %s", (row[0], row[0]))

def reduce_all_images():
    cursor = db.cursor()
    print('SELECTing images')
    cursor.execute("SELECT id, image_data FROM image")
    for row in cursor:
        reduce_image_batch(images, cursor)
        print("Downsampled one image")


if __name__ == '__main__':
    reduce_all_images()
    # image = Image.open('./downloader/dune.jpg')
    # image = IP.reduce_image_size(image, 500)
    # image.save('./downloader/dune_reduced.webp', "WEBP", quality=90)

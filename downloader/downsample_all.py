from image_processor import ImageProcessor as IP
from PIL import Image
import MySQLdb
from io import BytesIO
from db import get_covers_db
from sqlalchemy import text

def reduce_image_batch(row, session):
    """
    Reduce a batch of images.
    :param row: tuple format (id, image_data)
    :param session: SQLAlchemy session
    :return:
    """
    image = Image.open(BytesIO(row[1]))
    image = IP.reduce_image_size(image, 500)
    image_bytes = IP.get_webp_bytes(image)
    session.execute(
        text("UPDATE image SET small_image_data = :image_data, small_image_file_extension = 'webp' WHERE id = :image_id"),
        {"image_data": image_bytes, "image_id": row[0]}
    )

def reduce_all_images():
    read_session = get_covers_db()
    write_session = get_covers_db()
    batch_size = 50  # Adjust this value based on your requirements and system resources
    completed = 0
    query = read_session.execute(text("SELECT id, image_data FROM image"), execution_options={"stream_results": True})
    
    while True:
        rows = query.fetchmany(batch_size)
        if not rows:
            break

        for row in rows:
            reduce_image_batch(row, write_session)
        completed += batch_size
        print(f"Downsampled {completed} images")

    write_session.commit()
    write_session.close()
    read_session.close()


if __name__ == '__main__':
    reduce_all_images()
    # image = Image.open('./downloader/dune.jpg')
    # image = IP.reduce_image_size(image, 500)
    # image.save('./downloader/dune_reduced.webp', "WEBP", quality=90)

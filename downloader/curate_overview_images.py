import sqlite3
import webbrowser
import io
from PIL import Image

database_file = './covers.db'

def get_uncurated_images(conn):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, reddit_post_id, filename, image_data
        FROM reddit_image
        WHERE is_human_curated = 0
        GROUP BY reddit_post_id
        HAVING COUNT(reddit_post_id) = 1
    """)
    return cursor.fetchall()

def update_image_curated(conn, image_id, is_overview_image):
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE reddit_image
        SET is_overview_image = ?, is_human_curated = 1
        WHERE id = ?
    """, (is_overview_image, image_id))
    conn.commit()

def main():
    conn = sqlite3.connect(database_file)
    images = get_uncurated_images(conn)

    for image_id, reddit_post_id, filename, image_data in images:
        image = Image.open(io.BytesIO(image_data))
        image.show()

        # webbrowser.open(f'https://redd.it/{reddit_post_id}', new=2)

        user_input = input('Is this an overview image? (y/n) ').lower()
        is_overview_image = 1 if user_input == 'y' else 0

        update_image_curated(conn, image_id, is_overview_image)

        print(f"Updated image {filename} as {'overview' if is_overview_image else 'not overview'}")

    conn.close()

if __name__ == '__main__':
    main()

import psycopg
from psycopg import sql
from psycopg_pool import ConnectionPool
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    load_dotenv()

pool = ConnectionPool(conninfo=os.environ.get("DATABASE"), min_size=2, max_size=4, open=True)

def get_url_to_download():
    """Get a url and other data needed to download images to the database
    Returns:
        (url_id, reddit_post_id, url)
    """
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL('''
                WITH selected_row AS (
                    SELECT id
                    FROM public.reddit_url
                    WHERE status = 'new'
                    ORDER BY id -- or another column to determine which row to select
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE public.reddit_url
                SET status = 'download_in_progress'
                FROM selected_row
                WHERE public.reddit_url.id = selected_row.id
                RETURNING public.reddit_url.id, public.reddit_url.reddit_post_id, public.reddit_url.url
                '''))
            return cursor.fetchone()


def log_download_error(url_id):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL('''
                UPDATE public.reddit_url
                SET status = 'download_error'
                WHERE public.reddit_url.id = %s
            '''), [
                url_id,
            ])

if __name__ == "__main__":
    print(get_url_to_download())

from download_bdfr import main as download_bdfr
from comment_downloader import CommentDownloader
from extract_link_urls import ExtractLinkUrls

if __name__ == "__main__":
    
    database_file = 'covers.db'
    
    # Step 1: Download as much as possible with bdfr
    download_bdfr()
    
    # Step 2: Refresh comments in database
    comments = CommentDownloader(database_file)
    comments.download_all_comments()
    
    # Step 3: Extract URLs from comments
    extractor = ExtractLinkUrls()
    extractor.extract_all()
    
    # Step 4: Download from links in database

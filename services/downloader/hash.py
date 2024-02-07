import imagehash
from PIL import Image

def get_image_hash_from_file(file_name: str) -> str:
    with Image.open(file_name) as im:
        return str(imagehash.colorhash(im, binbits=32))

def get_image_hash_from_image(image: Image) -> str:
    return str(imagehash.colorhash(image, binbits=32))
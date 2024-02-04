from PIL import Image
from io import BytesIO

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
        image = image.resize((horizontal_pixels, height), resample=Image.LANCZOS)
    return image




def get_webp_bytes(image, quality=90):
    """
    Converts an image to webp format.
    :param image: PIL image
    :return: webp bytes
    """
    with BytesIO() as output:
        image.save(output, format="WEBP", quality=quality)
        file_bytes = output.getvalue()
    return file_bytes



def get_jpeg_bytes(image, quality=90):
    """
    Converts an image to JPEG format.
    Converts RGBA images to RGB before saving.
    :param image: PIL image
    :param quality: Integer from 0 to 100 (higher means better quality)
    :return: JPEG bytes
    """
    with BytesIO() as output:
        # Convert RGBA to RGB if necessary
        if image.mode == 'P' or image.mode == 'RGBA':
            # Create a white background image
            background = Image.new('RGB', image.size, (255, 255, 255))
            # Paste the image on the background, using the alpha channel as mask
            background.paste(image, (0, 0), image)
            image = background
        
        image.save(output, format="JPEG", quality=quality)
        file_bytes = output.getvalue()
    return file_bytes




def get_png_bytes(image):
    """
    Converts an image to PNG format.
    :param image: PIL image
    :return: PNG bytes
    """
    with BytesIO() as output:
        image.save(output, format="PNG")
        file_bytes = output.getvalue()
    return file_bytes

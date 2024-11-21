"""
This script decodes the JSON files created by my CAPTCHA saver script, aligns the foreground and background if necessary,
and saves the resulting image files named with the solutions.
"""
import io
import os
import sys
import json
import base64

from PIL import Image
from captcha_aligner import align_images

def strip_data_prefix(uri: str) -> str:
    return uri.split(',', 1)[1]

def decode_captcha_json(data: dict) -> (Image, str):
    """
    @param data Dict of decoded JSON data from the CAPTCHA saver script.
    @return tuple of (aligned image, solution text)
    """
    fg = Image.open(io.BytesIO(
        base64.b64decode(
            strip_data_prefix(data['fg'])
        )
    )).convert('RGBA')

    has_bg = data['bg'] is not None

    if has_bg: # Need to align the background
        bg = Image.open(io.BytesIO(
            base64.b64decode(
                strip_data_prefix(data['bg'])
            )
        )).convert('RGBA')

        aligned = align_images(bg, fg)
    else:
        aligned = fg

    return aligned, data['sol']

def decode_and_save(data: tuple):
    aligned, sol = decode_captcha_json(data)

    outpath = os.path.join('captchas', sol + '.png')
    aligned.save(outpath)


if __name__ == '__main__':
    # for file in os.listdir('jsons/'):
    #     with open(os.path.join('jsons', file), 'r') as fp:
    #         data = json.load(fp)
    #         decode_captcha_json(data)
    with open(sys.argv[1], 'r') as fp:
        decode_and_save(json.load(fp))
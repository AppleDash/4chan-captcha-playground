"""
Script to generate a synthetic CAPTCHA dataset, using existing CAPTCHA backgrounds
and images of known characters.
"""
import os
import random
import argparse

import cv2
import numpy as np

from common import walk_png_files, CHARACTER_SET

# Observed values from looking at a ton of CAPTCHAs.
LAYOUTS = [
    {
        'size': (45, 47),
        'x': [20, 50, 85, 170, 210, 255],
        'y': [20, 20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [15, 45, 75, 140, 175, 205],
        'y': [20, 20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [10, 85, 125, 165, 205, 245],
        'y': [20, 20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [5, 35, 65, 95, 125, 245],
        'y': [20, 20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [5, 45, 125, 165, 205, 245],
        'y': [20, 20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [15, 55, 95, 135, 215, 245],
        'y': [20, 20, 20, 20, 20, 20],
    },
    {
        'size': (45, 47),
        'x': [45, 125, 165, 205, 245],
        'y': [20, 20, 20, 20, 20]
    },
    {
        'size': (45, 47),
        'x': [15, 55, 95, 135, 205],
        'y': [20, 20, 20, 20, 20]
    }
]

LABELS_DIR = 'characters/'

def place_character_image(background: np.ndarray, foreground: np.ndarray, x_offset: int, y_offset: int) -> np.ndarray:
    """
    Combine a CAPTCHA letter image with the background image, at the given x and y offsets.
    """
    bg_h, bg_w, _ = background.shape
    fg_h, fg_w, _ = foreground.shape

    w = min(fg_w, bg_w, fg_w + x_offset, bg_w - x_offset)
    h = min(fg_h, bg_h, fg_h + y_offset, bg_h - y_offset)

    # Grab the region of the background that the forground image overlaps with.
    bg_x = max(0, x_offset)
    bg_y = max(0, y_offset)
    fg_x = max(0, x_offset * -1)
    fg_y = max(0, y_offset * -1)
    foreground = foreground[fg_y:fg_y + h, fg_x:fg_x + w]
    background_subsection = background[bg_y:bg_y + h, bg_x:bg_x + w]

    # Pull out the color and alpha channels from the overlay.
    foreground_colors = foreground[:, :, :3]
    alpha_channel = foreground[:, :, 3] / 255

    # Make an alpha mask that has the same shape as the overlay image's alpha.
    alpha_mask = np.dstack((alpha_channel, alpha_channel, alpha_channel))

    # Composite the character image onto the background area.
    composite = background_subsection * (1 - alpha_mask) + foreground_colors * alpha_mask

    # Update the background image with the combined area.
    background[bg_y:bg_y + h, bg_x:bg_x + w] = composite

    return background


def isolate_background(img: cv2.UMat) -> cv2.UMat:
    """
    Extract just the background from the given image, removing the letters/numbers.
    """
    # Ensure it's the right size.
    img = cv2.resize(img, (300, 80), interpolation=cv2.INTER_NEAREST)

    # Grayscale & Threshold
    img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype('uint8')
    img = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 21, 44)

    # Remove characters and clean up some of the noise.
    contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for area, c in zip(map(cv2.contourArea, contours), contours):
        # Pick a random selection to only remove some of the noise.
        # This area will always catch characters.
        if area > random.randint(1, 455):
            cv2.drawContours(img, [c], -1, 0, -1)

    # Re-invert colors because the threshold inverted them.
    img = cv2.bitwise_not(img)

    # Convert it back to a 3-channel image.
    return cv2.merge((img, img, img))

def generate_unique_label(length: int, outdir: str) -> int:
    """
    Generate a label of the given length, that doesn't already exist in the outdir.
    """
    while True:
        label = ''.join(random.choice(CHARACTER_SET[1:]) for _ in range(length))

        if not os.path.exists(os.path.join(outdir, f"{label}.png")):
            return label


# TODO: Add random left/right diagonal white lines across characters?
def synthesize_captcha(background: cv2.UMat, x_list: list[int], y_list: list[int], size: tuple[int, int], outdir: str):
    """
    Generate a single synthetic CAPTCHA image, using the given background image
    and character location info. The generated image will be saved in the outdir.

    @param background Background OpenCV image to use.
    @param x_list List of x positions for each character
    @param y_list List of y positions for each character
    @param size (width, height) size to make each character image
    @param outdir Directory to save the image
    """
    # Make sure it's the right size.
    background = cv2.resize(background, (300, 80), interpolation=cv2.INTER_NEAREST)
    label = generate_unique_label(len(x_list), outdir)

    for x, y, c in zip(x_list, y_list, label):
        # Load a random image for the given char.
        random_filename = random.choice(os.listdir(os.path.join(LABELS_DIR, c)))
        random_path = os.path.join(LABELS_DIR, c, random_filename)

        img = cv2.imread(random_path)
        img = cv2.resize(img, size, interpolation=cv2.INTER_NEAREST)

        # Alpha of 0 if black, 255 if white.
        alpha = np.uint8(np.where(img[..., -1] == 0, 255, 0))

        # Merge in that alpha channel.
        img = np.dstack((img, alpha))

        # Stick the character image on top of the background, with a little bit of x/y jitter.
        out = place_character_image(
            background, img,
            x + random.randint(-1, 2),
            y + random.randint(-5, 5)
        )

    cv2.imwrite(os.path.join(outdir, f"{label}.png"), out)

def main():
    parser = argparse.ArgumentParser(
        prog='4chan-captcha-synthesizer'
    )
    parser.add_argument('-b', '--backgrounds', action='store', required=True,
                        help='The root of the directory tree containing images to extract backgrounds from.')
    parser.add_argument('-n', '--number', action='store', required=True,
                        help='The number of synthetic CAPTCHAs to generate.')
    parser.add_argument('-o', '--out', action='store', required=True,
                        help='The directory to store images in.')

    args = parser.parse_args()

    if not os.path.exists(args.out):
        os.mkdir(args.out)

    paths = walk_png_files(args.backgrounds)

    for _ in range(int(args.number)):
        layout = np.random.choice(
            LAYOUTS, 1,
            # We have fewer 5-char layouts in the LAYOUTS array, so weight them a little heavier.
            p=[0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2]
        )[0]

        background_source = cv2.imread(random.choice(paths))
        background = isolate_background(background_source)

        synthesize_captcha(
            background, layout['x'], layout['y'], layout['size'], args.out
        )

if __name__ == '__main__':
    main()

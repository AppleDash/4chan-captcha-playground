"""
This script aligns the foreground and background images of a 4Chan "slider" CAPTCHA.
The background image contains a bunch of random-looking text/letter fragments.
The foreground image contains the normal CAPTCHA text, with transparent "holes" cut in it.
The user is meant to move a slider below the CAPTCHA to line up the background image under the "holes",
so that the CAPTCHA is a readable 5 or 6 character alphanumeric text.

This script uses a simple, but effective, heuristic:
It finds an alignment such that the black/white pixels on the left/right edges of the "holes" have the most
identical-colored pixels from the background image directly adjacent to them, visible through the "holes".
"""
import os
import sys
import operator

from PIL import Image, ImageDraw


def combine(bg: Image, fg: Image, offset: int) -> Image:
    """
    Combine the background and foreground images of a "slider" CAPTCHA,
    using the given x-offset.

    @param bg PIL.Image of the background image with random-looking text
    @param fg PIL.Image of the foreground image with holes in it.
    @param offset Pixel offset to align the images at.
    @return Combined/offset PIL.Image.
    """
    combined = Image.new('RGBA', (fg.width, fg.height))
    combined.paste(bg.crop((offset, 0, fg.width + offset, bg.height)), (0, 0, fg.width, fg.height))
    combined.paste(fg, (0, 0, fg.width, fg.height), fg)

    return combined


def to_bw(px: tuple[int, int, int]) -> int:
    """
    Determine whether a pixel is closer to black or white.

    @param px Tuple of (r, g, b) uint8 values of a pixel.
    @return 0 if the pixel is closer to black than white, 1 otherwise.
    """
    if px[0] + px[1] + px[2] > 384:
        return 1

    return 0


def detect_transparent_pixels(img: Image) -> list[tuple[int, int, int]]:
    """
    Detect transparent pixels in the image, and figure out the color of the pixel to the left or right of them.

    @param PIL.Image of the foreground image with transparent "holes".
    @return list of tuples of (x, y, color of adjacent pixel), where the color is 0 for blackish or 1 for whitish.
    """
    pixels = []
    for x in range(1, img.width - 1):
        for y in range(0, img.height):
            color = img.getpixel((x, y))
            is_trans = color[3] < 128

            if not is_trans:
                continue

            left_px = img.getpixel((x - 1, y))
            left_trans = left_px[3] < 128
            right_px = img.getpixel((x + 1, y))
            right_trans = right_px[3] < 128

            # ignore transparent gaps and one-wide areas
            if left_trans == right_trans:
                continue

            if left_trans:
                pixel = to_bw(right_px)
            else: # right_trans
                pixel = to_bw(left_px)

            pixels.append((x, y, pixel))

    print(pixels)
    return pixels


def score_offset(img: Image, pixels: list[tuple[int, int, int]], offset: int) -> int:
    """
    Heuristically score a background slide offset based on the given image and pixel information list.

    @param img The background image with random-looking text.
    @param pixels List of desired pixel values returned by detect_transparent_pixels().
    @param offset X-offset of the alignment we're scoring.
    @return Number of pixels that match the desired values in the pixels list.
    """
    score = 0
    for x, y, col in pixels:
        if to_bw(img.getpixel((x + offset, y))) == col:
            score += 1

    return score

def align_images(bg: Image, fg: Image) -> Image:
    """
    Run the heuristic (described at the top of this file) on the given background and foreground image,
    and return a combined image based on the results of the heuristic.

    @param bg PIL.Image of the background image.
    @param fg PIL.Image of the foreground image.
    @return PIL.Image of the aligned image.
    """
    max_delta = bg.width - fg.width

    pixels = detect_transparent_pixels(fg)
    scores = []

    print(max_delta)

    for offset in range(0, max_delta):
        score = score_offset(bg, pixels, offset)
        scores.append((offset, score))

    print(scores)
    best = sorted(
        scores, key=operator.itemgetter(1), reverse=True
    )[0]

    aligned = combine(bg, fg, best[0])
    return aligned


def main(argv: list[string]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} folder")
        return 1

    for root in os.listdir(argv[1]):
        root = os.path.join(argv[1], root)
        aligned_path = os.path.join(root, 'aligned.png')

        # Already did this one, no need to do it again.
        if os.path.exists(aligned_path):
            continue

        try:
            bg = Image.open(root + '/bg.png').convert('RGBA')
            fg = Image.open(root + '/img.png').convert('RGBA')

            aligned = align_images(bg, fg)

            aligned.save(aligned_path)
        except Exception as e:
            print(str(e))

    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))

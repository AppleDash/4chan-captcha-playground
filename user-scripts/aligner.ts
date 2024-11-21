/**
 * The meat of the runtime code for aligning the 4Chan "slider" style CAPTCHA.
 */
import { CaptchaData } from "./util.ts"

interface TransparentPixel {
  x: number,     // The x-coordinate of the pixel in the foreground image.
  y: number,     // The y-coordinate of the pixel in the foreground image.
  black: boolean // True if the pixel should be black, false otherwise.
};

interface RGBA {
  r: number,
  g: number,
  b: number,
  a: number
};

/**
 * @return true if the color is more white than black, false otherwise
 */
function toBw(rgba: RGBA) {
  return (rgba.r + rgba.g + rgba.b) >= 384;
}

/**
 * Get the RGBA color of the pixel at the given x, y coordinates in the given ImageData.
 *
 * @param img The ImageData
 * @param x   The x-coordinate of the pixel.
 * @param y   The y-coordinate of the pixel.
 */
function getPixel(img: ImageData, x: number, y: number): RGBA {
  const offset = ((y * img.width) + x) * 4;

  const r = img.data[offset + 0];
  const g = img.data[offset + 1];
  const b = img.data[offset + 2];
  const a = img.data[offset + 3];

  return {
    r, g, b, a
  };
}

/**
 * Given an ImageData, look for all the transparent pixels in it
 * that neighbor an opaque pixel on the x axis.
 *
 * @return an array of TransparentPixel objects, each representing an
 *         x/y image of a transparent pixel, and whether its neighbor
 *         is black or white.
 */
function detectTransparentPixels(img: ImageData): TransparentPixel[] {
  const pixels = [];

  for (let x = 1; x < img.width - 1; x++) {
    for (let y = 0; y < img.height; y++) {
      const rgba = getPixel(img, x, y);
      const isTrans = rgba.a < 128;

      if (!isTrans) {
        continue;
      }

      const leftPx = getPixel(img, x - 1, y);
      const rightPx = getPixel(img, x + 1, y);
      const leftTrans = leftPx.a < 128;
      const rightTrans = rightPx.a < 128;

      // Ignore transparent runs and 1-wide areas.
      if (leftTrans === rightTrans) {
        continue;
      }

      if (leftTrans) {
        pixels.push({ x, y, black: toBw(rightPx) });
      } else {
        pixels.push({ x, y, black: toBw(leftPx) });
      }
    }
  }

  return pixels;
}

function scoreOffset(bg: ImageData, pixels: TransparentPixel[], offset: number) {
  let score = 0;

  for (const pixel of pixels) {
    const color = getPixel(bg, pixel.x + offset, pixel.y);

    if (toBw(color) == pixel.black) {
      score++;
    }
  }

  return score;
}

/**
 * Given an HTMLElement representing the root element of the CAPTCHA input,
 * and a CaptchaData representing the foreground/background images,
 * attempt to move the slider so that the foreground and background images
 * line up to form a readable CAPTCHA.
 */
export function alignCaptcha(elem: HTMLElement, data: CaptchaData) {
  // No background image, nothing needs to be aligned.
  if (!data.bg) {
    return -1;
  }

  const maxDelta = data.bg.width - data.fg.width;
  const pixels = detectTransparentPixels(data.fg);

  let bestScore = 0;
  let bestOffset = 0;

  for (let offset = 0; offset < maxDelta; offset++) {
    const score = scoreOffset(data.bg, pixels, offset);

    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  const offsetPercent = (bestOffset / maxDelta) * 100.0;
  const slider = elem.querySelector('#t-slider') as HTMLInputElement;
  const bg = elem.querySelector('#t-bg') as HTMLElement;

  bg.style.backgroundPosition = `-${bestOffset}px top`;
  slider.value = String(offsetPercent);
  slider.dispatchEvent(new Event('change'));

  return bestOffset;
}

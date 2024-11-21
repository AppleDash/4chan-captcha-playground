export interface CaptchaData {
  fg: ImageData, // The foreground image that has transparent holes in it.
  bg?: ImageData // The background image that is aligned behind the foreground.
};

/**
 * A simple wrapper for {@link document.querySelector}
 */
export function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

/**
 * Wait for an element matching the selector to exist in the DOM, and resolve
 * the promise with that element.
 *
 * @param selector The selector to query for.
 * @param butNot   If provided, wait for the element to change from this element to a new one.
 * @return A Promise<HTMLElement> that is resolved when the desired element exists.
 */
export function waitForElm(selector: string, butNot?: HTMLElement): Promise<HTMLElement> {
  return new Promise(resolve => {
    const existingElem = $(selector);

    if (existingElem) {
      return resolve(existingElem);
    }

    const observer = new MutationObserver(() => {
      const elem = $(selector);
      if (elem && elem !== butNot) {
        observer.disconnect();
        resolve(elem);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

/*
 * Turns a string like "url('whatever')" into simply "whatever".
 */
export function unwrapDataUri(uri: string) {
  return uri.substring(5, uri.length - 7);
}

/**
 * Convert a data URI representing an image,
 * to an ImageData containing the data in the image.
 *
 * @param dataUri The data URI.
 * @return A Promise<ImageData> that will resolve with the converted ImageData.
 */
export function dataUriToImageData(dataUri: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const img = new Image();

    img.addEventListener('load', () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject('Failed to get canvas rendering context.');
        return;
      }

      ctx.drawImage(img, 0, 0);

      resolve(
        ctx.getImageData(0, 0, canvas.width, canvas.height)
      );
    });
    img.addEventListener('error', () => {
      reject('Failed to load image.');
    });
    img.src = dataUri;
  });
}

/**
 * Wait for a CAPTCHA image to be loaded under the given container element.
 *
 * @param elem Root container element the CAPTCHA is expected to be under.
 * @returns Promise that will resolve when the CAPTCHA is loaded.
 */
export function waitForCaptchaLoad(elem: HTMLElement) : Promise<CaptchaData> {
  return new Promise((resolve, reject) => {
    let fgUri : string | null = null;
    let bgUri : string | null = null;
    let timeout : number;

    const observer = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement;

          if (target.id === 't-fg') {
            fgUri = unwrapDataUri(target.style.backgroundImage);

            // Special case - if we don't get a background image fast enough, assume one isn't coming.
            // We can't rely on the order of the mutations arriving, because if we have a BG, it always comes last,
            // and if we don't have one, it never comes.
            timeout = setTimeout(async () => {
              observer.disconnect();

              if (fgUri) {
                const fgData = await dataUriToImageData(fgUri);
                resolve({
                  fg: fgData
                });
              }
            }, 150);
          } else if (target.id === 't-bg') {
            bgUri = unwrapDataUri(target.style.backgroundImage);
          }

          if (fgUri && bgUri) {
            clearTimeout(timeout);
            observer.disconnect();
            const fgData = await dataUriToImageData(fgUri);
            const bgData = await dataUriToImageData(bgUri);

            resolve({
              fg: fgData,
              bg: bgData
            });
          }
        }
      }
    });

    observer.observe(elem, { childList: true, subtree: true, attributes: true });
  });
}

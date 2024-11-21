// ==UserScript==
// @name         4Chan CAPTCHA Aligner
// @namespace    https://github.com/AppleDash
// @version      2024-11-08
// @description  Automatically align 4Chan "slider" CAPTCHAs.
// @author       Blackjack
// @match        https://boards.4chan.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=4chan.org
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  // aligner.ts
  function toBw(rgba) {
    return rgba.r + rgba.g + rgba.b >= 384;
  }
  function getPixel(img, x, y) {
    const offset = (y * img.width + x) * 4;
    const r = img.data[offset + 0];
    const g = img.data[offset + 1];
    const b = img.data[offset + 2];
    const a = img.data[offset + 3];
    return {
      r,
      g,
      b,
      a
    };
  }
  function detectTransparentPixels(img) {
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
  function scoreOffset(bg, pixels, offset) {
    let score = 0;
    for (const pixel of pixels) {
      const color = getPixel(bg, pixel.x + offset, pixel.y);
      if (toBw(color) == pixel.black) {
        score++;
      }
    }
    return score;
  }
  function alignCaptcha(elem, data) {
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
    const offsetPercent = bestOffset / maxDelta * 100;
    const slider = elem.querySelector("#t-slider");
    const bg = elem.querySelector("#t-bg");
    bg.style.backgroundPosition = `-${bestOffset}px top`;
    slider.value = String(offsetPercent);
    slider.dispatchEvent(new Event("change"));
    return bestOffset;
  }

  // util.ts
  function $(selector) {
    return document.querySelector(selector);
  }
  function waitForElm(selector, butNot) {
    return new Promise((resolve) => {
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
  function unwrapDataUri(uri) {
    return uri.substring(5, uri.length - 7);
  }
  function dataUriToImageData(dataUri) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.addEventListener("load", () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject("Failed to get canvas rendering context.");
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(
          ctx.getImageData(0, 0, canvas.width, canvas.height)
        );
      });
      img.addEventListener("error", () => {
        reject("Failed to load image.");
      });
      img.src = dataUri;
    });
  }
  function waitForCaptchaLoad(elem) {
    return new Promise((resolve, reject) => {
      let fgUri = null;
      let bgUri = null;
      let timeout;
      const observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "style") {
            const target = mutation.target;
            if (target.id === "t-fg") {
              fgUri = unwrapDataUri(target.style.backgroundImage);
              timeout = setTimeout(async () => {
                observer.disconnect();
                if (fgUri) {
                  const fgData = await dataUriToImageData(fgUri);
                  resolve({
                    fg: fgData
                  });
                }
              }, 150);
            } else if (target.id === "t-bg") {
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

  // 4chan-captcha-aligner.user.ts
  async function findAndSolve(selector, prevElem) {
    const rootElem = await waitForElm(selector, prevElem);
    const data = await waitForCaptchaLoad(rootElem);
    alignCaptcha(rootElem, data);
    await findAndSolve(selector, rootElem);
  }
  findAndSolve("#t-root");
  findAndSolve("#qrCaptchaContainer");
})();

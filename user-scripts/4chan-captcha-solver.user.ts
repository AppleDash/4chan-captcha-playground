import * as tf from "@tensorflow/tfjs";

import { alignCaptcha } from "./aligner.ts";
import { waitForElm, waitForCaptchaLoad, CaptchaData } from "./util.ts";

import modelJson from "../trainer/models/4ChanCaptcha-2024_11_19-20:35:27/model.json";
import weightsJson from "../trainer/models/4ChanCaptcha-2024_11_19-20:35:27/weights.json";

const CHARACTER_SET = ['', '0', '2', '4', '8', 'A', 'D', 'G', 'H', 'J', 'K',
                      'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y'];

let model : tf.LayersModel | null;

const modelLoader : tf.io.IOHandler = {
  load: () => Promise.resolve({
      ...modelJson,
      weightSpecs: modelJson.weightsManifest[0]["weights"] as tf.io.WeightsManifestEntry[],
      weightData: base64ToArrayBuffer(weightsJson.weights)
  })
};

/**
 * Decode a Base64 string into an ArrayBuffer.
 * @param base64 Base64-encoded string to decode
 * @return {@link ArrayBuffer} containing the decoded data.
 */
function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);

  const length = binaryString.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

/**
 * Align the foreground and background images in the CAPTCHA at the given offset.
 * If the CAPTCHA has no background image (it's not a slider CAPTCHA,) the
 * offset is ignored and the foreground image is returned.
 *
 * @param data CaptchaData containing the foreground and background images.
 * @param offset x-offset to slide the foreground image over the background.
 * @return {@link ImageData} representing the aligned image.
 * @throws {@link Error} if an internal error occurs when getting a Canvas DrawContext.
 */
function createAlignedImage(data: CaptchaData, offset: number) {
  // No background image to align, it's just a normal CAPTCHA with no slider.
  if (!data.bg) {
    return data.fg;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 80;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas draw context');
  }

  ctx.putImageData(data.bg, -offset, 0);

  // Draw the FG image with transparency onto the canvas.
  {
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = 300;
    fgCanvas.height = 300;

    const fgCtx = fgCanvas.getContext('2d');

    if (!fgCtx) {
      throw new Error('Failed to get foreground canvas draw context');
    }

    fgCtx.putImageData(data.fg, 0, 0);

    ctx.drawImage(fgCanvas, 0, 0);
  }

  return ctx.getImageData(0, 0, 300, 80);
}

/**
 * Decode the raw CTC-encoded predictions from the model, into a string
 * containing the predicted CAPTCHA text.
 * @param yPred Raw prediction output from the model.
 * @return string containing the predicted CAPTCHA text.
 */
function ctcDecode(yPred: tf.Tensor) {
  const rawValues = tf.tidy(() =>
    yPred.argMax(-1).arraySync() as number[][]
  );

  let result = '';
  let prevLabel = 0;

  for (const label of rawValues[0]) {
    if (label !== 0 && label !== prevLabel) {
      result += CHARACTER_SET[label] || ''; // Ignore out-of-vocabulary tokens.
    }
    prevLabel = label;
  }

  return result;
}

/**
 * Continually find and align + solve a CAPTCHA existing inside the container element
 * with the given selector. Once one operation has been performed,
 * this function will recurse to do it again once a new CAPTCHA is loaded.
 */
async function findAndSolve(selector: string, prevElem?: HTMLElement) {
  const rootElem = await waitForElm(selector, prevElem);

  try {
    const data = await waitForCaptchaLoad(rootElem); // This might fail if the post form is closed, etc.
    const solField = rootElem.querySelector<HTMLInputElement>('#t-resp');

    if (!solField) {
      console.error('[4Chan CAPTCHA Solver] Failed to find CAPTCHA solution field.');
      return;
    }

    const oldPlaceholder = solField.placeholder;

    // First, align the CAPTCHA, if it's a slider CAPTCHA.
    const offset = alignCaptcha(rootElem, data);

    // Now it's time for the fun part :)
    if (model == null) {
      solField.placeholder = 'Loading model...';
      model = await tf.loadLayersModel(modelLoader);
    }

    tf.tidy(() => {
      // This could only happen if the model failed to load, or something like that. Not much we can do.
      if (!model) {
        solField.placeholder = 'Failed to load model!';
        return;
      }

      solField.placeholder = 'Solving CAPTCHA...';

      const alignedImage = createAlignedImage(data, offset);
      let alignedTensor = tf.browser.fromPixels(alignedImage);

      // This mirrors the data manipulation done in the Python inference script.
      alignedTensor = tf.image.rgbToGrayscale(alignedTensor);
      alignedTensor = tf.where(
        alignedTensor.greater(127),
        tf.onesLike(alignedTensor),
        tf.zerosLike(alignedTensor)
      );
      alignedTensor = tf.transpose(alignedTensor, [1, 0, 2]);

      const prediction = model.predict(alignedTensor.expandDims(0));

      if (Array.isArray(prediction)) {
        solField.placeholder = 'Failed to solve!';
        throw new Error('Unexpected result type returned from model.predict()');
      }

      const predictedText = ctcDecode(prediction);

      if (predictedText.length < 5) {
        solField.placeholder = 'Failed to solve!';
        solField.value = '';
      } else {
        solField.value = predictedText;
        solField.placeholder = oldPlaceholder;
      }
    });
  } catch (e) {
    console.error("[4Chan CAPTCHA Solver] Failed to load/solve CAPTCHA:", e);
  }

  await findAndSolve(selector, rootElem);
}

findAndSolve('#t-root');
findAndSolve('#qrCaptchaContainer');

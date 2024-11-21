import { alignCaptcha } from './aligner.ts';
import { waitForElm, waitForCaptchaLoad } from './util.ts';

/**
 * Continually find and align a CAPTCHA existing inside the container element
 * with the given selector. Once one operation has been performed,
 * this function will recurse to do it again once a new CAPTCHA is loaded.
 */
async function findAndSolve(selector: string, prevElem?: HTMLElement) {
  const rootElem = await waitForElm(selector, prevElem);
  const data = await waitForCaptchaLoad(rootElem);

  alignCaptcha(rootElem, data);

  await findAndSolve(selector, rootElem);
}

findAndSolve('#t-root');
findAndSolve('#qrCaptchaContainer');

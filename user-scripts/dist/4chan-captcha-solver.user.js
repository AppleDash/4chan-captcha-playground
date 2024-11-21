// ==UserScript==
// @name         4Chan CAPTCHA Solver
// @namespace    https://github.com/AppleDash
// @version      2024-11-08
// @description  Automatically solve 4Chan CAPTCHAs using TensorFlow.
// @author       Blackjack
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest
// @match        https://boards.4chan.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=4chan.org
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // external-global-plugin:@tensorflow/tfjs
  var require_tfjs = __commonJS({
    "external-global-plugin:@tensorflow/tfjs"(exports, module) {
      "use strict";
      module.exports = window.tf;
    }
  });

  // 4chan-captcha-solver.user.ts
  var tf = __toESM(require_tfjs(), 1);

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

  // ../trainer/models/4ChanCaptcha-2024_11_19-20:35:27/model.json
  var model_default = { format: "layers-model", generatedBy: "keras v2.18.0", convertedBy: "TensorFlow.js Converter v4.22.0", modelTopology: { keras_version: "2.18.0", backend: "tensorflow", model_config: { class_name: "Functional", config: { name: "4ChanCaptcha", trainable: true, layers: [{ class_name: "InputLayer", config: { batch_input_shape: [null, 300, 80, 1], dtype: "float32", sparse: false, ragged: false, name: "input_1" }, name: "input_1", inbound_nodes: [] }, { class_name: "Conv2D", config: { name: "conv2d", trainable: true, dtype: "float32", filters: 32, kernel_size: [3, 3], strides: [1, 1], padding: "same", data_format: "channels_last", dilation_rate: [1, 1], groups: 1, activation: "relu", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, kernel_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, bias_constraint: null }, name: "conv2d", inbound_nodes: [[["input_1", 0, 0, {}]]] }, { class_name: "MaxPooling2D", config: { name: "max_pooling2d", trainable: true, dtype: "float32", pool_size: [2, 2], padding: "same", strides: [2, 2], data_format: "channels_last" }, name: "max_pooling2d", inbound_nodes: [[["conv2d", 0, 0, {}]]] }, { class_name: "Conv2D", config: { name: "conv2d_1", trainable: true, dtype: "float32", filters: 64, kernel_size: [3, 3], strides: [1, 1], padding: "same", data_format: "channels_last", dilation_rate: [1, 1], groups: 1, activation: "relu", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, kernel_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, bias_constraint: null }, name: "conv2d_1", inbound_nodes: [[["max_pooling2d", 0, 0, {}]]] }, { class_name: "MaxPooling2D", config: { name: "max_pooling2d_1", trainable: true, dtype: "float32", pool_size: [2, 2], padding: "same", strides: [2, 2], data_format: "channels_last" }, name: "max_pooling2d_1", inbound_nodes: [[["conv2d_1", 0, 0, {}]]] }, { class_name: "Conv2D", config: { name: "conv2d_2", trainable: true, dtype: "float32", filters: 128, kernel_size: [3, 3], strides: [1, 1], padding: "same", data_format: "channels_last", dilation_rate: [1, 1], groups: 1, activation: "relu", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, kernel_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, bias_constraint: null }, name: "conv2d_2", inbound_nodes: [[["max_pooling2d_1", 0, 0, {}]]] }, { class_name: "MaxPooling2D", config: { name: "max_pooling2d_2", trainable: true, dtype: "float32", pool_size: [2, 2], padding: "same", strides: [2, 2], data_format: "channels_last" }, name: "max_pooling2d_2", inbound_nodes: [[["conv2d_2", 0, 0, {}]]] }, { class_name: "Reshape", config: { name: "reshape", trainable: true, dtype: "float32", target_shape: [-1, 1280] }, name: "reshape", inbound_nodes: [[["max_pooling2d_2", 0, 0, {}]]] }, { class_name: "Dense", config: { name: "dense", trainable: true, dtype: "float32", units: 128, activation: "relu", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, kernel_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, bias_constraint: null }, name: "dense", inbound_nodes: [[["reshape", 0, 0, {}]]] }, { class_name: "Dropout", config: { name: "dropout", trainable: true, dtype: "float32", rate: 0.3, noise_shape: null, seed: null }, name: "dropout", inbound_nodes: [[["dense", 0, 0, {}]]] }, { class_name: "Bidirectional", config: { name: "bidirectional", trainable: true, dtype: "float32", layer: { module: "keras.layers", class_name: "LSTM", config: { name: "lstm", trainable: true, dtype: "float32", return_sequences: true, return_state: false, go_backwards: false, stateful: false, unroll: false, time_major: false, units: 128, activation: "tanh", recurrent_activation: "sigmoid", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, recurrent_initializer: { module: "keras.initializers", class_name: "Orthogonal", config: { gain: 1, seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, unit_forget_bias: true, kernel_regularizer: null, recurrent_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, recurrent_constraint: null, bias_constraint: null, dropout: 0, recurrent_dropout: 0, implementation: 2 }, registered_name: null }, merge_mode: "concat" }, name: "bidirectional", inbound_nodes: [[["dropout", 0, 0, {}]]] }, { class_name: "Bidirectional", config: { name: "bidirectional_1", trainable: true, dtype: "float32", layer: { module: "keras.layers", class_name: "LSTM", config: { name: "lstm_1", trainable: true, dtype: "float32", return_sequences: true, return_state: false, go_backwards: false, stateful: false, unroll: false, time_major: false, units: 64, activation: "tanh", recurrent_activation: "sigmoid", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, recurrent_initializer: { module: "keras.initializers", class_name: "Orthogonal", config: { gain: 1, seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, unit_forget_bias: true, kernel_regularizer: null, recurrent_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, recurrent_constraint: null, bias_constraint: null, dropout: 0, recurrent_dropout: 0, implementation: 2 }, registered_name: null }, merge_mode: "concat" }, name: "bidirectional_1", inbound_nodes: [[["bidirectional", 0, 0, {}]]] }, { class_name: "Dense", config: { name: "dense_1", trainable: true, dtype: "float32", units: 22, activation: "softmax", use_bias: true, kernel_initializer: { module: "keras.initializers", class_name: "GlorotUniform", config: { seed: null }, registered_name: null }, bias_initializer: { module: "keras.initializers", class_name: "Zeros", config: {}, registered_name: null }, kernel_regularizer: null, bias_regularizer: null, activity_regularizer: null, kernel_constraint: null, bias_constraint: null }, name: "dense_1", inbound_nodes: [[["bidirectional_1", 0, 0, {}]]] }], input_layers: [["input_1", 0, 0]], output_layers: [["dense_1", 0, 0]] } }, training_config: { loss: "ctc_loss", metrics: null, weighted_metrics: null, loss_weights: null, optimizer_config: { class_name: "Custom>Adam", config: { name: "Adam", weight_decay: null, clipnorm: null, global_clipnorm: null, clipvalue: null, use_ema: false, ema_momentum: 0.99, ema_overwrite_frequency: null, jit_compile: true, is_legacy_optimizer: false, learning_rate: 0.0010000000474974513, beta_1: 0.9, beta_2: 0.999, epsilon: 1e-7, amsgrad: false } } } }, weightsManifest: [{ paths: ["group1-shard1of1.bin"], weights: [{ name: "bidirectional/forward_lstm/lstm_cell/kernel", shape: [128, 512], dtype: "float32" }, { name: "bidirectional/forward_lstm/lstm_cell/recurrent_kernel", shape: [128, 512], dtype: "float32" }, { name: "bidirectional/forward_lstm/lstm_cell/bias", shape: [512], dtype: "float32" }, { name: "bidirectional/backward_lstm/lstm_cell/kernel", shape: [128, 512], dtype: "float32" }, { name: "bidirectional/backward_lstm/lstm_cell/recurrent_kernel", shape: [128, 512], dtype: "float32" }, { name: "bidirectional/backward_lstm/lstm_cell/bias", shape: [512], dtype: "float32" }, { name: "bidirectional_1/forward_lstm_1/lstm_cell/kernel", shape: [256, 256], dtype: "float32" }, { name: "bidirectional_1/forward_lstm_1/lstm_cell/recurrent_kernel", shape: [64, 256], dtype: "float32" }, { name: "bidirectional_1/forward_lstm_1/lstm_cell/bias", shape: [256], dtype: "float32" }, { name: "bidirectional_1/backward_lstm_1/lstm_cell/kernel", shape: [256, 256], dtype: "float32" }, { name: "bidirectional_1/backward_lstm_1/lstm_cell/recurrent_kernel", shape: [64, 256], dtype: "float32" }, { name: "bidirectional_1/backward_lstm_1/lstm_cell/bias", shape: [256], dtype: "float32" }, { name: "conv2d/kernel", shape: [3, 3, 1, 32], dtype: "float32" }, { name: "conv2d/bias", shape: [32], dtype: "float32" }, { name: "conv2d_1/kernel", shape: [3, 3, 32, 64], dtype: "float32" }, { name: "conv2d_1/bias", shape: [64], dtype: "float32" }, { name: "conv2d_2/kernel", shape: [3, 3, 64, 128], dtype: "float32" }, { name: "conv2d_2/bias", shape: [128], dtype: "float32" }, { name: "dense/kernel", shape: [1280, 128], dtype: "float32" }, { name: "dense/bias", shape: [128], dtype: "float32" }, { name: "dense_1/kernel", shape: [128, 22], dtype: "float32" }, { name: "dense_1/bias", shape: [22], dtype: "float32" }] }] };

  // ../trainer/models/4ChanCaptcha-2024_11_19-20:35:27/weights.json

  // 4chan-captcha-solver.user.ts
  var CHARACTER_SET = [
    "",
    "0",
    "2",
    "4",
    "8",
    "A",
    "D",
    "G",
    "H",
    "J",
    "K",
    "M",
    "N",
    "P",
    "R",
    "S",
    "T",
    "V",
    "W",
    "X",
    "Y"
  ];
  var model;
  var modelLoader = {
    load: () => Promise.resolve({
      ...model_default,
      weightSpecs: model_default.weightsManifest[0]["weights"],
      weightData: base64ToArrayBuffer(weights_default.weights)
    })
  };
  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  function createAlignedImage(data, offset) {
    if (!data.bg) {
      return data.fg;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas draw context");
    }
    ctx.putImageData(data.bg, -offset, 0);
    {
      const fgCanvas = document.createElement("canvas");
      fgCanvas.width = 300;
      fgCanvas.height = 300;
      const fgCtx = fgCanvas.getContext("2d");
      if (!fgCtx) {
        throw new Error("Failed to get foreground canvas draw context");
      }
      fgCtx.putImageData(data.fg, 0, 0);
      ctx.drawImage(fgCanvas, 0, 0);
    }
    return ctx.getImageData(0, 0, 300, 80);
  }
  function ctcDecode(yPred) {
    const rawValues = tf.tidy(
      () => yPred.argMax(-1).arraySync()
    );
    let result = "";
    let prevLabel = 0;
    for (const label of rawValues[0]) {
      if (label !== 0 && label !== prevLabel) {
        result += CHARACTER_SET[label] || "";
      }
      prevLabel = label;
    }
    return result;
  }
  async function findAndSolve(selector, prevElem) {
    const rootElem = await waitForElm(selector, prevElem);
    try {
      const data = await waitForCaptchaLoad(rootElem);
      const solField = rootElem.querySelector("#t-resp");
      if (!solField) {
        console.error("[4Chan CAPTCHA Solver] Failed to find CAPTCHA solution field.");
        return;
      }
      const oldPlaceholder = solField.placeholder;
      const offset = alignCaptcha(rootElem, data);
      if (model == null) {
        solField.placeholder = "Loading model...";
        model = await tf.loadLayersModel(modelLoader);
      }
      tf.tidy(() => {
        if (!model) {
          solField.placeholder = "Failed to load model!";
          return;
        }
        solField.placeholder = "Solving CAPTCHA...";
        const alignedImage = createAlignedImage(data, offset);
        let alignedTensor = tf.browser.fromPixels(alignedImage);
        alignedTensor = tf.image.rgbToGrayscale(alignedTensor);
        alignedTensor = tf.where(
          alignedTensor.greater(127),
          tf.onesLike(alignedTensor),
          tf.zerosLike(alignedTensor)
        );
        alignedTensor = tf.transpose(alignedTensor, [1, 0, 2]);
        const prediction = model.predict(alignedTensor.expandDims(0));
        if (Array.isArray(prediction)) {
          solField.placeholder = "Failed to solve!";
          throw new Error("Unexpected result type returned from model.predict()");
        }
        const predictedText = ctcDecode(prediction);
        if (predictedText.length < 5) {
          solField.placeholder = "Failed to solve!";
          solField.value = "";
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
  findAndSolve("#t-root");
  findAndSolve("#qrCaptchaContainer");
})();
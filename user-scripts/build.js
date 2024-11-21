import { build } from 'esbuild';
import externalGlobalPluginPackage from 'esbuild-plugin-external-global';

// Needed because the plugin is a CommonJS module.
const { externalGlobalPlugin } = externalGlobalPluginPackage;

const scripts = [
    {
        entry: '4chan-captcha-solver.user.ts',
        outfile: 'dist/4chan-captcha-solver.user.js',
        banner: `
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
`.trim()
    },
    {
        entry: '4chan-captcha-aligner.user.ts',
        outfile: 'dist/4chan-captcha-aligner.user.js',
        banner: `
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
        `.trim()
    }
];

scripts.forEach(({ entry, outfile, banner }) => {
    build({
        entryPoints: [entry],
        bundle: true,
        outfile: outfile,
        target: 'esnext',
        format: 'iife',
        platform: 'browser',
        banner: { js: banner },
        tsconfig: 'tsconfig.json',
        external: ['@tensorflow/tfjs'],
        treeShaking: true,
        plugins: [
            // This is needed to avoid embedding the entirety of TensorFlowJS in the script,
            // because it's instead provided by the @require declaration in the UserScript header.
            externalGlobalPlugin({
                '@tensorflow/tfjs': 'window.tf'
            })
        ]
      }).catch(() => process.exit(1));
    console.log(`Built ${entry} -> ${outfile}`);
})


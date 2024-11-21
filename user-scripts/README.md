4chan-captcha-user-scripts
=========================
These are the user scripts, written in TypeScript, which are designed to work in conjunction with the models trained by the trainer.

## 4chan-captcha-aligner
This script automatically aligns the "slider" CAPTCHAs whenever you receive one. It uses the same algorithm as the `captcha_aligner.py` script in the trainer.

## 4chan-captcha-solver
This script incorporates the function of the 4chan-captcha-aligner script and adds functionality to use the trained model to automatically solve the CAPTCHA.

## Usage
Builds of the latest version of the scripts are available in the `dist/` directory. Install them as you would any other user script. The CAPTCHA solver script is quite large, as the model weights are embedded in the script to avoid needing to download them from an external location.
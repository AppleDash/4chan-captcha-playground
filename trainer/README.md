4chan-captcha-trainer
=====================

This project uses TensorFlow and Keras to train a CNN LSTM network to decode the 4Chan CAPTCHA. CTC encoding of the solutions is used, because the 4Chan CAPTCHA can be either 4, 5 or 6 characters long. The rest of the model's architecture was determined by experimentation, as well as a lot of research into architectures others have used for CAPTCHA decoding.

## Scripts
### captcha_aligner.py
This script is used for preprocessing of slider CAPTCHAs. It takes the foreground and background image, and uses a heuristic to find the correct alignment and output an aligned image.

### decode_jsons.py
This script decodes the JSON output from the 4chan-captcha-saver script into aligned images (in the case of slider CAPTCHAs,) and saves output images named with the solutions.

### infer.py
This script uses the trained model to infer the solution for a 4Chan CAPTCHA image.

### labeler.py
This script was experimental; it uses a popular CAPTCHA-solving API (AntiCaptcha) to take unsolved CAPTCHAs and solve them, in order to use them as training input for the model. The AntiCaptcha service is not very reliable at solving the 4Chan CAPTCHA, however.

### main.py
This is the main script that compiles the model, trains it based on the training data, and saves the trained model.

### synthesize.py
This script uses OpenCV to synthesize new CAPTCHAs with known solutions, based on existing CAPTCHA characters and background images.

## Where is the data?
I chose not to include the datasets I used for CAPTCHA synthesis and training in this repo, as they are large and would pollute the repo with non-code files.

If you want the raw datasets, or the trained models in Keras format, feel free to contact me and I'd be happy to provide a download link.

The latest model, in TFJS format, is embedded in the compiled solver user script under `../user-scripts/dist`.

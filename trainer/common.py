"""
Common functions that are used by both the training and inference code.
"""
import os
import keras
import numpy as np
import tensorflow as tf

CHARACTER_SET = ['', '0', '2', '4', '8', 'A', 'D', 'G', 'H', 'J', 'K', 'M',
                'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y']
char_to_num = keras.layers.StringLookup(vocabulary=CHARACTER_SET,
                                        mask_token=None, oov_token='')
num_to_char = keras.layers.StringLookup(vocabulary=char_to_num.get_vocabulary(),
                                        invert=True, mask_token=None, oov_token='')

def walk_png_files(top: str) -> list[str]:
    """
    Walk the given directory and accumulate a list of all files ending in .png under that dir.
    @param top The top directory to walk.
    @return List of strs containing the paths of files ending in .png under that dir.
    """
    paths = []
    for root, dirs, files in os.walk(top):
        for file in files:
            if file.endswith('.png'):
                paths.append(os.path.join(root, file))

    return paths

def ctc_loss(y_true: tf.Tensor, y_pred: tf.Tensor):
    """ Simple CTC loss function. """
    # Compute the training-time loss value
    batch_len = tf.cast(tf.shape(y_true)[0], dtype="int64")
    input_length = tf.cast(tf.shape(y_pred)[1], dtype="int64")
    label_length = tf.cast(tf.shape(y_true)[1], dtype="int64")

    input_length = input_length * tf.ones(shape=(batch_len, 1), dtype="int64")
    label_length = label_length * tf.ones(shape=(batch_len, 1), dtype="int64")

    loss = tf.keras.backend.ctc_batch_cost(y_true, y_pred, input_length, label_length)
    return loss

def ctc_decode_predictions(pred):
    """
    Decode the CTC-encoded predictions from the model into a string of the
    CAPTCHA characters. Uses greedy search.
    """
    input_len = np.ones(pred.shape[0]) * pred.shape[1]
    results = tf.keras.backend.ctc_decode(pred, input_length=input_len, greedy=True)[0][0]
    output_text = []
    for result in results:
        result = tf.strings.reduce_join(num_to_char(result)).numpy().decode("utf-8")
        output_text.append(result)

    return output_text


def encode_sample(img: str, label: str = None) -> tuple[tf.Tensor, tf.Tensor]:
    """
    Encode a single sample as input to the model.
    @param img Path to the image file on disk
    @param label Label for the image file, when training. Can be None if we're encoding for inference.
    @return Tuple of (image tensor, encoded label tensor).
    """
    file = tf.io.read_file(img)

    data = tf.io.decode_png(file, channels=3)
    data = tf.image.resize(data, (80, 300))
    data = tf.image.rgb_to_grayscale(data)

    # threshold to convert to pure b/w, this also normalizes it.
    data = tf.where(data>127, tf.ones_like(data), tf.zeros_like(data))
    data = tf.transpose(data, perm=[1, 0, 2])

    if label is not None:
        label = char_to_num(tf.strings.unicode_split(label, input_encoding="UTF-8"))

        # Pad the label with empty chars to 6 chars (the maximum length of the CAPTCHA)
        max_label_len = 6
        label = tf.pad(label, [[0, max_label_len - tf.shape(label)[0]]], constant_values=0)

    return data, label

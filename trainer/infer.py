""" Simple script that infers the CAPTCHA solution using the trained model.  """
import argparse
import tensorflow as tf

from common import ctc_loss, ctc_decode_predictions, encode_sample

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog='4chan-captcha-inferer'
    )
    parser.add_argument('-m', '--model', action='store', required=True)
    parser.add_argument('image', action='store')

    args = parser.parse_args()

    model = tf.keras.models.load_model(args.model, custom_objects={'ctc_loss': ctc_loss})
    model.summary()

    pred = model.predict(tf.expand_dims(
        encode_sample(args.image)[0], 0
    ))

    decoded = ctc_decode_predictions(pred)

    print(decoded[0])

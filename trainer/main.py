"""
The main script that creates and trains the model based on the given training data.
"""
import os
import glob
import random
import argparse
import datetime

import keras
import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import tensorflow.keras as keras

from tensorflow.keras import layers

from common import ctc_loss, CHARACTER_SET, num_to_char, char_to_num, \
                   ctc_decode_predictions, encode_sample, walk_png_files

# This was taken from https://keras.io/examples/audio/ctc_asr/
class CallbackEval(keras.callbacks.Callback):
    """Displays a batch of outputs after every epoch."""

    def __init__(self, dataset):
        super().__init__()
        self.dataset = dataset

    def on_epoch_end(self, epoch: int, logs=None):
        predictions = []
        targets = []
        for batch in self.dataset:
            X, y = batch
            batch_predictions = self.model.predict(X)
            batch_predictions = ctc_decode_predictions(batch_predictions)
            predictions.extend(batch_predictions)
            for label in y:
                label = tf.strings.reduce_join(num_to_char(label)) \
                                  .numpy().decode("utf-8")

                targets.append(label)

        for i in np.random.randint(0, len(predictions), 5):
            print(f"Target    : {targets[i]}")
            print(f"Prediction: {predictions[i]}")
            print("-" * 100)


def get_file_label(file: str) -> str:
    label, _ = os.path.splitext(os.path.basename(file))

    return label.upper()

def create_model() -> keras.Model:
    image = keras.Input(shape=(300, 80, 1))

    x = image#layers.Dropout(0.2)(image)
    x = layers.Conv2D(32, (3, 3), padding='same', activation='relu')(x)
    x = layers.MaxPooling2D(padding='same', trainable=True)(x)
    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(x)
    x = layers.MaxPooling2D(padding='same', trainable=True)(x)
    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.MaxPooling2D(pool_size=(2, 2), strides=(2, 2), padding='same')(x)

    x = layers.Reshape((-1, 1280))(x)

    x = layers.Dense(128, activation='relu')(x)
    x = layers.Dropout(0.3)(x) # 0.4 seems to train faster but make the model dumber, 0.3 works rather well
    x = layers.Bidirectional(
        layers.LSTM(128, return_sequences=True)
    )(x)
    x = layers.Bidirectional(
        layers.LSTM(64, return_sequences=True)
    )(x)

    output = layers.Dense(len(CHARACTER_SET) + 1, activation='softmax')(x)

    model = keras.Model(image, output, name='4ChanCaptcha')

    model.compile(optimizer='adam', loss=ctc_loss)

    return model

def load_dataset(paths: list[str], batch_size=16) -> tf.data.Dataset:
    """
    Load a tf.data.Dataset of the encoded samples represented by the images at the given paths.
    The images must be named {sol}.png, where sol is the solution to the CAPTCHA in that image.
    @param paths The list of paths, one for each image.
    @param batch_size The batch size to use for the dataset.
    @return an encoded and batched tf.data.Dataset.
    """
    random.shuffle(paths)

    print('Have ' + str(len(paths)) + ' paths')

    dataset = tf.data.Dataset.from_tensor_slices(
        (paths, [get_file_label(path) for path in paths])
    )

    return dataset.map(encode_sample, num_parallel_calls=tf.data.AUTOTUNE) \
                  .padded_batch(batch_size) \
                  .prefetch(buffer_size=tf.data.AUTOTUNE)

def load_and_segment_dataset(paths: list[str], train_fraction=0.9) -> (tf.data.Dataset, tf.data.Dataset):
    """
    Load two tf.data.Datasets of encoded samples, split into training and evaluation.
    @param paths The list of paths, one for each image.
    @param train_fraction What fraction of the data to use for training vs evaluation.
    @return Tuple of (training_dataset, evaluation_dataset).
    """
    random.shuffle(paths)
    split = int(len(paths) * train_fraction)

    return load_dataset(paths[:split]), load_dataset(paths[split:])

def train_model(model: keras.Model, dataset_paths: list[str], epochs=16):
    """ Main routine that trains the model. """
    training_dataset, validation_dataset = load_and_segment_dataset(
        dataset_paths
    )

    # Callback function to check decodes on the validation set.
    validation_callback = CallbackEval(validation_dataset)
    return model.fit(
        training_dataset,
        validation_data=validation_dataset,
        epochs=epochs,
        callbacks=[validation_callback],
    )

def main():
    parser = argparse.ArgumentParser(
        prog='4chan-captcha-trainer',
        description='Trains the Keras model for the 4Chan CAPTCHA solver',
        epilog='All specified datasets will be combined, shuffled, and split into the training/validation sets.'
    )

    parser.add_argument('--dataset', '-d', action='append', required=True,
                        help='Add a directory containing a dataset for training.')
    parser.add_argument('--epochs', '-e', action='store', default=16,
                        help='How many epochs to train the model. Defaults to 16.')

    args = parser.parse_args()

    dataset_paths = []
    for root in args.dataset:
        dataset_paths.extend(walk_png_files(root))

    print(f"Found {len(dataset_paths)} image paths for training.")

    model = create_model()
    model.summary(line_length=110)
    history = train_model(model, dataset_paths, int(args.epochs))

    now = datetime.datetime.now().strftime('%Y_%m_%d-%H:%M:%S')
    model.save(os.path.join('models', f"4ChanCaptcha-{now}.h5"))

    # Create and save the loss graph
    print(history.history)
    epochs = range(1, len(history.history['loss']) + 1)

    plt.figure(figsize=(10, 6))
    plt.plot(epochs, history.history['loss'])
    plt.plot(epochs, history.history['val_loss'])
    plt.title('Model Loss')
    plt.ylabel('Loss')
    plt.xlabel('Epoch')
    plt.xticks(epochs)
    plt.grid(True)
    plt.legend(['Training', 'Validation'], loc='upper left')
    plt.savefig(os.path.join('models', f"4ChanCaptcha-{now}_loss.png"))

if __name__ == '__main__':
    main()

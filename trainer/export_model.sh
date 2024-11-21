#!/bin/sh
set -e

infile=$1
outdir="${infile%.*}" # Remove the extension
max_size=104857600 # 100 megabytes, it should be less than 10, but the idea is we want it all in one file.

# This needs to run in the Python 3.10 or older environment, previously set up with PyEnv.
pyenv exec tensorflowjs_converter --weight_shard_size_bytes=$max_size \
    --input_format=keras --output_format=tfjs_layers_model \
    "$infile" "$outdir"

# Convert the binary weights file to a JSON file that will be imported by the user script.
echo '{"weights":"'$(base64 -w 0 "$outdir/group1-shard1of1.bin")'"}' > "$outdir/weights.json"

#!/bin/bash

# Current Path
CURRENT_DIR=$(pwd)

# Data & Output path
DATA_DIR="$CURRENT_DIR/../data"

for csv_file in "$DATA_DIR"/*.csv; do
  filename=$(basename -- "$csv_file")
  filename_no_ext="${filename%.*}"
  output_subdir="$CURRENT_DIR/outputs/$filename_no_ext"
  
  rm -rf $output_subdir
  mkdir -p "$output_subdir"

  node runCodeWrapper.js "$csv_file" "$output_subdir"
done

import pandas as pd

def convert_parquet_to_csv(parquet_file, csv_file):
    """
    Converts a Parquet file to a CSV file.

    Args:
        parquet_file (str): The path to the input Parquet file.
        csv_file (str): The path to the output CSV file.
    """
    df = pd.read_parquet(parquet_file)
    df.to_csv(csv_file, index=False)
    print(f"Successfully converted {parquet_file} to {csv_file}")

import glob
import os

if __name__ == "__main__":
    # Change to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Find all .parquet files in the current directory
    parquet_files = glob.glob("*.parquet")
    
    for parquet_input in parquet_files:
        # Create the output CSV file name by replacing the extension
        csv_output = os.path.splitext(parquet_input)[0] + ".csv"
        convert_parquet_to_csv(parquet_input, csv_output)
import os
import glob

def compare_performance():
    search_path = os.path.join('..', 'compare', 'outputs', '**', 'summary.txt')
    summary_files = glob.glob(search_path, recursive=True)

    origin_performance = []
    optimized_performance = []
    native_performance = []

    for summary_file in summary_files:
        origin_epoch_time = None
        optimized_epoch_time = None
        with open(summary_file, 'r') as f:
            lines = f.readlines()
            in_origin_mode = False
            in_optimized_mode = False
            in_native_mode = False
            for line in lines:
                if '--- origin Mode ---' in line:
                    in_origin_mode = True
                    in_optimized_mode = False
                    in_native_mode = False
                elif '--- optimized Mode ---' in line:
                    in_origin_mode = False
                    in_optimized_mode = True
                    in_native_mode = False
                elif '--- native Mode ---' in line:
                    in_origin_mode = False
                    in_optimized_mode = False
                    in_native_mode = True
                
                if 'Epoch time:' in line:
                    epoch_time = int(line.split(':')[1].strip())
                    if in_origin_mode:
                        origin_epoch_time = epoch_time
                    elif in_optimized_mode:
                        optimized_epoch_time = epoch_time
                    elif in_native_mode:
                        native_epoch_time = epoch_time
        
        if origin_epoch_time is not None and optimized_epoch_time is not None and native_epoch_time is not None:
            origin_performance.append(origin_epoch_time)
            optimized_performance.append(optimized_epoch_time)
            native_performance.append(native_epoch_time)

    with open('origin_performance.txt', 'w') as f:
        for num in origin_performance:
            f.write(f"{num}\n")

    with open('optimized_performance.txt', 'w') as f:
        for num in optimized_performance:
            f.write(f"{num}\n")

    with open('native_performance.txt', 'w') as f:
        for num in native_performance:
            f.write(f"{num}\n")

    print(f"Found {len(summary_files)} summary.txt files.")
    print(f"Wrote {len(origin_performance)} performance of original to origin_performance.txt.")
    print(f"Wrote {len(optimized_performance)} performance of optimized to optimized_performance.txt.")
    print(f"Wrote {len(native_performance)} performance of native to native_performance.txt.")

if __name__ == '__main__':
    compare_performance()

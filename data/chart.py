import os
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

def read_data(file_path):
    """Reads performance data from a file."""
    data = []
    try:
        with open(file_path, 'r') as f:
            for line in f:
                try:
                    data.append(float(line.strip()))
                except ValueError:
                    print(f"Could not convert line to float: {line.strip()}")
    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
    return data

# Assuming the script is run from the 'data' directory, and the data files are in '../compare/outputs/'
base_path = os.path.dirname(__file__)

origin_performance_file = os.path.join(base_path, 'origin_performance.txt')
optimized_performance_file = os.path.join(base_path, 'optimized_performance.txt')
native_performance_file = os.path.join(base_path, 'native_performance.txt')

origin_performance = read_data(origin_performance_file)
optimized_performance = read_data(optimized_performance_file)
native_performance = read_data(native_performance_file)
 
# 2. 그래프 생성
# 각 데이터 배열에 대해 sns.kdeplot을 호출합니다.
sns.kdeplot(origin_performance, fill=True, alpha=0.5, label='WASM origin')
sns.kdeplot(optimized_performance, fill=True, alpha=0.5, label='WASM optimized')
sns.kdeplot(native_performance, fill=True, alpha=0.5, label='Native binary')
 
# 3. 그래프 마무리
plt.title('Performance Comparison') # 그래프 제목
plt.xlabel('Elapsed time (ms)') # x축 라벨
plt.ylabel('Density') # y축 라벨
plt.legend() # 각 그래프의 라벨(범례) 표시
plt.show() # 그래프 출력
from pathlib import Path

def analyze_simulations(root_directory="outputs"):
    """
    지정된 디렉토리 하위의 모든 ExtremeSimulation 폴더를 탐색하여
    comparison.txt 파일의 true/false 개수를 집계합니다.
    """
    true_count = 0
    false_count = 0
    
    # 'outputs' 디렉토리 경로를 설정합니다.
    root_path = Path(root_directory)
    
    # 'outputs' 디렉토리가 없는 경우 오류 메시지를 출력하고 종료합니다.
    if not root_path.is_dir():
        print(f"오류: '{root_directory}' 디렉토리를 찾을 수 없습니다.")
        return
        
    # glob을 사용하여 'ExtremeSimulation_*' 패턴을 가진 모든 하위 폴더를 찾습니다.
    for simulation_dir in root_path.glob("ExtremeSimulation_*"):
        if simulation_dir.is_dir():
            comparison_file = simulation_dir / "comparison.txt"
            
            # comparison.txt 파일이 존재하는지 확인합니다.
            if comparison_file.exists():
                try:
                    # 파일의 내용을 읽어옵니다.
                    content = comparison_file.read_text().strip()
                    
                    # 내용의 마지막 단어가 'true'인지 'false'인지 확인합니다.
                    if content.endswith("true"):
                        true_count += 1
                    elif content.endswith("false"):
                        false_count += 1
                except Exception as e:
                    print(f"{comparison_file} 파일을 읽는 중 오류 발생: {e}")

    # 최종 결과를 출력합니다.
    print("--- 분석 결과 ---")
    print(f"🟢 True 개수: {true_count}")
    print(f"🔴 False 개수: {false_count}")
    print(f"총 폴더 개수: {true_count + false_count}")

if __name__ == "__main__":
    analyze_simulations("../compare/outputs")
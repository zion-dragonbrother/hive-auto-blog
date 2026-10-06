import urllib.request
import urllib.parse
import json
import datetime

def test_api_connection():
    url = "https://api.hive.blog"
    # 요청 보낼 데이터
    data = {
        "jsonrpc": "2.0",
        "method": "condenser_api.get_dynamic_global_properties",
        "params": [],
        "id": 1
    }
    
    # 데이터를 JSON으로 변환
    json_data = json.dumps(data).encode('utf-8')
    
    # 요청 설정
    req = urllib.request.Request(url, data=json_data, headers={'Content-Type': 'application/json'})
    
    try:
        # 호출
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"✅ Hive 블록체인 연결 성공! 블록 높이: {result['result']['head_block_number']}")
    except Exception as e:
        print(f"❌ 연결 실패: {e}")

if __name__ == '__main__':
    test_api_connection()

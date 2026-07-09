import serial
import time

# UART1を使用 (/dev/ttyS1)
# timeoutを2秒に設定し、応答を少し長く待てるようにする
ser = serial.Serial('/dev/ttyS1', 115200, timeout=2)

print("Opening Serial Port... Waiting for 4GIM to be ready.")

command = b'$YV\r\n'
max_retries = 20  # 最大リトライ回数（約40〜60秒分）
success = False

for i in range(max_retries):
    ser.write(command)
    print(f"[{i+1}/{max_retries}] Sent: $YV")
    
    time.sleep(1) # モジュールの処理待ち
    
    if ser.in_waiting > 0:
        response = ser.read(ser.in_waiting)
        # デコードして表示（改行コードなどを整理して見やすくする）
        text_response = response.decode('utf-8', errors='ignore').strip()
        print(f"Received: {text_response}")
        success = True
        break  # 応答があればループを抜ける
    else:
        print("No response... retrying in 2 seconds.")
        time.sleep(2) # 次のコマンド送信まで少し待機

if not success:
    print("Error: 4GIMからの応答がタイムアウトしました。ハードウェアを確認してください。")

ser.close()
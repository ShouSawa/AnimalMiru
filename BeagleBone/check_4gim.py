import serial
import time

# UART1を使用 (/dev/ttyS1)
ser = serial.Serial('/dev/ttyS1', 115200, timeout=1)

print("Opening Serial Port...")
time.sleep(1) # 4GIMの起動待ち

# コマンド送信（バージョン情報の取得）
command = b'$YV\r\n' 
ser.write(command)
print(f"Sent: {command}")

# 応答の受信
time.sleep(1)
if ser.in_waiting > 0:
    response = ser.read(ser.in_waiting)
    print(f"Received: {response.decode('utf-8', errors='ignore')}")
else:
    print("No response")

ser.close()
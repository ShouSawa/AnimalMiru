import serial
import time

# 4GIMのUART設定（各自の環境に合わせて）
ser = serial.Serial('/dev/ttyS1', 115200, timeout=1)

# 例: mineoやsoracomなどのAPN情報を設定
ser.write(b'$PS soracom.io sora sora\r\n')
time.sleep(2) # 設定保存待ち

# ngrokで発行されたURL + /data
# 例: http://abcd-1234.ngrok-free.app/data
target_url = "https://4014-202-24-246-240.ngrok-free.app/data" 
sensor_value = 3.3  # センサから取得した値

# コマンドの組み立て
command = f'$WP {target_url} val={sensor_value}\r\n'

ser.write(command.encode())
time.sleep(1)
print(ser.read_all())
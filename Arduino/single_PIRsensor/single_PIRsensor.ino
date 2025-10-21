// 変数の宣言
int value;
int datas[1];
int pins[1] = { A0 }; // 回路と接続するピン
int i = 0;
int data; 
char buf1[5];

void setup() {
  Serial.begin(9600);
  while (!Serial);  // 準備が終わるのを待つ
  Serial.write("Starting Arduino\r\n"); // \r\nは改行

  // A〇ピンが入力用として動作する
  pinMode(A0, INPUT); 
}

void loop() {
  // 取得した電圧値を0~5[V]に変換
  float voltA0 = (analogRead(A0) * 5.0) / 1023.0;

  // 取得した電圧値を空白埋め
  sprintf(buf1, "%4d", analogRead(A0));

  // 取得したデータを送信
  Serial.println("circuit No.1 : " + String(buf1) + " , " + String(voltA0, 7) + "[V]");

  delay(100);  // 合計1ms = 1kHz
}
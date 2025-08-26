// 変数の宣言
int value;
int datas[3];
int pins[3] = { A0, A1, A2 }; // 回路と接続するピン
int i = 0;
int data;       
char buf1[5];
char buf2[5];
char buf3[5];

void setup() {
  Serial.begin(9600);
  while (!Serial);  // 準備が終わるのを待つ
  Serial.write("Starting Aduino No.C\r\n"); // \r\nは改行

  // A〇ピンが入力用として動作する
  pinMode(A0, INPUT); 
  pinMode(A1, INPUT); 
  pinMode(A2, INPUT); 
}

void loop() {
  // 取得した電圧値を0~5[V]に変換
  float voltA0 = (analogRead(A0) * 5.0) / 1023.0;
  float voltA1 = (analogRead(A1) * 5.0) / 1023.0;
  float voltA2 = (analogRead(A2) * 5.0) / 1023.0;

  // 取得した電圧値を空白埋め
  sprintf(buf1, "%4d", analogRead(A0));
  sprintf(buf2, "%4d", analogRead(A1));
  sprintf(buf3, "%4d", analogRead(A2));

  // 取得したデータを送信
  Serial.println("circuit No.7 : " + String(buf1) + " , " + String(voltA0, 7) + "[V]");
  Serial.println("circuit No.8 : " + String(buf2) + " , " + String(voltA1, 7) + "[V]");
  Serial.println("circuit No.9 : " + String(buf3) + " , " + String(voltA2, 7) + "[V]");


  delay(100);  // 合計1ms = 1kHz
}
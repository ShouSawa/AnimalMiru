// Lチカ テストプログラム

// ピンの定義
const int LED_L13 = 13;     // 回路図の D4 (L13)
const int LED_STATUS = 5;   // 回路図の D5 (LED_STATUS)

void setup() {
    // ピンを出力モードに設定
    pinMode(LED_L13, OUTPUT);
    pinMode(LED_STATUS, OUTPUT);
}

void loop() {
    // L13を点灯、STATUSを消灯
    digitalWrite(LED_L13, HIGH);
    digitalWrite(LED_STATUS, LOW);
    delay(1000); // 1秒待機

    // L13を消灯、STATUSを点灯
    digitalWrite(LED_L13, LOW);
    digitalWrite(LED_STATUS, HIGH);
    delay(1000); // 1秒待機
}
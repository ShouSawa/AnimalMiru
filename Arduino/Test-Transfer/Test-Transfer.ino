#include <SoftwareSerial.h>

#define DEBUG true
#define INITIAL_SETUP true
#define IM920_NN "0004"  // ノード番号
#define IM920_GN "00000A2A" // グループ番号

// IM920s接続ピン設定
#define IM920_RX 10
#define IM920_TX 11
SoftwareSerial im920(IM920_RX, IM920_TX);

// アナログ入力チャネル
const uint8_t channels[3] = { A1, A2, A3 };
volatile uint8_t currentChannel = 0;

// データバッファ（最大32バイト）
#define BUFFER_SIZE 32
volatile uint8_t buffer[BUFFER_SIZE];
volatile uint8_t bufferIndex = 0;

// 前回送信した値を保持
volatile uint8_t lastValue[3] = { 0, 0, 0 };
volatile uint16_t rawValues[3] = { 0, 0, 0 }; // Teleplot用生データ
const uint8_t threshold = 1;  // 変化しきい値

// タイマ割込みで送信フラグ
volatile bool sendFlag = false;


void im920_command(String command) {
  im920.print(command);
  im920.print("\r\n");

  while (!im920.available())
    ;
  String response = im920.readStringUntil('\n');
  response.trim();
  Serial.println(response);
}

void setup() {
  // デバッグ用シリアル
  Serial.begin(9600);

  // IM920s初期化
  im920.begin(19200);

  // ADC設定
  ADMUX = (1 << REFS0) | (channels[currentChannel] & 0x07);  // AVcc基準電圧
  ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADSC) | (1 << ADPS2) | (1 << ADPS1);
  // プリスケーラ=64 → 約19.2kサンプル/秒
  ADCSRB = 0;  // Free RunningモードOFF


  // タイマ設定（Timer1を使って約350msごとに割込み）
  /*
    送信可能サンプル数：331,960サンプル/時間
    1パケットに32サンプル → 10,374パケット/時間
    1時間 = 3600秒 → 3600 ÷ 10,374 ≈ 0.347秒（約347ms）/パケット
  */
  noInterrupts();
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = 5468;                         // 16MHz / 1024 ≈ 15625カウント/秒 → 350ms ≈ 5468
  TCCR1B |= (1 << WGM12);               // CTCモード
  TCCR1B |= (1 << CS12) | (1 << CS10);  // プリスケーラ1024
  TIMSK1 |= (1 << OCIE1A);              // 割込み許可
  interrupts();

  delay(100);
  // 初期設定
  if (INITIAL_SETUP) {
    im920_command("ENWR");
    im920_command("STNN " IM920_NN);
    im920_command("STGN " IM920_GN);
  }
  im920_command("RDNN");
  delay(1000);
}

// ADC割り込み処理
ISR(ADC_vect) {
  uint16_t value = ADC;
  rawValues[currentChannel] = value; // 生データを保存
  // Serial.println(value);
  uint8_t compressed = value >> 2;  // 8ビット化

  // 変化判定
  if (abs(compressed - lastValue[currentChannel]) >= threshold) {

    // 変化があったら、lastValue[]の3チャネル分をbufferに格納
    for (uint8_t k = 0; k < 3; k++) {
      if (bufferIndex < 30) {
        buffer[bufferIndex++] = lastValue[k];
      }
    }

    // バッファ満杯なら即送信
    if (bufferIndex >= 30) {
      sendFlag = true;
    }
  }
  lastValue[currentChannel] = compressed;

  // 次チャネルへ
  currentChannel++;
  if (currentChannel >= 3) {
    currentChannel = 0;
    String s0 = (String)lastValue[0];
    String s1 = (String)lastValue[1];
    String s2 = (String)lastValue[2];
    // Serial.println("0,255,"+s0+","+ s1+ ","+ s2);
  }
  ADMUX = (ADMUX & 0xF0) | (channels[currentChannel] & 0x07);

  // 次の変換開始
  ADCSRA |= (1 << ADSC);
}

ISR(TIMER1_COMPA_vect) {
  // 350msごとに送信フラグを立てる
  sendFlag = true;
}


int sendWithRetry(const char *data, uint8_t retries = 3) {
  unsigned long baseWait = 50;  // 初回待機時間(ms)

  for (uint8_t attempt = 0; attempt < retries; attempt++) {
    im920.print(data);
    if (DEBUG) {
      Serial.print("send attempt: ");
      Serial.println(attempt + 1);
    }

    unsigned long start = millis();
    while (millis() - start < baseWait) {  // 応答待ち
      if (im920.available()) {
        String response = im920.readStringUntil('\n');
        response.trim();
        if (DEBUG) {
          Serial.print("response: ");
          Serial.println(response);
        }
        if (response.startsWith("OK")) return attempt;  // 成功 → 試行回数返す
        if (response.startsWith("NG")) break;           // NG → 再送
      }
    }
    baseWait *= 2;  // 次回は待機時間を倍に（指数バックオフ）
  }
  return -1;  // 失敗
}

unsigned long lastTelemetry = 0;

void loop() {
  // Teleplot用データ送信 (50msごとに送信)
  if (millis() - lastTelemetry > 50) {
    lastTelemetry = millis();
    // 割り込み禁止区間を作ってデータをコピー（データ不整合防止）
    uint16_t v0, v1, v2;
    noInterrupts();
    v0 = rawValues[0];
    v1 = rawValues[1];
    v2 = rawValues[2];
    interrupts();

    Serial.print(">A1:"); Serial.println(v0);
    Serial.print(">A2:"); Serial.println(v1);
    Serial.print(">A3:"); Serial.println(v2);
  }

  if (sendFlag) {
    // 通信安定化のためADC割り込みを一時停止
    byte oldADCSRA = ADCSRA;
    ADCSRA &= ~(1 << ADIE);

    sendFlag = false;

    // TXDUコマンド文字列生成
    char outStr[5 + 4 + 1 + 30 * 2 + 2 + 1];
    char *p = outStr;

    *p++ = 'T';
    *p++ = 'X';
    *p++ = 'D';
    *p++ = 'U';
    *p++ = ' ';
    *p++ = '0';
    *p++ = '0';
    *p++ = '0';
    *p++ = '1';
    *p++ = ' ';

    for (uint8_t i = 0; i < bufferIndex; i++) {
      uint8_t val = buffer[i];
      *p++ = "0123456789ABCDEF"[val >> 4];
      *p++ = "0123456789ABCDEF"[val & 0x0F];
    }
    if (bufferIndex == 0) {
      *p++ = '0';
      *p++ = '0';
    }

    *p++ = '\r';
    *p++ = '\n';
    *p = '\0';

    // IM920s送信＋応答確認
    int result = sendWithRetry(outStr);
    if (result >= 0) {
      if (DEBUG) {
        Serial.print("(send success: ");
        Serial.print(result + 1);
        Serial.println("）");
      }
    } else {
      if (DEBUG) Serial.println("send failed (NG or timeout)");
    }


    // デバッグ表示
    if (DEBUG) Serial.println(outStr);

    // バッファクリア
    bufferIndex = 0;

    // ADC割り込み再開
    ADCSRA = oldADCSRA;
  }
}
/*
  PIRsensor_A_verTR.ino
  IM920sを使ったPIRセンサデータ送信機
  VerTR: Teleplot用生データ送信機能追加版
*/

#include <SoftwareSerial.h>  // ソフトウェアシリアル通信用ライブラリ

#define DEBUG true           // デバッグメッセージ表示ON/OFF
#define INITIAL_SETUP true   // 初期設定コマンド実行ON/OFF
#define IM920_NN "0004"      // このデバイスのノード番号
#define IM920_GN "00000A2A"  // 通信グループ番号

// IM920s接続ピン設定
#define IM920_RX 10                         // IM920s受信ピン(Arduinoの10番ピン)
#define IM920_TX 11                         // IM920s送信ピン(Arduinoの11番ピン)
SoftwareSerial im920(IM920_RX, IM920_TX);  // IM920sとの通信用シリアルオブジェクト

// アナログ入力センサ
const uint8_t channels[3] = { A1, A2, A3 };  // PIRセンサ3つのアナログピン
volatile uint8_t currentChannel = 0;         // 現在読み取り中のセンサ番号(0-2 = A1-A3)

// データバッファ（最大32バイト）
#define BUFFER_SIZE 32                 // バッファの最大サイズ
volatile uint8_t buffer[BUFFER_SIZE];  // 送信データを一時保存するバッファ
volatile uint8_t bufferIndex = 0;      // バッファの現在位置

// 前回送信した値を保持
volatile uint8_t lastValue[3] = { 0, 0, 0 };    // 各センサの前回値(8bit圧縮済み)
volatile uint16_t rawValues[3] = { 0, 0, 0 };   // 各センサの生データ(10bit、Teleplot表示用)
const uint8_t threshold = 1;                    // 値の変化検出しきい値

// タイマ割込みで送信フラグ
volatile bool sendFlag = false;  // 送信タイミングフラグ(350msごとにtrueになる)


// IM920sにコマンドを送信して応答を受信する関数
void im920_command(String command) {
  im920.print(command);                  // コマンド文字列を送信
  im920.print("\r\n");                   // 改行コードを送信(コマンド終了)

  while (!im920.available());            // 応答が来るまで待機
  String response = im920.readStringUntil('\n');  // 改行まで読み取り
  response.trim();                       // 前後の空白文字削除
  Serial.println(response);              // デバッグ用に応答を表示
}

void setup() {
  // デバッグ用シリアル
  Serial.begin(9600);     // PC接続用シリアル通信を9600bpsで初期化

  // IM920s初期化
  im920.begin(19200);     // IM920sとの通信を19200bpsで初期化

  // ADC設定
  ADMUX = (1 << REFS0) | (channels[currentChannel] & 0x07);  // 基準電圧AVcc、最初のセンサ選択
  ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADSC) | (1 << ADPS2) | (1 << ADPS1);
  // ADEN:ADC有効化、ADIE:割込み有効化、ADSC:変換開始、ADPS:プリスケーラ64(19.2kサンプル/秒)
  ADCSRB = 0;  // 自動トリガなし(手動変換モード)


  // タイマ設定（Timer1を使って約350msごとに割込み）
  /*
    送信可能サンプル数：331,960サンプル/時間
    1パケットに32サンプル → 10,374パケット/時間
    1時間 = 3600秒 → 3600 ÷ 10,374 ≈ 0.347秒（約347ms）/パケット
  */
  noInterrupts();                       // 全割込み一時停止
  TCCR1A = 0;                           // タイマ1制御レジスタAクリア
  TCCR1B = 0;                           // タイマ1制御レジスタBクリア
  TCNT1 = 0;                            // タイマカウンタ初期化
  OCR1A = 5468;                         // 比較値設定(16MHz/1024で約350ms)
  TCCR1B |= (1 << WGM12);               // CTCモード(カウンタ一致でリセット)
  TCCR1B |= (1 << CS12) | (1 << CS10);  // プリスケーラ1024設定
  TIMSK1 |= (1 << OCIE1A);              // タイマ比較一致割込み許可
  interrupts();                         // 全割込み再開

  delay(100);                         // 安定化待ち
  // 初期設定
  if (INITIAL_SETUP) {                // 初期設定が有効なら
    im920_command("ENWR");            // 設定書き込みモード有効化
    im920_command("STNN " IM920_NN);  // ノード番号設定
    im920_command("STGN " IM920_GN);  // グループ番号設定
  }
  im920_command("RDNN");              // ノード番号読み出し(確認用)
  delay(1000);                        // 初期化完了待ち
}

// ADC割り込み処理(AD変換完了時に自動実行)
ISR(ADC_vect) {
  uint16_t value = ADC;                   // ADC結果レジスタから10bit値を読み取り
  rawValues[currentChannel] = value;      // Teleplot表示用に生データ保存
  // Serial.println(value);
  uint8_t compressed = value >> 2;        // 10bit→8bitに圧縮(上位8bitを使用)

  // 変化判定
  if (abs(compressed - lastValue[currentChannel]) >= threshold) {  // しきい値以上の変化があれば

    // 変化があったら、lastValue[]の3センサ分をbufferに格納
    for (uint8_t k = 0; k < 3; k++) {      // 全センサのデータを
      if (bufferIndex < 30) {              // バッファに空きがあれば
        buffer[bufferIndex++] = lastValue[k];  // 格納してインデックスを進める
      }
    }

    // バッファ満杯なら即送信
    if (bufferIndex >= 30) {               // バッファが10サンプル分(30バイト)溜まったら
      sendFlag = true;                     // 送信フラグを立てる
    }
  }
  lastValue[currentChannel] = compressed;  // 今回値を保存(次回比較用)

  // 次センサへ
  currentChannel++;                      // センサ番号を次へ
  if (currentChannel >= 3) {             // 3センサ読み終わったら
    currentChannel = 0;                  // 最初に戻る
    String s0 = (String)lastValue[0];    // デバッグ用文字列変換
    String s1 = (String)lastValue[1];
    String s2 = (String)lastValue[2];
    // Serial.println("0,255,"+s0+","+ s1+ ","+ s2);  // (コメントアウト)
  }
  ADMUX = (ADMUX & 0xF0) | (channels[currentChannel] & 0x07);  // ADCマルチプレクサを次センサに切替

  // 次の変換開始
  ADCSRA |= (1 << ADSC);                 // 次のAD変換をトリガ
}

// タイマ1比較一致割り込み処理(約350msごとに自動実行)
ISR(TIMER1_COMPA_vect) {
  sendFlag = true;  // 送信フラグを立てる(定期送信用)
}


// リトライ機能付き送信関数
int sendWithRetry(const char *data, uint8_t retries = 3) {
  unsigned long baseWait = 50;            // 初回待機時間(ms)

  for (uint8_t attempt = 0; attempt < retries; attempt++) {  // 最大3回まで再試行
    im920.print(data);                    // データ送信
    if (DEBUG) {
      Serial.print("send attempt: ");     // 試行回数表示
      Serial.println(attempt + 1);
    }

    unsigned long start = millis();       // 応答待ち開始時刻
    while (millis() - start < baseWait) { // タイムアウトまで待機
      if (im920.available()) {            // 応答が来たら
        String response = im920.readStringUntil('\n');  // 改行まで読み取り
        response.trim();                  // 前後の空白削除
        if (DEBUG) {
          Serial.print("response: ");     // 応答内容表示
          Serial.println(response);
        }
        if (response.startsWith("OK")) return attempt;  // 成功→試行回数を返す
        if (response.startsWith("NG")) break;           // NG→次の試行へ
      }
    }
    baseWait *= 2;  // 次回は待機時間を2倍に(指数バックオフ)
  }
  return -1;  // 全試行失敗
}

unsigned long lastTelemetry = 0;  // Teleplot送信タイミング記録用

void loop() {
  // Teleplot用データ送信 (50msごとに送信)
  if (millis() - lastTelemetry > 50) {   // 前回から50ms経過したら
    lastTelemetry = millis();            // 送信時刻を記録
    // 割り込み禁止区間を作ってデータをコピー（データ不整合防止）
    uint16_t v0, v1, v2;                 // ローカル変数にコピー
    noInterrupts();                      // 割込み停止(データ読み取り中の書き換え防止)
    v0 = rawValues[0];                   // センサ0コピー
    v1 = rawValues[1];                   // センサ1コピー
    v2 = rawValues[2];                   // センサ2コピー
    interrupts();                        // 割込み再開

    Serial.print(">A1:"); Serial.println(v0);  // Teleplot形式でA1出力
    Serial.print(">A2:"); Serial.println(v1);  // Teleplot形式でA2出力
    Serial.print(">A3:"); Serial.println(v2);  // Teleplot形式でA3出力
  }

  if (sendFlag) {                        // 送信フラグが立っていたら
    // 通信安定化のためADC割り込みを一時停止
    byte oldADCSRA = ADCSRA;             // 現在のADC設定を保存
    ADCSRA &= ~(1 << ADIE);              // ADC割込みを無効化(通信中のノイズ防止)

    sendFlag = false;                    // フラグをクリア

    // TXDUコマンド文字列生成
    char outStr[5 + 4 + 1 + 30 * 2 + 2 + 1];  // コマンド用文字列バッファ
    char *p = outStr;                    // 書き込みポインタ

    *p++ = 'T';                          // "TXDU"コマンド開始
    *p++ = 'X';
    *p++ = 'D';
    *p++ = 'U';
    *p++ = ' ';                          // スペース
    *p++ = '0';                          // 送信先ノード番号"0001"
    *p++ = '0';
    *p++ = '0';
    *p++ = '1';
    *p++ = ' ';                          // スペース

    for (uint8_t i = 0; i < bufferIndex; i++) {  // バッファ内の全データを
      uint8_t val = buffer[i];           // 1バイト取り出し
      *p++ = "0123456789ABCDEF"[val >> 4];  // 上位4bitを16進数文字に変換
      *p++ = "0123456789ABCDEF"[val & 0x0F];  // 下位4bitを16進数文字に変換
    }
    if (bufferIndex == 0) {              // バッファが空なら
      *p++ = '0';                        // ダミーデータ"00"を追加
      *p++ = '0';
    }

    *p++ = '\r';                         // 改行コード追加
    *p++ = '\n';
    *p = '\0';                           // 文字列終端

    // IM920s送信＋応答確認
    int result = sendWithRetry(outStr);  // リトライ付きで送信実行
    if (result >= 0) {                   // 送信成功したら
      if (DEBUG) {
        Serial.print("(send success: ");  // 成功メッセージ表示
        Serial.print(result + 1);        // 試行回数表示
        Serial.print("）\n");
      }
    } else {                             // 送信失敗したら
      if (DEBUG) Serial.println("send failed (NG or timeout)");  // 失敗メッセージ
    }


    // デバッグ表示
    if (DEBUG) Serial.println(outStr);   // 送信したコマンド文字列を表示

    // バッファクリア
    bufferIndex = 0;                     // バッファインデックスをリセット

    // ADC割り込み再開
    ADCSRA = oldADCSRA;                  // ADC設定を元に戻す(割込み再開)
  }
}
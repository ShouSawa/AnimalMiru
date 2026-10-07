/*
  PIRsensor_B.ino
  IM920sを使ったPIRセンサデータ送信機
  VerTR: Teleplot用生データ送信機能追加版
*/

#include <SoftwareSerial.h>  // ソフトウェアシリアル通信用ライブラリ

#define DEBUG true           // デバッグメッセージ表示ON/OFF
#define INITIAL_SETUP true   // 初期設定コマンド実行ON/OFF
#define IM920_NN "0003"      // このデバイスのノード番号
#define IM920_GN "00000A3B"  // 通信グループ番号

// IM920s接続ピン設定
#define IM920_RX 10                         // IM920s受信ピン(Arduinoの10番ピン)
#define IM920_TX 11                         // IM920s送信ピン(Arduinoの11番ピン)
SoftwareSerial im920(IM920_RX, IM920_TX);  // IM920sとの通信用シリアルオブジェクト

// アナログ入力センサ（A1〜A3端子 = ADCチャネル1〜3。A0端子は基板上でセンサにつながっていない）
#define CHANNEL_COUNT 3
#define FIRST_CHANNEL 1  // 最初に読むADCチャネル(A1端子)
volatile uint8_t convCount = 0;  // 1回の記録中のAD変換回数(1チャネルにつき2回変換する)

// 送信データバッファ（35msごとに3チャネルを記録 × 10回 = 30バイトで1パケット）
#define PACKET_BYTES 30
volatile uint8_t samples[2][PACKET_BYTES];  // 記録用と送信用を交互に使う2面バッファ
volatile uint8_t writeBuf = 0;              // 記録中のバッファ番号
volatile uint8_t sampleIndex = 0;           // 記録中のバッファの書き込み位置
volatile int8_t readyBuf = -1;              // 送信待ちのバッファ番号(-1 = なし)
volatile uint16_t rawValues[CHANNEL_COUNT] = { 0, 0, 0 };  // 各センサの生データ(10bit、Teleplot表示用)


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

  delay(1000);                         // 安定化待ち
  // 初期設定
  if (INITIAL_SETUP) {                // 初期設定が有効なら
    im920_command("ENWR");            // 設定書き込みモード有効化
    im920_command("STNN " IM920_NN);  // ノード番号設定
    im920_command("STGN " IM920_GN);  // グループ番号設定
  }
  im920_command("RDNN");              // ノード番号読み出し(確認用)
  delay(1000);                        // 初期化完了待ち

  // ADC設定（変換開始はTimer1割込みで行う）
  ADMUX = (1 << REFS0) | FIRST_CHANNEL;  // 基準電圧AVcc、ADCチャネル1(A1端子)を選択
  ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0);
  // ADEN:ADC有効化、ADIE:割込み有効化、ADPS:プリスケーラ128(1回の変換 約104us)
  ADCSRB = 0;  // 自動トリガなし(手動変換モード)

  // タイマ設定（Timer1を使って35msごとに割込み → 10回記録で350ms/パケット）
  /*
    送信可能サンプル数：331,960サンプル/時間
    1パケットに32サンプル → 10,374パケット/時間
    1時間 = 3600秒 → 3600 ÷ 10,374 ≈ 0.347秒（約347ms）/パケット
  */
  noInterrupts();                       // 全割込み一時停止
  TCCR1A = 0;                           // タイマ1制御レジスタAクリア
  TCCR1B = 0;                           // タイマ1制御レジスタBクリア
  TCNT1 = 0;                            // タイマカウンタ初期化
  OCR1A = 2187;                         // 比較値設定(16MHz/256で(2187+1)×16us ≈ 35ms)
  TCCR1B |= (1 << WGM12);               // CTCモード(カウンタ一致でリセット)
  TCCR1B |= (1 << CS12);                // プリスケーラ256設定
  TIMSK1 |= (1 << OCIE1A);              // タイマ比較一致割込み許可
  interrupts();                         // 全割込み再開
}

// ADC割り込み処理(AD変換完了時に自動実行)
ISR(ADC_vect) {
  uint16_t value = ADC;              // ADC結果レジスタから10bit値を読み取り

  // チャネル切替直後の1回目は前チャネルの電荷が残っているため捨て、2回目の値を記録する
  if (convCount & 1) {
    rawValues[convCount >> 1] = value;              // Teleplot表示用に生データ保存(convCount>>1 = チャネル番号)
    samples[writeBuf][sampleIndex++] = value >> 2;  // 10bit→8bitに圧縮して記録
  }

  convCount++;
  if (convCount < CHANNEL_COUNT * 2) {
    ADMUX = (ADMUX & 0xF0) | (FIRST_CHANNEL + (convCount >> 1));  // 次に変換するチャネルを選択
    ADCSRA |= (1 << ADSC);                      // 次のAD変換をトリガ
    return;
  }

  // 3チャネル分記録したらA1端子に戻し、次のタイマ割込みを待つ
  convCount = 0;
  ADMUX = (ADMUX & 0xF0) | FIRST_CHANNEL;
  if (sampleIndex >= PACKET_BYTES) {  // 10回分たまったら送信待ちにして、もう一方のバッファへ切替
    readyBuf = writeBuf;
    writeBuf ^= 1;
    sampleIndex = 0;
  }
}

// タイマ1比較一致割り込み処理(35msごとに自動実行)
ISR(TIMER1_COMPA_vect) {
  ADCSRA |= (1 << ADSC);  // A1端子からAD変換を開始(残りのチャネルはADC割込みで順に変換)
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

  if (readyBuf >= 0) {                   // 送信待ちのバッファがあれば
    // 割り込み禁止区間で送信データをコピー（記録側の書き換えと競合しないように）
    uint8_t packet[PACKET_BYTES];
    noInterrupts();
    for (uint8_t i = 0; i < PACKET_BYTES; i++) packet[i] = samples[readyBuf][i];
    readyBuf = -1;
    interrupts();

    // TXDUコマンド文字列生成
    char outStr[5 + 4 + 1 + PACKET_BYTES * 2 + 2 + 1];  // コマンド用文字列バッファ
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

    for (uint8_t i = 0; i < PACKET_BYTES; i++) {  // バッファ内の全データを
      uint8_t val = packet[i];           // 1バイト取り出し
      *p++ = "0123456789ABCDEF"[val >> 4];  // 上位4bitを16進数文字に変換
      *p++ = "0123456789ABCDEF"[val & 0x0F];  // 下位4bitを16進数文字に変換
    }

    *p++ = '\r';                         // 改行コード追加
    *p++ = '\n';
    *p = '\0';                           // 文字列終端

    // IM920s送信＋応答確認（送信中も割込みで次の10回分の記録は続く）
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
  }
}

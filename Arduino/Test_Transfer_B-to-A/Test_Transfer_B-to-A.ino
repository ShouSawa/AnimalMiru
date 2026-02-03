/*
  Test_Transfer_B-to-A.ino
  IM920sを使って，BeagleBoneからArduinoへデータ転送するテストプログラム
*/

#include <SoftwareSerial.h>

#define DEBUG true           // デバッグメッセージ表示ON/OFF
#define INITIAL_SETUP true   // 初期設定コマンド実行ON/OFF
#define IM920_NN "0004"      // ノード番号
#define IM920_GN "00000A2A"  // グループ番号

// IM920s接続ピン設定
#define IM920_RX 10
#define IM920_TX 11
SoftwareSerial im920(IM920_RX, IM920_TX);

// データバッファ
#define BUFFER_SIZE 32
uint8_t buffer[BUFFER_SIZE];
uint8_t bufferIndex = 0;

void im920_command(String command) {
  im920.print(command);
  im920.print("\r\n");

  while (!im920.available()); // 応答待ち
  String response = im920.readStringUntil('\n');
  response.trim();
  Serial.println(response);
}

void setup() {
  // デバッグ用シリアル
  Serial.begin(9600);

  // IM920s初期化
  im920.begin(19200);

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

// リトライ機能付き送信関数
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

void loop() {
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
}

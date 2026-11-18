# アニマルミル 経路推定 実装設計書

| 項目 | 内容 |
|---|---|
| 対象リポジトリ | `ShouSawa/AnimalMiru`（`backend/` = Go，`frontend/` = React + Vite） |
| 基準コミット | `14e7a09`「テンプレートをDBに保存」 |
| 作成日 | 2026年11月18日 |
| 元資料 | 研究日記PDF「アニマルミル 経路推定アルゴリズム」（最終更新 2026年11月18日 13:23）と，その後の設計相談の内容 |
| 読み手 | リポジトリにアクセスできるコーディング用AI（この文書だけで実装できることを目標にしている） |

---

## 0. この文書の使い方（AIへの指示）

1. 第2章（確定事項）と第11章（ファイル構成）を最初に読むこと．実装は第14章の順番で進めること．
2. **1ファイルはできるだけ短く**する（目安: 本体は60行以内，どうしても超える場合も100行以内）．1ファイル1責務．理由は，作者が後から読んで修正しやすくするためである．
3. 既存コードの書き方に合わせること: コメントは日本語，パッケージ名は小文字，エラーは `log.Printf` で記録（既存の `handler`，`repository` と同じ作法）．
4. 第13章の**正解値（ゴールデンテスト）**を，Goのテストとして必ず実装し，全部通してから次へ進むこと．
5. 次のことは**実装しない**（スコープ外）: 動物の種類の推定（機械学習），WCL（重み付き重心法）や他手法との比較，パラメータ変更後の再計算機能，正解データによる評価，BeagleBone・Arduino側の変更，将来性の節・参考文献の節の内容．
6. 文書中の「**要確認**」は，作者が未確定の項目である．第15章の既定値で実装し，コード中に `// 要確認:` コメントを残すこと．勝手に別の値へ変えないこと．
7. この文書の日本語は，句読点を「，」と「．」で統一している．READMEやコメントを書き足すときも同じにすること．

---

## 1. 目的とスコープ

### 1.1 研究の目的

農業従事者の金銭的・時間的負担を軽減し，低コストかつ省力的な獣害対策を支援する．赤外線焦電センサ（PIR）だけを用いて，**カメラなしで動物の行動経路を推定**する．本設計書はその**経路推定アルゴリズムをサーバー（Go）に組み込む**ための設計である．

### 1.2 今回作るもの

| 項目 | 内容 |
|---|---|
| 推定対象 | 圃場内を動く**1個体**の位置（種類は推定しない） |
| 手法 | 格子ベイズフィルタ（ヒストグラムフィルタ）．30 m四方を0.5 mのセル60×60個に分け，各セルの存在確率を毎秒更新する |
| 実行場所 | さくらのサーバー上のGoバックエンド（常時，毎秒） |
| 入力 | DBの `sensor_reading`（12センサの生波形） |
| 出力 | DBの `estimation_result`（1秒窓＝1行，反応のあった秒だけ保存） |
| 表示 | フロントの経路表示モードの地図に，存在確率を赤の濃淡で重ねる |

### 1.3 スケジュール上の位置づけ

実験は2026年11月中，卒論は12月中，IIAE論文誌への投稿も12月中に進める．卒論では「行動経路の推定」までを実装範囲とし，「動物の種類の推定」はfuture workである．したがって，**まず動く実装を早く作ること**を優先する．

---

## 2. 確定事項（これまでの議論の要約）

「どこで決めたか」を残すため，決定ごとに理由を付けている．

| # | 決定 | 理由・補足 |
|---|---|---|
| D1 | 手法は**格子ベイズフィルタ**．推定対象は1匹 | 複数個体は扱わない．状態は「動物がセルiにいる確率」 |
| D2 | 格子は60×60，0.5 m，±15 m．セル中心 x = −15+(ix+0.5)·0.5，y 同様．添字 i = iy·60+ix | ixは西→東，iyは南→北．原点側のセル中心は(−14.75，−14.75) |
| D3 | センサは4ノード×3個＝12個．配置・向きは固定 | `estimator_node` のようなテーブルは作らない．ノードを除く運用もしない |
| D4 | 視野は半角72°（144°），距離10 m（データシートD205B） | `fov_half_deg`，`range_m` として config に持つが，実質固定 |
| D5 | 特徴量 S_k = 1秒窓での（最大値−最小値）．生の8bit値（0〜255）で計算 | V = v/255×5．0.7 Vは S≈35.7 |
| D6 | 反応の強さ s_k = clip((S_k − n_k)/(u_k − n_k)，0，1） | n_k，u_k はセンサごとに作者が手で設定（`estimator_sensor`） |
| D7 | 予測はガウス畳み込み（σ=2 m，範囲1〜3 m）．更新は積形式の尤度（σ_s=0.3，ε=0.1，β=0.7，d0=8 m） | β<1 は独立性の近似を弱めるための経験的な調整 |
| D8 | 欠測センサは尤度の積から**除く**（「反応なし」とは扱わない） | データが無いことは情報が無いこと |
| D9 | 出力は est（最大点），mean（事後平均），p_max，radius90，entropy | 定義は第6.4節 |
| D10 | 処理は毎秒．窓は1秒．`delay_sec` 秒待ってから計算する（既定3.0） | データが集まる前に計算しないため |
| D11 | 前の確率はメモリに持つ．再起動後は一様から始める | DBから復元しない |
| D12 | データの無い秒は**予測のみ**（保存しない）．反応なし（active=false）がquiet_reset_sec（30）秒続いたら一様に戻す | |
| D13 | **保存するのは active=true の秒だけ**．1行 = 1秒窓．主キー（config_id，ts） | 計算済みの秒は再計算しない．遅れて届いたデータは無視 |
| D14 | 存在確率の地図は `map_z`（uint8に量子化＋zlib）に保存．同じテーブルの列 | 約2.3 KB/行．並びは行優先 i=iy·nx+ix |
| D15 | 設定は `estimator_config` と `estimator_sensor`．**作った行は書き換えず**，変えるときは `clone_estimator_config()` で新しい行を作る | トリガで強制する（付録A） |
| D16 | 使う設定は環境変数 `ESTIMATOR_CONFIG_ID` で指定 | |
| D17 | **時刻のずれは読み出し側で補正する**．補正量 δ_fix は**Goの定数**（DBの列ではない） | 補正は共通関数1つにまとめ，グラフ（GetSeries）と推定の両方が同じ関数を使う．地図の時刻と推定の時刻が一致すれば十分 |
| D18 | `delay_sec`=3.0．BeagleBoneの設定は**変えない**．サーバー側とフロント側で合わせる | 第10章 |
| D19 | `active_thresh_v`=0.7（当面）．後から調整する | 静かな時のデータで再確認する |
| D20 | 同じノード・同じセンサで，10値が同一のものが近い時刻にあれば，あとのものを捨てる | Arduinoの再送などによる重複への対処．推定側のみで適用（グラフは生のまま） |
| D21 | 地図の窓は `node_timestamp` 基準 | |
| D22 | ノード配置（位置・向き）の出所はフロントの `Home.jsx` の `nodes`．バックエンドにも同じ値を定数で持つ（共有の仕組みは作らない） | |
| D23 | APIは，Goが `map_z` を展開してJSONで返す．フロントは不透明度 = q/255 で塗る | |
| D24 | 「1秒以内に計算失敗」のログを，1回の処理が1秒を超えたときに出す | |

---

## 3. システムの前提

### 3.1 ハードウェアとデータの流れ

```
PIR(D205B)×3 → Arduino(35 msごとにA1,A2,A3を順に読む．10回=350 msで1パケット30バイト)
   → IM920s(無線) → BeagleBone(GW01．受信時刻を付け，5件か2秒ごとにまとめて送信)
   → [LTE] → さくらサーバー Go (TCP 9000) → PostgreSQL(animalmiru) → HTTP/WebSocket → React
```

| 項目 | 内容 |
|---|---|
| ADC | 10bit値を `>>2` で8bit（0〜255）に圧縮．V = v/255×5 |
| 1パケット | 1ノードの3センサ×10回．DBでは**1センサ=1行**，`value_dec` に「72,71,73,…」（10値，35 ms間隔） |
| 重複キー | 同じ（node_id，node_timestamp，sensor_id）が重なると値が連結される（10の倍数の長さ）．まれ |
| 再送 | Arduinoは送信失敗時に最大3回再送（待ち 50/100/200 ms） |

### 3.2 既存DB（変更しない）

| テーブル | 主な列 |
|---|---|
| `sensor_reading` | node_id varchar(64)，node_timestamp timestamptz，sensor_id varchar(4)（A1/A2/A3），value_hex text，value_dec text．主キー（node_id，node_timestamp，sensor_id） |
| `node_data` | node_id，node_timestamp |
| `gateway_data` | gw_timestamp，node_id，node_timestamp，rssi_hex |
| `data_template` | 画面の設定テンプレート |

`UML/ER_diagram.md` は古い（`round_index` 付きのsensor_readingになっている）ので，**実際のDB構造と新しい3テーブルに合わせて直すこと**．

### 3.3 既存コードの構成（このまま使う）

```
backend/ cmd/main.go  db/db.go  handler/{ingest,query,template}.go
         repository/{sensor,template}.go  tcp/tcp_server.go  websocket/{client,hub,server}.go
frontend/src/ pages/{Home,DB}.jsx  components/{SensorChart,MapGrid,SensorRanges,SettingsPanel,...}.jsx
```

- DB接続は `db.DB`（`*sqlx.DB`，パッケージ変数）．リポジトリ関数はパッケージ関数で，`db.DB` を直接使う．
- WebSocketは `hub.Broadcast(v any)` でJSONを全接続に配信する．フロントは `/ws/realtime` に接続する（Nginx経由）．
- モジュール名: `github.com/ShouSawa/AnimalMiru/backend`．

---

## 4. 座標系とセンサ配置

座標は圃場中心が原点，単位m，**東が+x，北が+y**（地図の上が+y）．角度は東を0°とした反時計回り．

| ノード | 位置（x，y）[m] | A1の向き | A2の向き | A3の向き |
|---|---|---|---|---|
| 0002 | (+5，+5) | 225° | 345° | 105° |
| 0003 | (+5，−5) | 135° | 255° | 15° |
| 0004 | (−5，−5) | 45° | 165° | 285° |
| 0005 | (−5，+5) | 315° | 75° | 195° |

A1は中心（0，0）を向き，A2 = A1+120°，A3 = A1+240°．`Home.jsx` の `nodes[].charts[].angle` と一致している．

**センサ番号 k（1〜12）**: 0002-A1=1，A2=2，A3=3，0003-A1=4，…，0005-A3=12（`s_01`〜`s_12` と同じ順）．
**node_maskのビット**: 1=0002，2=0003，4=0004，8=0005．

### 4.1 期待反応 e_k(i)（センサkから見たセルiの反応の大きさ）

セルiの中心をc_i，センサkの位置をp_k，向きをθ_k，その間の距離をd_{k,i}，c_iの方向とθ_kの角度差（−180°〜180°に折り返す）をΔ_{k,i}とする．

$$
\mathrm{inside}_k(i)=\begin{cases}1 & |\Delta_{k,i}|\le 72^\circ \ \text{かつ}\ d_{k,i}\le 10\,\mathrm{m}\\ 0 & \text{それ以外}\end{cases}
\qquad
e_k(i)=\mathrm{inside}_k(i)\cdot \exp\!\left(-\left(\frac{d_{k,i}}{d_0}\right)^2\right)
$$

$d_0=8\,\mathrm{m}$（config の `d0_m`）．e_k は起動時に12×3600の表として1回だけ計算する．

---

## 5. 時刻の扱い（重要）

### 5.1 現状の `node_timestamp` の意味

`handler/ingest.go` が次のように作る．

```go
nodeTimestamp = receivedAt.Add(-time.Duration((req.Timestamp - entry.Timestamp) * float64(time.Second)))
```

- `receivedAt`（R）= サーバーがバッチを受け取った時刻（`gw_timestamp`．同じバッチで共通）．
- `req.Timestamp`（B）= BeagleBoneがバッチを送信した時刻，`entry.Timestamp`（e）= BeagleBoneがそのパケットを読んだ時刻．
- よって node_timestamp = R −（B−e）．BeagleBone時計の絶対ずれはB−eで打ち消される．**意味は「パケットを読み終えた真の時刻 + LTE片道遅延」**．

### 5.2 サンプルへの時刻の割り当て（現状の誤りと補正）

1行（n値）の最後の値は，パケットを読む直前に測られたものなので，**最後の値の時刻 ≈ node_timestamp − δ_fix**．現状の `GetSeries` は `node_timestamp + i×35ms`（i=0..）と割り当てており，**最大で約0.31 s + δ_fix だけ遅れて見える**．これを次式に改める．

$$
t_j=\text{node\_timestamp}-(n-1-j)\times 35\,\mathrm{ms}-\delta_{fix},\qquad j=0,1,\dots,n-1
$$

（j=0が最も古い値．n = その行の値の個数．）

- **δ_fix はGoの定数**（`samples.DeltaFix`）．初期値は 0（**要確認**: 本当の値は未測定．Arduino→IM920s→BeagleBoneの遅れ（≥ 約0.09 s）と，LTE片道遅延の和．後で，センサ全部に同時に刺激を与える実験などで測って決める）．
- **グラフと推定は必ず同じ関数を使う**．これで，値を変えてもグラフと地図の時刻は常に一致する．
- 補正はDBには書き込まない（`sensor_reading` の値はそのまま）．DB画面・CSV出力は `node_timestamp` をそのまま使い，補正しない．

### 5.3 DBの検索範囲

窓 [T，T+W)（Wは窓の秒数）の値を集めるには，補正後の時刻が窓に入る行を取ればよい．1行は最大 (10−1)×35 ms = 315 ms さかのぼるので，次の範囲で検索し，その後Goで1サンプルずつ時刻を求めて [T，T+W) に絞る．

$$
\text{node\_timestamp}\in\left[\,T+\delta_{fix},\ T+W+\delta_{fix}+0.315\ \mathrm{s}\right)
$$

この範囲を返す関数 `samples.QueryRange(from, to)` を作り，`GetSeries` と推定の両方で使う．

### 5.4 WebSocketで配信するデータ（リアルタイムのグラフ）

`handler/ingest.go` で，配信する各エントリに**先頭サンプルの補正後時刻 `t0`（UNIX秒，小数）を追加**する（`entry.Timestamp` は node_timestamp のまま残す．DB画面が使っているため）．フロントは `t0 + i×0.035` で点を置く．これにより δ_fix はGoにしか存在しない．

---

## 6. アルゴリズム

### 6.1 特徴量（1秒窓ごと）

センサkについて，窓 [T，T+W) に入ったサンプル（重複除去後）から:

- サンプル数 c_k < `min_samples`（5）→ **欠測**（K_t から除く）．
- S_k = max − min（生の8bit値）．
- 電圧換算 S_k^V = S_k/255×5．
- s_k = clip( (S_k − n_k)/(u_k − n_k) , 0 , 1 )．
- **active** = いずれかの（欠測でない）センサで S_k^V ≥ `active_thresh_v`（0.7）．
- active_sum = Σ s_k（使ったセンサの合計）．n_sensors = 使ったセンサ数．
- node_mask = 窓内に1サンプルでも届いたノードのビット和（min_samples未満でも届いていれば含める）．

### 6.2 フィルタ

信念 bel_t(i)（Σ bel = 1）を毎秒更新する．初期値は一様 1/3600．

**予測（動きのぼかし）**— 動物は1秒で最大数m動くので，確率をガウスでぼかす．

$$
\overline{bel}_t(i)=\sum_j T(i\mid j)\,bel_{t-1}(j)=(G_\sigma * bel_{t-1})(i),\qquad \sigma=\text{sigma\_move\_m}=2\,\mathrm{m}
$$

実装規則:
- カーネルは1次元，標準偏差 σ/h = 4セル，半径 R = ceil(3σ/h) = 12セル（長さ25），**合計1に正規化**．
- 2次元は「行方向 → 列方向」の**分離畳み込み**．
- **境界は反射**（セル−1はセル0，セル−2はセル1に折り返す＝端のセルを繰り返す）．これにより質量が保存され，一様な確率は一様のままになる（検証済み）．`reflect(j,n)`: j<0 なら −1−j，j≥n なら 2n−1−j．

**更新（観測の反映）**— K_t = データのあったセンサの集合．

$$
bel_t(i)=\eta\;\overline{bel}_t(i)\prod_{k\in K_t}\Big[(1-\varepsilon)\exp\!\Big(-\frac{(s_k-e_k(i))^2}{2\sigma_s^2}\Big)+\varepsilon\Big]^{\beta}
$$

$\sigma_s=0.3,\ \varepsilon=0.1,\ \beta=0.7$．ηは正規化定数（全セルの合計が1になるように割る）．各因子は $[\varepsilon^\beta,1]$ に入るのでアンダーフローはしない．合計が0または非有限になったら更新を捨てて予測後の値を使い，ログに出す．

**仮定（論文・卒論に書く内容）**: 動きはマルコフ性（A），観測は現在位置だけで決まる（B），センサは位置を与えれば条件付き独立（C）．Cは実際には成り立たないので，影響を弱める β<1 を入れる（経験的調整）．

### 6.3 1秒の処理順序

```
1. quiet >= quiet_reset_sec なら bel = 一様，quiet = 0
2. bel = Predict(bel)                       （毎秒必ず実行）
3. K_t が空（使えるセンサなし）なら 保存せず，quiet++ ，終了
4. bel = Update(bel, K_t)
5. active なら quiet = 0 ，保存対象．そうでなければ quiet++
```

ステップ3の「データの無い秒」も無反応として quiet に数える（active=false が続いた秒数）．

### 6.4 出力指標の定義

bel は float64 のまま計算し，uint8 への量子化の**前**に求める．

| 量 | 定義 | 備考 |
|---|---|---|
| est（採用位置） | 確率が最大のセルの中心．最大が複数あれば（`bel ≥ max·(1−1e-9)` のセル全部）x，yそれぞれの平均 | 保存列 est_x，est_y |
| mean（事後平均） | $\hat x=\sum_i bel(i)X_i,\ \hat y=\sum_i bel(i)Y_i$ | est は0.5 m刻みで跳ぶので滑らかな比較用 |
| p_max | $100\cdot\max_i bel(i)$ [%] | |
| radius90 | est を中心に，セルを距離の近い順に並べて累積確率が初めて0.9に達する半径．隣り合う距離の間で**線形補間**．下限 0.25 m | 「この位置を報告したとき90%の確率で真の位置が半径r以内」 |
| entropy | $H=-\sum_i bel(i)\log_2 bel(i)$ [bit]（$0\log0=0$）．0〜log₂3600≈11.814 | 一様で最大 |

radius90 の補間: 距離で昇順（同距離は安定ソート）に並べ，累積確率 C_m が最初に 0.9 以上になる m を取り，

$$
r=d_{m-1}+(d_m-d_{m-1})\frac{0.9-C_{m-1}}{C_m-C_{m-1}}\quad(C_0=0,\ d_0=0\ \text{とみなす．}\ m=1\ \text{のときは}\ r=d_1)
$$

最後に r = max(r，0.25)．

派生量（保存しないが説明に使える）: 有効セル数 N_eff = 2^H，有効半径 r_eff = h√(N_eff/π)．較正（較正＝出力の信頼度が正しいかの確認）の指標として，「真の位置が r90 の中に入る割合が約90%か」を後の評価で使う予定（今回は実装しない）．

### 6.5 保存列の作り方

| 列 | 値 |
|---|---|
| s_01〜s_12 | round(100·s_k)．欠測は NULL |
| active_sum | Σ s_k（丸めない） |
| n_sensors | 使ったセンサ数（0〜12） |
| update_type | 1（保存される行は必ず観測で更新している．0は予約） |
| computed_at | 計算を終えた時刻（`time.Now()`） |
| event_id | 第7.4節 |
| map_z | 第8.3節 |

---

## 7. 毎秒の処理（バックエンドの常駐処理）

### 7.1 対象の秒

時刻 W（整数秒）の処理が対象にする窓の開始 T は

$$
T=\lfloor W-\text{window\_sec}-\text{delay\_sec}\rfloor\ \text{（整数秒に切り下げ）}
$$

`delay_sec`=3.0，`window_sec`=1 なら，**10:57:21 には 10:57:17 から始まる1秒（10:57:17〜18）を計算する**．

> 注意（PDFとの食い違い）: PDFの設計思想の節には「2秒前の1秒間，例: 10:57:21 に 10:57:19 を計算」とあるが，これは `delay_sec`=1.0 の場合の文章である．**`delay_sec`=3.0 の設計が正**であり，PDFの文章は直すこと（**要確認**: 作者へ）．

### 7.2 ループ

- 毎秒の切り替わり直後に起動（ティッカーを整数秒に合わせる）．`lastT` を持つ．
- 起動直後: 最初のTは現在時刻から求める．**過去には遡らない**（一様から開始）．
- 取りこぼし（前回から2秒以上進んだ）: 欠けたTを順番に処理する．ただし10秒を超える遅れは，最新のTへ飛び，信念を一様に戻す（ログ）．
- 1つのTの処理が1秒を超えたら `log.Printf("1秒以内に計算失敗: T=%s 処理時間=%s")`．
- すでに結果がある（主キー衝突）場合は `ON CONFLICT DO NOTHING`．**既に計算済みの秒は再計算しない．遅れて届いたデータは無視する**．
- `ESTIMATOR_CONFIG_ID` が未設定なら推定を起動せず，ログに出して他の機能（受信・配信・API）は通常どおり動かす．設定が見つからない・格子が60×60×0.5 m×−15 m以外・`map_encoding`≠1 のときは起動を中止（ログ）する．

### 7.3 1つのTの処理手順

```
rows  = GetRows(QueryRange(T, T+W))            // repository
rows  = DropDuplicates(rows)                   // samples
samps = Collect(rows, T, T+W)                  // samples: 補正後の時刻で窓に入るものだけ
stats = ToStats(samps)                         // runner: センサ番号1..12ごとの (Count, Min, Max)
feat  = Features(stats, cal, params)           // estimator
bel   = filter.Step(feat)                      // estimator: 第6.3節
if saved対象: row = BuildRow(...) ; SaveResult(row) ; Broadcast(frame)
```

重複除去（D20）: （ノード，センサ）ごとに，直前に残した行と**値が10個すべて同じ**で，`node_timestamp` の差が `samples.DuplicateGap`（0.30 s，**要確認**）未満なら，後の行を捨てる．

### 7.4 event_id

連続する反応の秒を1回の通過としてまとめる番号．

- メモリに `eventID` と `lastActiveT` を持つ．起動時に `SELECT COALESCE(MAX(event_id),0) FROM estimation_result WHERE config_id=$1` で初期化する．
- active=true の秒で，`lastActiveT` から `EventGapSec`（3秒，**要確認**，Go定数）を超えて空いていたら，`eventID++`．その秒の event_id = eventID．

### 7.5 配信

`SaveResult` が成功したら，`hub.Broadcast(map[string]any{"estimation": frame})` を呼ぶ．既存の `sensor_data` メッセージとはキーで区別する（既存のフロントは `sensor_data ?? []` と読むので影響しない）．

---

## 8. DB

3テーブルを新設する．**SQLの本体は付録A**（検証済み: PostgreSQL 16で3本とも実行して確認）．実行ファイルは `backend/sql/` に置く．属性の意味は次の表のとおり．

### 8.1 属性表

**estimator_config**（1行=1つの計算条件．作った行は書き換えない）

| 列 | 型 | 既定値 | 意味 |
|---|---|---|---|
| config_id | integer IDENTITY PK | | 設定の番号 |
| name | text NOT NULL UNIQUE | | 人が見分ける名前 |
| created_at | timestamptz | now() | 作成日時 |
| code_version | text NULL | | gitのコミットID |
| note | text NULL | | 変更理由 |
| grid_nx / grid_ny | smallint | 60 / 60 | 格子のセル数 |
| cell_size_m | real | 0.5 | 1セルの一辺 |
| grid_x_min_m / grid_y_min_m | real | −15.0 / −15.0 | 格子の西端・南端 |
| map_encoding | smallint | 1 | map_zの形式（1=uint8+zlib，2=uint16+zlib．**実装は1のみ**） |
| window_sec | smallint | 1 | 窓の長さ |
| delay_sec | real | 3.0 | データが届くのを待つ秒数 |
| min_samples | smallint | 5 | 窓に必要な最小サンプル数 |
| active_thresh_v | real | 0.7 | 反応ありの判定電圧 [V] |
| fov_half_deg | real | 72 | 視野の半角 |
| range_m | real | 10 | 検知距離 |
| d0_m | real | 8 | 距離で弱まる目安 |
| sigma_obs | real | 0.3 | σ_s |
| epsilon | real | 0.1 | ε |
| beta | real | 0.7 | β |
| sigma_move_m | real | 2.0 | σ（予測のぼかし） |
| quiet_reset_sec | smallint NULL | 30 | 無反応でリセットする秒数（NULL=しない） |

**estimator_sensor**（1設定につき12行．主キー config_id，sensor_no）

| 列 | 型 | 意味 |
|---|---|---|
| config_id | integer FK（ON DELETE CASCADE） | どの設定か |
| sensor_no | smallint 1〜12 | センサ番号（s_01〜s_12と同じ順） |
| noise_floor | real ≥ 0 | n_k．S_kと同じ単位（生の8bit幅，0〜255） |
| upper_level | real > noise_floor | u_k．反応1.0とみなす上限 |

**estimation_result**（1行=1秒窓．主キー config_id，ts）

| 列 | 型 | 意味 |
|---|---|---|
| config_id | integer FK | どの設定の結果か |
| ts | timestamptz(3) | 窓の開始時刻（`[ts，ts+window_sec)`）．UTC保存 |
| update_type | smallint 0/1 | 1=観測で更新，0=予測のみ（予約） |
| node_mask | smallint 0〜15 | データが届いたノード（1=0002，2=0003，4=0004，8=0005） |
| active | boolean | 反応ありか |
| est_x，est_y | real NULL | 採用位置 [m] |
| mean_x，mean_y | real NULL | 事後平均 [m] |
| p_max | real 0〜100 | 最大セルの確率 [%] |
| radius90 | real ≥ 0 | 90%半径 [m] |
| entropy | real ≥ 0 | エントロピー [bit] |
| n_sensors | smallint 0〜12 | 使ったセンサ数 |
| active_sum | real ≥ 0 | Σ s_k |
| s_01〜s_12 | smallint 0〜100 NULL | 100×s_k．NULL=欠測 |
| map_z | bytea NULL（STORAGE EXTERNAL） | 3600セルの確率（第8.3節） |
| computed_at | timestamptz(3) | 計算を終えた時刻（ts+窓長との差が遅れ） |
| event_id | integer NULL | 通過の番号 |

### 8.2 設定を変えるとき

`UPDATE` で変えず，`SELECT clone_estimator_config(元id, '新しい名前', 'メモ');` で複製して，新しい行の `estimator_sensor` や `estimator_config` を更新してから，`ESTIMATOR_CONFIG_ID` を新しい番号にして再起動する．**使用済みの config_id はトリガが変更を拒否する**（name と note だけは変更できる）．ただし「その設定でまだ1行も結果が無い間」は更新できるので，クローン直後に値を調整できる．

アプリ用ユーザー `animalmiru_user` の権限: `GRANT SELECT ON estimator_config, estimator_sensor TO animalmiru_user;`，`GRANT SELECT, INSERT ON estimation_result TO animalmiru_user;`．（`estimator_config` のIDENTITYは使わないのでシーケンス権限は不要．）

### 8.3 map_z の符号化

- bel（float64，合計1）→ 最大値で割って255倍し四捨五入: $q_i=\mathrm{round}\big(255\cdot bel(i)/\max_j bel(j)\big)$．最大のセルは255．
- 3600バイトの配列（i=iy·60+ix の順）を `compress/zlib`（既定の圧縮レベル）で圧縮した結果をbyteaに保存．
- 復号: zlibを展開して3600バイトを得る（長さが nx×ny でなければエラー）．確率[%]に戻すときは $100\,q_i/\sum_j q_j$（近似）．

### 8.4 `real` 型の注意

PostgreSQLの `real` は4バイト浮動小数なので，0.7 は 0.69999999… として読める．判定の境界（`active_thresh_v` の S≥35.7）にも影響しうるが，実用上は問題ない．テストでは許容誤差を付けること．

---

## 9. API と WebSocket

### 9.1 `GET /api/estimation`

| クエリ | 意味 |
|---|---|
| `from`，`to` | UNIX秒（整数）．`ts ∈ [from，to)` のフレームを返す．`to−from` が600秒を超えたら400 |
| `config_id` | 省略時は環境変数 `ESTIMATOR_CONFIG_ID` |
| `map` | `0` のとき `map_q` を省く（省略時は含める） |

応答: `{"config_id": 1, "frames": [Frame, ...]}`（`ts` の昇順）．無ければ `frames: []`．

### 9.2 Frame（JSON）

```json
{
  "ts": 1763431037.0,
  "window_sec": 1,
  "active": true,
  "update_type": 1,
  "node_mask": 11,
  "est_x": 2.75, "est_y": 2.25,
  "mean_x": 2.5049, "mean_y": 2.0923,
  "p_max": 1.367, "radius90": 3.756, "entropy": 7.7065,
  "n_sensors": 9, "active_sum": 1.43,
  "s": [60, null, null, 45, null, null, null, null, null, 38, null, null],
  "event_id": 12,
  "computed_at": 1763431041.4,
  "map_q": [0, 0, 1, ... 3600個の0〜255の整数]
}
```

- 時刻はUNIX秒（小数，ミリ秒精度）．`s` は12個（`s_01`〜`s_12`，NULLはnull）．
- 実測の大きさ: `map_q` はJSONで約10 KB/フレーム．

### 9.3 WebSocket（既存の `/ws/realtime`）

保存直後に `{"estimation": Frame}` を配信する（第7.5節）．形式は9.2と同じ（`map_q` 含む）．

---

## 10. 表示の同期（リアルタイムモード）

### 10.1 結論（作者の質問への答え）

**推定の遅れ（delay_sec=3.0）はそのままにして，フロントのグラフの表示遅れ `REALTIME_DELAY_SECONDS` を 3 → 3.5 秒に変える．** BeagleBoneの設定変更は不要．

理由（数値）: 窓 [T，T+1) の結果は，壁時計で

$$
T+\underbrace{1}_{\text{窓の長さ}}+\underbrace{3.0}_{\text{delay\_sec}}+\underbrace{\approx 0.2}_{\text{計算・DB・配信}}=T+4.2\ \text{秒}
$$

に利用可能になる．グラフの右端は「現在時刻 − D」なので，窓の終わり T+1 が右端に来るのは壁時計で T+1+D．地図がそれまでに届いていればよいので **D ≥ 3.0+0.2 = 3.2**．余裕0.3秒を見て **D = 3.5（= delay_sec + 0.5）** とする．一方，グラフ側のデータ到着の遅れは，BeagleBoneの送信まとめ（最大約2.5 s）と δ_fix により最大 約2.5+δ_fix なので，D=3.5 で足りる（以前の3秒だと余裕が小さい）．

**表示ルール**: グラフの右端 E（= 現在時刻 − 3.5 s）に対し，**窓の終わり ts+window_sec ≤ E を満たす最新のフレーム**を地図に表示し，その時刻を併記する．

### 10.2 過去データの確認（リアルタイムでないとき）

設定エリアの「表示開始時間」を整数秒に切り下げた時刻 T とし，`ts = T` のフレームを表示する（無ければ「この秒は反応なし（保存なし）」と表示）．**要確認**: 将来，グラフ範囲内を選んで見られるようにしてもよいが，今回は不要．

### 10.3 将来の最適化（今回は実装しない）

BeagleBone→サーバーはTCPで順序が保たれ，`node_timestamp` は受信順に単調に増えるので，「窓の終わり + δ_fix + 0.35 s 以降の node_timestamp が1つでも届いたら，その窓は完成」と判断して早く計算できる（典型的な遅れ約1.7 s）．ただし，グラフ側も右端を「届いた最新サンプルの時刻」に追従させる必要がある．効果は表示の遅れの短縮のみなので，後回しでよい．

---

## 11. ファイル構成

方針: **1ファイル1責務・短く**．「純粋な計算」（DBもHTTPも使わない）と「DBアクセス」と「常駐処理」と「HTTP」を分ける．純粋な計算は表を与えれば結果が決まるので，テストが書きやすい．

### 11.1 ツリー（★=新規，✎=既存の修正）

```
backend/
├─ cmd/main.go                          ✎ 起動処理に推定を追加（+10行）
├─ sql/                                 ★
│   ├─ 001_create_tables.sql
│   ├─ 002_config_guard.sql
│   └─ 003_seed_config.sql
├─ samples/                             ★ 生サンプルの時刻・重複の扱い（DBなし）
│   ├─ constants.go
│   ├─ row.go
│   ├─ parse.go
│   ├─ timeline.go
│   ├─ collect.go
│   └─ dedupe.go
├─ estimator/                           ★ ベイズフィルタ本体（DBなし・HTTPなし）
│   ├─ params.go
│   ├─ layout.go
│   ├─ grid.go
│   ├─ expected.go
│   ├─ kernel.go
│   ├─ predict.go
│   ├─ update.go
│   ├─ features.go
│   ├─ filter.go
│   ├─ summary.go
│   ├─ radius90.go
│   ├─ entropy.go
│   ├─ mapcodec.go
│   └─ result.go
├─ frame/                               ★ APIと配信で共通のJSON形式
│   ├─ frame.go
│   └─ from_row.go
├─ runner/                              ★ 毎秒の常駐処理
│   ├─ deps.go
│   ├─ clock.go
│   ├─ stats.go
│   ├─ event.go
│   ├─ step.go
│   └─ loop.go
├─ repository/
│   ├─ sensor_rows.go                   ★ 窓のsensor_reading取得
│   ├─ estimator_config.go              ★ 設定の読み込み
│   ├─ estimation_result.go             ★ 結果の保存・取得
│   └─ sensor.go                        ✎ GetSeries を共通関数に差し替え
└─ handler/
    ├─ estimation.go                    ★ GET /api/estimation
    └─ ingest.go                        ✎ t0 を追加

frontend/src/
├─ estimate/                            ★ 推定表示のまとまり
│   ├─ geometry.js
│   ├─ api.js
│   ├─ pickFrame.js
│   ├─ usePastFrame.js
│   ├─ useRealtimeFrame.js
│   ├─ useEstimateFrame.js
│   ├─ EstimateLayer.jsx
│   ├─ EstimateLayer.module.css
│   └─ EstimateInfo.jsx
└─ pages/Home.jsx                       ✎ 数行の変更（第12章）
docs/estimation_design.md               ★ この設計書
```

### 11.2 依存の向き（循環を作らないこと）

```
samples      ← （標準ライブラリのみ）
estimator    ← （標準ライブラリのみ）
repository   ← samples, estimator, db
frame        ← estimator, repository
runner       ← samples, estimator, repository, frame
handler      ← repository, frame, samples
cmd/main     ← runner, handler, websocket, ...
```

### 11.3 バックエンドの各ファイルの役割

行数は目安（コメント込み）．

**samples/**

| ファイル | 役割 | 主な公開要素 | 行 |
|---|---|---|---|
| constants.go | 時刻に関する定数 | `SampleInterval`=35ms，`DeltaFix`=0（要確認），`MaxRowSamples`=10，`DuplicateGap`=300ms（要確認） | 15 |
| row.go | 型 | `Row{NodeID，SensorID string; NodeTs time.Time; Values []int}`，`Key{NodeID，SensorID string}`，`Sample{T time.Time; V int}` | 20 |
| parse.go | `value_dec` を数値列に変換．数値でない要素は捨てる | `ParseValues(s string) []int` | 20 |
| timeline.go | **時刻補正の唯一の実装**（第5章） | `SampleTime(nodeTs time.Time, n, j int) time.Time`，`FirstSampleTime(nodeTs, n)`，`QueryRange(from, to time.Time) (time.Time, time.Time)` | 35 |
| collect.go | 行→（ノード，センサ）ごとのサンプル列．補正後の時刻が [from，to) のものだけ | `Collect(rows []Row, from, to time.Time) map[Key][]Sample` | 30 |
| dedupe.go | 重複行の除去（D20） | `DropDuplicates(rows []Row) []Row`（`NodeTs` 昇順の入力を仮定） | 30 |

**estimator/**

| ファイル | 役割 | 主な公開要素 | 行 |
|---|---|---|---|
| params.go | 設定の構造体 | `Params`（configの列に対応: WindowSec，DelaySec，MinSamples，ActiveThreshV，FovHalfDeg，RangeM，D0M，SigmaObs，Epsilon，Beta，SigmaMoveM，QuietResetSec *int），`SensorCal{Noise，Upper float64}` | 35 |
| layout.go | センサ12個の固定配置（第4章） | `Sensors [12]SensorPos`，`SensorNo(nodeID，sensorID string) int`（無ければ−1），`NodeBit(nodeID string) int` | 40 |
| grid.go | 格子の座標計算 | `Grid{Nx，Ny int; H，X0，Y0 float64}`，`DefaultGrid()`，`(g Grid) N() int`，`Center(i int) (x，y float64)`，`Uniform() []float64` | 35 |
| expected.go | e_k(i) の表を作る | `Expected(g Grid, p Params) [][]float64`（[12][N]） | 40 |
| kernel.go | ガウスカーネル | `Kernel(sigmaCells float64) []float64`（半径ceil(3σ)，合計1） | 20 |
| predict.go | 反射境界の分離畳み込み | `Predict(bel []float64, g Grid, ker []float64) []float64`，`reflect(j，n int) int` | 45 |
| update.go | 観測の反映と正規化 | `Obs{K int; S float64}`，`Update(bel []float64, obs []Obs, exp [][]float64, p Params) []float64` | 40 |
| features.go | S_k，s_k，active，欠測 | `Stat{Count，Min，Max int}`，`Features{Obs []Obs; S [12]*float64（0〜1）; Active bool; ActiveSum float64; NSensors，NodeMask int}`，`BuildFeatures(stats [12]*Stat, cal [12]SensorCal, p Params) Features` | 55 |
| filter.go | 信念とquietカウンタを持ち，1秒を進める（第6.3節） | `Filter`，`NewFilter(g Grid, p Params, cal [12]SensorCal) *Filter`，`(f *Filter) Step(ft Features) (bel []float64, save bool)`，`Reset()` | 55 |
| summary.go | est，mean，p_max | `Summary{EstX，EstY，MeanX，MeanY，PMax float64}`，`Summarize(bel []float64, g Grid) Summary` | 45 |
| radius90.go | 90%半径 | `Radius90(bel []float64, g Grid, cx，cy float64) float64` | 35 |
| entropy.go | エントロピー | `Entropy(bel []float64) float64` | 15 |
| mapcodec.go | map_zの符号化・復号 | `EncodeMap(bel []float64) ([]byte，error)`，`DecodeMap(z []byte, n int) ([]uint8，error)` | 45 |
| result.go | 1秒の結果をまとめる型 | `Result{Summary; Radius90，Entropy float64; Features; MapZ []byte}`，`NewResult(bel，g，ft) (Result，error)` | 35 |

**frame/**

| ファイル | 役割 | 主な公開要素 | 行 |
|---|---|---|---|
| frame.go | JSON形式（第9.2節）の構造体 | `Frame`（jsonタグ付き） | 35 |
| from_row.go | DBの行（`repository.EstimationRow`）をFrameへ．`map_z` を展開，`ts`・`computed_at` をUNIX秒へ | `FromRow(r repository.EstimationRow, withMap bool, n int) (Frame，error)` | 45 |

**runner/**

| ファイル | 役割 | 主な公開要素 | 行 |
|---|---|---|---|
| deps.go | 外部依存を関数の束で受ける（テストで差し替える） | `Deps{GetRows func(from，to time.Time) ([]samples.Row，error); SaveResult func(repository.EstimationRow) (bool，error); Broadcast func(any); Now func() time.Time}` | 25 |
| clock.go | 対象の窓の開始時刻（第7.1節） | `TargetStart(now time.Time, windowSec int, delaySec float64) time.Time` | 15 |
| stats.go | サンプル列→12センサの統計 | `ToStats(m map[samples.Key][]samples.Sample) [12]*estimator.Stat` | 30 |
| event.go | event_idの採番（第7.4節） | `EventCounter`，`(e *EventCounter) Next(t time.Time) int` | 25 |
| step.go | 1つの窓の処理（第7.3節）．失敗はerrorで返す | `(r *Runner) Process(T time.Time) error` | 60 |
| loop.go | 毎秒のループ・取りこぼし・遅延ログ（第7.2節） | `Runner`，`New(...) *Runner`，`(r *Runner) Run(ctx context.Context)` | 55 |

**repository/**

| ファイル | 役割 | 主な公開要素 | 行 |
|---|---|---|---|
| sensor_rows.go | `[from，to)` の `sensor_reading` を `[]samples.Row` で返す（`node_timestamp` 昇順） | `GetRows(from，to time.Time) ([]samples.Row，error)` | 35 |
| estimator_config.go | config 1行と12センサを読む．格子・map_encodingの検査 | `LoadEstimator(id int) (estimator.Params，estimator.Grid，[12]estimator.SensorCal，error)` | 60 |
| estimation_result.go | 保存と取得 | `EstimationRow`（DB列に対応，`MapZ []byte`，`S [12]*int16`），`SaveResult(r EstimationRow) (inserted bool，err error)`，`GetFrames(configID int, from，to time.Time, withMap bool) ([]EstimationRow，error)`，`MaxEventID(configID int) (int，error)` | 80 |
| sensor.go（修正） | `GetSeries` を `samples` の共通関数で書き直す | 既存の関数名・戻り値は変えない | −10 |

**handler/**

| ファイル | 役割 | 行 |
|---|---|---|
| estimation.go | `ServeEstimation()`: クエリを検査 → `repository.GetFrames` → `frame.FromRow` → JSON | 60 |
| ingest.go（修正） | 配信エントリに `T0 float64 json:"t0"` を追加し，`samples.FirstSampleTime(nodeTimestamp, n)` を設定（n=`payload_hex` の要素数÷3） | +8 |

**cmd/main.go（修正）**: `ESTIMATOR_CONFIG_ID` を読み，設定を `repository.LoadEstimator` で読み，`runner.New(...)` を `go r.Run(ctx)` で起動．ルート `mux.HandleFunc("/api/estimation", handler.ServeEstimation())` を追加．`.env.example`（あれば）に `ESTIMATOR_CONFIG_ID=1` を追記．

### 11.4 フロントエンドの各ファイルの役割

| ファイル | 役割 | 行 |
|---|---|---|
| estimate/geometry.js | 定数（FIELD_SIZE_M=30，NX=60，CELL=0.5）と，座標→地図上の%（x，y）の変換．`toLeftPct(x)`=(x+15)/30·100，`toTopPct(y)`=(15−y)/30·100 | 20 |
| estimate/api.js | `fetchFrames(from，to，withMap)`（`/api/estimation`） | 25 |
| estimate/pickFrame.js | 第10.1節の選択規則: `pickFrame(frames，edgeSec，windowSec=1)` = `ts+windowSec ≤ edgeSec` の最大ts | 15 |
| estimate/usePastFrame.js | 過去確認用．開始時間のフレームを1件取得 | 30 |
| estimate/useRealtimeFrame.js | リアルタイム用．初回に直近30秒を取得し，WebSocketの `estimation` で追加．30秒より古いものは捨てる．`pickFrame` で選ぶ | 60 |
| estimate/useEstimateFrame.js | 上の2つを `realtime` で切り替える窓口（フックは両方を `enabled` 付きで呼ぶ） | 15 |
| estimate/EstimateLayer.jsx | 60×60の `<canvas>` に塗る（第12.3節）．推定位置（est）の印と，radius90の円（点線）を重ねる | 55 |
| estimate/EstimateLayer.module.css | 地図いっぱいに広げる，`image-rendering: pixelated`，`pointer-events: none` | 20 |
| estimate/EstimateInfo.jsx | 「推定時刻 hh:mm:ss（窓 ts〜ts+1），p_max，r90，使用センサ数」を表示．フレームが無いときは「反応なし」 | 35 |

---

## 12. 既存ファイルの変更仕様

### 12.1 `backend/repository/sensor.go` — `GetSeries`

- 検索範囲を `samples.QueryRange(from, to)` に変える．
- 1サンプルの時刻を `samples.SampleTime(nodeTs, n, j)` に変える（`base + i*sampleIntervalSec` を廃止．`sampleIntervalSec` 定数は削除して `samples.SampleInterval` を使う）．
- 結果は補正後の時刻が `[from，to)` に入るものだけ．戻り値の形（ノード→センサ→[[UNIX秒，値]…]）は同じ．
- 重複除去は**しない**．

### 12.2 `backend/handler/ingest.go`

`SensorEntry` に `T0 float64 `json:"t0"`` を追加．保存ループ内で `entry.T0 = float64(samples.FirstSampleTime(nodeTimestamp, n).UnixMicro()) / 1e6`．ここで n = 1センサあたりの値の個数 = `payload_hex` のカンマ区切りの要素数 ÷ 3（切り捨て．通常は30÷3=10）．`entry.Timestamp` の上書きは今のまま．

### 12.3 `frontend/src/pages/Home.jsx`（最小の変更）

1. `parseSensorData`: `timestamp + (i / 3) * SAMPLE_INTERVAL_SEC` を `t0 + (i / 3) * SAMPLE_INTERVAL_SEC` に変える（分割代入に `t0` を追加）．
2. `REALTIME_DELAY_SECONDS` を `3` → `3.5`．コメント「= delay_sec(3.0) + 0.5．バックエンドの delay_sec と対で変えること」を付ける．
3. `const frame = useEstimateFrame({ realtime, pastFromSec, edgeSec: toSec });` を追加．
4. `routeMode` のときだけ，`<MapGrid />` の直後に `<EstimateLayer frame={frame} />`，地図の下（`mapScroll` の外）に `<EstimateInfo frame={frame} />` を描く．**経路表示モードでだけ座標が地図の0〜100%と一致する**（ノードが±5 mの位置にある）ため．

`EstimateLayer` の描画規則:
- キャンバスは 60×60 ピクセル．セル (ix，iy) は**行 59−iy，列 ix**（上が北）．
- 色は赤 `rgb(255,0,0)`，不透明度 = `q/255`．
- 重ね順は，格子線より上，ノードのピン・グラフより下．
- 推定位置: `left = toLeftPct(est_x)`，`top = toTopPct(est_y)` に小さな丸．不確かさの円は半径 `radius90/30·100`（%）．

---

## 13. テストと受け入れ条件

`go test ./...` が通ること．以下の正解値は，別実装（Python/NumPy）で計算して照合済みのもの．許容誤差は，表示桁の最後の桁（相対 1e-5 程度，float64の計算順の違いは1e-12程度）で比較する．

### 13.1 指標（Grid 60×60，h=0.5）

中心は（0.25，0.25）のセル，ガウスは σ [m] の2次元ガウスを正規化したもの．

| 入力 | p_max[%] | H[bit] | radius90[m] |
|---|---|---|---|
| 一様（est=(0.25,0.25)） | 0.028 | 11.814 | 16.711 |
| ガウス σ=0.5 | 15.915 | 4.094 | 1.118 |
| ガウス σ=1 | 3.979 | 6.094 | 2.121 |
| ガウス σ=2 | 0.995 | 8.094 | 4.272 |
| ガウス σ=3 | 0.442 | 9.264 | 6.500 |
| ガウス σ=5 | 0.160 | 10.692 | 10.607 |

二峰（σ=1の山が (−4.25，0.25) と (3.75，0.25)）: est=最大点(−4.25，0.25)で p_max=1.989，H=7.094，radius90=9.014．中心を事後平均(−0.25，0.25)にすると radius90=5.500（estを中心にする設計との違いの確認用）．

### 13.2 予測（Predict）

| 検査 | 期待 |
|---|---|
| 一様 → 一様 | 全セルの差の最大 < 1e-15 |
| 質量保存（乱数の信念） | 合計 = 1（誤差 < 1e-12） |
| 角のセル（0，0）に全確率 | 合計 = 1．最大セルは（0，0）で 0.038708 |
| 中央のセル（30，30）に全確率 | 最大値 0.0099817（σ=2，カーネル半径12．連続の理論値 0.0099472 とは1%以内で一致） |

### 13.3 フィルタ全体（ゴールデンテスト）

設定: 既定のパラメータ．センサ番号 k=1..12（1始まり）．ターゲットはセル中心 (3.25，2.25)（i=2076）にいるとして，**観測 s_k を e_k(i=2076) そのもの**とする（雑音なし）:
s_1=0.847033，s_4=0.419312，s_10=0.306775，**ほかの9個は 0.0**（12個すべてを観測に入れる）．
一様から開始し，毎秒「予測 → 更新」を3回，続けて予測のみ1回．

| ステップ | est_x | est_y | mean_x | mean_y | p_max[%] | radius90[m] | H[bit] |
|---|---|---|---|---|---|---|---|
| 1（更新） | 3.25 | 2.25 | 0.961365 | 0.760121 | 0.390995 | 18.384776 | 10.855614 |
| 2（更新） | 2.75 | 2.25 | 2.094041 | 1.727251 | 1.092161 | 14.422205 | 8.751040 |
| 3（更新） | 2.75 | 2.25 | 2.504880 | 2.092337 | 1.366984 | 3.756351 | 7.706547 |
| 4（予測のみ） | 2.75 | 2.25 | 2.504869 | 2.092330 | 0.583923 | 5.955209 | 9.066963 |

追加の検査:

| 検査 | 期待 |
|---|---|
| 一様から，センサ1〜3（0002）だけを1回更新 | est=(3.0，3.0)，mean=(−0.432092，−0.432092)，p_max=0.115922，H=11.583828，radius90=18.141803 |
| 一様から，12個すべて s=0 で1回更新 | est=(0.0，0.0)（最大が4セルで同値→平均），mean≈(0，0)，p_max=0.065472，H=11.371587，radius90=18.155578 |
| e_k の視野内セル数 | センサ1: 502，センサ6: 506，センサ12: 506 |

**注意**: この正解値は「実装がPython参照実装と一致するか」の回帰テストであり，推定精度の評価ではない（ターゲットから少しずれた位置に収束している）．精度は実験データで評価する．

### 13.4 特徴量

n_k=20，u_k=120 のとき: S=10→s=0.0，S=20→0.0，S=70→0.5，S=120→1.0，S=200→1.0．`active_thresh_v`=0.7 は S ≥ 35.7（S=35 はfalse，S=36 はtrue）．サンプル数が4（min_samples=5未満）のセンサは欠測．

### 13.5 時刻

`node_timestamp = 2026-11-18T10:00:00.500+09:00`，n=10，δ_fix=0 のとき，j=9 の時刻は 10:00:00.500，j=0 は 10:00:00.185，j=5 は 10:00:00.360．`QueryRange(T，T+1s)`（T=10:00:00，δ_fix=0）は `[10:00:00.000，10:00:01.315)`．`node_timestamp` が T−0.05 の行は（最後の値がT未満なので）窓に入らない．`DeltaFix` を変えても，`GetSeries` と推定が同じ時刻に値を置くこと（同じ行を両方に通して時刻が一致するテスト）．

### 13.6 重複除去・map符号化

- 同じ（node，sensor）で値が同一かつ差0.12 sの2行 → 後の行だけ捨てる．差0.47 sなら両方残す．値が違えば残す．
- `EncodeMap` → `DecodeMap` で，最大セルが255，q_i = round(255·bel_i/max)，長さ3600．約2.3 KB以下．

### 13.7 runner（偽の `Deps` を使うテスト）

| 状況 | 期待 |
|---|---|
| 全センサのデータ無し | 保存なし・信念は予測のみ |
| データあり・全センサ振幅が閾値未満 | 更新するが保存なし（active=false） |
| いずれかが0.7 V以上 | 保存1行．`computed_at` が入る．Broadcastが1回呼ばれる |
| active=falseが30秒続く | 信念が一様に戻る（`quiet_reset_sec`=NULLなら戻らない） |
| 同じTの保存が2回目 | `inserted=false`．Broadcastしない |
| 取りこぼしが10秒超 | 最新のTへ飛び，信念が一様に戻る |
| 処理が1秒超（Nowを進めて再現） | ログ「1秒以内に計算失敗」 |
| `TargetStart(10:57:21，1，3.0)` | 10:57:17 |

### 13.8 受け入れ条件（手動）

1. 4ノードが稼働中に，リアルタイムモードで経路表示モードを開くと，人が動く（歩く）のに合わせて赤い領域が動く．
2. 地図に表示された時刻と，その時刻に対応するグラフの区間が，横軸の右端付近で一致する．
3. `estimation_result` の `computed_at − (ts + 1秒)` が，ほぼ 3.0〜3.3 秒．
4. サーバーを再起動しても受信と配信が止まらず，推定は一様から再開する．
5. 反応のない時間は `estimation_result` に行が増えない．

---

## 14. 実装順序（フェーズ）

各フェーズの終わりにテストを通し，作者が動作を確認できる状態にすること．

| フェーズ | 内容 | 完了の目安 |
|---|---|---|
| 1 | `backend/sql/` の3本を置く．`samples/`（時刻補正・重複・Collect）とそのテスト | 第13.5，13.6節 |
| 2 | `GetSeries` を共通関数に差し替え，`ingest.go` に `t0` ，`Home.jsx` の `parseSensorData` 修正．`REALTIME_DELAY_SECONDS`=3.5 | グラフが約0.3 s 以上早い位置に描かれる．既存画面が壊れない |
| 3 | `estimator/`（計算の部品→ `Filter`）とゴールデンテスト | 第13.1〜13.4節 |
| 4 | `repository/estimator_config.go`，`estimation_result.go`，`sensor_rows.go`．`runner/`．`main.go` に追加 | 第13.7節．実機で `estimation_result` に行が増える |
| 5 | `frame/`，`handler/estimation.go`．WebSocket配信 | `curl /api/estimation?from=..&to=..` がJSONを返す |
| 6 | フロント `estimate/` と `Home.jsx` | 第13.8節 |
| 7（任意） | 第10.3節の早期計算（今回は実装しない） | |

---

## 15. 未確定事項（要確認）と既定値

| # | 項目 | 既定値（コードに入れる値） | 確認方法 |
|---|---|---|---|
| Q1 | `DeltaFix`（δ_fix） | 0 | 全センサに同時刺激を与え，推定時刻との差を測る．測定までは0 |
| Q2 | `DuplicateGap` | 0.30 s | 付録Bのクエリで実データの重複間隔を見て決める |
| Q3 | `EventGapSec` | 3 s | 実データで通過の区切りを見て決める |
| Q4 | `active_thresh_v` | 0.7 V | 静かな時間帯のデータで再確認（10/14のデータでは，0.7 Vで84%の秒がactiveになっていた） |
| Q5 | `n_k`，`u_k` | 20，120（仮） | センサごとに作者が実測して設定（cloneで新しい設定を作る） |
| Q6 | PDFの「2秒前」の文章 | `delay_sec` に従う | PDFの該当文を修正する |
| Q7 | 過去確認の表示フレーム | 表示開始時間（整数秒）の窓 | 第10.2節 |
| Q8 | `UML/ER_diagram.md` | 実DB＋新3テーブルへ更新 | AIが更新する |
| Q9 | 表示遅れ `REALTIME_DELAY_SECONDS` の実測調整 | 3.5 s | 地図がグラフより遅れて見える場合は4.0 sへ．フロントの時計補正は `node_timestamp` に基づくため，サーバー時計より最大0.1〜0.3 s程度遅れうる（第10.1節の余裕0.3 sを使う） |

---

## 付録A. SQL（`backend/sql/`）

次のSQLは，PostgreSQL 16の一時DBで3本とも実行して確認済み．

### A.1 `001_create_tables.sql`

```sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) 設定(1行=1つの計算条件．作った行は書き換えず，変えるときは新しい行を作る)
CREATE TABLE estimator_config (
  config_id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text        NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  code_version    text,
  note            text,
  -- 格子
  grid_nx         smallint NOT NULL DEFAULT 60   CHECK (grid_nx > 0),
  grid_ny         smallint NOT NULL DEFAULT 60   CHECK (grid_ny > 0),
  cell_size_m     real     NOT NULL DEFAULT 0.5  CHECK (cell_size_m > 0),
  grid_x_min_m    real     NOT NULL DEFAULT -15.0,
  grid_y_min_m    real     NOT NULL DEFAULT -15.0,
  map_encoding    smallint NOT NULL DEFAULT 1    CHECK (map_encoding IN (1, 2)),
  -- 時間
  window_sec      smallint NOT NULL DEFAULT 1    CHECK (window_sec > 0),
  delay_sec       real     NOT NULL DEFAULT 3.0  CHECK (delay_sec >= 0),
  min_samples     smallint NOT NULL DEFAULT 5    CHECK (min_samples > 0),
  active_thresh_v real     NOT NULL DEFAULT 0.7  CHECK (active_thresh_v > 0),
  -- センサのモデル
  fov_half_deg    real     NOT NULL DEFAULT 72   CHECK (fov_half_deg > 0 AND fov_half_deg <= 90),
  range_m         real     NOT NULL DEFAULT 10   CHECK (range_m > 0),
  d0_m            real     NOT NULL DEFAULT 8    CHECK (d0_m > 0),
  sigma_obs       real     NOT NULL DEFAULT 0.3  CHECK (sigma_obs > 0),
  epsilon         real     NOT NULL DEFAULT 0.1  CHECK (epsilon >= 0 AND epsilon <= 1),
  beta            real     NOT NULL DEFAULT 0.7  CHECK (beta > 0 AND beta <= 1),
  -- 動き
  sigma_move_m    real     NOT NULL DEFAULT 2.0  CHECK (sigma_move_m > 0),
  quiet_reset_sec smallint          DEFAULT 30   CHECK (quiet_reset_sec > 0)  -- NULL=リセットしない
);

-- 2) センサごとの n_k(雑音下限), u_k(反応1.0とみなす上限)
CREATE TABLE estimator_sensor (
  config_id    integer  NOT NULL REFERENCES estimator_config (config_id) ON DELETE CASCADE,
  sensor_no    smallint NOT NULL CHECK (sensor_no BETWEEN 1 AND 12),
  noise_floor  real     NOT NULL CHECK (noise_floor >= 0),
  upper_level  real     NOT NULL,
  PRIMARY KEY (config_id, sensor_no),
  CHECK (upper_level > noise_floor)
);

-- 3) 推定結果(1行=1秒窓)
CREATE TABLE estimation_result (
  config_id    integer       NOT NULL REFERENCES estimator_config (config_id),
  ts           timestamptz(3) NOT NULL,
  update_type  smallint      NOT NULL CHECK (update_type IN (0, 1)),
  node_mask    smallint      NOT NULL CHECK (node_mask BETWEEN 0 AND 15),
  active       boolean       NOT NULL,
  est_x        real,
  est_y        real,
  mean_x       real,
  mean_y       real,
  p_max        real          CHECK (p_max BETWEEN 0 AND 100),
  radius90     real          CHECK (radius90 >= 0),
  entropy      real          CHECK (entropy >= 0),
  n_sensors    smallint      NOT NULL CHECK (n_sensors BETWEEN 0 AND 12),
  active_sum   real          CHECK (active_sum >= 0),
  s_01 smallint CHECK (s_01 BETWEEN 0 AND 100),
  s_02 smallint CHECK (s_02 BETWEEN 0 AND 100),
  s_03 smallint CHECK (s_03 BETWEEN 0 AND 100),
  s_04 smallint CHECK (s_04 BETWEEN 0 AND 100),
  s_05 smallint CHECK (s_05 BETWEEN 0 AND 100),
  s_06 smallint CHECK (s_06 BETWEEN 0 AND 100),
  s_07 smallint CHECK (s_07 BETWEEN 0 AND 100),
  s_08 smallint CHECK (s_08 BETWEEN 0 AND 100),
  s_09 smallint CHECK (s_09 BETWEEN 0 AND 100),
  s_10 smallint CHECK (s_10 BETWEEN 0 AND 100),
  s_11 smallint CHECK (s_11 BETWEEN 0 AND 100),
  s_12 smallint CHECK (s_12 BETWEEN 0 AND 100),
  map_z        bytea,
  computed_at  timestamptz(3) NOT NULL,
  event_id     integer,
  PRIMARY KEY (config_id, ts)
);

-- map_z は圧縮済みなので，TOASTでの再圧縮を避ける
ALTER TABLE estimation_result ALTER COLUMN map_z SET STORAGE EXTERNAL;

COMMIT;
```

### A.2 `002_config_guard.sql`

```sql
\set ON_ERROR_STOP on
BEGIN;

-- 設定(estimator_config + estimator_sensor 12行)を複製し，新しい config_id を返す
CREATE FUNCTION clone_estimator_config(src integer, new_name text, new_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE new_id integer;
BEGIN
  INSERT INTO estimator_config (
    name, note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec)
  SELECT
    new_name, new_note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec
  FROM estimator_config WHERE config_id = src
  RETURNING config_id INTO new_id;

  IF new_id IS NULL THEN
    RAISE EXCEPTION 'config_id=% は存在しません', src;
  END IF;

  INSERT INTO estimator_sensor (config_id, sensor_no, noise_floor, upper_level)
  SELECT new_id, sensor_no, noise_floor, upper_level
  FROM estimator_sensor WHERE config_id = src;

  RETURN new_id;
END $$;

-- 推定結果で使用済みの config_id は変更させない(name と note の修正だけは許可)
CREATE FUNCTION forbid_change_if_used() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer;
BEGIN
  IF TG_TABLE_NAME = 'estimator_config' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'name' - 'note') = (to_jsonb(OLD) - 'name' - 'note') THEN
    RETURN NEW;
  END IF;

  cid := CASE WHEN TG_OP = 'INSERT' THEN NEW.config_id ELSE OLD.config_id END;
  IF EXISTS (SELECT 1 FROM estimation_result WHERE config_id = cid) THEN
    RAISE EXCEPTION 'config_id=% は推定結果で使用済みのため変更できません．clone_estimator_config() で新しい設定を作ってください', cid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_config_guard BEFORE UPDATE ON estimator_config
  FOR EACH ROW EXECUTE FUNCTION forbid_change_if_used();
CREATE TRIGGER trg_sensor_guard BEFORE INSERT OR UPDATE OR DELETE ON estimator_sensor
  FOR EACH ROW EXECUTE FUNCTION forbid_change_if_used();

COMMIT;
```

### A.3 `003_seed_config.sql`

```sql
\set ON_ERROR_STOP on
BEGIN;
-- 初期設定(config_id=1)．パラメータは既定値(DEFAULT)を使う．
-- noise_floor / upper_level は仮の値(20 / 120)．実測の雑音と最大反応に合わせて自分で設定すること．
-- 設定を変えるときは UPDATE せず，clone_estimator_config() で新しい config_id を作る．
INSERT INTO estimator_config (name, note) VALUES ('初期値', '初期設定．n_k=20, u_k=120 は仮の値');
INSERT INTO estimator_sensor (config_id, sensor_no, noise_floor, upper_level)
SELECT (SELECT config_id FROM estimator_config WHERE name = '初期値'), g, 20, 120
FROM generate_series(1, 12) AS g;
COMMIT;
```

## 付録B. 重複間隔を調べるクエリ（`DuplicateGap` を決める）

同じノード・同じセンサで，直前の行と**値が完全に同じ**行の，時刻の差の分布を見る（差が小さい山が再送による重複）．時刻の範囲は実際のデータの日時に置き換える．

```sql
WITH r AS (
  SELECT node_timestamp, value_dec,
         LAG(node_timestamp) OVER w AS prev_ts,
         LAG(value_dec)      OVER w AS prev_val
  FROM sensor_reading
  WHERE node_timestamp >= '2026-11-17 10:00+09' AND node_timestamp < '2026-11-17 11:00+09'
  WINDOW w AS (PARTITION BY node_id, sensor_id ORDER BY node_timestamp))
SELECT round(extract(epoch FROM node_timestamp - prev_ts)::numeric, 2) AS gap_s, count(*) AS n
FROM r WHERE value_dec = prev_val GROUP BY 1 ORDER BY 1;
```

## 付録C. 記号とパラメータ

| 記号 | 意味 | 値 | 決まり方 |
|---|---|---|---|
| t，T | 秒，窓の開始時刻 | | 自動 |
| i，j | セル番号 | 0〜3599 | 固定 |
| k | センサ番号 | 1〜12 | 固定 |
| K_t | その秒に使えたセンサの集合 | | データの有無 |
| S_k | 1秒窓の最大−最小 | 0〜255 | 自動 |
| n_k，u_k | 雑音下限，反応1.0の上限 | 20，120（仮） | 調整（`estimator_sensor`） |
| s_k | 正規化した反応の強さ | 0〜1 | 自動 |
| σ | 動きの幅（`sigma_move_m`） | 2 m（1〜3） | 調整 |
| σ_s | 観測の揺らぎ（`sigma_obs`） | 0.3 | 固定 |
| ε | 外れ値の下限（`epsilon`） | 0.1 | 固定 |
| β | 観測の影響を弱める指数 | 0.7（0.3〜1） | 調整 |
| d0 | 距離で弱まる目安（`d0_m`） | 8 m（5〜8） | 調整 |
| δ_fix | 時刻補正 | 0（要確認） | Go定数 |
| delay_sec | 待ち時間 | 3.0 | config |
| quiet_reset_sec | 一様へ戻す無反応秒数 | 30 | config |

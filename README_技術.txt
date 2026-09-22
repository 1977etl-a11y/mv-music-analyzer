技術メモ
========

構成
----
index.html              UI
styles.css              スマホ向けスタイル
app.js                  解析本体
manifest.webmanifest    PWAマニフェスト
sw.js                   アプリシェル/CDNキャッシュ
icon.svg                アイコン
sample_music_analysis.json 出力例

Essentia.js
-----------
Version: 0.1.3
CDN:
https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js
https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.min.js

使っている主なEssentiaアルゴリズム
----------------------------------
・RhythmExtractor2013: BPM / beat timestamps / confidence
・KeyExtractor: key / scale / strength
・SuperFluxExtractor: onset timestamps
  失敗時は OnsetRate にフォールバック

サンプルレート
--------------
Essentiaのいくつかのアルゴリズムが44.1kHz前提のため、ブラウザのOfflineAudioContextで
44,100Hzへリサンプルしてから解析します。

帯域カーブ
----------
MV用途の時間マッピングを優先し、ブラウザ側で以下の概略帯域へ分けています。
LOW : < 250Hz
MID : 250Hz - 4kHz
HIGH: > 4kHz

0.5秒窓 / 0.25秒ホップでRMS(dB)と帯域比率を出力します。
これはマスタリング用の厳密なスペクトル測定ではありません。

自動候補
--------
section_change_candidates:
音量＋LOW/MID/HIGH比率のフレーム間変化量から候補を抽出。

mv_hook_candidates:
・低域比率が強いオンセット
・4秒窓でオンセット密度が高い区間
・構造変化スコア上位
をMV設計の候補として出します。

改造候補
--------
・Essentia LowLevelSpectralExtractorへ完全移行
・LUFS / EBUR128追加
・ステム別解析
・セクション分類モデル追加
・歌詞タイムライン統合
・v4.8プロトコル用プロンプト自動生成

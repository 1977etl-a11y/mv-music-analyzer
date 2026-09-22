MV Music Analyzer PWA v0.3

今回の実地テスト（「笑って蹴るわ」）で判明した不足を修正した版です。

v0.3の主変更
1. MV同期候補を曲全体から抽出
   v0.2の「最大24件を時刻順で切る」挙動を廃止。15秒前後の区間ごとに候補を確保し、全編に分散させます。
2. 各同期候補に strength / normalized_strength / local_loudness_db / beat_distance_sec を追加。
3. -60 dBの無音ゲートを追加。終端ノイズなどをMV同期候補から除外。
4. beat_tracking_diagnostics を追加。検出器が返していない0秒を人工的にbeatへ追加しません。
5. 構造イベントと瞬間同期イベントを区別しやすい出力へ変更。
6. schemaを mv_music_analysis.v3 に更新。
7. Stem-awareの出力枠と、歌詞外ボーカルイベントの分類枠を追加。

重要：Stem分離について
このv0.3 GitHub Pages版は「Stem-aware」ですが、高品質な自動Stem分離そのものはまだ内蔵していません。
理由は、Demucs系の高品質モデルをスマホのブラウザPWAへ同梱すると、モデル容量・RAM・処理時間が大きく、
不完全な疑似分離を「Stem分離」として出す方がMV解析を壊すためです。

したがって現版は：
音源1個 → 原曲の全編同期解析 → music_analysis_v3.json
を確実に実行します。
Stemが無い状態で shout / adlib / beatbox 等を勝手に確定せず、未分類として保持します。

次段階
高品質Stemを自動生成するには、
A) サーバー側Demucs
B) PCローカルDemucs + PWAへ結果受け渡し
C) 十分軽量なブラウザStemモデル
のいずれかを接続します。

Done条件
- 全曲に同期候補が分散する
- 候補ごとに強度がある
- 低音量区間が除外される
- beat時刻の由来がJSONに残る
- 分からない声イベントを推測で確定しない

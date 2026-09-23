MV Music Analyzer v0.6.1 変更点

目的
- 正規歌詞（WHAT）と外部ASR SRT（WHEN）を分離したまま同一時間軸へ接続する。
- 歌詞に無いスキャット/アドリブ等の発声候補を捨てない。

追加
1. SRTインポート（スマホのファイル選択対応）
2. SRT時刻を秒へ変換し vocal_asr_timeline に保持
3. TurboScribe等の既知の書き出しバナー文字列を解析対象から除外（元raw_textは保持）
4. 正規歌詞とSRTを単調順序で候補照合。1歌詞行に最大3 SRT cueを結合して比較
5. 一致した行はSRT開始/終了時刻を lyric_timeline に採用
6. 一致しないSRT cueは unmatched_vocal_events に保持。反復音節のみ SCAT_CANDIDATE として弱く候補化
7. SRT未入力時はv0.6のVocal Stemヒューリスティック同期へフォールバック

重要な制限
- Whisper/WhisperXをブラウザ内蔵した版ではない。外部ASRのSRTを読み込む。
- ASR誤認識は正規歌詞へ上書きしない。
- SCAT_CANDIDATEは確定分類ではない。
- 単語forced alignmentは未実装。行/フレーズ単位の候補同期。
- 具体的な映像演出は後段の意味変質型MVプロトコルが決める。

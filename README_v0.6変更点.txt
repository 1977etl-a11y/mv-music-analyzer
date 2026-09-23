MV Music Analyzer v0.6 変更点
============================

目的
----
v0.5のStem解析＋9運動プリミティブを保持したまま、歌詞を「別の水脈」として同一時間軸へ接続する。
歌詞の意味から映像命令を自動決定しない。

追加
----
1. 歌詞全文入力欄
   - 1行=1フレーズ
   - 任意で [mm:ss.xx] を先頭に付けると開始時刻を固定
   - [SCAT] [BREATH] [VOCAL] [INST] [LYRIC] の明示タグに対応

2. lyric_timeline
   - Vocals Stemのunknown_vocal_event等の発声候補を利用し、歌詞行を時間軸へ仮同期
   - 行数と発声クラスタ数が一致する場合はクラスタ同期
   - 一致しない場合は発声イベント分布のquantileを使った保守的な仮配置
   - Vocal Stemなしの場合は曲尺分布による低confidence fallback

3. 手動補正UI
   - 解析後、各行のstart_sec/end_sec/typeをスマホ画面から修正可能
   - 修正値はJSON保存/共有へ反映

4. audio_context
   - 各歌詞行と同時刻にあるv0.5運動プリミティブ上位候補を参照用に付与
   - 意味を融合せず、共通時刻座標としてのみ接続

5. unified_timeline
   - 歌詞と音響物理を別水脈のまま後段MV設計へ渡すルールを明記

重要な制限
----------
- v0.6は音声認識(ASR)やphoneme/word forced alignmentを実装していない。
- 自動同期は「正確な歌詞認識」ではなくVocal Stemの発声時刻を利用した候補生成。
- 単語単位の正確な位置が必要な箇所は手動補正、または将来の専用alignment層が必要。
- SCAT/BREATH/VOCALIZATION等は音響だけから断定せず、原則ユーザー明示タグで保持する。

出力
----
*_music_analysis_v6.json
schema: mv_music_analysis.v6

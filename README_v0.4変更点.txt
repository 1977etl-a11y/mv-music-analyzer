MV Music Analyzer PWA v0.4 変更点

目的:
v0.3の原曲解析を維持しながら、ユーザー側で分離したStemをスマホから任意入力し、
Original基準の共通タイムラインへ統合する。

入力:
- Original: 必須
- Vocals: 任意
- Drums: 任意
- Bass: 任意
- Other: 任意
全部揃っていなくても動作する。Original + Vocalsだけでも詳細解析可能。

v0.4追加:
1. 外部Stem入力UI
2. Stemごとのオンセット/可聴オンセット/帯域カーブ
3. Originalとの尺差を検査（±0.25秒をaligned）
4. Vocals Stemから unknown_vocal_event の時刻候補を抽出
5. 原曲MV同期候補 + Stem候補を merged_timeline_candidates に統合
6. schemaを mv_music_analysis.v4 に更新
7. v0.3で残っていたfrontend/output filenameの版表記を修正

重要:
- 自動Stem分離はしない。
- スキャット/ボイパ/笑い/掛け声/ブレス等の意味分類は、現段階では推測で確定しない。
- Vocal Stemは「正確な発声候補時刻」を増やすために使う。
- 歌詞タイムアラインメントと聴感重要度の自動判定は次段階。

# 後段コンテ参照契約 v0.7.0

解析器はCUTや演出上の関係を生成しません。ここで定義するのは、別のAI/アプリが人間の演出判断を記録するための参照形式です。

## 読み取り手順

1. `schema` と `reference_schema` を確認する。旧v6.1だけならID参照層は未取得であり、架空のIDを補わない。
2. `source.id` / 音源ハッシュを照合し、参照先の解析ファイルを特定する。
3. `unified_timeline.time_index` からCUTと時間範囲が重なるIDを検索する。
4. IDを `references[id].pointer`（JSON Pointer）で元イベント/歌詞/SRT/構造行/motion窓へ解決する。
5. provenance・method・source_refs・confidence・timing_statusを確認する。
6. `review_items` のtarget_id / related_idsを確認し、必要な項目だけを制作側の確認リストへ引き継ぐ。

時間範囲はMaster先頭を0秒とする。瞬間イベントは開始=終了。
時間窓同士の重なりは `a.start < b.end && a.end > b.start`、瞬間点は `cut.start <= t < cut.end` として扱う。
SECTIONの範囲は所属歌詞の包絡であり、未照合/推定境界や無音を含み得る。音響的な区切りの確定値ではない。
時刻がない構造行は `references` にはあるが `time_index` にはない。

## コンテ側の最小フィールド

| フィールド | 内容 |
| --- | --- |
| `schema` | `mv_storyboard_references.v0.1` |
| `analysis_file` / `reference_schema` / `source_id` | 参照先の解析と対象音源 |
| `cuts[].cut_number` | CUT番号。制作側が採番 |
| `start_sec` / `end_sec` | 制作側が決めた開始/終了。Masterの範囲内 |
| `audio_event_ids` | 音響イベントIDの配列 |
| `lyric_line_ids` | 正規歌詞行IDの配列 |
| `section_ids` | SECTION構造行の安定ID。旧 `section_行番号` は使わない |
| `motion_window_ids` / `srt_ids` | 必要に応じた追加参照（任意） |
| `relations` | 制作側が選んだ音と歌詞/映像の関係 |
| `manual_review_ids` | 解析JSON内review_itemsのID。重要度は制作側で判断 |

`relations[]` は対象ID、`relation`、`delay_sec`、`decision_by`、`explanation` を持つ。
`relation` は `一致 / 無視 / 反転 / 遅延 / null`。nullは未決定であり失敗ではない。
`遅延` を選ぶ場合だけ、制作側が符号付き `delay_sec` と説明を記録する。
`decision_by` は判断した人/後段アプリを記録する。解析器が選択したことにしてはいけない。
必要なら映像側の動作説明をコンテ側へ追加できるが、音響側の観測値や正規歌詞を書き換えない。

## 例と整合性

`sample_storyboard_references_v0.7.json` は合成解析 `sample_music_analysis_v7.synthetic.json` の実在IDを参照する1CUT例。
関係は未決定のnullで、音が鳴るから映像を一致させるという判断を自動生成していない。
配列位置は永続IDとして使わない。手動時刻補正後は同じIDの最新の索引を再取得する。
再解析で音源/歌詞/解析器が変わる場合はIDが変わり得る。存在しないIDを時刻の近さだけで自動置換しない。

後段がどの解析状態を使ったか再現するには、解析JSON自体をコンテと一緒に保存する。
`initial_state` / `timing_origin` / `edit_history` / 元SRTから補正の由来を確認できる。

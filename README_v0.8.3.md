# MV Music Analyzer v0.8.3 — 改稿用JSON

v0.8.2のレビュー判断から、`needs_revision` のCUTだけを改稿への引き継ぎ用JSONに抽出します。コンテの自動改稿・演出案生成・時刻修正は行いません。既存の解析、差分検出、比較基準保存、通常検証、旧基準互換処理は変更していません。

## 操作

### その場でレビューした場合

1. 従来どおり比較し、影響CUTレビューで「要修正」を選びます。
2. 下の「改稿用JSON」に対象CUT数が反映されます。元コンテは読み込み済みのものを使います。
3. 「改稿用JSONを書き出す」を押します。レビューJSONの再選択は不要です。

### 保存済みレビューを使う場合

1. 「コンテJSON」に元コンテを読み込みます。すでに読み込み済みなら不要です。
2. 「改稿用JSON」の「レビューJSON」で `mv_impact_cut_review.v0.8.2` のファイルを選びます。
3. 対象数・エラーを確認し、「改稿用JSONを書き出す」を押します。

この抽出に解析JSONの再選択は不要です。レビュー内に記録された変更根拠をそのまま引き継ぎます。インポートしたレビューは、画面のレビューを操作しても勝手に置き換えません。切り替えるには「画面のレビューを使用」を押します。

`no_change`・`reviewed`・`unreviewed`（status未指定を含む）は対象外です。0件でも正常に書き出せます。判断や読み込みデータはこの画面のメモリ内で扱い、基準のIndexedDBには書き込みません。

## 出力

ファイル名：`mv_storyboard_revision_handoff_v0_8_3.json`

- `schema`: `mv_storyboard_revision_handoff.v0.8.3`
- `version`: `0.8.3`
- `source_review`: 入力レビューのschema・review_id。
- `baseline_saved_at`: レビューに記録された基準保存日時。
- `source_storyboard`: 元コンテのid/title/version（未指定はnull）とCUT数。
- `comparison`: レビュー内の比較件数・メタデータ指摘などを保持。
- `target_count`: 出力できる改稿対象数。
- `targets[]`: `cut_id`、表示用`cut_number`、`original_cut`、`review_status`、`review_entries`。
- `original_cut`: 元コンテの該当オブジェクト全体の複製。未知の追加項目も保持。構図・人物・動作・時刻・参照などを削除しません。改稿案ではありません。
- `review_entries`: 当該CUTの入力レビュー行を丸ごと保持。各行のeventsにイベントID、変更フィールドと前後値、time_shifts、review_candidates、authored_itemsが入ります。同一CUTの複数行はここに集約し、targetsを重複させません。
- `errors[]`: 対象CUTのcut_id、code、reason。
- `policy`: 元データを変更せず、改稿案を生成しない方針。

参照は `review.cut_id` と元CUTの `id`（存在しなければ従来の `cut`）の完全一致です。表示用番号・配列位置・似たCUTへの置き換えは行いません。見つからない場合はmissing_cut、元ID重複はambiguous_cut_id、同一CUTの判断矛盾はconflicting_review_statusです。画面に対象IDと理由を表示し、不完全な引き継ぎを避けるためエラーがある間は書き出しを無効にします。

元ファイルを直接読み込んだ場合は、検証用に追加した別名フィールドを含めず、ファイルにあったCUTをそのまま使います。保存済み基準から復元されたコンテを使う場合は、その保存済みCUTを元データとします。

## 互換性と検証

v0.8.2レビューJSONの読み込み・従来のレビューJSON書き出しを維持します。既存の比較結果と、storyboard_metadata_issues／analysis_comparison.issuesの分離は変更しません。レビュー・改稿JSONの出力で元コンテ・解析JSON・比較基準を変更しません。

テストA〜Eに加え、判断矛盾、元ID重複、未知項目保持、配列形式の元コンテ、画面レビューの再利用、v0.8.2レビューのインポート、0件書き出し、320px画面での表示を検証します。合成44CUT・211参照と指定イベントの影響CUTテストも維持します。

ユーザーが今回書き出した `mv_impact_cut_review_v0_8_2.json` は作業環境にありませんでした。明示的な合成レビューをno_changeに設定したテストを使用し、実ファイルでの検証とは区別しています。実44CUT・スマートフォン実機は未検証です。

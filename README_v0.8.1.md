# MV Music Analyzer v0.8.1

コンテと解析イベントの比較を分け、比較不能を差分0件と区別します。解析計算・既存コンテ検証・CUT本文・演出・参照IDは変更しません。解析スキーマ `mv_music_analysis.v6.1`、参照スキーマ `mv_music_analysis.references.v0.7.0`、コンテスキーマ `mv_storyboard.v0.7.1` は維持します。

## 保存形式

新しい比較基準は `mv_storyboard_baseline.v0.8.1`、ファイル名は `mv_storyboard_baseline_v0_8_1.json` です。

- `board`: 保存操作時のコンテ全体。そのまま保持します。
- `saved_at`: 保存日時。
- `snapshot_version: "1"`。
- `baseline.analysis`: 元解析schema、reference_schema、source_id、尺、エンジン条件、音源識別方法。
- `baseline.references`: 参照IDをキーとする値。kind、開始・終了、provenance、confidence、detail内のtype/source/source_id/method、分類・数値・motion metrics/primitivesなど、既存解析にある比較対象を保存します。欠落値を推測しません。Masterの識別はbaseline.analysis、個別Stemの識別はイベントのsource/source_idから追跡します。

元解析JSON全体は新基準に含めません。対象参照の値だけを保存します。コンテに元からある任意フィールドは削除しないため、入力コンテ自体の大きさに依存する部分は残ります。

IndexedDBへの保存とJSONバックアップ往復に対応します。再読込時はコンテと基準が復元されます。現在の解析JSONは改めて読み込んで比較してください。基準だけを現在解析とみなして自己比較しません。

## 比較結果

- `cut_changes`: CUTの追加・削除・内容変更。cut_idとcut_numberを表示。
- `event_changes`: `reference_added`（新規参照）、`reference_removed`（参照解除）、`event_deleted`（保存値はあるが現在解析から消失）、`unresolved_reference`（参照先不明）、`event_changed`（同一IDの値変更）。影響するCUT番号をaffected_cutsへ記録。
- event_changedの`fields`: 変更フィールドのパス、変更前後の値、フィールドの存在有無。
- `compared_reference_count`: 保存時・現在の参照IDの和集合の件数。参照の照合対象数です。
- `value_compared_reference_count`: 保存値と現在値があり、解析元の条件が一致して値比較できた件数。
- `stored_reference_count`: 保存済みスナップショット数。
- `unavailable_references`: 値を比較できない理由。
- `identity_changes`: 音源・解析条件の変更。これがある場合は単純な数値差分として比較せず、条件不一致を明示します。

状態は「比較済み・差分0件」「比較済み・差分あり」「一部比較不可」「解析値の比較不可」を区別します。参照0件／値比較0件を比較済みとは表示しません。コンテ検証結果は別欄のまま維持します。

## 旧基準と再作成

v0.7.1基準を読み込めます。保存済み参照値があればその値で比較します。参照値がない旧基準でも、トップレベルanalysisに保存当時の実データがあり、baseline.analysisの識別情報と一致すれば、元コンテが参照していた値を読み取り専用で取得します。現在の解析を過去の値として使いません。保存当時の値が取得できない場合は理由を明示して「解析値の比較不可」とします。古い基準を自動変換・更新しません。

最新の値を基準にするには、現在のコンテと解析JSONを読み込み、「比較基準を再作成（確認あり）」を選びます。確認を承認したときだけ新しい基準を保存します。初回レコードは保持し、直前の基準を履歴レコードにも保存します。履歴の選択UIはありません。旧版を別ファイルでも保管するには再作成前に書き出してください。別タブが基準を変更していた場合は再作成を中止し、無条件に上書きしません。

## 検証

Node回帰テストとEdgeの実ブラウザテストを実行します。合成44CUTでIndexedDB保存・再読込、スナップショット保持、バックアップ入出力、再作成のキャンセル／承認、初回基準の不変を確認します。単一イベントの時刻・種類・confidence・数値変更、影響CUT、参照追加／解除・イベント消失・不明、旧基準、条件変更、無変更・参照0件を回帰テストします。

実際の44CUTファイル・実音源・スマートフォン実機は未検証です。IDのないCUTはcutまたは位置で対応づけるため、並べ替え時の精度は安定IDを持つコンテより限定されます。ブラウザデータ削除への備えにはJSONバックアップを利用してください。

## 旧形式の実データ読み取り修正

比較基準のbaseline.referencesは参照値の事前抽出マップです。旧版ではこのマップが空でも、トップレベルanalysisに解析イベント本体とunified_timeline.referencesが保存されていました。比較処理は両者を区別して読みます。stored_reference_countは事前抽出マップの件数のまま、legacy_reference_countは保存済みanalysisから取得した件数、baseline_value_sourcesはIDごとの取得元と保存日時です。value_compared_reference_countは実際に比較した件数です。比較・書き出し時に旧基準を変更しません。

取得不能理由はmissing_snapshot_and_saved_analysis（保存データなし）、saved_analysis_identity_mismatch（保存元識別不一致）、reference_absent_from_saved_analysis（保存解析にIDがない）です。未取得値を推測しません。時刻はイベント本体を優先し、SECTION等の本体に時刻のない項目では索引の導出範囲を使います。

回帰テストには明示的な合成44CUT・211参照の旧形式を含め、211件の値比較、同一解析で差分0件、イベント本体の時刻変更による影響CUT検出、入力不変を検証します。ユーザーの指定日時の実JSONは作業環境にないため、そのファイル自体の検証とは区別します。

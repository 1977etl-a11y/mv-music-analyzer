# 独立コンテ参照仕様 v0.7.1

`storyboard_schema_v0_7_1.json` がデータ型の仕様、`MVStoryboard.validate(board, analysis)` が参照・時間・更新影響の検証です。未知の追加フィールドは保存時に削除しません。解析とコンテをセットで後段AIへ渡してください。

## 所有とID

`id / title / version` はコンテ全体の識別情報です。CUTの `id` は永続ID、`cut_number` は表示名です。新規コンテの作成者がUUID等の一意なIDを割り当て、並び替え・時刻編集・番号変更で再発行しません。旧形式の初回移行だけ、原コンテと原CUT・出現位置からv0.7のstableIdでIDを生成します。旧ファイル自体を編集して再移行した場合のID一致は保証しません。

解析イベントIDはv0.7.0規則をそのまま使用します。IDが安定していても値は変わり得るため、`baseline.references` に参照対象ごとの値を保存します。IDを推測して作成したり、近い時刻の別IDへ自動付け替えたりしません。

## CUT

`start_sec / end_sec` はMaster先頭から秒。`subjects` は被写体、`shot` はsize/composition/camera_direction、`actions` はsubject_id/initial_state/action/final_state。`review_status` はpending/reviewed、`uncertainties` は作者が保持する未確定事項です。任意画像はコンテ側の追加フィールドにURL/パスとして保持し、解析JSONへ埋め込みません。

`references[]`:

- `target_id`: 解析のunified_timeline.referencesに実在するID。
- `kind`: audio_event / motion_window / lyric_line / srt_cue / section。
- `source_range`: 保存した参照元の開始・終了。SECTIONは所属発声行から導出された索引上の範囲であり、発声時刻ではありません。
- `purpose`: action_start、action_peak、sustain、cut_change、contrast等の作者の自由記述。
- `cut_time_sec`: 使用するMaster時刻。省略時CUT開始。`timing.offset_sec` = 使用時刻 − 参照開始時刻。正は遅延、負は先行。`intentional:true` と説明、実時刻と一致するoffsetが揃う場合は意図的な指摘として扱います。
- `usage_status`: candidate / confirmed。数値confidenceが0.7未満または未定義のconfirmed使用を警告します。この閾値は確認用の方針で、解析の信頼度を再計算しません。文字列confidenceは保守的に未定量として確認対象にします。

`relations[]` は複数指定可。`relation` は一致/無視/反転/遅延/null、`targets[]` は `{type:"analysis"|"cut"|"motif", id}`、`decision_by` と `explanation` は作者の記述です。`delay_sec` は演出説明用です。時刻との機械的整合確認にはreferencesのtimingを用います。関係の妥当性・意味を解析器は判定しません。

`mappings[]` は `analysis_ids` と `concept / visual_action / diegetic_source / acoustic_relationship / decision_by / explanation`。元の音響根拠と選択した身体動作・世界内音源を分離します。

`motifs[]` はid,label,occurrences。各occurrenceのcut_id/state/action/meaningとprevious_cut_id/next_cut_idで連鎖を追跡します。意味は作者の説明であり、自動評価ではありません。

`transitions[]` のfrom_cut_id/to_cut_id/type(gap|overlap)/intentional/explanationで意図的な空白・重複を明示します。時刻は自動修正しません。全曲を覆うことは必須ではなく、先頭・末尾の余白は警告しません。

## 更新比較

`MVStoryboard.captureBaseline(board, analysis)` は新しいコンテオブジェクトを返します。元オブジェクトは変更しません。解析schema、reference_schema、source_id、尺、エンジン条件、参照identityを保存します。参照値は時刻、由来、confidence、分類、motion primitives、利用可能な数値等に限定します。フレーム列、audio_context全体、編集履歴は複製しません。

比較は値の正規化ハッシュ（v0.7 stableId、暗号学的保証なし）で行い、参照先消失・時刻・confidence・分類等の変更をCUTに関連づけます。解析生成日時や配列ポインタの変化だけでは変更としません。解析元/条件変更時は保守的に全CUTを確認対象にします。手動補正後の旧source_rangeを検出します。手動変更の来歴そのものは解析側initial_state/edit_historyへ辿ります。

`validate` の返り値は `issues[]`（code,cut_id,reference_id,severity,reason,recommended_check）と `affected_cut_ids`。severityはerror/warning/intentionalです。affectedには意図的な指摘を除いた確認対象CUTを含みます。重要度ランキングは付けません。

比較基準のないファイルはmissing_baselineです。最新解析から初めて基準を作っても過去との差分を検証したことにはなりません。既存基準はUIで自動更新しません。更新を承認した作者が、元版を保持した別バージョンのコンテで明示的に基準を更新してください。

## 最小入出力

実際に解決可能なIDを含む `sample_storyboard_v0_7_1.synthetic.json` を参照してください。インポート→検証→エクスポートでは新形式の内容をそのまま保持します。旧形式のみ互換フィールドを追加する移行が行われます。スキーマ検証と参照検証は補完関係で、ランタイム検証はJSON Schemaの全キーワードを実装するものではありません。

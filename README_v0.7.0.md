# MV Music Analyzer v0.7.0

既存の音響・Stem・9 motion primitives・歌詞/SRT解析に参照層を追加した静的PWAです。
映像演出や、音と歌詞の因果・意味的一致を決定する機能はありません。

## 既存実装と互換性

- `schema: mv_music_analysis.v6.1` と `*_music_analysis_v6_1.json` を維持します。
- v0.7.0の参照契約は `reference_schema: mv_music_analysis.references.v0.7.0` で識別します。
- `music_analysis_schema_v7.json` はこの追加契約を検証するDraft 2020-12スキーマです。
- 既存主要フィールドの名前・値の意味は維持します。新フィールドは追加です。
- v6.1の読取側は未知フィールドを無視できます。参照を使用する読取側は `reference_schema` を確認してください。
- 旧 `section_id` は従来の行位置由来の文字列です。削除しません。CUTの永続参照には新しい `section_ref`（SECTION行の `id`）を使います。
- `line_index` / 配列位置 / `source_line_number` は従来どおり残しますが、外部の永続参照キーとしては非推奨です。
- `audio_context` は従来の参照要約を維持します。時刻・種別の手動修正後に再計算します。
- サンプル旧v2のファイルは説明用であり、実音源の検証データではありません。

## 追加したデータ

| 場所 | 内容 |
| --- | --- |
| `source.id`, `source.content_sha256` | Masterの識別子とファイル内容ハッシュ。同じ項目をStem解析にも付加 |
| `audio_events.events` | 既存オンセット・検出拍・構造変化・Stemイベントと、既存RMSフレームから選択したエネルギー観測 |
| `audio_events.availability` | 未入力ソース、未計算の小節/中域オンセット、検出拍の有無 |
| `motion_primitives.windows[].id` | 既存時間窓の参照ID。9種類の計算と強度は変更しない |
| `lyric_timeline.entries[].id/section_ref/input_line_ref` | 歌詞行と元入力・セクションへの参照 |
| `input_structure.lines[].id/section_ref` | 原文行と所属セクションの安定参照 |
| `vocal_asr_timeline.entries[].id` | 外部SRT区間の識別子 |
| `lyric_asr_alignment.matches[].lyric_id/srt_ids/srt_cue_indices` | 照合結果から実際に使った歌詞・SRTへの参照 |
| `unmatched_vocal_events[].srt_id` | 未一致発声から元SRTへの参照 |
| `unified_timeline.references` | ID → 元データのJSON Pointer、時間範囲、種類、由来 |
| `unified_timeline.time_index` | 開始秒とIDでソートしたID列。時間不明の対象は含めない |
| `unified_timeline.sections` | 所属歌詞から導出した時間包絡。独立した音響セクション推定ではない |
| `review_items` | 対象ID、理由、確認方法。根拠のない優先順位は付けず `priority:null` |

同時刻に存在するという情報だけで、音響と歌詞を同じ意味のイベントへ統合しません。
索引はIDとPointerを保持し、元の本文・曲線・primitiveを索引内へ複製しません。
瞬間イベントは `start_sec === end_sec` です。範囲外/非数の検出点から新しいイベントを作りません。
既存フィールドに不正な時間範囲があれば元値を変更せず時間索引から外し、確認事項にします。

## 観測と推定の区別

- `observed`: デコード済みPCMから既存処理で計算したRMS/帯域比率。校正済みLUFSや現実世界の音圧ではありません。
- `estimated`: オンセット・検出拍・構造変化・Stem発声候補・motion窓・推定歌詞時刻。検出器の出力であり真値ではありません。
- `external_estimate`: 外部ASR SRTの時刻と、それに基づく歌詞照合。
- `manual`: ユーザーの入力/補正。
- `mixed_user_estimate`: 開始はユーザー時刻、終了は推定。

`confidence` は既存検出器の値/ラベルを保持し、不明ならnullです。異なる検出器間で校正された確率として比較できません。
RMS観測は既存motion窓の中央に最も近い実フレームを選択したものです。新しいアクセント検出器ではありません。
局所検出イベントは `scope:local_detector_event`、RMS標本は `scope:sampled_measurement`。
motion窓は索引上 `kind:motion_window` として独立し、オンセットイベントへ分割しません。
拍は既存 `beat_times_sec` だけを使用します。BPMから拍や小節頭を生成しません。
中域オンセットと小節グリッドは未計算です。欠落を空想のイベントで埋めません。

## 安定IDの規則

1. 入力バッファのSHA-256をWeb Cryptoで取得。既にデコード用に読んだバッファを使い、二重の音響解析は行いません。
2. ハッシュが利用不可ならファイル名・サイズ・尺・デコード時のsample rate/channelsを使用し、`metadata_identity`確認事項を出します。
3. 正規化JSON（オブジェクトキー順をソート、配列順は保持）をUTF-16 code unit列として、4個のFNV-1a 32bit状態でハッシュ。
   初期値は2166136261 / 2246822507 / 3266489909 / 668265263、乗数16777619。16進8桁×4を種類prefixへ連結します。
4. 音響IDはソースID・参照層版・解析器版/sample rate・イベント種類・算出方法・元時刻から生成。生成日時や乱数は使いません。
5. motion IDは同じ解析条件と元窓境界/basis/phrase幅から生成。
6. 歌詞/構造行はMaster ID・物理行番号・原文を使います。セクション所属や手動時刻はIDに含めません。
7. SRT IDはMaster ID・元開始/終了・raw_text。完全重複cueだけは出現回数で区別します。

同一入力・同一条件・同一検出結果で再現します。通常の検出点やSRT配列を並べ替えてもIDは変わりません。
音源内容、解析器版、検出時刻が変われば音響IDは変わり得ます。歌詞の行挿入/原文変更は行IDに影響します。
metadata fallbackでは同じメタデータの別音源を区別できません。IDハッシュは暗号学的な同一性の証明ではありません。
JSON内のID衝突は参照層生成エラーとして扱います。完全同一の音響検出点は1イベントへ重複排除します。

## 手動補正・確認事項

歌詞には初回の `initial_state` を保持します。SRT適用前の仮配置は `timing_origin` に残します。
編集のたびに `edit_history` へ変更種別・before/afterを追加。元SRTと照合結果も残します。
補正しても歌詞IDは変えず、索引時刻・セクション包絡・確認事項・audio_contextを更新します。
分類だけの補正で推定時刻を手動確定扱いにはしません。再解析すると編集履歴は新しい解析になります。

確認対象は曖昧構造、文脈由来の見出し、発声分類候補、低信頼度SRT一致、未一致歌詞/SRT、推定歌詞時刻、
Stem尺差、Vocals未入力時の仮配置、実拍なしの窓、定量confidence未取得などです。
定量confidence欠如はソース/検出方式単位でまとめ、`related_ids` に対象を列挙します。
重要度を自動決定しません。必要なCUTが参照する対象を制作側で選んで確認します。

## 見出しの改善

未知のタイトルも、括弧形式・タイトル形・既存見出しとの形式一致・後続発声行・孤立した注記付き見出しを組み合わせます。
Final/Repriseを単語辞書へ追加する修正ではありません。時刻タグ付きの後続歌詞も文脈として認識します。
掛け声・反復音節・文としての手掛かりを優先し、根拠が不足すればAMBIGUOUSを維持。
推定見出しはmediumと根拠を保持し、reviewにも残します。短い括弧語の意味は完全には判別できません。

## 実行・検証・性能

```text
node --test tests/*.test.cjs
node tests/measure-references.cjs sample_music_analysis_v7.synthetic.json sample_storyboard_references_v0.7.json
python tests/validate-schema.py
node tests/browser-smoke.cjs
```

通常テストはNode標準機能のみ。任意のschema検証はjsonschema>=4.23、ブラウザ検証はPlaywrightが必要。
`node --expose-gc tests/measure-references.cjs` ではGC後の保持heap差分も出力します（ピークメモリではありません）。
`PLAYWRIGHT_MODULE` と `BROWSER_CHANNEL` で外部のテスト用環境を指定できます。本番PWA依存関係の追加ではありません。
実解析JSON/「笑って蹴るわ」の音源・SRTはリポジトリにないため、例と新規テストは合成データです。
既存解析器の精度を実音源で検証したとは主張しません。

合成180秒（オンセット720件）の計測例: 参照追加約19ms、compact JSON約251KB→943KB。
合成600秒（2400件）: 約58ms、818KB→3.12MB。値は検証PCの一例で、端末・イベント数で変動します。
これは参照層のみの時間で、DSP・ファイルSHA・JSON文字列化は含みません。スマートフォン実機性能は未測定。
イベント数に比例する保持メモリと索引ソートが追加されます。重いDSPの再実行はありません。
画面はイベント10件/確認事項20件を表示し、JSONプレビューでは大きい参照配列を件数へ置換。保存/共有には全件を含めます。
Service Worker cacheをv0.7.0へ更新し、references.jsとv7スキーマをapp shellへ追加しています。

後段CUTの仕様は `STORYBOARD_REFERENCE_v0.7.0.md` を参照してください。

この変更での検証結果: Node回帰33件成功、合成JSONのv6.1/v7両schema検証成功。
Edge 153 / 390×844のブラウザテストで参照UI、手動編集、JSON保存、SWオフライン再読込を確認。
合成1秒WAVの44.1kHzデコードとSHA-256一致も確認しました。CDN解析器を使う実楽曲の解析精度検証ではありません。

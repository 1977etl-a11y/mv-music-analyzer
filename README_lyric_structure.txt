MV Music Analyzer v0.6.2 — 歌詞構造・発声分類修正

互換性
schema mv_music_analysis.v6.1、保存名 *_music_analysis_v6_1.json、既存トップレベル項目を維持。
音響・Stem・motion primitivesの解析処理は変更していない。
lyric_timeline.entries は発声行を格納する。line_index は従来どおり0始まりの連番。
見出し・指示・曖昧行を除いた後の連番になるため、原文の位置参照には追加の
source_line_number（空行も数える1始まりの物理行番号）を使う。
入力[INST]は演奏指示として構造情報へ移し、歌唱時刻を割り当てない。
手動種別選択の既存INSTRUMENTALは互換性のため残す。

追加情報
lyric_timeline.input_structure:
  source_text: 入力全文（空行・括弧・空白を保持）
  lines: 非空行のraw_text / source_line_number / text / kind /
         section_id / structure_confidence / structure_evidence 等
  kind: SECTION / DIRECTIVE / VOCAL_LINE / AMBIGUOUS
  SECTIONにsection_label、VOCAL_LINEにline_indexとclassificationを持つ。
  構造行には歌唱開始・終了時刻を生成しない。セクション時間範囲も推定しない。
entries に source_line_number / raw_text / section_id / classification / timing_status を追加。
classification は明示タグ・手動指定を優先し、テキストだけの推定はcandidatesへ保持。
タグなしのtypeはLYRICを維持し、候補をSCAT等の確定分類へ置換しない。
classificationのconfidenceはヒューリスティックであり認識確率ではない。
timing_status:
  estimated: 発声候補分布または曲尺から仮配置
  user_start_estimated_end: 開始のみ明示時刻、終了は推定
  srt_candidate: 外部SRTとの文字列類似照合（forced alignmentではない）
  manual: 時刻をユーザーが補正
発声種別だけの補正では推定時刻をmanualへ変更しない。

判定と修正
行全体の括弧、Markdown見出し、構成語、短い構成ラベル、番号付きタイトル、
指示文形、発声的な文・反復音節、前後の空行や後続内容を参照する。
固定のセクション名だけに依存しない。未知の括弧行は根拠が不足すればAMBIGUOUS。
括弧内の掛け声や文は発声行として保持。曖昧行も構造情報と画面に原文を残す。
見出し内のscat/ad-lib等は後続発声行の弱い分類根拠であり、見出し自身を歌唱しない。

誤判定は入力行頭に [SECTION] / [DIRECTIVE] / [AMBIGUOUS] /
[LYRIC] / [SCAT] / [VOCAL] / [BREATH] を付けて再解析する。
時刻タグを併記する場合は [00:12.30] [LYRIC] 本文 の順。
解析結果の発声種別・開始秒・終了秒は既存編集欄で補正できる。
再解析すると手動補正は作り直されるため、必要なら開始時刻を入力タグへ移す。

制約・再解析
自動判定はテキスト上の候補。括弧内の短い語などは自動で断定できない。
曖昧行はSRT照合や時刻配分に参加しないため、実際に歌う場合は明示タグで指定する。
実ASR・単語同期・forced alignmentは未実装。SRT照合の誤一致は残り得る。
元のJSONは自動修復されない。見出しが混入した結果は元音源・歌詞・SRTで再解析が必要。

検証
node --test tests/stabilization.test.cjs
既存11件に構造解析・分類・同期・編集の回帰ケースを追加。
「笑って蹴るわ」の実歌詞全文・SRTは未提供のため、提示された見出しと短い合成例を使用。
特定曲の全文や時刻を推測してテストデータにはしていない。
実ブラウザ・実音源・スマートフォン・Pages公開はこの変更では未検証。

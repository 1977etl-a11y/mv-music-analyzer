MV Music Analyzer v0.2 設計メモ
================================

音源
↓
Web Audio APIでPCM化 / 44.1kHz / mono
↓
┌ Essentia.js
│  ├ Key / Scale
│  ├ RhythmExtractor2013（クロスチェック）
│  └ SuperFlux/Onset（フォールバック）
│
├ @audio/beat
│  ├ beat timestamps
│  ├ onset timestamps
│  ├ BPM + confidence
│  ├ low-band energy onsets
│  └ high-band energy onsets
│
└ Browser DSP
   ├ low/mid/high band curves
   ├ loudness curve
   └ feature-change heuristic
↓
music_analysis.v2
↓
GPT + 意味変質型MVプロトコル
↓
曲固有フック抽出
→ 音響―世界内写像
→ 意味ビート
→ CUT
→ マルチショット
→ ショットサイズ/被写体カバレッジ

注:
低域accent = 「ベース」や「キック」と断定しない。
高域accent = 「ハイハット」「ヒール」と断定しない。
信号特徴を候補としてGPT側へ渡し、歌詞・聴感・世界設定と照合する。

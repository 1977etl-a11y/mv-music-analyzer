const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function host(){
  const el={addEventListener(){}};
  const h=vm.createContext({document:{getElementById:()=>el},navigator:{},console,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(root,'references.js'),'utf8'),h);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),h);
  return {run:s=>vm.runInContext(s,h),context:h};
}
function fixture(duration=12){
  const h=host();h.context.duration=duration;
  return JSON.parse(JSON.stringify(h.run(`(()=>{
    const text='【Bridge】\\nDaba-daba…\\n【Final】\\n笑って蹴るわ\\n【Reprise - Soft S（新規追加）】\\n[00:08.00] 君が好き\\n【春の影】';
    const curves=Array.from({length:Math.floor(duration*4)},(_,i)=>({t:i*.25+.125,loudness_db:-20,low_ratio:.6,mid_ratio:.3,high_ratio:.1}));
    const onsets=Array.from({length:Math.floor(duration*4)},(_,i)=>i*.25+.1);
    const beats=Array.from({length:Math.floor(duration*2)},(_,i)=>i*.5+.2);
    const motion=buildMotionPrimitiveLayer({duration,bpm:120,beats,onsets,lowOnsets:[],highOnsets:[],curves,sections:[],stemAnalysis:{}});
    const cues=parseSrt('1\\n00:00:01,000 --> 00:00:02,000\\nDaba-daba…\\n\\n2\\n00:00:04,000 --> 00:00:05,000\\n笑って蹴るわ\\n\\n3\\n00:00:09,000 --> 00:00:10,000\\n未記載の声',duration);
    const alignment=buildAsrLyricAlignment(text,cues,duration);
    const lyrics=buildLyricTimeline({text,vocalEvents:[],duration,motionPrimitives:motion});applySrtAlignment(lyrics,alignment,text,motion);
    return {schema:'mv_music_analysis.v6.1',generated_at:'2026-01-01T00:00:00Z',engine:{frontend:'MV Music Analyzer 0.7.0',essentia_js:'0.1.3',audio_beat:'2.1.3',analysis_sample_rate_hz:44100},
      source:{file_name:'synthetic.wav',file_size_bytes:1234,duration_sec:duration,source_sample_rate_hz:44100,source_channels:1},
      rhythm:{bpm:120,selected_engine:'synthetic_detector',confidence:.8,beat_times_sec:beats},onset:{selected_method:'synthetic_detector',onset_times_sec:onsets,low_band_onset_times_sec:[],high_band_onset_times_sec:[]},
      dynamics_and_bands:{curves},stems:{analysis:{}},section_change_candidates:{method:'heuristic_feature_change',candidates:[]},motion_primitives:motion,
      lyric_timeline:lyrics,vocal_asr_timeline:{entries:cues},lyric_asr_alignment:alignment,
      unified_timeline:{rule:'Independent streams on shared time axis',lyric_entry_count:lyrics.entries.length,motion_window_count:motion.windows.length},warnings:[]};
  })()`)));
}
module.exports={host,fixture};

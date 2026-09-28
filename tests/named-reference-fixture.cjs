// Synthetic CUT with IDs that really resolve in the checked-in analysis JSON.
const a=require('../sample_music_analysis_v7.synthetic.json');
const id=kind=>Object.keys(a.unified_timeline.references).find(key=>a.unified_timeline.references[key].kind===kind);
module.exports=()=>({cut:'CUT23',id:'named_cut',cut_number:'CUT23',block:'synthetic',start_sec:1,end_sec:2,
  references:[],lyric_refs:[{lyric_id:id('lyric_line'),purpose:'lyric_relation'}],
  srt_refs:[id('srt_cue')],motion_refs:[{window_id:id('motion_window')}],
  audio_event_refs:[{audio_event_id:id('audio_event')}],review_refs:[{review_id:a.review_items[0].id}],
  direction:{action:'unchanged',notes:['preserve all source fields']}});

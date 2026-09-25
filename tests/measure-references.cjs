// Synthetic inputs only. Measures reference enrichment, not DSP or browser/mobile performance.
const {performance}=require('node:perf_hooks');
const {fixture}=require('./reference-fixture.cjs');
const {enrich}=require('../references.js');
const fs=require('node:fs');
const results=[];
for(const seconds of [12,180,600]){
  const data=fixture(seconds),before=Buffer.byteLength(JSON.stringify(data));
  if(global.gc)global.gc();const heapBefore=process.memoryUsage().heapUsed;
  const start=performance.now();enrich(data);const elapsed=performance.now()-start;
  if(global.gc)global.gc();const retainedHeapDelta=global.gc?process.memoryUsage().heapUsed-heapBefore:null;
  results.push({synthetic_seconds:seconds,onsets:data.onset.onset_times_sec.length,events:data.audio_events.events.length,
    base_json_bytes:before,reference_json_bytes:Buffer.byteLength(JSON.stringify(data)),enrichment_ms:Number(elapsed.toFixed(2)),retained_heap_delta_bytes:retainedHeapDelta});
  if(seconds===12&&process.argv[2]){
    data.example_metadata={synthetic:true,description:'Fabricated detector outputs for reference-layer tests; not a real song analysis.'};
    fs.writeFileSync(process.argv[2],JSON.stringify(data,null,2)+'\n');
    if(process.argv[3]){
      const lyric=data.lyric_timeline.entries[0],event=data.audio_events.events.find(e=>e.type==='onset'&&e.start_sec>=1&&e.start_sec<=2);
      const storyboard={schema:'mv_storyboard_references.v0.1',example_only:true,analysis_file:process.argv[2],reference_schema:data.reference_schema,source_id:data.source.id,
        cuts:[{cut_number:'CUT001',start_sec:1,end_sec:2,audio_event_ids:[event.id],lyric_line_ids:[lyric.id],section_ids:[lyric.section_ref],
          relations:[{audio_event_id:event.id,lyric_line_id:lyric.id,relation:null,delay_sec:null,decision_by:null,explanation:'演出判断は未決定。参照の重なりだけでは一致を意味しない。'}],
          manual_review_ids:data.review_items.filter(r=>r.target_id===lyric.id).map(r=>r.id)}]};
      fs.writeFileSync(process.argv[3],JSON.stringify(storyboard,null,2)+'\n');
    }
  }
}
console.log(JSON.stringify(results,null,2));

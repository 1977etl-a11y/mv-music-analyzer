// Explicitly synthetic 44 CUT / 211 references with the user-reported test ID and times.
const R=require('../references'),S=require('../storyboard'),{fixture}=require('./reference-fixture.cjs');
module.exports=()=>{
 const analysis=fixture(60);R.enrich(analysis);
 const ids=Object.keys(analysis.unified_timeline.references).filter(id=>analysis.unified_timeline.references[id].kind==='audio_event').slice(0,211);
 const eventId='audio_046374677ed4c2adcbc94bd7e65e2ae9',previous=ids[1],target=S.resolve(analysis,previous);
 target.value.id=eventId;target.value.start_sec=2.3917;target.value.end_sec=2.3917;
 analysis.unified_timeline.references[eventId]={...target.ref,start_sec:2.3917,end_sec:2.3917};delete analysis.unified_timeline.references[previous];ids[1]=eventId;
 const board={schema:S.SCHEMA,cuts:Array.from({length:44},(_,i)=>({id:'cut_'+i,cut_number:'CUT '+String(i+1).padStart(2,'0'),start_sec:i,end_sec:i+1,references:ids.filter((_,j)=>j%44===i).map(target_id=>({target_id,kind:'audio_event',purpose:'action_start'})),actions:[{subject_id:'synthetic_subject',initial_state:'still',action:'turn'}],shot:{camera_direction:'front'}}))};
 const baseline={schema:'mv_storyboard_baseline.v0.8.1',snapshot_version:'1',saved_at:'2026-01-01T00:00:00Z',board,baseline:S.captureBaseline(board,analysis).baseline};
 const updated=JSON.parse(JSON.stringify(analysis));S.resolve(updated,eventId).value.start_sec=2.6917;S.resolve(updated,eventId).value.end_sec=2.6917;
 return {analysis,board,baseline,updated,eventId,secondId:ids[45]};
};

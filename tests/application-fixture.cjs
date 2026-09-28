const ids=require('../sample_revision_handoff_v0_8_3.synthetic.json').targets[0].original_cut.references.map(r=>r.target_id);
function analysis(){const events=ids.map(id=>({id,start_sec:1,end_sec:1,confidence:1,type:'synthetic'}));return {schema:'synthetic',source:{duration_sec:100},audio_events:events,unified_timeline:{references:Object.fromEntries(events.map((e,i)=>[e.id,{kind:'audio_event',pointer:'/audio_events/'+i,start_sec:1,end_sec:1,provenance:'estimate'}]))}};}
module.exports={analysis};

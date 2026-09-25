const test=require('node:test'),assert=require('node:assert/strict');
const {enrich,state,recordEdit}=require('../references.js');
const {host,fixture}=require('./reference-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const pointer=(data,p)=>p.split('/').slice(1).reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],data);
function verify(data){
  const refs=data.unified_timeline.references,d=data.source.duration_sec;
  for(const [id,r] of Object.entries(refs)){
    const target=pointer(data,r.pointer);assert.ok(target,id);assert.equal(target.id,id);
    if(r.start_sec!=null)assert.ok(r.start_sec>=0&&r.end_sec>=r.start_sec&&r.end_sec<=d,id);
  }
  for(const id of data.unified_timeline.time_index)assert.ok(refs[id]&&refs[id].start_sec!=null);
  for(const item of data.review_items){assert.ok(refs[item.target_id]);for(const id of item.related_ids||[])assert.ok(refs[id]);assert.equal(item.priority,null);}
  for(const e of data.audio_events.events){assert.ok(refs[e.source_id]);for(const p of e.source_refs)assert.notEqual(pointer(data,p),undefined,p);}
  for(const m of data.lyric_asr_alignment.matches){assert.ok(refs[m.lyric_id]);for(const id of m.srt_ids)assert.ok(refs[id]);}
  for(const e of data.lyric_timeline.entries){if(e.section_ref)assert.ok(refs[e.section_ref]);if(e.input_line_ref)assert.ok(refs[e.input_line_ref]);}
}
test('unknown Final/Reprise headings use structural context and update membership without consuming SRT',()=>{
  const d=enrich(fixture());verify(d);
  const rows=d.lyric_timeline.input_structure.lines;
  assert.deepEqual(rows.filter(r=>r.kind==='SECTION').map(r=>r.section_label),['Bridge','Final','Reprise - Soft S（新規追加）']);
  assert.equal(d.lyric_timeline.entries.length,3);
  assert.equal(new Set(d.lyric_timeline.entries.map(e=>e.section_ref)).size,3);
  assert.deepEqual(d.lyric_asr_alignment.matches.map(m=>m.start_sec),[1,4]);
  assert.equal(rows[rows.length-1].kind,'AMBIGUOUS');
});
test('contextual headings do not capture bracketed lyrics or calls',()=>{
  const h=host();
  for(const s of ['【Hey】','【ラララ…】','【君が好き】','[I love you]','（Final）']){
    h.context.input='【Bridge】\n声を届ける\n'+s+'\n次の歌';
    const row=h.run('parseLyricStructure(input).lines[2]');assert.notEqual(row.kind,'SECTION',s);
  }
  assert.equal(h.run(`parseLyricStructure('【Final】').lines[0].kind`),'AMBIGUOUS');
  assert.equal(h.run(`parseLyricStructure('【Reprise - Soft S（新規追加）】\\n声を届ける').lines[0].kind`),'SECTION');
});
test('IDs repeat across runs, timestamp generation and array reordering',()=>{
  const original=fixture(),a=enrich(clone(original)),b=clone(original);
  b.generated_at='different';b.onset.onset_times_sec.reverse();b.motion_primitives.windows.reverse();b.vocal_asr_timeline.entries.reverse();enrich(b);
  assert.deepEqual(a.audio_events.events.map(x=>x.id).sort(),b.audio_events.events.map(x=>x.id).sort());
  assert.deepEqual(a.motion_primitives.windows.map(x=>x.id).sort(),b.motion_primitives.windows.map(x=>x.id).sort());
  assert.deepEqual(a.vocal_asr_timeline.entries.map(x=>x.id).sort(),b.vocal_asr_timeline.entries.map(x=>x.id).sort());verify(a);verify(b);
  const oldIds=Object.keys(a.unified_timeline.references).sort();enrich(a);assert.deepEqual(Object.keys(a.unified_timeline.references).sort(),oldIds);
});
test('source and detector condition changes affect audio identity; lyrics do not',()=>{
  const a=fixture(),b=fixture();b.source.content_sha256='changed-content';
  assert.notEqual(enrich(a).audio_events.events[0].id,enrich(b).audio_events.events[0].id);
  const c=fixture();c.engine.essentia_js='different';assert.notEqual(enrich(c).audio_events.events[0].id,a.audio_events.events[0].id);
  const d=fixture();d.lyric_timeline.entries[0].text='different';assert.deepEqual(enrich(d).audio_events.events.map(x=>x.id),a.audio_events.events.map(x=>x.id));
});
test('observations are RMS samples, detector events are estimates, windows are not onsets',()=>{
  const d=enrich(fixture());verify(d);
  assert.ok(d.audio_events.events.some(e=>e.provenance==='observed'&&e.type==='energy_sample'));
  assert.ok(d.audio_events.events.filter(e=>e.type==='onset').every(e=>e.provenance==='estimated'&&e.scope==='local_detector_event'));
  assert.equal(d.audio_events.events.filter(e=>e.type==='onset').length,d.onset.onset_times_sec.length);
  assert.ok(d.motion_primitives.windows.every(w=>Object.keys(w.primitives).length===9&&d.unified_timeline.references[w.id].kind==='motion_window'));
});
test('outside/invalid detector points are not made into reference events',()=>{
  const d=fixture();d.onset.onset_times_sec.push(-1,Infinity,NaN,20);enrich(d);verify(d);
  assert.ok(d.audio_events.events.every(e=>e.start_sec>=0&&e.end_sec<=12));
});
test('no stems, lyrics, or SRT still yields honest audio references',()=>{
  const d=fixture();d.lyric_timeline={entries:[]};d.vocal_asr_timeline={entries:[]};d.lyric_asr_alignment={matches:[],unmatched_vocal_events:[]};enrich(d);verify(d);
  assert.ok(d.audio_events.events.length>0);assert.deepEqual(d.audio_events.availability.sources,['Master']);
  assert.equal(d.audio_events.availability.mid_band_onsets,'not_computed');assert.equal(d.audio_events.availability.bar_grid,'not_computed');
});
test('stems reuse existing events; no offset adjustment or invented source',()=>{
  const d=fixture();d.stems.analysis.vocals={file_name:'v.wav',duration_sec:12,alignment_status:'check_required',event_candidates:[{time_sec:1,type:'unknown_vocal_event',confidence:'candidate',local_loudness_db:-24},{time_sec:15,type:'unknown_vocal_event'}]};enrich(d);verify(d);
  assert.equal(d.audio_events.events.filter(e=>e.source==='Vocals').length,1);
  assert.ok(d.review_items.some(x=>x.kind==='stem_alignment'));
});
test('no detected beats does not create a synthetic beat grid',()=>{
  const d=fixture();d.rhythm.beat_times_sec=[];enrich(d);verify(d);
  assert.equal(d.audio_events.events.filter(x=>x.type==='detected_beat').length,0);
  assert.ok(d.review_items.some(x=>x.kind==='no_detected_beats'));
});
test('manual edits preserve identity, original state, SRT origin, and refresh section ranges',()=>{
  const d=enrich(fixture()),e=d.lyric_timeline.entries[0],id=e.id,initial=clone(e.initial_state),before=state(e);
  e.start_sec=2;e.end_sec=3;e.alignment_method='manual';e.timing_status='manual';e.manual_corrected=true;recordEdit(e,before,'timing');enrich(d,{rebuildAudio:false});verify(d);
  assert.equal(e.id,id);assert.deepEqual(e.initial_state,initial);assert.equal(e.timing_origin.timing_status,'estimated');
  assert.equal(e.edit_history[0].before.start_sec,1);assert.equal(d.unified_timeline.references[id].provenance,'manual');
  assert.equal(d.unified_timeline.sections[0].start_sec,2);
  assert.ok(d.lyric_asr_alignment.matches[0].srt_ids.length);
});
test('existing field values and downstream access remain unchanged by enrichment',()=>{
  const d=fixture(),before=clone(d);enrich(d);
  assert.equal(d.schema,'mv_music_analysis.v6.1');assert.equal(d.unified_timeline.rule,before.unified_timeline.rule);
  assert.deepEqual(d.rhythm,before.rhythm);assert.deepEqual(d.onset,before.onset);assert.deepEqual(d.dynamics_and_bands,before.dynamics_and_bands);
  assert.deepEqual(d.motion_primitives.windows.map(x=>x.primitives),before.motion_primitives.windows.map(x=>x.primitives));
  assert.deepEqual(d.lyric_timeline.entries.map(x=>[x.text,x.start_sec,x.end_sec,x.type]),before.lyric_timeline.entries.map(x=>[x.text,x.start_sec,x.end_sec,x.type]));
});

test('review IDs cover uncertainty and resolve even after timing edits',()=>{
  const d=fixture();d.lyric_asr_alignment.matches[0].confidence='low';enrich(d);verify(d);
  for(const kind of ['ambiguous_structure','structure_candidate','vocal_classification','low_srt_match','unmatched_lyric','unmatched_srt','estimated_lyric_time','unquantified_event_confidence'])assert.ok(d.review_items.some(r=>r.kind===kind),kind);
});

test('checked-in storyboard example refers to real IDs and does not decide a relation',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../sample_music_analysis_v7.synthetic.json'),'utf8'));
  const s=JSON.parse(fs.readFileSync(path.join(__dirname,'../sample_storyboard_references_v0.7.json'),'utf8'));
  verify(d);assert.equal(d.example_metadata.synthetic,true);assert.equal(s.source_id,d.source.id);
  for(const cut of s.cuts){
    assert.ok(cut.start_sec>=0&&cut.end_sec<=d.source.duration_sec);
    for(const id of [...cut.audio_event_ids,...cut.lyric_line_ids,...cut.section_ids])assert.ok(d.unified_timeline.references[id]);
    for(const id of cut.manual_review_ids)assert.ok(d.review_items.some(r=>r.id===id));
    assert.ok(cut.relations.every(r=>r.relation===null&&r.decision_by===null));
  }
});

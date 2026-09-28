const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../storyboard'),R=require('../references'),a=require('../sample_music_analysis_v7.synthetic.json'),cut=require('./named-reference-fixture.cjs');
const h=vm.createContext({MVStoryboard:S,MVReferences:R});vm.runInContext(fs.readFileSync(require.resolve('../storyboard-baseline.js'),'utf8'),h);const B=h.MVStoryboardBaseline;
const board=()=>({schema:S.SCHEMA,id:'named',title:'Named reference fixture',version:'1',cuts:[cut()]});
test('all five named fields survive import and resolve to actual analysis data',()=>{
 const raw=board(),b=S.importJSON(JSON.stringify(raw));assert.deepEqual(b,raw);
 const refs=S.extractReferences(b.cuts[0]).references;assert.equal(refs.length,5);
 for(const r of refs){assert.equal(S.snapshot(a,r.target_id).kind,r.kind);}
 const report=S.validate(b,a);assert.equal(report.reference_count,5);assert.ok(!report.issues.some(i=>i.code==='missing_reference'||i.code==='reference_kind'));
 assert.equal(Object.keys(S.captureBaseline(b,a).baseline.references).length,5);
});
test('missing named IDs and malformed entries are reported rather than silently ignored',()=>{
 const b=board();b.cuts[0].audio_event_refs.push('missing');b.cuts[0].review_refs.push({unexpected:'invalid'});
 const issues=S.validate(b,a).issues;assert.ok(issues.some(i=>i.code==='missing_reference'&&i.reference_id==='missing'));assert.ok(issues.some(i=>i.code==='invalid_reference'));
});
test('old baseline without snapshots is explicitly incomparable and never reconstructed',()=>{
 const b=board(),record={schema:'mv_storyboard_baseline.v0.7.1',board:b,analysis:a,baseline:{analysis:S.identity(a),references:{}},saved_at:'2026-01-01T00:00:00Z'};
 const before=JSON.stringify(record),result=B.compare(record,b,a);
 assert.equal(result.compared_reference_count,5);assert.equal(result.value_compared_reference_count,0);assert.equal(result.analysis_status,'解析値の比較不可');assert.equal(JSON.stringify(record),before);assert.equal(B.check(record),record);
});
test('v0.8.1 compact snapshot round trip and unchanged comparison',()=>{
 const b=board(),record=B.create(b,a);assert.equal(record.schema,'mv_storyboard_baseline.v0.8.1');assert.equal(record.analysis,undefined);assert.equal(JSON.stringify(record.board),JSON.stringify(b));assert.equal(Object.keys(record.baseline.references).length,5);
 const result=B.compare(B.check(JSON.parse(JSON.stringify(record))),b,a);assert.equal(result.value_compared_reference_count,5);assert.equal(result.analysis_status,'比較済み・差分0件');assert.equal(result.cut_changes.length,0);
});
test('one changed event reports values and affected CUT separately',()=>{
 const b=board(),record=B.create(b,a),updated=structuredClone(a),id=S.extractReferences(b.cuts[0]).references.find(r=>r.kind==='audio_event').target_id;
 const event=S.resolve(updated,id);event.value.numbers={strength:.123};event.value.type='changed_type';event.value.confidence=.111;event.ref.start_sec+=.25;
 const before=JSON.stringify(record),result=B.compare(record,b,updated),change=result.event_changes.find(e=>e.change==='event_changed');
 assert.equal(result.cut_changes.length,0);assert.equal(result.event_changes.length,1);assert.equal(change.reference_id,id);assert.equal(change.affected_cuts[0].cut_number,'CUT23');assert.ok(change.fields.some(f=>f.field==='start_sec'));assert.ok(change.fields.some(f=>f.field==='confidence'));assert.ok(change.fields.some(f=>f.field.startsWith('detail.numbers')));assert.ok(change.fields.some(f=>f.field==='detail.type'));assert.equal(JSON.stringify(record),before);
});
test('reference addition/removal, event deletion and unresolved targets stay distinct',()=>{
 const b=board(),record=B.create(b,a),current=structuredClone(b),updated=structuredClone(a),id=current.cuts[0].srt_refs[0];
 current.cuts[0].review_refs=[];current.cuts[0].audio_event_refs.push('unknown');delete updated.unified_timeline.references[id];
 const changes=B.compare(record,current,updated).event_changes.map(e=>e.change);
 for(const expected of ['reference_added','reference_removed','event_deleted','unresolved_reference'])assert.ok(changes.includes(expected));
});
test('changed source or analysis conditions blocks numeric comparison',()=>{
 const b=board(),record=B.create(b,a),updated=structuredClone(a);updated.source.id='different';
 const result=B.compare(record,b,updated);assert.equal(result.value_compared_reference_count,0);assert.match(result.analysis_status,/音源・解析条件/);assert.ok(result.identity_changes.length>0);
});
test('canonical references and identical named aliases are counted once',()=>{
 const c=cut();c.references=[{target_id:c.srt_refs[0],kind:'srt_cue',purpose:'未指定'}];assert.equal(S.extractReferences(c).references.length,5);
});

test('legacy populated snapshot remains usable and zero references never means compared',()=>{
 const b=board(),record=B.create(b,a);record.schema='mv_storyboard_baseline.v0.7.1';record.analysis=a;
 assert.equal(B.compare(B.check(record),b,a).analysis_status,'比較済み・差分0件');
 const empty={...b,cuts:[{id:'empty',cut_number:'CUT1',start_sec:0,end_sec:1}]},base=B.create(empty,a);
 assert.equal(B.compare(base,empty,a).analysis_status,'解析値の比較不可');assert.equal(B.compare(base,empty,a).value_compared_reference_count,0);
});

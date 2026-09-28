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
test('empty old baseline derives only from archived analysis without writing any input',()=>{
 const b=board(),record={board:b,analysis:a,baseline:{analysis:S.identity(a),references:{}},saved_at:'2026-01-01T00:00:00Z'};
 const before=JSON.stringify(record);const result=B.compare(record,b,a);
 assert.equal(result.compared_reference_count,5);assert.equal(result.stored_reference_count,0);assert.equal(result.derived_reference_count,5);assert.equal(JSON.stringify(record),before);
 const updated=structuredClone(a),event=S.extractReferences(b.cuts[0]).references.find(r=>r.kind==='audio_event');S.resolve(updated,event.target_id).value.confidence=.001;
 assert.ok(B.compare(record,b,updated).analysis_comparison.issues.some(i=>i.code==='analysis_changed'));assert.equal(JSON.stringify(record),before);
});
test('new or unavailable original references are never inferred from current analysis',()=>{
 const b=board(),old=structuredClone(b);old.cuts[0].review_refs=[];
 const record={board:old,analysis:a,baseline:{analysis:S.identity(a),references:{}},saved_at:'2026-01-01T00:00:00Z'};
 const result=B.compare(record,b,a);assert.equal(result.compared_reference_count,4);assert.ok(result.analysis_comparison.issues.some(i=>i.code==='missing_baseline'));
 record.analysis=structuredClone(a);record.analysis.source.id='different';assert.equal(B.compare(record,b,a).derived_reference_count,0);
});
test('canonical references and identical named aliases are counted once',()=>{
 const c=cut();c.references=[{target_id:c.srt_refs[0],kind:'srt_cue',purpose:'未指定'}];assert.equal(S.extractReferences(c).references.length,5);
});

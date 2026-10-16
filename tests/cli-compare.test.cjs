'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const S = require('../storyboard');
const R = require('../references');
const Review = require('../impact-review');
const fixture = require('./impact-review-fixture.cjs');
const host = vm.createContext({MVReferences:R, MVStoryboard:S});
vm.runInContext(fs.readFileSync(require.resolve('../storyboard-baseline'), 'utf8'), host);
const B = host.MVStoryboardBaseline;
const cli = path.join(__dirname, '../cli/mv-analyzer.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const oldId = 'srt_de9bbac2e3d0a3fc5beeab127c1c3b48';
const newId = 'srt_93927bc2b7547684936f1cf205962c68';

// Extend the existing synthetic fixture; no real work inputs are included.
function srtFixture() {
  const f = fixture(), a = f.analysis;
  const ids = [...S.targets(f.board)].slice(0,210);
  const pointer = '/vocal_asr_timeline/entries/3';
  a.vocal_asr_timeline.entries.forEach((c,i) => c.cue_index=i);
  a.vocal_asr_timeline.entries.push({id:oldId,cue_index:3,text:'Synthetic cue',start_sec:17.04,end_sec:19.6});
  a.unified_timeline.references[oldId] = {kind:'srt_cue',pointer,start_sec:17.04,end_sec:19.6,provenance:'external_estimate'};
  f.board.cuts.forEach((c,i) => c.references=ids.filter((_,j)=>j%44===i).map(target_id=>({target_id,kind:'audio_event',purpose:'action_start'})));
  for (const i of [5,6]) f.board.cuts[i].references.push({target_id:oldId,kind:'srt_cue',purpose:'lyrics'});
  f.baseline = {schema:'mv_storyboard_baseline.v0.7.1',saved_at:'2026-09-27T20:57:24.397Z',board:plain(f.board),analysis:plain(a),baseline:{analysis:S.identity(a),references:{}}};
  f.updated = plain(a);
  Object.assign(f.updated.vocal_asr_timeline.entries[3],{id:newId,start_sec:17});
  f.updated.unified_timeline.references[newId]={...a.unified_timeline.references[oldId],start_sec:17};
  delete f.updated.unified_timeline.references[oldId];
  return f;
}
function setup(t, f, array=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mv-cli-phase2-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('mv-cli-phase2-'));fs.rmSync(dir,{recursive:true,force:true});});
  const files={baseline:path.join(dir,'baseline.json'),analysis:path.join(dir,'analysis.json'),storyboard:path.join(dir,'storyboard.json')};
  for (const [key,value] of Object.entries({baseline:f.baseline,analysis:f.updated,storyboard:array?f.board.cuts:f.board})) fs.writeFileSync(files[key],JSON.stringify(value));
  const before=Object.values(files).map(file=>fs.readFileSync(file));
  t.after(()=>Object.values(files).forEach((file,i)=>{if(fs.existsSync(file))assert.deepEqual(fs.readFileSync(file),before[i]);}));
  function run(command, extra=[]) {return spawnSync(process.execPath,[cli,command,...Object.entries(files).flatMap(([key,file])=>['--'+key,file]),'--compact',...extra],{encoding:'utf8',maxBuffer:16*1024*1024});}
  function result(command) {const r=run(command);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return JSON.parse(r.stdout);}
  function expected(command) {const board=S.importJSON(fs.readFileSync(files.storyboard,'utf8'));const c=B.compare(B.check(f.baseline),board,f.updated);return plain(command==='compare'?c:Review.build(c,board));}
  return {dir,files,run,result,expected,assertInputs:()=>Object.values(files).forEach((file,i)=>assert.deepEqual(fs.readFileSync(file),before[i]))};
}

test('compare: 44 CUT / 211 values equals direct Core; unchanged and changed values',t=>{
  const f=fixture(), h=setup(t,f), r=h.result('compare');
  assert.deepEqual(r,h.expected('compare'));assert.equal(f.board.cuts.length,44);
  assert.equal(r.compared_reference_count,211);assert.equal(r.value_compared_reference_count,211);
  assert.equal(r.storyboard_metadata_issues.length,3);assert.ok(!r.analysis_comparison.issues.some(i=>i.code==='storyboard_metadata'));
  const u=fixture();u.updated=u.analysis;const clean=setup(t,u).result('compare');
  assert.equal(clean.event_changes.length,0);assert.equal(clean.analysis_status,'比較済み・差分0件');h.assertInputs();
});
test('SRT remap: 17.04 -> 17.00, only CUT 06/07, 211 values and no unavailable',t=>{
  const h=setup(t,srtFixture()),r=h.result('compare');assert.deepEqual(r,h.expected('compare'));
  assert.equal(r.value_compared_reference_count,211);assert.equal(r.unavailable_reference_count,0);assert.equal(r.event_changes.length,1);
  const e=r.event_changes[0];assert.equal(e.change,'event_changed');assert.equal(e.reference_id,oldId);assert.equal(e.remap.new_reference_id,newId);
  assert.deepEqual(e.affected_cuts.map(c=>c.cut_number),['CUT 06','CUT 07']);
  assert.deepEqual(e.fields.map(f=>[f.field,f.before,f.after]),[['start_sec',17.04,17]]);h.assertInputs();
});
test('impact-review matches complete Core output, IDs, candidates, -0.0400 shifts and unreviewed states',t=>{
  const h=setup(t,srtFixture()),r=h.result('impact-review');assert.deepEqual(r,h.expected('impact-review'));
  assert.equal(r.schema,'mv_impact_cut_review.v0.8.2');assert.deepEqual(r.cuts.map(c=>c.cut_number),['CUT 06','CUT 07']);
  for(const c of r.cuts){assert.equal(c.status,'unreviewed');assert.equal(c.events[0].time_shifts[0].delta_sec.toFixed(4),'-0.0400');}
  h.assertInputs();
});
test('top-level CUT arrays and CUT edits use Core import and comparison unchanged',t=>{
  const f=fixture();f.board=plain(f.board);f.board.cuts[0].actions[0].action='synthetic change';
  const h=setup(t,f,true);for(const command of ['compare','impact-review'])assert.deepEqual(h.result(command),h.expected(command));
  assert.equal(h.result('compare').cut_changes.length,1);h.assertInputs();
});
for(const [name,mutate] of [
  ['different source',f=>f.updated.source.id='different'],
  ['different conditions',f=>f.updated.engine.analysis_sample_rate_hz=22050],
  ['missing reference',f=>delete f.updated.unified_timeline.references[newId]],
  ['SRT identity conflict',f=>f.updated.vocal_asr_timeline.entries[3].text='different'],
  ['incomplete legacy baseline',f=>delete f.baseline.analysis]
])test(name+' stays explicit in both commands and exits successfully',t=>{
  const f=srtFixture();mutate(f);const h=setup(t,f),r=h.result('compare');assert.deepEqual(r,h.expected('compare'));
  assert.ok(r.unavailable_reference_count>0);assert.match(r.analysis_status,/比較不可/);
  assert.notEqual(r.analysis_status,'比較済み・差分0件');const review=h.result('impact-review');assert.deepEqual(review,h.expected('impact-review'));
  assert.match(review.comparison.analysis_status,/比較不可/);h.assertInputs();
});
test('both commands create only new output files and protect every input and existing report',t=>{
  const h=setup(t,srtFixture());
  for(const command of ['compare','impact-review']){
    const output=path.join(h.dir,command+'.json'),r=h.run(command,['--output',output]);assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(output,'utf8'),r.stdout);
    for(const file of [...Object.values(h.files),output]){const bad=h.run(command,['--output',file]);assert.notEqual(bad.status,0);assert.equal(bad.stdout,'');assert.equal(JSON.parse(bad.stderr).schema,'mv_analyzer_cli.error.v1');}
    h.assertInputs();
  }
});
test('both commands return machine-readable failures for arguments, files, JSON, baseline check and runtime',t=>{
  const h=setup(t,fixture()),broken=path.join(h.dir,'broken.json'),invalid=path.join(h.dir,'invalid.json');fs.writeFileSync(broken,'{');fs.writeFileSync(invalid,'{}');
  for(const command of ['compare','impact-review']){
    const args=Object.entries(h.files).flatMap(([key,file])=>['--'+key,file]);
    const cases=[[],args.concat('--unknown'),args.concat('--baseline',h.files.baseline)];
    for(const key of Object.keys(h.files)){
      cases.push(Object.entries(h.files).filter(([k])=>k!==key).flatMap(([k,v])=>['--'+k,v]));
      for(const value of [broken,invalid,path.join(h.dir,'absent')])cases.push(Object.entries({...h.files,[key]:value}).flatMap(([k,v])=>['--'+k,v]));
    }
    for(const argv of cases){const r=spawnSync(process.execPath,[cli,command,...argv],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).schema,'mv_analyzer_cli.error.v1');}
  }
  h.assertInputs();
});
test('adapter exposes only check and compare, without persistence APIs',()=>{
  assert.deepEqual(Object.keys(require('../cli/baseline-core.cjs')).sort(),['check','compare']);
});

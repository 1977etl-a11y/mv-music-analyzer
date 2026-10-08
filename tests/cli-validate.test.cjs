'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Core = require('../storyboard');
function temp(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mv-analyzer-cli-'));
  t.after(()=>{const full=path.resolve(dir);assert.equal(path.dirname(full),path.resolve(os.tmpdir()));assert.ok(path.basename(full).startsWith('mv-analyzer-cli-'));fs.rmSync(full,{recursive:true,force:true});});
  return dir;
}
function run(...args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});}

const root = path.join(__dirname, '..');
const cli = path.join(root, 'cli', 'mv-analyzer.cjs');
const analysis = path.join(root, 'sample_music_analysis_v7.synthetic.json');
const storyboard = path.join(root, 'sample_storyboard_v0_7_1.synthetic.json');

test('CLI validate returns machine-readable read-only validation result', () => {
  const run = spawnSync(process.execPath, [
    cli, 'validate',
    '--analysis', analysis,
    '--storyboard', storyboard,
    '--compact'
  ], {encoding: 'utf8'});

  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.schema, 'mv_analyzer_cli.validate.v1');
  assert.equal(out.command, 'validate');
  assert.equal(out.read_only, true);
  assert.equal(out.inputs.storyboard_input_kind, 'storyboard_object');
  assert.equal(out.summary.cut_count, 2);
  assert.equal(out.summary.reference_count, 9);
  const direct=Core.validate(Core.importJSON(fs.readFileSync(storyboard,'utf8')),JSON.parse(fs.readFileSync(analysis,'utf8')));
  assert.equal(out.summary.reference_count,direct.reference_count);
  assert.deepEqual(out.issues,direct.issues);
  assert.deepEqual(out.affected_cut_ids,direct.affected_cut_ids);
  assert.ok(Array.isArray(out.affected_cut_ids));
  assert.ok(Array.isArray(out.issues));
  assert.match(out.policy, /never changes/i);
});

test('CLI validate accepts a top-level CUT array without rewriting the source file', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-analyzer-cli-'));
  const file = path.join(tmp, 'cuts.json');
  const cuts = [
    {cut: 'CUT23', start: 1, end: 2, audio_event_ids: ['missing_event'], direction: {action: 'preserve'}}
  ];
  fs.writeFileSync(file, JSON.stringify(cuts), 'utf8');
  const before = fs.readFileSync(file, 'utf8');

  const run = spawnSync(process.execPath, [
    cli, 'validate',
    '--analysis', analysis,
    '--storyboard', file,
    '--compact'
  ], {encoding: 'utf8'});

  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.inputs.storyboard_input_kind, 'cut_array');
  assert.equal(out.summary.cut_count, 1);
  assert.ok(out.issues.some(i => i.code === 'missing_reference'));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('CLI failures are JSON and return non-zero', () => {
  const run = spawnSync(process.execPath, [cli, 'validate', '--analysis', analysis], {encoding: 'utf8'});
  assert.notEqual(run.status, 0);
  const out = JSON.parse(run.stderr);
  assert.equal(out.schema, 'mv_analyzer_cli.error.v1');
  assert.equal(out.ok, false);
  assert.match(out.error, /--storyboard/);
});


test('optional report is a new file; inputs and a saved-baseline sentinel are never overwritten',t=>{
 const dir=temp(t),a=path.join(dir,'analysis.json'),b=path.join(dir,'board.json'),baseline=path.join(dir,'baseline.json'),output=path.join(dir,'report.json');
 fs.copyFileSync(analysis,a);fs.copyFileSync(storyboard,b);fs.writeFileSync(baseline,'{"synthetic_baseline_sentinel":true}');const inputs=[a,b,baseline],before=inputs.map(f=>fs.readFileSync(f));
 const ok=run('validate','--analysis',a,'--storyboard',b,'--output',output);assert.equal(ok.status,0,ok.stderr);assert.equal(fs.readFileSync(output,'utf8'),ok.stdout);
 for(const file of [...inputs,output]){const failure=run('validate','--analysis',a,'--storyboard',b,'--output',file);assert.notEqual(failure.status,0);assert.equal(failure.stdout,'');assert.equal(JSON.parse(failure.stderr).schema,'mv_analyzer_cli.error.v1');}
 inputs.forEach((f,i)=>assert.deepEqual(fs.readFileSync(f),before[i]));assert.deepEqual(fs.readdirSync(dir).sort(),['analysis.json','baseline.json','board.json','report.json']);
});
test('invalid arguments, read failures, JSON errors and Core failures return JSON on stderr',t=>{
 const dir=temp(t),bad=path.join(dir,'bad.json'),invalid=path.join(dir,'invalid.json');fs.writeFileSync(bad,'{invalid');fs.writeFileSync(invalid,'{"cuts":[null]}');
 const common=['validate','--analysis',analysis,'--storyboard',storyboard];
 const cases=[['compare'],['validate','--unknown'],['validate','--analysis'],['--analysis',analysis],common.concat('extra'),common.concat('--analysis',analysis),['validate','--analysis',path.join(dir,'absent'),'--storyboard',storyboard],['validate','--analysis',bad,'--storyboard',storyboard],['validate','--analysis',analysis,'--storyboard',bad],['validate','--analysis',analysis,'--storyboard',invalid],common.concat('--output',path.join(dir,'missing','report.json'))];
 for(const args of cases){const r=run(...args);assert.notEqual(r.status,0,args.join(' '));assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).ok,false);}
});
test('help and no-argument usage succeed; validation errors remain successful result data',t=>{
 for(const args of [[],['--help']]){const r=run(...args);assert.equal(r.status,0);assert.match(r.stdout,/Usage:/);}
 const dir=temp(t),file=path.join(dir,'cuts.json');fs.writeFileSync(file,JSON.stringify([{cut:'02',start:3,end:2,audio_event_ids:['missing']} ]));const r=run('validate','--analysis',analysis,'--storyboard',file,'--compact');assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.ok(out.issues.some(i=>i.severity==='error'));assert.equal(r.stderr,'');
});

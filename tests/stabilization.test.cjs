const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function harness() {
  const elements = new Map(), scripts = [];
  function element() {
    return { value:'', disabled:false, dataset:{}, listeners:{}, style:{},
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(name,fn){this.listeners[name]=fn;},
      appendChild(){}, scrollIntoView(){},
      querySelectorAll(){return this.fields ||= [element(),element(),element()];}
    };
  }
  const document = {
    scripts,
    getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    createElement(){const el=element();el.remove=()=>{const i=scripts.indexOf(el);if(i>=0)scripts.splice(i,1);};return el;},
    head:{appendChild(el){scripts.push(el);}}
  };
  const context=vm.createContext({document,navigator:{},console:{warn(){},error(){}},setTimeout,clearTimeout,Blob});
  vm.runInContext(source,context);
  return {context,elements,scripts,run(code){return vm.runInContext(code,context);}};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('JavaScript / JSON syntax and every precache path',()=>{
  new vm.Script(source);
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');new vm.Script(sw);
  const shell=vm.runInNewContext(sw.match(/const APP_SHELL = (.*);/)[1]);
  for(const item of shell)assert.ok(fs.existsSync(path.join(root,item)),item);
  for(const name of fs.readdirSync(root).filter(x=>/\.json$|webmanifest$/.test(x)))JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
  assert.match(sw,/if\(resp.ok\)/);
});

test('repeated lyrics consume distinct SRT cues, including multi-cue spans',()=>{
  const h=harness();
  assert.deepEqual(plain(h.run(`buildAsrLyricAlignment('こんにちは\\nこんにちは',[
    {start_sec:1,end_sec:2,text:'こんにちは'}, {start_sec:5,end_sec:6,text:'こんにちは'}],10).matches.map(x=>x.start_sec)`)),[1,5]);
  assert.deepEqual(plain(h.run(`buildAsrLyricAlignment('赤い花咲く\\n咲く',[
    {start_sec:1,end_sec:2,text:'赤い花'}, {start_sec:2,end_sec:3,text:'咲く'},
    {start_sec:5,end_sec:6,text:'咲く'}],10).matches.map(x=>x.start_sec)`)),[1,5]);
});

test('SRT rejects negative, reversed, zero, invalid and outside intervals; clips end',()=>{
  const h=harness();
  h.context.srt=['-00:00:01,000 --> 00:00:02,000','00:00:09,000 --> 00:00:02,000',
    '00:00:02,000 --> 00:00:02,000','00:61:00,000 --> 00:62:00,000',
    '00:00:11,000 --> 00:00:12,000','00:00:08,000 --> 00:00:12,000',
    '00:00:01,000 --> 00:00:02,000'].map((t,i)=>`${i+1}\n${t}\nhello`).join('\n\n');
  const result=h.run(`(()=>{const warnings=[];return {entries:parseSrt(srt,10,warnings),warnings};})()`);
  assert.equal(result.warnings.length,6);
  assert.deepEqual(plain(result.entries.map(e=>[e.start_sec,e.end_sec])),[[1,2],[8,10]]);
  assert.equal(h.run(`parseSrt('1\\n00:00:01,000 --> 00:00:02,000\\nhello',1.23456)[0].end_sec`),1.234);
});

function prepareTimeline(h){
  h.run(`var motion={windows:[
    {start_sec:0,end_sec:5,primitives:{ACCENT:{type:'ACCENT',strength:.8,confidence:'high'}}},
    {start_sec:5,end_sec:10,primitives:{FORCE:{type:'FORCE',strength:.9,confidence:'high'}}}
  ]};
  var timeline={entries:[{line_index:0,start_sec:1,end_sec:2,text:'hello',type:'LYRIC'},
    {line_index:1,start_sec:2,end_sec:3,text:'world',type:'LYRIC'}]};`);
}
test('explicit time remains fixed and SRT updates audio_context',()=>{
  const h=harness();prepareTimeline(h);
  h.run(`applySrtAlignment(timeline,{matches:[{line_index:0,start_sec:6,end_sec:7},
    {line_index:1,start_sec:7,end_sec:8}]},'[00:01.00] hello\\nworld',motion)`);
  assert.equal(h.run('timeline.entries[0].start_sec'),1);
  assert.equal(h.run('timeline.entries[0].audio_context[0].type'),'ACCENT');
  assert.equal(h.run('timeline.entries[1].start_sec'),7);
  assert.equal(h.run('timeline.entries[1].audio_context[0].type'),'FORCE');
});

test('manual editor recomputes audio_context and retains schema fields',()=>{
  const h=harness();prepareTimeline(h);const rows=[];
  h.elements.get('lyricTimelineEditor').appendChild=row=>rows.push(row);
  h.run(`analysisResult={source:{duration_sec:10},lyric_timeline:timeline,motion_primitives:motion,dynamics_and_bands:{curves:[]}};renderLyricEditor()`);
  const [a,b,select]=rows[0].fields;a.value='6';b.value='8';select.value='LYRIC';a.listeners.change();
  assert.equal(h.run('timeline.entries[0].audio_context[0].type'),'FORCE');
  assert.equal(h.run('timeline.entries[0].manual_corrected'),true);
});

test('silence and extreme low energy have no strong primitives; audible evidence remains',()=>{
  const h=harness();
  for(const db of [-180,-70,-59]){
    h.context.db=db;
    const result=h.run(`buildMotionPrimitiveLayer({duration:10,bpm:120,beats:[],onsets:[.5,1,1.5],lowOnsets:[.5],highOnsets:[1],sections:[],stemAnalysis:{},curves:Array.from({length:40},(_,i)=>({t:i*.25,loudness_db:db,low_ratio:.9,mid_ratio:.05,high_ratio:.05}))})`);
    assert.equal(result.primitive_types.length,9);
    for(const w of result.windows)for(const p of Object.values(w.primitives))assert.ok(p.strength<.45,`${db} ${p.type}`);
  }
  assert.ok(h.run(`buildMotionPrimitiveLayer({duration:2,bpm:120,beats:[],onsets:[],lowOnsets:[],highOnsets:[],sections:[],stemAnalysis:{},curves:Array.from({length:8},(_,i)=>({t:i*.25,loudness_db:-20,low_ratio:.9,mid_ratio:.05,high_ratio:.05}))}).windows[0].primitives.SUSTAIN.strength`)>=.72);
});

test('zero change is excluded and MV timestamps stay within duration',()=>{
  const h=harness();
  assert.equal(h.run(`detectSections(Array.from({length:40},(_,i)=>({t:i*.25,loudness_db:-180,low_ratio:0,mid_ratio:0,high_ratio:0}))).length`),0);
  const candidates=h.run(`buildMvSyncCandidates({duration:1,beats:[],onsets:[.5],lowOnsets:[],highOnsets:[],sections:[{time_sec:2,score:1}],curves:[{t:.5,loudness_db:-20,low_ratio:.8,mid_ratio:.1,high_ratio:.1}]}).candidates`);
  assert.ok(candidates.length>0);assert.ok(candidates.every(x=>x.time_sec>=0&&x.time_sec<=1));
  assert.equal(h.run(`mergeStemMvCandidates([],{vocals:{event_candidates:[{time_sec:-1},{time_sec:.5},{time_sec:2}]}},1).length`),1);
});

test('failed CDN script load can be retried; concurrent loads share one request',async()=>{
  const h=harness();const first=h.run(`loadScript('https://example.test/engine.js')`);
  assert.equal(h.run(`loadScript('https://example.test/engine.js')`),first);
  const rejected=assert.rejects(first,/ライブラリ読み込み失敗/);h.scripts[0].onerror();await rejected;
  assert.equal(h.scripts.length,0);
  const retry=h.run(`loadScript('https://example.test/engine.js')`);assert.equal(h.scripts.length,1);
  h.scripts[0].onload();await retry;
});

function mockAnalysis(h){
  h.run(`var calls=[];
    selectedFile={name:'original.wav',size:123,type:'audio/wav'};
    stemFiles.vocals={name:'vocals.wav'};
    srtFile={name:'original.srt',text:async()=>'1\\n00:00:01,000 --> 00:00:02,000\\nhello'};
    ui.lyrics.value='hello';
    var resume;
    ensureLibraries=()=>new Promise(resolve=>resume=resolve);
    decodeAndResample=async file=>{calls.push(file.name);return {buffer:{},sourceRate:44100,sourceChannels:1};};
    downmixToMono=()=>new Float32Array(441000);
    buildBandSignals=()=>({low:[],mid:[],high:[]});
    essentiaRhythm=()=>({bpm:120,confidence:.8,beat_times_sec:[1,1.5,2]});
    essentiaKey=()=>({key:'C',scale:'major',strength:.8});
    essentiaOnsets=()=>({times:[1,2],method:'Essentia OnsetRate'});
    buildBandCurves=()=>Array.from({length:40},(_,i)=>({t:i*.25,loudness_db:-20,low_ratio:.6,mid_ratio:.3,high_ratio:.1}));
    analyzeStemFile=async file=>{calls.push(file.name);return {event_candidates:[]};};
    renderResults=()=>{};renderLyricEditor=()=>{};
  `);
}
test('analysis snapshots inputs, prevents reentry, preserves v6.1 and excludes self-agreement',async()=>{
  const h=harness();mockAnalysis(h);
  const pending=h.run('analyzeSelectedFile()');
  assert.equal(h.elements.get('lyricsInput').disabled,true);
  h.run(`selectedFile={name:'changed.wav'};stemFiles.vocals={name:'changed-vocals.wav'};srtFile=null;ui.lyrics.value='changed';`);
  await h.run('analyzeSelectedFile()');h.run('resume()');await pending;
  assert.deepEqual(plain(h.run('calls')),['original.wav','vocals.wav']);
  const result=h.run('analysisResult');assert.ok(result);
  assert.equal(result.source.file_name,'original.wav');assert.equal(result.vocal_asr_timeline.source_file,'original.srt');
  assert.equal(result.lyric_timeline.entries[0].text,'hello');
  assert.equal(result.rhythm.estimator_crosscheck.agreement_score,null);
  assert.equal(result.onset.selected_method,'Essentia OnsetRate');
  assert.equal(result.schema,'mv_music_analysis.v6.1');assert.equal(h.run('outputName()'),'original_music_analysis_v6_1.json');
  assert.equal(h.elements.get('lyricsInput').disabled,false);
  assert.deepEqual(Object.keys(result).sort(),['schema','generated_at','engine','source','rhythm','tonal','stems','semantic_audio_events','onset','dynamics_and_bands','section_change_candidates','mv_sync_candidates','motion_primitives','lyric_timeline','vocal_asr_timeline','lyric_asr_alignment','unified_timeline','mv_mapping_hint','warnings'].sort());
});

test('onset method records actual fallback or success independently of band failures',async()=>{
  for(const mode of ['throw','success']){
    const h=harness();mockAnalysis(h);
    h.context.mode=mode;
    h.run(`audioBeat={detect(){throw Error('detect failure');},onsets(){if(mode==='throw')throw Error('onsets failure');return [1,2];},energyOnsets(){throw Error('band failure');}}`);
    const pending=h.run('analyzeSelectedFile()');h.run('resume()');await pending;
    assert.equal(h.run('analysisResult.onset.selected_method'),mode==='throw'?'Essentia OnsetRate':'@audio/beat spectral-flux');
  }
});

test('analysis failure releases input controls for retry',async()=>{
  const h=harness();mockAnalysis(h);h.run(`ensureLibraries=async()=>{throw Error('offline');}`);
  await h.run('analyzeSelectedFile()');assert.equal(h.run('analyzing'),false);assert.equal(h.elements.get('audioInput').disabled,false);
});

test('section typography and generic labels are separated from vocal lines',()=>{
  const h=harness();
  for(const label of ['【Intro – Ad-lib Scat】','[Verse 1]','【A’】','〈間奏〉','[Verse 2 - whispered]','[Nebula Chamber 7 - whispered]','# 未知の構成名']){
    h.context.lyrics=label+'\n歌を届けよう';
    const structure=h.run('parseLyricStructure(lyrics)');
    assert.equal(structure.lines[0].kind,'SECTION',label);
    assert.equal(h.run('parseLyrics(lyrics).length'),1,label);
    assert.equal(structure.lines[1].section_id,structure.lines[0].section_id);
    assert.ok(structure.lines[0].structure_evidence.length);
    assert.equal(structure.lines[0].start_sec,undefined);
  }
});

test('directives, raw text, physical line numbers and section membership survive',()=>{
  const h=harness();h.context.lyrics='【A’】\n\n  [whispered]  \n[LYRIC] （君が好き）\n[INST]\n[DIRECTIVE] 照明を落とす';
  const result=h.run('parseLyricStructure(lyrics)');
  assert.equal(result.source_text,h.context.lyrics);
  assert.deepEqual(plain(result.lines.map(x=>x.kind)),['SECTION','DIRECTIVE','VOCAL_LINE','DIRECTIVE','DIRECTIVE']);
  assert.equal(result.lines[1].raw_text,'  [whispered]  ');
  assert.equal(result.lines[2].source_line_number,4);
  assert.equal(result.lines[2].section_id,'section_1');
  assert.equal(result.lines[2].classification.status,'explicit');
});

test('bracketed calls and sung sentences remain vocal; uncertainty remains recoverable',()=>{
  const h=harness();
  for(const text of ['(Hey!)','【ラララ…】','[I love you]','（君が好き）','[VOCAL] [A]']){
    h.context.lyrics=text;assert.equal(h.run('parseLyrics(lyrics).length'),1,text);
  }
  h.context.lyrics='【春の影】\n[不明な注記]';
  const t=h.run('buildLyricTimeline({text:lyrics,vocalEvents:[],duration:10,motionPrimitives:{windows:[]}})');
  assert.equal(t.entries.length,0);
  assert.equal(t.input_structure.lines.length,2);
  assert.ok(t.input_structure.lines.every(x=>x.kind==='AMBIGUOUS'&&x.structure_confidence==='low'&&x.start_sec===undefined));
  h.context.lyrics='[LYRIC] 【春の影】';
  assert.equal(h.run('parseLyrics(lyrics)[0].text'),'【春の影】');
});

test('English Japanese and mixed scat are candidates, while explicit tags take priority',()=>{
  const h=harness();
  for(const text of ['Daba-daba…','ラララ…','Daba ララ…']){
    h.context.lyrics=text;const line=h.run('parseLyrics(lyrics)[0]');
    assert.equal(line.type,'LYRIC');assert.equal(line.classification.status,'candidate');
    assert.ok(line.classification.candidates.some(x=>x.type==='SCAT'),text);
  }
  assert.equal(h.run(`parseLyrics('uh…')[0].classification.candidates[0].type`),'VOCALIZATION');
  assert.equal(h.run(`parseLyrics('[LYRIC] Daba-daba…')[0].classification.candidates[0].type`),'LYRIC');
  assert.equal(h.run(`parseLyrics('[SCAT] Daba-daba…')[0].type`),'SCAT');
  assert.equal(h.run(`parseLyrics('[BREATH]')[0].type`),'BREATH');
});

test('section annotations supply weak candidates without making headings vocal',()=>{
  const h=harness();
  const lines=h.run(`parseLyrics('[Intro - Ad-lib Scat]\\nDaba-daba…\\n[Verse 2 - whispered]\\n君が好き')`);
  assert.equal(lines.length,2);
  assert.ok(lines[0].classification.candidates.some(x=>x.evidence.includes('section_or_directive_annotation')));
  assert.equal(lines[1].classification.candidates.length,0);
});

test('ordinary lyrics preserve line indexes, source lines and timing estimates',()=>{
  const h=harness();
  const t=h.run(`buildLyricTimeline({text:'笑って蹴るわ\\n\\nあなたが残したシャツを',vocalEvents:[],duration:10,motionPrimitives:{windows:[]}})`);
  assert.deepEqual(plain(t.entries.map(x=>[x.line_index,x.source_line_number,x.type])),[[0,1,'LYRIC'],[1,3,'LYRIC']]);
  assert.ok(t.entries.every(x=>x.timing_status==='estimated'&&x.confidence==='low'&&x.alignment_method==='duration_distribution'&&!x.manual_corrected));
});

test('headings and directives do not consume SRT cues; unmatched vocals remain estimated',()=>{
  const h=harness();prepareTimeline(h);
  h.context.lyrics='【Intro – Ad-lib Scat】\n[whispered]\nDaba-daba…\n【A’】\n笑って蹴るわ\n未照合の歌';
  const result=h.run(`(()=>{
    const cues=[{start_sec:1,end_sec:2,text:'Daba-daba…'},{start_sec:6,end_sec:7,text:'笑って蹴るわ'}];
    const alignment=buildAsrLyricAlignment(lyrics,cues,10);
    const t=buildLyricTimeline({text:lyrics,vocalEvents:[],duration:10,motionPrimitives:motion});
    applySrtAlignment(t,alignment,lyrics,motion);return {alignment,t};
  })()`);
  assert.deepEqual(plain(result.alignment.matches.map(x=>x.start_sec)),[1,6]);
  assert.equal(result.t.entries.length,3);
  assert.equal(result.t.entries[1].audio_context[0].type,'FORCE');
  assert.equal(result.t.entries[1].timing_status,'srt_candidate');
  assert.equal(result.t.entries[2].timing_status,'estimated');
  assert.equal(result.t.entries[2].confidence,'low');
  assert.equal(result.t.entries[0].source_line_number,3);
});

test('explicit timecodes survive structure filtering and SRT alignment',()=>{
  const h=harness();
  const t=h.run(`(()=>{const text='[Verse 1]\\n[00:04.00] hello';const t=buildLyricTimeline({text,vocalEvents:[],duration:10,motionPrimitives:{windows:[]}});applySrtAlignment(t,buildAsrLyricAlignment(text,[{start_sec:1,end_sec:2,text:'hello'}],10),text,{windows:[]});return t;})()`);
  assert.equal(t.entries[0].start_sec,4);assert.equal(t.entries[0].alignment_method,'user_timecode');
  assert.equal(t.entries[0].timing_status,'user_start_estimated_end');
});

test('manual classification does not turn estimated timing into manual timing',()=>{
  const h=harness();prepareTimeline(h);const rows=[];
  h.elements.get('lyricTimelineEditor').appendChild=row=>rows.push(row);
  h.run(`timeline.entries[0].timing_status='estimated';timeline.entries[0].alignment_method='duration_distribution';analysisResult={source:{duration_sec:10},lyric_timeline:timeline,motion_primitives:motion,dynamics_and_bands:{curves:[]}};renderLyricEditor()`);
  rows[0].fields[2].value='SCAT';rows[0].fields[2].listeners.change();
  assert.equal(h.run('timeline.entries[0].type'),'SCAT');
  assert.equal(h.run('timeline.entries[0].classification.status'),'manual');
  assert.equal(h.run('timeline.entries[0].timing_status'),'estimated');
  assert.equal(h.run('timeline.entries[0].alignment_method'),'duration_distribution');
});

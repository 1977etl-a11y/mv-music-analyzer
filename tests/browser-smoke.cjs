// Optional integration test: npm-installed Playwright, or PLAYWRIGHT_MODULE pointing to its module.
// Uses synthetic detector outputs; it does not assert real audio / CDN detector accuracy.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('./reference-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
    if(!/^[\w.\-]+$/.test(name)){res.writeHead(404).end();return;}
    try{const content=fs.readFileSync(path.join(root,name));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/json');res.end(content);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.context().setOffline(true);await page.reload();
    const decoded=await page.evaluate(async()=>{
      const bytes=new Uint8Array(44+16000),v=new DataView(bytes.buffer);
      const text=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
      text(0,'RIFF');v.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
      v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,16000,true);
      for(let i=0;i<8000;i++)v.setInt16(44+i*2,Math.round(8000*Math.sin(2*Math.PI*440*i/8000)),true);
      const r=await decodeAndResample(new File([bytes],'synthetic-tone.wav',{type:'audio/wav'}));
      const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      return {rate:r.buffer.sampleRate,duration:r.buffer.duration,hash_matches:r.contentHash===expected};
    });
    assert.equal(decoded.rate,44100);assert.ok(Math.abs(decoded.duration-1)<.01);assert.equal(decoded.hash_matches,true);
    await page.evaluate(data=>{analysisResult=data;MVReferences.enrich(analysisResult);renderLyricEditor();renderReferenceSummary();ui.results.classList.remove('hidden');},fixture());
    assert.match(await page.locator('#referenceSummary').innerText(),/音響イベント/);
    assert.equal(await page.locator('.lyric-row').count(),3);
    const id=await page.evaluate(()=>analysisResult.lyric_timeline.entries[0].id);
    await page.locator('.lyric-row input').first().fill('1.5');await page.locator('.lyric-row input').first().press('Tab');
    assert.equal(await page.evaluate(()=>analysisResult.lyric_timeline.entries[0].id),id);
    assert.equal(await page.evaluate(()=>analysisResult.unified_timeline.references[analysisResult.lyric_timeline.entries[0].id].provenance),'manual');
    await page.locator('.lyric-row select').first().selectOption('SCAT');
    const downloading=page.waitForEvent('download');await page.locator('#downloadBtn').click();
    const download=await downloading,stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk;
    const exported=JSON.parse(text);assert.equal(exported.reference_schema,'mv_music_analysis.references.v0.7.0');
    assert.equal(exported.lyric_timeline.entries[0].edit_history.length,2);assert.equal(exported.lyric_timeline.entries[0].id,id);
    assert.match(download.suggestedFilename(),/_music_analysis_v6_1\.json$/);
    await page.locator('#storyboardAnalysisFile').setInputFiles({name:'analysis.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('../sample_music_analysis_v7.synthetic.json')))});
    await page.locator('#storyboardFile').setInputFiles({name:'board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('../sample_storyboard_v0_7_1.synthetic.json')))});
    await page.waitForFunction(()=>document.getElementById('storyboardStatus').textContent.includes('2 CUT'));
    await page.locator('#storyboardValidate').click();
    assert.match(await page.locator('#storyboardOutput').innerText(),/cut_demo_a/);
    const exporting=page.waitForEvent('download');await page.locator('#storyboardExport').click();
    const boardDownload=await exporting,boardStream=await boardDownload.createReadStream();let boardText='';for await(const chunk of boardStream)boardText+=chunk;
    assert.deepEqual(JSON.parse(boardText),require('../sample_storyboard_v0_7_1.synthetic.json'));
    await page.locator('#storyboardFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});
    await page.waitForFunction(()=>document.getElementById('storyboardStatus').textContent.includes('読込失敗'));
    const cuts=[{cut:'CUT23',block:'A',start:1,end:2,audio_event_ids:['not_real'],direction:{action:'preserve'}}];
    for(const input of [cuts,{cuts}]){
      await page.locator('#storyboardFile').setInputFiles({name:'cuts_v71.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
      await page.waitForFunction(()=>document.getElementById('storyboardStatus').textContent.includes('1 CUT'));
      await page.locator('#storyboardValidate').click();
      assert.match(await page.locator('#storyboardOutput').innerText(),/missing_reference/);
      assert.doesNotMatch(await page.locator('#storyboardStatus').innerText(),/読込失敗/);
      const saved=page.waitForEvent('download');await page.locator('#storyboardExport').click();
      const file=await saved,stream=await file.createReadStream();let text='';for await(const part of stream)text+=part;
      const data=JSON.parse(text);assert.equal(data.cuts.length,1);for(const key of Object.keys(cuts[0]))assert.deepEqual(data.cuts[0][key],cuts[0][key]);
    }
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      const boxes=await page.locator('#storyboardPanel .actions button').evaluateAll(buttons=>buttons.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,top:b.getBoundingClientRect().top,scroll:b.scrollWidth,client:b.clientWidth})));
      assert.ok(boxes.every(b=>b.width>200&&b.height>=44&&b.scroll<=b.client));
      assert.ok(boxes.every((b,i)=>i===0||b.top>=boxes[i-1].top+boxes[i-1].height));
    }
    // Synthetic 44 CUT baseline: transaction failure, persistence, backup, restore and comparison.
    const baselineBoard=JSON.parse(JSON.stringify(require('../sample_storyboard_v0_7_1.synthetic.json')));
    delete baselineBoard.baseline;
    baselineBoard.cuts=Array.from({length:44},(_,i)=>({...baselineBoard.cuts[0],id:'persist_cut_'+i,cut_number:'CUT'+(i+1)}));
    baselineBoard.cuts[0]={...baselineBoard.cuts[0],...require('./named-reference-fixture.cjs')()};
    await page.locator('#storyboardFile').setInputFiles({name:'44.synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(baselineBoard))});
    await page.waitForFunction(()=>document.getElementById('storyboardStatus').textContent.includes('44 CUT'));
    await page.evaluate(()=>{window.originalBaselineSave=MVStoryboardBaseline.save;MVStoryboardBaseline.save=async()=>{throw Error('QuotaExceededError simulated');};});
    await page.locator('#storyboardBaseline').click();
    await page.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('保存失敗'));
    assert.equal(await page.evaluate(()=>MVStoryboardBaseline.load()),null);
    assert.match(await page.locator('#storyboardBaselineStatus').innerText(),/未保存/);
    await page.evaluate(()=>{MVStoryboardBaseline.save=window.originalBaselineSave;});
    await page.locator('#storyboardBaseline').click();
    await page.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('保存成功'));
    const persisted=await page.evaluate(()=>MVStoryboardBaseline.load());
    for(const id of ['lyric_refs','srt_refs','motion_refs','audio_event_refs','review_refs'])assert.deepEqual(persisted.board.cuts[0][id],baselineBoard.cuts[0][id]);

    assert.deepEqual(persisted.board,baselineBoard);assert.equal(persisted.board.cuts.length,44);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('storyboardBaselineStatus').textContent.includes('保存済み'));
    assert.match(await page.locator('#storyboardBaselineStatus').innerText(),/44 CUT/);
    assert.equal(persisted.analysis,undefined);assert.ok(Object.keys(persisted.baseline.references).length>=5);
    await page.locator('#storyboardAnalysisFile').setInputFiles({name:'current.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('../sample_music_analysis_v7.synthetic.json')))});
    await page.locator('#storyboardCompare').click();
    await page.waitForFunction(()=>document.getElementById('storyboardComparison').textContent.includes('cut_changes'));
    const comparison=()=>page.locator('#storyboardComparison').innerText();
    assert.deepEqual(JSON.parse((await comparison()).replace(/^比較結果\n/, '')).cut_changes,[]);
    assert.ok(JSON.parse((await comparison()).replace(/^比較結果\n/, '')).compared_reference_count>=5);
    assert.equal(JSON.parse((await comparison()).replace(/^比較結果\n/, '')).analysis_status,'比較済み・差分0件');
    await page.locator('#storyboardBaseline').click();
    await page.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('上書きしません'));
    assert.deepEqual(await page.evaluate(()=>MVStoryboardBaseline.load()),persisted);
    const changed=JSON.parse(JSON.stringify(baselineBoard));changed.cuts[0].end_sec+=.1;
    await page.locator('#storyboardFile').setInputFiles({name:'changed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});
    await page.locator('#storyboardCompare').click();
    await page.waitForFunction(()=>document.getElementById('storyboardComparison').textContent.includes('"change": "changed"'));
    const updatedAnalysis=JSON.parse(JSON.stringify(require('../sample_music_analysis_v7.synthetic.json')));
    const affectedId=Object.keys(persisted.baseline.references)[0];
    updatedAnalysis.unified_timeline.references[affectedId].start_sec+=.25;
    await page.locator('#storyboardAnalysisFile').setInputFiles({name:'updated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(updatedAnalysis))});
    await page.locator('#storyboardCompare').click();
    await page.waitForFunction(()=>document.getElementById('storyboardComparison').textContent.includes('analysis_changed'));
    assert.deepEqual(await page.evaluate(()=>MVStoryboardBaseline.load()),persisted);
    const backing=page.waitForEvent('download');await page.locator('#storyboardBaselineExport').click();
    const backup=await backing,backupStream=await backup.createReadStream();let backupText='';for await(const part of backupStream)backupText+=part;
    assert.deepEqual(JSON.parse(backupText),persisted);
    const other=await browser.newContext(),otherPage=await other.newPage();
    await otherPage.goto(page.url());
    await otherPage.waitForFunction(()=>document.getElementById('storyboardBaselineStatus').textContent.includes('未保存'));
    await otherPage.locator('#storyboardBaselineFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backupText)});
    await otherPage.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('保存成功'));
    await otherPage.reload();await otherPage.waitForFunction(()=>document.getElementById('storyboardBaselineStatus').textContent.includes('保存済み'));
    assert.deepEqual(await otherPage.evaluate(()=>MVStoryboardBaseline.load()),persisted);
    await assert.rejects(otherPage.evaluate(async()=>MVStoryboardBaseline.save(await MVStoryboardBaseline.load())));
    const originalDisk=await otherPage.evaluate(()=>MVStoryboardBaseline.load());
    await otherPage.locator('#storyboardAnalysisFile').setInputFiles({name:'current.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('../sample_music_analysis_v7.synthetic.json')))});
    otherPage.once('dialog',dialog=>dialog.dismiss());await otherPage.locator('#storyboardBaselineRecreate').click();
    assert.deepEqual(await otherPage.evaluate(()=>MVStoryboardBaseline.load()),originalDisk);
    otherPage.once('dialog',dialog=>dialog.accept());await otherPage.locator('#storyboardBaselineRecreate').click();
    await otherPage.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('再作成成功'));
    const initial=await otherPage.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('mv-storyboard-baseline');req.onsuccess=()=>{const db=req.result,tx=db.transaction('baselines');const r=tx.objectStore('baselines').get('initial');r.onsuccess=()=>{resolve(r.result);db.close();};};req.onerror=()=>reject(req.error);}));
    assert.deepEqual(initial,originalDisk);
    await other.close();
    const legacyContext=await browser.newContext(),legacyPage=await legacyContext.newPage();
    await legacyPage.goto(page.url());await legacyPage.waitForFunction(()=>document.getElementById('storyboardBaselineStatus').textContent.includes('未保存'));
    const legacy={...persisted,schema:'mv_storyboard_baseline.v0.7.1',analysis:require('../sample_music_analysis_v7.synthetic.json'),baseline:{analysis:persisted.baseline.analysis,references:{}}};
    await legacyPage.locator('#storyboardBaselineFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await legacyPage.waitForFunction(()=>document.getElementById('storyboardBaselineMessage').textContent.includes('保存成功'));
    await legacyPage.locator('#storyboardCompare').click();
    await legacyPage.waitForFunction(()=>document.getElementById('storyboardComparison').textContent.includes('解析値の比較不可'));
    assert.deepEqual(await legacyPage.evaluate(()=>MVStoryboardBaseline.load()),legacy);
    await legacyContext.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),viewport:'390x844',synthetic_ui:'passed',download:'passed',service_worker:'offline_reload_passed',synthetic_decode:decoded,page_errors:errors}));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

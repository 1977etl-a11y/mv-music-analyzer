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
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),viewport:'390x844',synthetic_ui:'passed',download:'passed',service_worker:'offline_reload_passed',synthetic_decode:decoded,page_errors:errors}));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

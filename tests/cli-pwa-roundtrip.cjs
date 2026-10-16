// CLI -> PWA integration only. Synthetic author UI operations, never real approvals.
// Optional: PLAYWRIGHT_MODULE and BROWSER_CHANNEL, as in browser-smoke.cjs.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const B=require('../cli/baseline-core.cjs'),Review=require('../impact-review');
async function download(page,button,file){const wait=page.waitForEvent('download');await page.locator(button).click();await (await wait).saveAs(file);return JSON.parse(fs.readFileSync(file,'utf8'));}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mv-cli-pwa-')),inputs=new Map();let browser;
 const put=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value));inputs.set(file,fs.readFileSync(file));return file;};
 const cli=(command,args,output)=>{const r=spawnSync(process.execPath,[path.join(root,'cli/mv-analyzer.cjs'),command,...Object.entries(args).flatMap(([k,v])=>['--'+k,v]),'--output',output],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),JSON.parse(fs.readFileSync(output,'utf8')));return JSON.parse(r.stdout);};
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!/^[\w.-]+$/.test(name)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(path.join(root,name)));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  for(const format of ['object','array']){
   const f=require('./impact-review-fixture.cjs')();
   // Generic evidence references retain their IDs without claiming action synchronization.
   for(const c of f.board.cuts)for(const r of c.references)r.purpose='evidence';
   Object.assign(f.board,{id:'synthetic_board',title:'Synthetic 44 CUT',version:'1'});
   const board=format==='array'?f.board.cuts:f.board;
   const review=Review.build(B.compare(f.baseline,f.board,f.updated),f.board);assert.equal(review.cuts.length,1);review.cuts[0].status='needs_revision';
   const source=put(format+'-board.json',board),analysis=put(format+'-analysis.json',f.analysis);put(format+'-baseline.json',f.baseline);
   const reviewFile=put(format+'-review.json',review),handoffFile=path.join(dir,format+'-handoff.json'),proposalFile=path.join(dir,format+'-proposal.json'),editedFile=path.join(dir,format+'-edited.json');
   cli('revision-handoff',{review:reviewFile,storyboard:source},handoffFile);
   const initial=cli('proposal-create',{handoff:handoffFile,storyboard:source},proposalFile);assert.equal(initial.target_count,1);
   const edits=put(format+'-edits.json',{edits:[{cut_id:'cut_1',path:['actions','0','action'],value:'lower hand slowly'}]});
   const edited=cli('proposal-edit',{proposal:proposalFile,storyboard:source,edits},editedFile);
   const preflight=cli('preflight',{proposal:editedFile,storyboard:source,analysis},path.join(dir,format+'-preflight.json'));assert.equal(preflight.eligible_count,0);
   const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>document.getElementById('storyboardBaselineStatus').textContent.includes('未保存'));
    assert.equal(await page.evaluate(()=>MVStoryboardBaseline.load()),null);
    await page.locator('#storyboardFile').setInputFiles(source);
    await page.locator('#storyboardAnalysisFile').setInputFiles(analysis);
    await page.locator('#proposalSavedFile').setInputFiles(editedFile);
    await page.waitForFunction(()=>document.getElementById('proposalStatus').textContent.includes('改稿対象 1 CUT'));
    const loaded=await page.evaluate(()=>MVProposalUI.getProposal());assert.deepEqual(loaded,edited);
    assert.equal(await page.locator('[data-path="actions.0.action"]').inputValue(),'lower hand slowly');
    assert.equal(await page.locator('#proposalDecision').inputValue(),'unreviewed');
    for(const topic of ['timing','actions','subjects','props','wardrobe','camera'])assert.equal(await page.locator('[data-check-topic="'+topic+'"]').inputValue(),'unconfirmed');
    assert.deepEqual(loaded.targets[0].original_cut,f.board.cuts[1]);
    assert.deepEqual(loaded.targets[0].continuity.neighbors.previous.original_cut,f.board.cuts[0]);
    assert.deepEqual(loaded.targets[0].continuity.neighbors.next.original_cut,f.board.cuts[2]);
    assert.deepEqual(loaded.targets[0].review_entries[0],copy(review.cuts[0]));
    await page.locator('#proposalToApply').click();await page.locator('#applySourceFile').setInputFiles(source);
    assert.equal(await page.locator('#applyGenerate').isDisabled(),true);
    // Synthetic test-author actions exclusively through UI.
    await page.locator('#proposalDecision').selectOption('adopt_proposal');
    await page.locator('#proposalSummary').fill('Lower the hand slowly in this cut.');
    await page.locator('#proposalReason').fill('Synthetic timing-independent direction test.');
    await page.locator('#proposalToApply').click();assert.equal(await page.locator('#applyGenerate').isDisabled(),true);
    for(const topic of ['timing','actions','subjects','props','wardrobe','camera'])await page.locator('[data-check-topic="'+topic+'"]').selectOption('consistent');
    await page.locator('#proposalToApply').click();
    const related=page.locator('[data-approval="related_confirmed"]');if(await related.count())await related.check();
    await page.waitForFunction(()=>!document.getElementById('applyFinal').disabled);
    const approvedFile=path.join(dir,format+'-ui-proposal.json');
    const approved=await download(page,'#proposalExport',approvedFile);
    const positive=cli('preflight',{proposal:approvedFile,storyboard:source,analysis},path.join(dir,format+'-positive.json'));assert.equal(positive.eligible_count,1);
    assert.equal(await page.locator('#applyGenerate').isDisabled(),true);assert.equal(await page.locator('#applyFinal').isChecked(),false);
    // CLI editing invalidates the synthetic saved author checks; no stale approval reuse.
    const secondEdits=put(format+'-second-edits.json',{edits:[{cut_id:'cut_1',path:['actions','0','action'],value:'raise hand slowly'}]});
    const invalidatedFile=path.join(dir,format+'-invalidated.json'),invalidated=cli('proposal-edit',{proposal:approvedFile,storyboard:source,edits:secondEdits},invalidatedFile);
    assert.ok(Object.values(invalidated.targets[0].continuity.author_checks).every(c=>c.status==='unconfirmed'));
    await page.locator('#applyProposalFile').setInputFiles(invalidatedFile);assert.equal(await page.locator('#applyGenerate').isDisabled(),true);assert.equal(await page.locator('#applyFinal').isDisabled(),true);
    await page.locator('#applyProposalFile').setInputFiles(approvedFile);
    for(const index of [1,0,2]){
     const mismatch=copy(board),cuts=Array.isArray(mismatch)?mismatch:mismatch.cuts;cuts[index].actions[0].action='source mismatch';
     await page.locator('#applySourceFile').setInputFiles(put(format+'-mismatch-'+index+'.json',mismatch));
     await page.waitForFunction(()=>document.getElementById('applyBlockers').textContent.includes('一致'));
     assert.equal(await page.locator('#applyFinal').isDisabled(),true);assert.equal(await page.locator('#applyGenerate').isDisabled(),true);
     await page.locator('#applySourceFile').setInputFiles(source);
    }
    if(await related.count())await related.check();
    assert.equal(await page.locator('#applyGenerate').isDisabled(),true);
    await page.locator('#applyFinal').check();await page.locator('#applyGenerate').click();
    await page.waitForFunction(()=>!document.getElementById('applyBoardExport').disabled);
    const revised=await download(page,'#applyBoardExport',path.join(dir,format+'-revised.json'));
    const history=await download(page,'#applyHistoryExport',path.join(dir,format+'-history.json'));
    const expected=copy(board);(Array.isArray(expected)?expected:expected.cuts)[1].actions[0].action='lower hand slowly';
    assert.deepEqual(revised,expected);assert.equal(Array.isArray(revised),format==='array');
    assert.equal((Array.isArray(revised)?revised:revised.cuts).length,44);
    assert.equal(history.applied.length,1);assert.equal(history.held.length,0);assert.equal(history.final_confirmation.confirmed,true);
    assert.deepEqual(history.applied[0].changes,approved.targets[0].draft_changes);
    assert.ok(Object.values(history.applied[0].proposal_author_checks).every(c=>c.status==='consistent'));
    assert.equal(await page.evaluate(()=>MVStoryboardBaseline.load()),null);assert.deepEqual(await page.evaluate(()=>MVApplyUI.getBoard()),board);
    assert.deepEqual(errors,[]);
    console.log('PASS '+format+': CLI -> PWA; 44 CUT, only CUT 02 actions[0].action; stale/mismatched/unapproved blocked; baseline absent and unchanged');
   }finally{await context.close();}
  }
  for(const [file,bytes] of inputs)assert.deepEqual(fs.readFileSync(file),bytes);
  console.log('PASS inputs unchanged; 2/2 round-trip scenarios');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('mv-cli-pwa-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';

const VERSION = '0.6.1-fix1';
const ESSENTIA_VERSION = '0.1.3';
const AUDIO_BEAT_VERSION = '2.1.3';
const ESSENTIA_BASE = `https://cdn.jsdelivr.net/npm/essentia.js@${ESSENTIA_VERSION}/dist`;
const AUDIO_BEAT_URL = `https://esm.sh/@audio/beat@${AUDIO_BEAT_VERSION}?bundle`;
const ANALYSIS_SR = 44100;

const $ = (id) => document.getElementById(id);
const ui = {
  input:$('audioInput'), drop:$('dropZone'), fileInfo:$('fileInfo'), analyze:$('analyzeBtn'), reset:$('resetBtn'),
  vocals:$('vocalsInput'), drums:$('drumsInput'), bass:$('bassInput'), other:$('otherInput'), stemInfo:$('stemInfo'), lyrics:$('lyricsInput'), srt:$('srtInput'), srtChoose:$('srtChooseBtn'), srtInfo:$('srtInfo'), lyricPanel:$('lyricResultPanel'), lyricEditor:$('lyricTimelineEditor'),
  statusPanel:$('statusPanel'), statusText:$('statusText'), statusPercent:$('statusPercent'), progress:$('progressBar'),
  engineStatus:$('engineStatus'), warning:$('warningText'), results:$('results'),
  bpm:$('bpmValue'), bpmSub:$('bpmSub'), key:$('keyValue'), keySub:$('keySub'),
  beat:$('beatValue'), onset:$('onsetValue'), onsetSub:$('onsetSub'),
  lowOnset:$('lowOnsetValue'), highOnset:$('highOnsetValue'), duration:$('durationValue'), agreement:$('agreementValue'),
  canvas:$('curveCanvas'), sections:$('sectionList'), hooks:$('hookList'), estimators:$('estimatorList'),
  json:$('jsonPreview'), download:$('downloadBtn'), share:$('shareBtn'), copy:$('copyBtn')
};

let selectedFile = null;
const stemFiles = {vocals:null,drums:null,bass:null,other:null};
let analysisResult = null;
let srtFile = null;
let essentia = null;
let audioBeat = null;

function setProgress(pct,text){
  const p=Math.max(0,Math.min(100,pct));
  ui.statusPanel.classList.remove('hidden');
  ui.progress.style.width=`${p}%`;
  ui.statusPercent.textContent=`${Math.round(p)}%`;
  ui.statusText.textContent=text;
}
function setEngineStatus(items){
  ui.engineStatus.innerHTML = items.map(x=>`<span class="${x.ok?'ok':'fallback'}">${x.ok?'●':'△'} ${escapeHtml(x.label)}</span>`).join(' &nbsp; ');
}
function showWarning(text){
  ui.warning.textContent=text;
  ui.warning.classList.toggle('hidden',!text);
}
function fmtBytes(bytes){const u=['B','KB','MB','GB'];let i=0,n=bytes;while(n>=1024&&i<u.length-1){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${u[i]}`;}
function fmtTime(sec){if(!Number.isFinite(sec))return'—';const m=Math.floor(sec/60),s=sec-m*60;return `${m}:${s.toFixed(1).padStart(4,'0')}`;}
function round(n,d=4){return Number.isFinite(n)?Number(n.toFixed(d)):null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function asArray(x){return x?Array.from(x):[];}

function pickFile(file){
  if(!file)return;
  if(!(file.type.startsWith('audio/')||/\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(file.name))){
    showWarning('音声ファイルを選択してください。');return;
  }
  selectedFile=file;analysisResult=null;
  ui.fileInfo.innerHTML=`<strong>${escapeHtml(file.name)}</strong><br><span>${fmtBytes(file.size)} / ${escapeHtml(file.type||'audio')}</span>`;
  ui.fileInfo.classList.remove('hidden');
  ui.analyze.disabled=false;ui.reset.disabled=false;ui.results.classList.add('hidden');ui.statusPanel.classList.add('hidden');showWarning('');
}
ui.input.addEventListener('change',()=>pickFile(ui.input.files?.[0]));
ui.drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')ui.input.click();});
['dragenter','dragover'].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.add('dragover');}));
['dragleave','drop'].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.remove('dragover');}));
ui.drop.addEventListener('drop',e=>pickFile(e.dataTransfer.files?.[0]));

function updateStemInfo(){
  const chosen=Object.entries(stemFiles).filter(([,f])=>f);
  ui.stemInfo.textContent=chosen.length
    ? `詳細解析モード：${chosen.map(([k,f])=>`${k}=${f.name}`).join(' / ')}`
    : 'Stem未選択：通常解析モード';
}
for(const role of ['vocals','drums','bass','other']){
  ui[role].addEventListener('change',()=>{
    stemFiles[role]=ui[role].files?.[0]||null;
    updateStemInfo();
  });
}

if(ui.srtChoose && ui.srt) ui.srtChoose.addEventListener('click',()=>{
  // Android/installed PWAでもネイティブのファイルピッカーを明示的に開く。
  ui.srt.click();
});

if(ui.srt) ui.srt.addEventListener('change',()=>{
  srtFile=ui.srt.files?.[0]||null;
  if(ui.srtInfo) ui.srtInfo.textContent=srtFile?`SRT読込：${srtFile.name}`:'SRT未選択';
});

ui.reset.addEventListener('click',resetAll);
ui.analyze.addEventListener('click',analyzeSelectedFile);
ui.download.addEventListener('click',downloadJSON);
ui.share.addEventListener('click',shareJSON);
ui.copy.addEventListener('click',copySummary);

function resetAll(){
  selectedFile=null;analysisResult=null;ui.input.value='';
  for(const role of ['vocals','drums','bass','other']){stemFiles[role]=null;ui[role].value='';} updateStemInfo();
  ui.fileInfo.classList.add('hidden');ui.results.classList.add('hidden');ui.statusPanel.classList.add('hidden'); if(ui.lyrics)ui.lyrics.value=''; srtFile=null; if(ui.srt)ui.srt.value=''; if(ui.srtInfo)ui.srtInfo.textContent='SRT未選択'; if(ui.lyricPanel)ui.lyricPanel.classList.add('hidden');
  ui.analyze.disabled=true;ui.reset.disabled=true;showWarning('');
}

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){if(existing.dataset.loaded==='1')resolve();else existing.addEventListener('load',resolve,{once:true});return;}
    const s=document.createElement('script');s.src=src;s.async=true;
    s.onload=()=>{s.dataset.loaded='1';resolve();};s.onerror=()=>reject(new Error(`ライブラリ読み込み失敗: ${src}`));
    document.head.appendChild(s);
  });
}
async function ensureLibraries(){
  const state=[];
  if(!essentia){
    setProgress(5,'Essentia.jsを読み込み中…');
    await loadScript(`${ESSENTIA_BASE}/essentia-wasm.web.js`);
    await loadScript(`${ESSENTIA_BASE}/essentia.js-core.min.js`);
    if(!window.Essentia||!window.EssentiaWASM)throw new Error('Essentia.jsの初期化に失敗しました。');
    const wasmModule=await window.EssentiaWASM();
    essentia=new window.Essentia(wasmModule);
  }
  state.push({label:`Essentia.js ${ESSENTIA_VERSION}`,ok:true});

  if(!audioBeat){
    setProgress(9,'@audio/beatを読み込み中…');
    try{
      audioBeat=await import(AUDIO_BEAT_URL);
      state.push({label:`@audio/beat ${AUDIO_BEAT_VERSION}`,ok:true});
    }catch(err){
      console.warn('@audio/beat load failed; fallback to Essentia only',err);
      audioBeat=null;
      state.push({label:'@audio/beat 未使用 / Essentiaへフォールバック',ok:false});
    }
  }else state.push({label:`@audio/beat ${AUDIO_BEAT_VERSION}`,ok:true});
  setEngineStatus(state);
}

async function decodeAndResample(file){
  const arrayBuffer=await file.arrayBuffer();
  const Ctx=window.AudioContext||window.webkitAudioContext;
  const ctx=new Ctx();
  const decoded=await ctx.decodeAudioData(arrayBuffer.slice(0));
  const sourceRate=decoded.sampleRate,sourceChannels=decoded.numberOfChannels;
  let buffer=decoded;
  if(decoded.sampleRate!==ANALYSIS_SR){
    const length=Math.ceil(decoded.duration*ANALYSIS_SR);
    const offline=new OfflineAudioContext(decoded.numberOfChannels,length,ANALYSIS_SR);
    const src=offline.createBufferSource();src.buffer=decoded;src.connect(offline.destination);src.start();
    buffer=await offline.startRendering();
  }
  await ctx.close();
  return{buffer,sourceRate,sourceChannels};
}
function downmixToMono(buffer){
  const n=buffer.length,ch=buffer.numberOfChannels,mono=new Float32Array(n);
  for(let c=0;c<ch;c++){const d=buffer.getChannelData(c);for(let i=0;i<n;i++)mono[i]+=d[i]/ch;}
  return mono;
}
function safeVectorToArray(v){
  if(!v)return[];
  try{return Array.from(essentia.vectorToArray(v));}
  finally{try{if(v.delete)v.delete();}catch(_){}}
}

function biquadCoeffs(type,f0,Q,fs){
  const w0=2*Math.PI*f0/fs,cos=Math.cos(w0),sin=Math.sin(w0),alpha=sin/(2*Q);
  let b0,b1,b2,a0,a1,a2;
  if(type==='lowpass'){b0=(1-cos)/2;b1=1-cos;b2=(1-cos)/2;a0=1+alpha;a1=-2*cos;a2=1-alpha;}
  else{b0=(1+cos)/2;b1=-(1+cos);b2=(1+cos)/2;a0=1+alpha;a1=-2*cos;a2=1-alpha;}
  return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0};
}
function applyBiquad(input,c){
  const out=new Float32Array(input.length);let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<input.length;i++){const x=input[i],y=c.b0*x+c.b1*x1+c.b2*x2-c.a1*y1-c.a2*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
  return out;
}
function rmsFrames(signal,fs,winSec=.5,hopSec=.25){
  const win=Math.max(256,Math.round(winSec*fs)),hop=Math.max(128,Math.round(hopSec*fs)),rows=[];
  for(let start=0;start<signal.length;start+=hop){
    const end=Math.min(signal.length,start+win);if(end-start<win*.35)break;
    let ss=0;for(let i=start;i<end;i++)ss+=signal[i]*signal[i];
    const rms=Math.sqrt(ss/(end-start));rows.push({t:(start+(end-start)/2)/fs,rms,db:20*Math.log10(rms+1e-9)});
  }
  return rows;
}
function buildBandSignals(mono,fs){
  const q=Math.SQRT1_2;
  const low=applyBiquad(mono,biquadCoeffs('lowpass',250,q,fs));
  const midHP=applyBiquad(mono,biquadCoeffs('highpass',250,q,fs));
  const mid=applyBiquad(midHP,biquadCoeffs('lowpass',4000,q,fs));
  const high=applyBiquad(mono,biquadCoeffs('highpass',4000,q,fs));
  return{low,mid,high};
}
function buildBandCurves(mono,bands,fs){
  const totalR=rmsFrames(mono,fs),lowR=rmsFrames(bands.low,fs),midR=rmsFrames(bands.mid,fs),highR=rmsFrames(bands.high,fs),out=[];
  for(let i=0;i<Math.min(totalR.length,lowR.length,midR.length,highR.length);i++){
    const eL=lowR[i].rms**2,eM=midR[i].rms**2,eH=highR[i].rms**2,sum=eL+eM+eH+1e-15;
    out.push({t:round(totalR[i].t,3),loudness_db:round(totalR[i].db,3),
      low_db:round(lowR[i].db,3),mid_db:round(midR[i].db,3),high_db:round(highR[i].db,3),
      low_ratio:round(eL/sum,5),mid_ratio:round(eM/sum,5),high_ratio:round(eH/sum,5)});
  }
  return out;
}
function percentile(arr,p){
  const a=arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return 0;
  const idx=(a.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return a[lo]+(a[hi]-a[lo])*(idx-lo);
}
function normalize(v,min,max){return max>min?(v-min)/(max-min):0;}
function detectSections(curves,maxCount=10){
  if(curves.length<3)return[];
  const loud=curves.map(x=>x.loudness_db),low=curves.map(x=>x.low_ratio),mid=curves.map(x=>x.mid_ratio),high=curves.map(x=>x.high_ratio);
  const mins=[Math.min(...loud),Math.min(...low),Math.min(...mid),Math.min(...high)];
  const maxs=[Math.max(...loud),Math.max(...low),Math.max(...mid),Math.max(...high)];
  const changes=[];
  for(let i=1;i<curves.length;i++){
    const a=curves[i-1],b=curves[i];
    const score=Math.abs(normalize(b.loudness_db,mins[0],maxs[0])-normalize(a.loudness_db,mins[0],maxs[0]))*1.4+
      Math.abs(b.low_ratio-a.low_ratio)+Math.abs(b.mid_ratio-a.mid_ratio)+Math.abs(b.high_ratio-a.high_ratio);
    changes.push({time_sec:b.t,score});
  }
  const threshold=percentile(changes.map(x=>x.score),.82),sorted=changes.filter(x=>x.score>=threshold).sort((a,b)=>b.score-a.score),chosen=[];
  for(const c of sorted){if(chosen.every(x=>Math.abs(x.time_sec-c.time_sec)>=4))chosen.push(c);if(chosen.length>=maxCount)break;}
  return chosen.sort((a,b)=>a.time_sec-b.time_sec).map(x=>({time_sec:round(x.time_sec,3),score:round(x.score,4),label:'feature_change_candidate'}));
}
function nearestCurve(curves,t){
  if(!curves.length)return null;
  let lo=0,hi=curves.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(curves[m].t<t)lo=m+1;else hi=m;}
  const a=curves[lo],b=curves[Math.max(0,lo-1)];
  return !b||Math.abs(a.t-t)<Math.abs(b.t-t)?a:b;
}
function bpmAgreement(a,b){
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0)return null;
  const ratios=[b/a,(2*b)/a,(b/2)/a];
  const err=Math.min(...ratios.map(r=>Math.abs(1-r)));
  return clamp(1-err/.08,0,1);
}
function dedupeTimes(arr,minGap=.04){
  const sorted=arr.filter(Number.isFinite).sort((a,b)=>a-b),out=[];
  for(const t of sorted)if(!out.length||t-out[out.length-1]>=minGap)out.push(t);
  return out;
}
function densityPeaks(times,duration,windowSec=4,stepSec=2,count=3){
  const rows=[];
  for(let start=0;start<duration;start+=stepSec)rows.push({time_sec:start+windowSec/2,count:times.filter(t=>t>=start&&t<start+windowSec).length});
  rows.sort((a,b)=>b.count-a.count);const out=[];
  for(const r of rows){if(r.count>0&&out.every(x=>Math.abs(x.time_sec-r.time_sec)>=6)){out.push(r);if(out.length>=count)break;}}
  return out.sort((a,b)=>a.time_sec-b.time_sec);
}
function sustainedLowCandidates(curves){
  if(curves.length<8)return[];
  const lowThr=percentile(curves.map(x=>x.low_ratio),.82);
  const loudThr=percentile(curves.map(x=>x.loudness_db),.35);
  const out=[];let start=null,peak=0;
  for(let i=0;i<curves.length;i++){
    const c=curves[i],ok=c.low_ratio>=lowThr&&c.loudness_db>=loudThr;
    if(ok&&start===null){start=c.t;peak=c.low_ratio;}
    if(ok)peak=Math.max(peak,c.low_ratio);
    if((!ok||i===curves.length-1)&&start!==null){
      const end=ok?c.t:curves[Math.max(0,i-1)].t;
      if(end-start>=1.5)out.push({start_sec:round(start,3),end_sec:round(end,3),peak_low_ratio:round(peak,4)});
      start=null;peak=0;
    }
  }
  return out.slice(0,8);
}

function eventStrength(curves,t,band='full'){
  const c=nearestCurve(curves,t);
  if(!c)return 0;
  const loud=clamp((c.loudness_db+72)/60,0,1);
  const ratio=band==='low'?c.low_ratio:band==='high'?c.high_ratio:Math.max(c.low_ratio,c.mid_ratio,c.high_ratio);
  return clamp(.58*loud+.42*ratio,0,1);
}
function isAudibleAt(curves,t,thresholdDb=-60){
  const c=nearestCurve(curves,t);
  return !!c && Number.isFinite(c.loudness_db) && c.loudness_db>=thresholdDb;
}
function nearestBeatDistance(beats,t){
  if(!beats||!beats.length)return null;
  let best=Infinity;
  for(const b of beats){const d=Math.abs(b-t);if(d<best)best=d;if(b>t&&d>best)break;}
  return Number.isFinite(best)?best:null;
}
function distributedTop(events,duration,maxCount=48,minGap=.18){
  if(!events.length)return[];
  const bucketCount=Math.max(1,Math.ceil(duration/15));
  const perBucket=Math.max(2,Math.ceil(maxCount/bucketCount));
  const picked=[];
  for(let bi=0;bi<bucketCount;bi++){
    const a=bi*duration/bucketCount,b=(bi+1)*duration/bucketCount;
    const rows=events.filter(e=>e.time_sec>=a&&e.time_sec<b).sort((x,y)=>(y.normalized_strength||0)-(x.normalized_strength||0));
    for(const e of rows){
      if(picked.filter(x=>x.time_sec>=a&&x.time_sec<b).length>=perBucket)break;
      if(picked.every(x=>Math.abs(x.time_sec-e.time_sec)>=minGap))picked.push(e);
    }
  }
  if(picked.length<maxCount){
    const rest=events.slice().sort((x,y)=>(y.normalized_strength||0)-(x.normalized_strength||0));
    for(const e of rest){
      if(picked.length>=maxCount)break;
      if(picked.every(x=>Math.abs(x.time_sec-e.time_sec)>=minGap))picked.push(e);
    }
  }
  return picked.sort((a,b)=>a.time_sec-b.time_sec).slice(0,maxCount);
}
function buildMvSyncCandidates({onsets,lowOnsets,highOnsets,sections,curves,duration,beats=[]}){
  const silenceThresholdDb=-60;
  const raw=[];
  const add=(t,type,band,reason,mv_use)=>{
    if(!Number.isFinite(t)||t<0||t>duration||!isAudibleAt(curves,t,silenceThresholdDb))return;
    const c=nearestCurve(curves,t);
    const s=eventStrength(curves,t,band);
    raw.push({
      time_sec:round(t,3),type,band,
      strength:round(s,4),normalized_strength:round(s,4),
      confidence:s>=.72?'high':s>=.45?'medium':'low',
      local_loudness_db:round(c?.loudness_db??null,3),
      beat_distance_sec:round(nearestBeatDistance(beats,t),4),
      source_detector:type==='low_band_accent'||type==='high_band_accent'?'band_onset':'spectral_flux',
      eligible_for_mv_sync:s>=.34,
      reason,mv_use
    });
  };

  onsets.forEach(t=>add(t,'transient_accent','full','可聴域のトランジェント','身体・小道具・編集アクセント候補'));
  lowOnsets.forEach(t=>add(t,'low_band_accent','low','低域オンセット','重量運動／回転／キック／筐体振動候補'));
  highOnsets.forEach(t=>add(t,'high_band_accent','high','高域オンセット','ヒール／指／金属接触／短いインサート候補'));

  const eligible=raw.filter(x=>x.eligible_for_mv_sync);
  const chosen=distributedTop(eligible,duration,48,.16);

  densityPeaks(onsets.filter(t=>isAudibleAt(curves,t,silenceThresholdDb)),duration,4,2,8)
    .forEach(d=>chosen.push({time_sec:round(d.time_sec,3),type:'transient_cluster',confidence:'medium',strength:null,normalized_strength:null,band:'full',local_loudness_db:round(nearestCurve(curves,d.time_sec)?.loudness_db??null,3),beat_distance_sec:round(nearestBeatDistance(beats,d.time_sec),4),source_detector:'density',eligible_for_mv_sync:true,reason:`約4秒内のオンセット密度が高い (${d.count})`,mv_use:'細かな身体フレーズ／カット密度上昇候補'}));

  sections.forEach(s=>chosen.push({time_sec:s.time_sec,type:'structural_change',confidence:'medium',strength:round(s.score,4),normalized_strength:null,band:'mixed',local_loudness_db:round(nearestCurve(curves,s.time_sec)?.loudness_db??null,3),beat_distance_sec:round(nearestBeatDistance(beats,s.time_sec),4),source_detector:'feature_change',eligible_for_mv_sync:true,reason:'音量・帯域構成の変化が大きい',mv_use:'意味段階／マルチショットブロック境界候補'}));

  sustainedLowCandidates(curves).forEach(x=>chosen.push({time_sec:x.start_sec,end_sec:x.end_sec,type:'sustained_low_energy',confidence:'medium',strength:round(x.peak_low_ratio,4),normalized_strength:round(x.peak_low_ratio,4),band:'low',local_loudness_db:round(nearestCurve(curves,x.start_sec)?.loudness_db??null,3),beat_distance_sec:round(nearestBeatDistance(beats,x.start_sec),4),source_detector:'band_curve',eligible_for_mv_sync:true,reason:'低域優勢が一定時間継続',mv_use:'慣性回転／世界側だけ動き続ける対位候補'}));

  const uniq=[];
  chosen.sort((a,b)=>a.time_sec-b.time_sec).forEach(h=>{
    if(uniq.every(u=>u.type!==h.type||Math.abs(u.time_sec-h.time_sec)>.12))uniq.push(h);
  });
  return {
    silence_gate_db:silenceThresholdDb,
    raw_event_count:raw.length,
    rejected_below_gate:raw.filter(x=>!x.eligible_for_mv_sync).length,
    candidates:uniq
  };
}

function essentiaRhythm(mono){
  let vec=null;
  try{
    vec=essentia.arrayToVector(mono);
    const r=essentia.RhythmExtractor2013(vec);
    return{
      bpm:round(r.bpm,4),
      confidence:round(r.confidence,5),
      beat_times_sec:safeVectorToArray(r.ticks).map(x=>round(x,4)),
      bpm_estimates:safeVectorToArray(r.estimates).map(x=>round(x,4))
    };
  }finally{try{if(vec)vec.delete();}catch(_){}}
}
function essentiaKey(mono){
  let vec=null;
  try{
    vec=essentia.arrayToVector(mono);
    const k=essentia.KeyExtractor(vec);
    return{key:k.key||null,scale:k.scale||null,strength:round(k.strength,5)};
  }finally{try{if(vec)vec.delete();}catch(_){}}
}
function essentiaOnsets(mono){
  let vec=null;
  try{
    vec=essentia.arrayToVector(mono);
    let r;
    try{r=essentia.SuperFluxExtractor(vec,20,2048,256,16,ANALYSIS_SR,.05);}
    catch(_){r=essentia.OnsetRate(vec);}
    const onsetVec=r.onsets||null;
    const times=onsetVec&&typeof onsetVec!=='number'?safeVectorToArray(onsetVec):[];
    return{times:times.map(x=>round(x,4)),rate:round(r.onsetRate??(times.length/(mono.length/ANALYSIS_SR)),5)};
  }finally{try{if(vec)vec.delete();}catch(_){}}
}


function localDbAt(curves,t){
  if(!curves?.length)return null;
  const idx=Math.max(0,Math.min(curves.length-1,Math.round(t/.25)));
  return curves[idx]?.loudness_db??null;
}
function compactStemCurves(curves){
  return curves.map(x=>({t:x.t,loudness_db:x.loudness_db,low_ratio:x.low_ratio,mid_ratio:x.mid_ratio,high_ratio:x.high_ratio}));
}
async function analyzeStemFile(file,role,originalDuration){
  const {buffer,sourceRate,sourceChannels}=await decodeAndResample(file);
  const mono=downmixToMono(buffer),duration=mono.length/ANALYSIS_SR;
  const bands=buildBandSignals(mono,ANALYSIS_SR);
  const curves=buildBandCurves(mono,bands,ANALYSIS_SR);
  let onsets=[];
  if(audioBeat){
    try{onsets=dedupeTimes(asArray(audioBeat.onsets(mono,{fs:ANALYSIS_SR}))).map(x=>round(x,4));}catch(_){}
  }
  if(!onsets.length)onsets=essentiaOnsets(mono).times;
  const audible=onsets.filter(t=>(localDbAt(curves,t)??-120)>=-60);
  const events=audible.map(t=>{
    const db=localDbAt(curves,t);
    return {time_sec:t,type:role==='vocals'?'unknown_vocal_event':'stem_onset',
      stem:role,local_loudness_db:round(db,3),confidence:'candidate',
      eligible_for_mv_sync:true,
      note:role==='vocals'?'Vocal stem上の発声/子音/ブレス等の候補。意味種別は未確定。':'Stem上のオンセット候補。'};
  });
  return {
    file_name:file.name,mime_type:file.type||null,file_size_bytes:file.size,
    duration_sec:round(duration,5),source_sample_rate_hz:sourceRate,source_channels:sourceChannels,
    duration_delta_from_original_sec:round(duration-originalDuration,5),
    alignment_status:Math.abs(duration-originalDuration)<=.25?'aligned':'check_required',
    onset_times_sec:onsets,audible_onset_times_sec:audible,
    event_candidates:events,
    dynamics_and_bands:{window_sec:.5,hop_sec:.25,curves:compactStemCurves(curves)}
  };
}
function mergeStemMvCandidates(originalCandidates,stemAnalysis){
  const all=[...(originalCandidates||[])];
  for(const [role,s] of Object.entries(stemAnalysis||{})){
    for(const e of (s?.event_candidates||[])){
      all.push({...e,mv_use:role==='vocals'?'歌詞/スキャット/ボイパ等の時刻照合候補':'Stem由来の動作同期候補'});
    }
  }
  return all.sort((a,b)=>(a.time_sec??0)-(b.time_sec??0));
}


// v0.5: 音響特徴を、具体的な演出より一段手前の「運動プリミティブ」へ圧縮する。
// ここでは物体名や人物動作を決めず、根拠 feature / detector と confidence を保持する。
function avg(a){const v=a.filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:0;}
function std(a){const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)));}
function trend(a){
  const v=a.filter(Number.isFinite);if(v.length<2)return 0;
  const n=v.length,mx=(n-1)/2,my=avg(v);let num=0,den=0;
  for(let i=0;i<n;i++){num+=(i-mx)*(v[i]-my);den+=(i-mx)**2;}
  return den?num/den:0;
}
function confidenceLabel(v){return v>=.72?'high':v>=.45?'medium':'low';}
function timesIn(times,a,b){return (times||[]).filter(t=>t>=a&&t<b);}
function stemEventsIn(stemAnalysis,role,a,b){return (stemAnalysis?.[role]?.event_candidates||[]).filter(e=>e.time_sec>=a&&e.time_sec<b);}
function stemCurveWindow(stemAnalysis,role,a,b){return (stemAnalysis?.[role]?.dynamics_and_bands?.curves||[]).filter(x=>x.t>=a&&x.t<b);}
function makePrimitive(type,strength,evidence,extra={}){
  const s=round(clamp(strength,0,1),4);
  return {type,strength:s,confidence:confidenceLabel(s),evidence, ...extra};
}
function buildMotionPrimitiveLayer({duration,bpm,beats,onsets,lowOnsets,highOnsets,curves,sections,stemAnalysis}){
  // 4 beatsを基本フレーズ窓にする。BPMが不確かな場合は4秒。
  const phraseSec=Number.isFinite(bpm)&&bpm>0?clamp(240/bpm,2,8):4;
  const windows=[];
  const globalLoud=curves.map(x=>x.loudness_db), loudLo=percentile(globalLoud,.1), loudHi=percentile(globalLoud,.9);
  const globalOnsetRate=(onsets?.length||0)/Math.max(duration,1);
  const sectionTimes=(sections||[]).map(x=>x.time_sec);

  for(let start=0;start<duration;start+=phraseSec){
    const end=Math.min(duration,start+phraseSec), span=Math.max(.001,end-start);
    const cs=curves.filter(x=>x.t>=start&&x.t<end);if(!cs.length)continue;
    const ons=timesIn(onsets,start,end), lows=timesIn(lowOnsets,start,end), highs=timesIn(highOnsets,start,end);
    const loud=cs.map(x=>x.loudness_db), low=cs.map(x=>x.low_ratio), mid=cs.map(x=>x.mid_ratio), high=cs.map(x=>x.high_ratio);
    const loudNorm=clamp((avg(loud)-loudLo)/Math.max(1,loudHi-loudLo),0,1);
    const onsetRate=ons.length/span;
    const densityNorm=clamp(onsetRate/Math.max(globalOnsetRate*2.2,.8),0,1);
    const lowMean=avg(low), highMean=avg(high);

    const drumCount=stemEventsIn(stemAnalysis,'drums',start,end).length;
    const bassCount=stemEventsIn(stemAnalysis,'bass',start,end).length;
    const vocalCount=stemEventsIn(stemAnalysis,'vocals',start,end).length;
    const otherCount=stemEventsIn(stemAnalysis,'other',start,end).length;
    const activeStems=[drumCount,bassCount,vocalCount,otherCount].filter(x=>x>0).length;
    const drumDensity=clamp((drumCount/span)/Math.max(globalOnsetRate*1.5,.7),0,1);
    const bassCurve=stemCurveWindow(stemAnalysis,'bass',start,end);
    const bassLow=bassCurve.length?avg(bassCurve.map(x=>x.low_ratio)):lowMean;

    const accent=clamp(.50*densityNorm+.22*drumDensity+.14*clamp(lows.length/Math.max(1,ons.length),0,1)+.14*clamp(highs.length/Math.max(1,ons.length),0,1),0,1);
    const force=clamp(.48*lowMean+.27*bassLow+.25*loudNorm,0,1);

    // 周期性は窓内オンセット間隔の安定性を近似根拠とする。
    const intervals=ons.slice(1).map((t,i)=>t-ons[i]).filter(x=>x>.04);
    const intervalMean=avg(intervals), cv=intervalMean?std(intervals)/intervalMean:1;
    const periodicity=intervals.length>=2?clamp(1-cv,0,1):0;

    // 蓄積: 音量・密度・低域・active stemの増加を複合する。
    const half=start+span/2;
    const first=curves.filter(x=>x.t>=start&&x.t<half), second=curves.filter(x=>x.t>=half&&x.t<end);
    const loudRise=clamp((avg(second.map(x=>x.loudness_db))-avg(first.map(x=>x.loudness_db))+3)/12,0,1);
    const firstOns=timesIn(onsets,start,half).length, secondOns=timesIn(onsets,half,end).length;
    const densityRise=clamp((secondOns-firstOns+1)/Math.max(2,firstOns+1),0,1);
    const lowRise=clamp((avg(second.map(x=>x.low_ratio))-avg(first.map(x=>x.low_ratio))+.08)/.28,0,1);
    const accumulation=clamp(.32*loudRise+.32*densityRise+.18*lowRise+.18*(activeStems/4),0,1);

    const transitionDist=sectionTimes.length?Math.min(...sectionTimes.map(t=>Math.abs(t-(start+span/2)))):999;
    const transition=clamp(1-transitionDist/Math.max(1.5,phraseSec),0,1);

    // RELEASEは「転換」単独ではなく、直前窓の蓄積と現在の密度/音量低下または構造転換を要求する。
    const prev=windows[windows.length-1];
    const prevAcc=prev?.primitives?.ACCUMULATION?.strength||0;
    const prevDensity=prev?.metrics?.onset_density_norm||0;
    const drop=prev?clamp(((prev.metrics.loudness_norm-loudNorm)+(prevDensity-densityNorm)+.2)/1.2,0,1):0;
    const release=clamp(prevAcc*(.55*transition+.45*drop),0,1);

    // SUSTAIN: 小さな音量変動 + オンセット低密度 + 可聴持続を continuous_force として扱う。
    const loudStability=clamp(1-std(loud)/10,0,1);
    const sustain=clamp(.48*loudStability+.32*(1-densityNorm)+.20*loudNorm,0,1);

    // TRAJECTORY: 現版では pitch contour 未実装のため、帯域重心の時間傾向を弱い代理値としてのみ使用。
    const spectralProxy=cs.map(x=>x.mid_ratio+2*x.high_ratio);
    const tr=trend(spectralProxy);
    const trajectoryStrength=clamp(Math.abs(tr)*12,0,1)*.65;
    const direction=tr>.004?'up':tr<-.004?'down':'stable';

    // TEXTUREは材質名を決めず、low/mid/high dominance と変動性だけを出す。
    const ratios={low:lowMean,mid:avg(mid),high:highMean};
    const dominantBand=Object.entries(ratios).sort((a,b)=>b[1]-a[1])[0][0];
    const textureStrength=clamp(Math.max(...Object.values(ratios))*(.65+.35*clamp(std(spectralProxy),0,1)),0,1);

    const primitives={
      ACCENT:makePrimitive('ACCENT',accent,['onset_density','drums_stem_onsets','band_specific_onsets']),
      SUSTAIN:makePrimitive('SUSTAIN',sustain,['loudness_stability','onset_sparsity','audible_energy'],{physical_hint:'continuous_force'}),
      TRAJECTORY:makePrimitive('TRAJECTORY',trajectoryStrength,['band_centroid_proxy_trend'],{direction,limitation:'pitch contour未実装のため帯域比率の時間傾向による弱い代理推定'}),
      PERIODICITY:makePrimitive('PERIODICITY',periodicity,['onset_interval_regularity'],{interval_cv:round(cv,4)}),
      ACCUMULATION:makePrimitive('ACCUMULATION',accumulation,['loudness_trend','onset_density_trend','low_band_trend','active_stems']),
      TRANSITION:makePrimitive('TRANSITION',transition,['section_change_candidate']),
      RELEASE:makePrimitive('RELEASE',release,['previous_accumulation','transition','energy_or_density_drop']),
      TEXTURE:makePrimitive('TEXTURE',textureStrength,['band_energy_ratios','spectral_variation_proxy'],{dominant_band:dominantBand,band_ratios:{low:round(lowMean,4),mid:round(avg(mid),4),high:round(highMean,4)}}),
      FORCE:makePrimitive('FORCE',force,['low_band_energy','bass_stem_low_ratio','loudness'],{physical_hint:'weight_or_pressure'})
    };
    windows.push({
      start_sec:round(start,3),end_sec:round(end,3),window_basis:'4_beats_or_4sec_fallback',
      metrics:{loudness_norm:round(loudNorm,4),onset_density_norm:round(densityNorm,4),onset_count:ons.length,active_stems:activeStems,stem_event_counts:{vocals:vocalCount,drums:drumCount,bass:bassCount,other:otherCount}},
      primitives
    });
  }

  // コンテ側へ渡すため、各窓の上位プリミティブだけを抽出した軽量タイムラインも作る。
  const compact=windows.map(w=>{
    const ranked=Object.values(w.primitives).filter(p=>p.strength>=.35).sort((a,b)=>b.strength-a.strength).slice(0,4);
    return {start_sec:w.start_sec,end_sec:w.end_sec,dominant_primitives:ranked.map(p=>({type:p.type,strength:p.strength,confidence:p.confidence,...(p.direction?{direction:p.direction}:{}),...(p.dominant_band?{dominant_band:p.dominant_band}:{})}))};
  });
  return {
    version:'0.1',status:'heuristic_candidate_layer',
    design_rule:'音側の事実→運動プリミティブ→映像物理候補。具体的なBODY/OBJECT/CAMERA/LIGHT/SPACE/EDITへの割当は後段で決定する。',
    primitive_types:['ACCENT','SUSTAIN','TRAJECTORY','PERIODICITY','ACCUMULATION','TRANSITION','RELEASE','TEXTURE','FORCE'],
    phrase_window_sec:round(phraseSec,4),
    limitations:['TRAJECTORYはpitch contour未実装のため帯域比率傾向の代理推定','TEXTUREは材質名を確定しない','RELEASEはkey change単独では判定しない','confidenceは現段階ではヒューリスティック強度に基づく'],
    windows,compact_timeline:compact
  };
}


// v0.6.1: 外部ASR SRTを「WHEN」の観測として読み込み、正規歌詞「WHAT」と分離して保持する。
function srtTimeToSec(s){
  const m=String(s||'').trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/); if(!m)return null;
  return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4].padEnd(3,'0'))/1000;
}
function cleanAsrText(text){
  let t=String(text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const patterns=[/\(?TurboScribe[^)]*\)?/gi,/TurboScribeによって文字起こしされました[^。]*。?/gi,/このメッセージを削除するには[^。]*。?/gi,/transcribed by TurboScribe[^.]*\.?/gi];
  for(const p of patterns)t=t.replace(p,' ');
  return t.replace(/\s+/g,' ').trim();
}
function parseSrt(text){
  const blocks=String(text||'').replace(/\r/g,'').split(/\n{2,}/); const entries=[];
  for(const block of blocks){
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean); if(!lines.length)continue;
    const ti=lines.findIndex(x=>x.includes('-->')); if(ti<0)continue;
    const mm=lines[ti].match(/(\d+:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d+:\d{2}:\d{2}[,.]\d{1,3})/); if(!mm)continue;
    const start=srtTimeToSec(mm[1]),end=srtTimeToSec(mm[2]); if(start==null||end==null)continue;
    const raw=lines.slice(ti+1).join(' '), cleaned=cleanAsrText(raw); if(!cleaned)continue;
    entries.push({cue_index:entries.length,start_sec:round(start,3),end_sec:round(end,3),raw_text:raw,text:cleaned});
  }
  return entries;
}
function normJa(s){return String(s||'').toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').replace(/[ぁ-ん]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));}
function bigramSet(s){const n=normJa(s),a=new Set();if(n.length<2){if(n)a.add(n);return a;}for(let i=0;i<n.length-1;i++)a.add(n.slice(i,i+2));return a;}
function textSimilarity(a,b){const A=bigramSet(a),B=bigramSet(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return 2*hit/(A.size+B.size);}
function classifyUnmatchedAsr(text){
  const n=normJa(text); if(!n)return 'UNKNOWN';
  const scat=/^(ダ|バ|ラ|タ|ナ|パ|ド|ゥ|ア|ハ|ヤ|マ|ワ|ン|オ|ウ|エ|イ){4,}$/.test(n)||/(ダバ|ララ|ダダ|ババ|ナナ|パパ){2,}/.test(n);
  return scat?'SCAT_CANDIDATE':'UNMATCHED_VOCAL';
}
function buildAsrLyricAlignment(lyricText,srtEntries,duration){
  const lyrics=parseLyrics(lyricText).filter(x=>x.type!=='INSTRUMENTAL');
  const matches=[]; let minCue=0;
  for(const line of lyrics){
    if(!line.text)continue; let best=null;
    for(let i=minCue;i<srtEntries.length;i++){
      let joined='';
      for(let span=1;span<=3&&i+span<=srtEntries.length;span++){
        joined+=(span>1?' ':'')+srtEntries[i+span-1].text;
        const sim=textSimilarity(line.text,joined);
        if(!best||sim>best.similarity)best={i,span,similarity:sim,text:joined};
      }
      if(i>minCue+12&&best&&best.similarity>=.45)break;
    }
    if(best&&best.similarity>=.18){
      const cues=srtEntries.slice(best.i,best.i+best.span), start=cues[0].start_sec,end=cues[cues.length-1].end_sec;
      matches.push({line_index:line.line_index,type:line.type,canonical_text:line.text,start_sec:start,end_sec:end,asr_text:best.text,similarity:round(best.similarity,4),confidence:best.similarity>=.62?'high':best.similarity>=.38?'medium':'low',source:'canonical_lyrics_x_srt'});
      minCue=Math.max(minCue,best.i);
    }
  }
  const used=new Set();
  for(const m of matches)for(let i=0;i<srtEntries.length;i++){const c=srtEntries[i];if(c.start_sec<m.end_sec&&c.end_sec>m.start_sec&&textSimilarity(m.asr_text,c.text)>.05)used.add(i);}
  const unmatched=srtEntries.filter((_,i)=>!used.has(i)).map(c=>({...c,event_type:classifyUnmatchedAsr(c.text),confidence:'candidate',note:'正規歌詞との一致が弱い/無いASR区間。スキャット等の候補だが意味分類は確定しない。'}));
  return {version:'0.1',status:srtEntries.length?'srt_alignment_available':'not_supplied',role_split:{canonical_lyrics:'WHAT / 正規テキスト',srt_asr:'WHEN / 実発声時刻の観測'},matching:'monotonic_candidate_match_1_to_3_srt_cues',matches,unmatched_vocal_events:unmatched,limitations:['ASR誤認識を正規歌詞へ上書きしない','SCAT_CANDIDATEは候補分類で確定ではない','単語forced alignmentではない']};
}

// v0.6: 歌詞は音響プリミティブと独立した水脈として保持し、同一時刻軸にだけ接続する。
// 音声認識/forced alignmentは行わない。Vocal Stemの発声候補から行単位の仮同期を作り、ユーザー補正を正本にできる。
function parseTimecode(raw){
  if(!raw)return null; const m=raw.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/); if(!m)return null;
  return Number(m[1])*60+Number(m[2]);
}
function parseLyrics(text){
  return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((raw,index)=>{
    let rest=raw, anchor=null, type='LYRIC', explicitType=false;
    const tm=rest.match(/^\[(\d+:[0-5]?\d(?:\.\d+)?)\]\s*/); if(tm){anchor=parseTimecode(tm[1]);rest=rest.slice(tm[0].length).trim();}
    const ty=rest.match(/^\[(SCAT|BREATH|VOCAL|VOCALIZATION|INST|INSTRUMENTAL|LYRIC)\]\s*/i);
    if(ty){const t=ty[1].toUpperCase();type=t==='VOCAL'?'VOCALIZATION':t==='INST'?'INSTRUMENTAL':t;rest=rest.slice(ty[0].length).trim();explicitType=true;}
    return {line_index:index,text:rest||null,type,anchor_start_sec:anchor,explicit_type:explicitType};
  });
}
function clusterVocalEvents(events,duration){
  const ts=(events||[]).map(e=>e.time_sec).filter(Number.isFinite).sort((a,b)=>a-b); if(!ts.length)return [];
  const gaps=ts.slice(1).map((t,i)=>t-ts[i]).filter(x=>x>.05); const med=percentile(gaps,.5)||.35;
  const splitGap=clamp(med*3.2,.65,1.8); const groups=[]; let g=[ts[0]];
  for(let i=1;i<ts.length;i++){if(ts[i]-ts[i-1]>splitGap){groups.push(g);g=[];}g.push(ts[i]);} groups.push(g);
  return groups.map(a=>({start_sec:clamp(a[0]-.08,0,duration),end_sec:clamp(a[a.length-1]+Math.max(.28,med*.8),0,duration),event_count:a.length}));
}
function quantileTime(events,q,duration){
  const ts=(events||[]).map(e=>e.time_sec).filter(Number.isFinite).sort((a,b)=>a-b); if(!ts.length)return duration*q;
  return percentile(ts,clamp(q,0,1));
}
function buildLyricTimeline({text,vocalEvents,duration,motionPrimitives}){
  const lines=parseLyrics(text); if(!lines.length)return {version:'0.1',status:'not_supplied',alignment_method:'none',entries:[],note:'歌詞未入力'};
  const clusters=clusterVocalEvents(vocalEvents,duration), hasVocal=(vocalEvents||[]).length>0;
  const entries=lines.map((line,i)=>{
    let start=line.anchor_start_sec;
    let method=line.anchor_start_sec!==null?'user_timecode':'heuristic_vocal_activity';
    if(start===null){
      if(clusters.length===lines.length)start=clusters[i].start_sec;
      else start=quantileTime(vocalEvents,(i+.15)/Math.max(lines.length,1),duration);
    }
    let end=null;
    const nextAnchor=lines.slice(i+1).find(x=>x.anchor_start_sec!==null)?.anchor_start_sec;
    if(clusters.length===lines.length && line.anchor_start_sec===null)end=clusters[i].end_sec;
    else if(nextAnchor!==undefined&&nextAnchor!==null)end=Math.max(start+.1,nextAnchor-.05);
    else if(i<lines.length-1){const q=quantileTime(vocalEvents,(i+.92)/lines.length,duration);end=Math.max(start+.1,q);}
    else end=Math.min(duration,Math.max(start+.35,hasVocal?(vocalEvents[vocalEvents.length-1]?.time_sec||duration)+.35:duration));
    start=clamp(start,0,duration); end=clamp(end,start,duration);
    const confidence=line.anchor_start_sec!==null?'user_fixed':hasVocal?(clusters.length===lines.length?'medium':'low'):'low';
    return {line_index:i,start_sec:round(start,3),end_sec:round(end,3),type:line.type,text:line.text,confidence,alignment_method:method,manual_corrected:false};
  });
  const windows=motionPrimitives?.windows||[];
  for(const e of entries){
    const mid=(e.start_sec+e.end_sec)/2, w=windows.find(x=>mid>=x.start_sec&&mid<x.end_sec);
    e.audio_context=w?Object.values(w.primitives).filter(p=>p.strength>=.35).sort((a,b)=>b.strength-a.strength).slice(0,4).map(p=>({type:p.type,strength:p.strength,confidence:p.confidence})):[];
  }
  return {version:'0.1',status:hasVocal?'candidate_alignment_available':'timing_fallback_without_vocal_stem',alignment_method:hasVocal?'vocal_event_quantile_or_cluster':'duration_distribution',unit:'lyric_line',source_text_preserved:true,classification_rule:'LYRICを既定値とし、SCAT/BREATH/VOCALIZATION/INSTRUMENTALは入力タグで明示する。音響だけから意味分類を確定しない。',limitations:['音声認識/forced alignment未実装','単語単位同期未実装','自動同期は候補値。重要箇所は手動補正を推奨'],entries};
}
function renderLyricEditor(){
  if(!ui.lyricPanel||!ui.lyricEditor||!analysisResult?.lyric_timeline?.entries?.length){ui.lyricPanel?.classList.add('hidden');return;}
  ui.lyricPanel.classList.remove('hidden'); ui.lyricEditor.innerHTML='';
  for(const e of analysisResult.lyric_timeline.entries){
    const row=document.createElement('div');row.className='lyric-row';
    row.innerHTML=`<input type="number" step="0.01" min="0" value="${e.start_sec}" aria-label="開始秒"><input type="number" step="0.01" min="0" value="${e.end_sec}" aria-label="終了秒"><select aria-label="種別">${['LYRIC','SCAT','BREATH','VOCALIZATION','INSTRUMENTAL'].map(t=>`<option ${t===e.type?'selected':''}>${t}</option>`).join('')}</select><div class="lyric-text">${escapeHtml(e.text||'（テキストなし）')}<br><small>${escapeHtml(e.confidence)} / ${escapeHtml(e.alignment_method)}</small></div>`;
    const [a,b,sel]=row.querySelectorAll('input,select');
    const update=()=>{e.start_sec=round(clamp(Number(a.value)||0,0,analysisResult.source.duration_sec),3);e.end_sec=round(clamp(Number(b.value)||e.start_sec,e.start_sec,analysisResult.source.duration_sec),3);e.type=sel.value;e.manual_corrected=true;e.confidence='user_corrected';e.alignment_method='manual';renderJsonPreviewOnly();};
    a.addEventListener('change',update);b.addEventListener('change',update);sel.addEventListener('change',update);ui.lyricEditor.appendChild(row);
  }
}
function renderJsonPreviewOnly(){if(!analysisResult)return;const data=analysisResult;const preview={...data,dynamics_and_bands:{...data.dynamics_and_bands,curves:`[${data.dynamics_and_bands.curves.length} frames — JSON保存時は全データ]`}};ui.json.textContent=JSON.stringify(preview,null,2);}

async function analyzeSelectedFile(){
  if(!selectedFile)return;
  ui.analyze.disabled=true;ui.reset.disabled=true;showWarning('');ui.results.classList.add('hidden');
  try{
    await ensureLibraries();
    setProgress(14,'音源をデコード中…');
    const {buffer,sourceRate,sourceChannels}=await decodeAndResample(selectedFile);
    const mono=downmixToMono(buffer),duration=mono.length/ANALYSIS_SR;

    setProgress(23,'帯域信号を準備中…');
    const bands=buildBandSignals(mono,ANALYSIS_SR);

    setProgress(31,'BPM / ビートをクロスチェック中…');
    let beatPrimary=null,beatFallbackReason=null;
    const er=essentiaRhythm(mono);
    if(audioBeat){
      try{
        const d=audioBeat.detect(mono,{fs:ANALYSIS_SR});
        beatPrimary={
          engine:'@audio/beat',
          bpm:round(d.bpm,4),
          confidence:round(d.confidence??null,5),
          beat_times_sec:asArray(d.beats).map(x=>round(x,4)),
          onset_times_sec:asArray(d.onsets).map(x=>round(x,4))
        };
      }catch(err){beatFallbackReason=String(err?.message||err);}
    }
    if(!beatPrimary||!Number.isFinite(beatPrimary.bpm)||beatPrimary.beat_times_sec.length<2){
      beatPrimary={engine:'Essentia.js',bpm:er.bpm,confidence:er.confidence,beat_times_sec:er.beat_times_sec,onset_times_sec:[]};
    }
    const agree=bpmAgreement(beatPrimary.bpm,er.bpm);

    setProgress(43,'キー / スケールを解析中…');
    const tonal=essentiaKey(mono);

    setProgress(53,'オンセットを解析中…');
    const eo=essentiaOnsets(mono);
    let onsetTimes=beatPrimary.onset_times_sec.length?beatPrimary.onset_times_sec:eo.times;
    let lowOnsets=[],highOnsets=[];
    if(audioBeat){
      try{
        onsetTimes=asArray(audioBeat.onsets(mono,{fs:ANALYSIS_SR}));
        lowOnsets=asArray(audioBeat.energyOnsets(bands.low,{fs:ANALYSIS_SR}));
        highOnsets=asArray(audioBeat.energyOnsets(bands.high,{fs:ANALYSIS_SR}));
      }catch(err){console.warn('audio beat onset fallback',err);}
    }
    onsetTimes=dedupeTimes(onsetTimes).map(x=>round(x,4));
    lowOnsets=dedupeTimes(lowOnsets).map(x=>round(x,4));
    highOnsets=dedupeTimes(highOnsets).map(x=>round(x,4));

    setProgress(65,'低域 / 中域 / 高域カーブを生成中…');
    const curves=buildBandCurves(mono,bands,ANALYSIS_SR);

    setProgress(76,'構造変化候補を探索中…');
    const sections=detectSections(curves);

    setProgress(86,'MV同期候補を生成中…');
    const mvSync=buildMvSyncCandidates({onsets:onsetTimes,lowOnsets,highOnsets,sections,curves,duration,beats:beatPrimary.beat_times_sec});

    const stemAnalysis={};
    const selectedStems=Object.entries(stemFiles).filter(([,f])=>f);
    if(selectedStems.length){
      let stemIndex=0;
      for(const [role,file] of selectedStems){
        stemIndex++;
        setProgress(86+Math.min(7,stemIndex*1.5),`${role} Stemを解析中…`);
        stemAnalysis[role]=await analyzeStemFile(file,role,duration);
      }
    }


    setProgress(94,'運動プリミティブへ圧縮中…');
    const motionPrimitives=buildMotionPrimitiveLayer({duration,bpm:beatPrimary.bpm,beats:beatPrimary.beat_times_sec,onsets:onsetTimes,lowOnsets,highOnsets,curves,sections,stemAnalysis});
    let srtEntries=[]; if(srtFile){setProgress(93,'SRTと正規歌詞を照合中…');srtEntries=parseSrt(await srtFile.text());}
    const asrLyricAlignment=buildAsrLyricAlignment(ui.lyrics?.value||'',srtEntries,duration);
    let lyricTimeline=buildLyricTimeline({text:ui.lyrics?.value||'',vocalEvents:stemAnalysis.vocals?.event_candidates||[],duration,motionPrimitives});
    if(asrLyricAlignment.matches.length){
      const byLine=new Map(asrLyricAlignment.matches.map(x=>[x.line_index,x]));
      lyricTimeline.entries=lyricTimeline.entries.map(e=>{const m=byLine.get(e.line_index);return m?{...e,start_sec:m.start_sec,end_sec:m.end_sec,confidence:m.confidence,alignment_method:'external_srt_match',asr_text:m.asr_text,asr_similarity:m.similarity}:e;});
      lyricTimeline.status='external_srt_alignment_available'; lyricTimeline.alignment_method='canonical_lyrics_x_external_srt';
    }

    const warnings=[];
    if(duration>600)warnings.push('10分を超える音源はスマホで処理時間・メモリ使用量が増える可能性があります。');
    if(audioBeat===null)warnings.push('@audio/beatを読み込めなかったため、一部解析はEssentia.jsのみで実行しました。');
    if(agree!==null&&agree<.45)warnings.push('BPM推定器同士の結果差が大きいです。ハーフ/ダブルテンポを含め、実音で確認してください。');
    warnings.push('v0.6.1はv0.5の音響・Stem・運動プリミティブ解析を保持し、歌詞行を独立水脈として同一時間軸へ接続します。');
    if(srtEntries.length)warnings.push('v0.6.1は外部SRTを実発声時刻の観測として使用し、正規歌詞を文字の正本として保持します。ASR誤認識で正規歌詞を上書きしません。'); else if(lyricTimeline.entries.length)warnings.push('SRT未入力時の歌詞自動同期はVocal Stem発声候補によるヒューリスティックです。重要箇所は画面で補正してください。');
    warnings.push('このGitHub Pages版はStemを自動分離しません。外部で分離したVocals/Drums/Bass/Otherを任意入力してください。');
    warnings.push('低/中/高域カーブはMV設計向け近似であり、マスタリング測定値ではありません。');

    analysisResult={
      schema:'mv_music_analysis.v6.1',
      generated_at:new Date().toISOString(),
      engine:{
        frontend:`MV Music Analyzer ${VERSION}`,
        essentia_js:ESSENTIA_VERSION,
        audio_beat:audioBeat?AUDIO_BEAT_VERSION:null,
        processing:'browser_local',
        analysis_sample_rate_hz:ANALYSIS_SR
      },
      source:{
        file_name:selectedFile.name,mime_type:selectedFile.type||null,file_size_bytes:selectedFile.size,
        duration_sec:round(duration,5),source_sample_rate_hz:sourceRate,source_channels:sourceChannels
      },
      rhythm:{
        selected_engine:beatPrimary.engine,
        bpm:beatPrimary.bpm,
        confidence:beatPrimary.confidence,
        beat_times_sec:beatPrimary.beat_times_sec,
        beat_tracking_diagnostics:{
          method:beatPrimary.engine,
          first_detected_beat_sec:beatPrimary.beat_times_sec.length?beatPrimary.beat_times_sec[0]:null,
          timeline_zero_injected:false,
          median_interval_sec:beatPrimary.beat_times_sec.length>2?round(percentile(beatPrimary.beat_times_sec.slice(1).map((x,i)=>x-beatPrimary.beat_times_sec[i]),.5),5):null,
          note:'beat_times_sec は検出器が返した時刻のみ。0秒を人工的に追加しない。'
        },
        estimator_crosscheck:{
          selected_bpm:beatPrimary.bpm,
          essentia_bpm:er.bpm,
          essentia_confidence:er.confidence,
          agreement_score:round(agree,4),
          fallback_reason:beatFallbackReason
        }
      },
      tonal,
      stems:{
        mode:selectedStems.length?'external_stem_detail_analysis':'original_mix_only',
        automatic_separation:'not_embedded_in_browser_build',
        accepted_inputs:['vocals','drums','bass','other'],
        supplied_roles:selectedStems.map(([role])=>role),
        alignment_tolerance_sec:.25,
        analysis:stemAnalysis,
        note:'Originalを基準タイムラインとし、ユーザーが外部分離したStemを同一時刻軸で解析する。'
      },
      semantic_audio_events:{
        status:stemAnalysis.vocals?'vocal_timing_candidates_available':'not_classified_automatically',
        supported_labels:['vocal_percussion_candidate','shout_candidate','adlib_candidate','laugh_candidate','breath_candidate','whistle_candidate','unknown_vocal_event'],
        candidates:stemAnalysis.vocals?.event_candidates||[],
        note:stemAnalysis.vocals?'Vocal stem上の時刻候補を抽出済み。ただしスキャット/ボイパ/笑い/掛け声等の意味分類は専用分類器または歌詞照合なしに確定しない。':'Vocal stem未入力のため歌詞外ボーカル時刻は未確定。'
      },
      onset:{
        selected_method:audioBeat?'@audio/beat spectral-flux':'Essentia SuperFlux/OnsetRate',
        rate_per_sec:round(onsetTimes.length/Math.max(duration,1e-9),5),
        onset_times_sec:onsetTimes,
        low_band_onset_times_sec:lowOnsets,
        high_band_onset_times_sec:highOnsets
      },
      dynamics_and_bands:{
        bands_hz:{low:'<250',mid:'250-4000',high:'>4000'},
        window_sec:.5,hop_sec:.25,curves
      },
      section_change_candidates:{method:'heuristic_feature_change',candidates:sections},
      mv_sync_candidates:{method:'original_plus_optional_stems',silence_gate_db:mvSync.silence_gate_db,raw_event_count:mvSync.raw_event_count,rejected_below_gate:mvSync.rejected_below_gate,candidates:mvSync.candidates,merged_timeline_candidates:mergeStemMvCandidates(mvSync.candidates,stemAnalysis)},
      motion_primitives:motionPrimitives,
      lyric_timeline:lyricTimeline,
      vocal_asr_timeline:{source_file:srtFile?.name||null,format:srtFile?'SRT':null,entries:srtEntries,cleaner:'provider_banner_and_markup_filter'},
      lyric_asr_alignment:asrLyricAlignment,
      unified_timeline:{rule:'歌詞水脈と音響物理水脈は意味を混合せず、共通time_secで参照する。歌詞と映像の一致/無視/反転/遅延は後段MV設計が決める。',lyric_entry_count:lyricTimeline.entries.length,motion_window_count:motionPrimitives.windows.length},
      mv_mapping_hint:{
        low_band_accent:'重量・慣性・回転・低い周期運動・キック・筐体振動への写像候補',
        high_band_accent:'ヒール・指・金属・細かな身体アクセント・インサートへの写像候補',
        transient_cluster:'細かな身体フレーズ・カット密度・スキャット的反復との照合候補',
        sustained_low_energy:'人物が止まっても世界側の回転が継続する等の対位候補',
        structural_change:'意味段階・マルチショットブロック・導入/転換/終盤境界の検討候補'
      },
      warnings
    };

    setProgress(95,'画面を描画中…');
    renderResults(analysisResult);
    renderLyricEditor();
    setProgress(100,'解析完了');
    ui.results.classList.remove('hidden');
    setTimeout(()=>ui.results.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }catch(err){
    console.error(err);
    showWarning(`解析に失敗しました：${err?.message||err}\n\n初回はネット接続、対応音声形式、端末メモリを確認してください。`);
    setProgress(0,'解析失敗');
  }finally{ui.analyze.disabled=false;ui.reset.disabled=false;}
}

function renderResults(data){
  ui.bpm.textContent=data.rhythm.bpm?data.rhythm.bpm.toFixed(1):'—';
  ui.bpmSub.textContent=`${data.rhythm.selected_engine} / conf ${data.rhythm.confidence??'—'}`;
  ui.key.textContent=data.tonal.key?`${data.tonal.key} ${data.tonal.scale||''}`.trim():'—';
  ui.keySub.textContent=`strength ${data.tonal.strength??'—'}`;
  ui.beat.textContent=String(data.rhythm.beat_times_sec.length);
  ui.onset.textContent=String(data.onset.onset_times_sec.length);
  ui.onsetSub.textContent=`${data.onset.rate_per_sec??0}/sec`;
  ui.lowOnset.textContent=String(data.onset.low_band_onset_times_sec.length);
  ui.highOnset.textContent=String(data.onset.high_band_onset_times_sec.length);
  ui.duration.textContent=fmtTime(data.source.duration_sec);
  const ag=data.rhythm.estimator_crosscheck.agreement_score;
  ui.agreement.textContent=ag==null?'—':`${Math.round(ag*100)}%`;

  renderCurves(data.dynamics_and_bands.curves);

  ui.sections.innerHTML=data.section_change_candidates.candidates.length?
    data.section_change_candidates.candidates.map(x=>`<div class="event-item"><b>${fmtTime(x.time_sec)}</b><small>変化スコア ${x.score.toFixed(3)}</small></div>`).join(''):
    '<div class="event-item">明確な候補なし</div>';

  ui.hooks.innerHTML=data.mv_sync_candidates.candidates.length?
    data.mv_sync_candidates.candidates.map(x=>{
      const end=x.end_sec!=null?`–${fmtTime(x.end_sec)}`:'';
      return `<div class="event-item"><b>${fmtTime(x.time_sec)}${end} / ${escapeHtml(x.type)}</b><span class="tag">${escapeHtml(x.confidence||'')}</span><small>${escapeHtml(x.reason)}<br>${escapeHtml(x.mv_use||'')}</small></div>`;
    }).join(''):
    '<div class="event-item">候補なし</div>';

  const cc=data.rhythm.estimator_crosscheck;
  ui.estimators.innerHTML=[
    `<div class="event-item"><b>採用: ${escapeHtml(data.rhythm.selected_engine)}</b><small>${data.rhythm.bpm??'—'} BPM / confidence ${data.rhythm.confidence??'—'}</small></div>`,
    `<div class="event-item"><b>Essentia.js</b><small>${cc.essentia_bpm??'—'} BPM / confidence ${cc.essentia_confidence??'—'}</small></div>`,
    `<div class="event-item"><b>一致度</b><small>${cc.agreement_score==null?'—':Math.round(cc.agreement_score*100)+'%'}（ハーフ/ダブルテンポは近似的に吸収）</small></div>`
  ].join('');

  const preview={...data,dynamics_and_bands:{...data.dynamics_and_bands,curves:`[${data.dynamics_and_bands.curves.length} frames — JSON保存時は全データ]`}};
  ui.json.textContent=JSON.stringify(preview,null,2);
}

function renderCurves(curves){
  const c=ui.canvas,ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0d0d10';ctx.fillRect(0,0,W,H);
  if(!curves.length)return;
  const pad={l:58,r:20,t:20,b:36},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,end=curves[curves.length-1].t||1;
  const vals=curves.flatMap(x=>[x.loudness_db,x.low_db,x.mid_db,x.high_db]),ymin=Math.min(-80,Math.floor(Math.min(...vals)/10)*10),ymax=0;
  ctx.strokeStyle='#27272e';ctx.lineWidth=1;ctx.fillStyle='#7d7d86';ctx.font='18px system-ui';
  for(let k=0;k<=4;k++){const y=pad.t+ih*k/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();const db=ymax-(ymax-ymin)*k/4;ctx.fillText(`${Math.round(db)}dB`,6,y+6);}
  const palette={loudness_db:'#f2dd66',low_db:'#9bd6ff',mid_db:'#d5a6ff',high_db:'#ff9faa'};
  for(const [key,color] of Object.entries(palette)){ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.beginPath();curves.forEach((p,i)=>{const x=pad.l+(p.t/end)*iw,y=pad.t+(ymax-clamp(p[key],ymin,ymax))/(ymax-ymin)*ih;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  ctx.fillStyle='#7d7d86';ctx.textAlign='center';for(let k=0;k<=4;k++){const t=end*k/4,x=pad.l+iw*k/4;ctx.fillText(fmtTime(t),x,H-10);}ctx.textAlign='start';
}

function jsonBlob(){return new Blob([JSON.stringify(analysisResult,null,2)],{type:'application/json'});}
function outputName(){const base=(selectedFile?.name||'music').replace(/\.[^.]+$/,'');return `${base}_music_analysis_v6_1.json`;}
function downloadJSON(){if(!analysisResult)return;const a=document.createElement('a');a.href=URL.createObjectURL(jsonBlob());a.download=outputName();a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function shareJSON(){
  if(!analysisResult)return;
  const file=new File([jsonBlob()],outputName(),{type:'application/json'});
  try{if(navigator.canShare?.({files:[file]}))await navigator.share({title:'MV Music Analysis v6.1',text:'意味変質型MV用の時刻付き音楽解析JSON',files:[file]});else downloadJSON();}
  catch(e){if(e.name!=='AbortError')downloadJSON();}
}
async function copySummary(){
  if(!analysisResult)return;
  const d=analysisResult,cc=d.rhythm.estimator_crosscheck;
  const text=[
    `曲: ${d.source.file_name}`,
    `長さ: ${fmtTime(d.source.duration_sec)}`,
    `BPM: ${d.rhythm.bpm} (${d.rhythm.selected_engine}) / confidence ${d.rhythm.confidence}`,
    `BPM一致度: ${cc.agreement_score==null?'—':Math.round(cc.agreement_score*100)+'%'}`,
    `Key: ${d.tonal.key} ${d.tonal.scale} / strength ${d.tonal.strength}`,
    `Beats: ${d.rhythm.beat_times_sec.length}`,
    `Onsets: ${d.onset.onset_times_sec.length}`,
    `Low-band onsets: ${d.onset.low_band_onset_times_sec.length}`,
    `High-band onsets: ${d.onset.high_band_onset_times_sec.length}`,
    `構造変化候補: ${d.section_change_candidates.candidates.map(x=>fmtTime(x.time_sec)).join(', ')}`,
    `MV同期候補: ${d.mv_sync_candidates.candidates.slice(0,12).map(x=>`${fmtTime(x.time_sec)} ${x.type}`).join(', ')}`,
    `運動プリミティブ窓: ${d.motion_primitives?.windows?.length||0} / ${d.motion_primitives?.primitive_types?.join(', ')||'—'}`
  ].join('\n');
  try{await navigator.clipboard.writeText(text);ui.copy.textContent='コピー済み';setTimeout(()=>ui.copy.textContent='要約コピー',1200);}
  catch(_){alert(text);}
}

if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

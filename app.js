'use strict';

const VERSION = '0.2.0';
const ESSENTIA_VERSION = '0.1.3';
const AUDIO_BEAT_VERSION = '2.1.3';
const ESSENTIA_BASE = `https://cdn.jsdelivr.net/npm/essentia.js@${ESSENTIA_VERSION}/dist`;
const AUDIO_BEAT_URL = `https://esm.sh/@audio/beat@${AUDIO_BEAT_VERSION}?bundle`;
const ANALYSIS_SR = 44100;

const $ = (id) => document.getElementById(id);
const ui = {
  input:$('audioInput'), drop:$('dropZone'), fileInfo:$('fileInfo'), analyze:$('analyzeBtn'), reset:$('resetBtn'),
  statusPanel:$('statusPanel'), statusText:$('statusText'), statusPercent:$('statusPercent'), progress:$('progressBar'),
  engineStatus:$('engineStatus'), warning:$('warningText'), results:$('results'),
  bpm:$('bpmValue'), bpmSub:$('bpmSub'), key:$('keyValue'), keySub:$('keySub'),
  beat:$('beatValue'), onset:$('onsetValue'), onsetSub:$('onsetSub'),
  lowOnset:$('lowOnsetValue'), highOnset:$('highOnsetValue'), duration:$('durationValue'), agreement:$('agreementValue'),
  canvas:$('curveCanvas'), sections:$('sectionList'), hooks:$('hookList'), estimators:$('estimatorList'),
  json:$('jsonPreview'), download:$('downloadBtn'), share:$('shareBtn'), copy:$('copyBtn')
};

let selectedFile = null;
let analysisResult = null;
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
ui.reset.addEventListener('click',resetAll);
ui.analyze.addEventListener('click',analyzeSelectedFile);
ui.download.addEventListener('click',downloadJSON);
ui.share.addEventListener('click',shareJSON);
ui.copy.addEventListener('click',copySummary);

function resetAll(){
  selectedFile=null;analysisResult=null;ui.input.value='';
  ui.fileInfo.classList.add('hidden');ui.results.classList.add('hidden');ui.statusPanel.classList.add('hidden');
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
function buildMvSyncCandidates({onsets,lowOnsets,highOnsets,sections,curves,duration}){
  const out=[];
  densityPeaks(onsets,duration).forEach(d=>out.push({time_sec:round(d.time_sec,3),type:'transient_cluster',confidence:'medium',reason:`約4秒内のオンセット密度が高い (${d.count})`,mv_use:'細かな身体フレーズ／カット密度上昇候補'}));
  const lowRatioThr=percentile(curves.map(x=>x.low_ratio),.82);
  lowOnsets.forEach(t=>{
    const c=nearestCurve(curves,t);
    if(c&&c.low_ratio>=lowRatioThr)out.push({time_sec:round(t,3),type:'low_band_accent',confidence:'medium',reason:'低域オンセット + 低域比率が高い',mv_use:'重量運動／回転／キック／筐体振動候補'});
  });
  highOnsets.slice(0,60).forEach(t=>{
    const c=nearestCurve(curves,t);
    if(c&&c.high_ratio>=percentile(curves.map(x=>x.high_ratio),.78))out.push({time_sec:round(t,3),type:'high_band_accent',confidence:'medium',reason:'高域オンセット + 高域比率が高い',mv_use:'ヒール／指／金属接触／短いインサート候補'});
  });
  sections.forEach(s=>out.push({time_sec:s.time_sec,type:'structural_change',confidence:'medium',reason:'音量・帯域構成の変化が大きい',mv_use:'意味段階／マルチショットブロック境界候補'}));
  sustainedLowCandidates(curves).forEach(x=>out.push({time_sec:x.start_sec,end_sec:x.end_sec,type:'sustained_low_energy',confidence:'medium',reason:'低域優勢が一定時間継続',mv_use:'慣性回転／世界側だけ動き続ける対位候補'}));
  const uniq=[];
  out.sort((a,b)=>a.time_sec-b.time_sec).forEach(h=>{
    if(uniq.every(u=>u.type!==h.type||Math.abs(u.time_sec-h.time_sec)>.25))uniq.push(h);
  });
  return uniq.slice(0,24);
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
    const mvSync=buildMvSyncCandidates({onsets:onsetTimes,lowOnsets,highOnsets,sections,curves,duration});

    const warnings=[];
    if(duration>600)warnings.push('10分を超える音源はスマホで処理時間・メモリ使用量が増える可能性があります。');
    if(audioBeat===null)warnings.push('@audio/beatを読み込めなかったため、一部解析はEssentia.jsのみで実行しました。');
    if(agree!==null&&agree<.45)warnings.push('BPM推定器同士の結果差が大きいです。ハーフ/ダブルテンポを含め、実音で確認してください。');
    warnings.push('Verse/Chorus、特定楽器、スキャット等はこの版では自動確定しません。時刻付き信号特徴をMV設計へ渡すための解析です。');
    warnings.push('低/中/高域カーブはMV設計向け近似であり、マスタリング測定値ではありません。');

    analysisResult={
      schema:'mv_music_analysis.v2',
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
        estimator_crosscheck:{
          selected_bpm:beatPrimary.bpm,
          essentia_bpm:er.bpm,
          essentia_confidence:er.confidence,
          agreement_score:round(agree,4),
          fallback_reason:beatFallbackReason
        }
      },
      tonal,
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
      mv_sync_candidates:{method:'time_features_to_mv_sync_hints',candidates:mvSync},
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
function outputName(){const base=(selectedFile?.name||'music').replace(/\.[^.]+$/,'');return `${base}_music_analysis_v2.json`;}
function downloadJSON(){if(!analysisResult)return;const a=document.createElement('a');a.href=URL.createObjectURL(jsonBlob());a.download=outputName();a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function shareJSON(){
  if(!analysisResult)return;
  const file=new File([jsonBlob()],outputName(),{type:'application/json'});
  try{if(navigator.canShare?.({files:[file]}))await navigator.share({title:'MV Music Analysis v2',text:'意味変質型MV用の時刻付き音楽解析JSON',files:[file]});else downloadJSON();}
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
    `MV同期候補: ${d.mv_sync_candidates.candidates.slice(0,12).map(x=>`${fmtTime(x.time_sec)} ${x.type}`).join(', ')}`
  ].join('\n');
  try{await navigator.clipboard.writeText(text);ui.copy.textContent='コピー済み';setTimeout(()=>ui.copy.textContent='要約コピー',1200);}
  catch(_){alert(text);}
}

if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

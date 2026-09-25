'use strict';

// Additive reference layer. No audio decoding, detector, or semantic mapping lives here.
(function(root){
  const SCHEMA='mv_music_analysis.references.v0.7.0';
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function stableId(kind,value){
    const text=canonical(value),hashes=[2166136261,2246822507,3266489909,668265263];
    for(let i=0;i<text.length;i++)for(let j=0;j<hashes.length;j++)hashes[j]=Math.imul(hashes[j]^text.charCodeAt(i),16777619)>>>0;
    return `${kind}_${hashes.map(h=>h.toString(16).padStart(8,'0')).join('')}`;
  }
  function state(e){return {start_sec:e.start_sec,end_sec:e.end_sec,type:e.type,confidence:e.confidence,
    alignment_method:e.alignment_method,timing_status:e.timing_status,classification:JSON.parse(JSON.stringify(e.classification||null))};}
  function recordEdit(e,before,change){
    e.initial_state??=before;
    (e.edit_history??=[]).push({change,before,after:state(e)});
  }
  function enrich(data,{rebuildAudio=true}={}){
    const duration=data.source.duration_sec;
    const valid=t=>Number.isFinite(t)&&t>=0&&t<=duration;
    const range=(a,b=a)=>valid(a)&&valid(b)&&b>=a?{start_sec:a,end_sec:b}:null;
    const refs={},issues=[],timeIds=[],sectionMap=new Map(),lineMap=new Map(),rowMap=new Map();
    const identifySource=(role,s)=>stableId('source',{role,sha256:s.content_sha256||null,
      fallback:s.content_sha256?null:{name:s.file_name,size:s.file_size_bytes,duration:s.duration_sec,sample_rate:s.source_sample_rate_hz,channels:s.source_channels}});
    data.source.id=identifySource('Master',data.source);
    const config={version:SCHEMA,essentia:data.engine?.essentia_js,audio_beat:data.engine?.audio_beat,sample_rate:data.engine?.analysis_sample_rate_hz};
    function register(id,kind,pointer,timing,provenance){
      if(refs[id])throw new Error(`Duplicate reference ID: ${id}`);
      refs[id]={kind,pointer,...(timing||{}),provenance};
      if(timing)timeIds.push(id);
    }
    function issue(kind,id,reason,recommendation){
      const ref=refs[id];if(!ref)throw new Error(`Missing review target: ${id}`);
      issues.push({id:stableId('review',{kind,id,reason}),kind,target_id:id,
        start_sec:ref.start_sec??null,end_sec:ref.end_sec??null,reason,recommended_check:recommendation,priority:null});
    }
    register(data.source.id,'source','/source',null,'observed');
    if(!data.source.content_sha256)issue('metadata_identity',data.source.id,'Content hashing was unavailable; metadata cannot distinguish different audio with identical metadata.','Use a secure context with Web Crypto and reanalyze when cross-file identity matters.');
    const roles={Master:data.source};
    for(const [role,s] of Object.entries(data.stems?.analysis||{})){
      const label=role[0].toUpperCase()+role.slice(1);s.id=identifySource(label,s);roles[label]=s;
      register(s.id,'source',`/stems/analysis/${role}`,null,'observed');
      if(s.alignment_status==='check_required')issue('stem_alignment',s.id,'Stem duration differs from Master; offset is not corrected.','Listen and verify the Stem offset before using its timestamps.');
    }
    const windows=data.motion_primitives?.windows||[];
    const rows=data.lyric_timeline?.input_structure?.lines||[];
    rows.forEach((row,i)=>{
      row.id=stableId('text',{source:data.source.id,line:row.source_line_number,raw:row.raw_text});
      rowMap.set(row.source_line_number,row);
      if(row.kind==='SECTION')sectionMap.set(row.section_id,row.id);
      register(row.id,'input_structure',`/lyric_timeline/input_structure/lines/${i}`,null,row.structure_confidence==='user_fixed'?'manual':'estimated');
      if(row.kind==='AMBIGUOUS')issue('ambiguous_structure',row.id,'Text structure is unresolved.','Read the original line and specify [SECTION], [DIRECTIVE], or a vocal tag, then reanalyze.');
      else if((row.kind==='SECTION'||row.kind==='DIRECTIVE')&&row.structure_confidence==='medium')issue('structure_candidate',row.id,'Structure was inferred from formatting and context.','Confirm this is a heading/instruction; use an explicit vocal tag if it is sung.');
    });
    for(const row of rows)row.section_ref=sectionMap.get(row.section_id)||null;
    windows.forEach((w,i)=>{
      w.id=stableId('motion',{source:data.source.id,config,start:w.start_sec,end:w.end_sec,basis:w.window_basis,phrase:data.motion_primitives.phrase_window_sec});
      register(w.id,'motion_window',`/motion_primitives/windows/${i}`,range(w.start_sec,w.end_sec),'estimated');
      if(!range(w.start_sec,w.end_sec))issue('invalid_time',w.id,'Motion window falls outside the source.','Inspect the original analysis; this window is not in the time index.');
    });
    const cues=data.vocal_asr_timeline?.entries||[],cueMap=new Map(),cueDuplicates=new Map();
    cues.forEach((c,i)=>{
      const identity={source:data.source.id,start:c.start_sec,end:c.end_sec,raw:c.raw_text??c.text};
      const key=canonical(identity),occurrence=cueDuplicates.get(key)||0;cueDuplicates.set(key,occurrence+1);
      c.id=stableId('srt',{...identity,occurrence});cueMap.set(c.cue_index,c.id);
      register(c.id,'srt_cue',`/vocal_asr_timeline/entries/${i}`,range(c.start_sec,c.end_sec),'external_estimate');
      if(!range(c.start_sec,c.end_sec))issue('invalid_time',c.id,'SRT timing falls outside the source.','Check the source SRT.');
    });
    const entries=data.lyric_timeline?.entries||[];
    entries.forEach((e,i)=>{
      e.id=stableId('lyric',{source:data.source.id,line:e.source_line_number??e.line_index,raw:e.raw_text??e.text});
      e.section_ref=sectionMap.get(e.section_id)||null;
      e.input_line_ref=rowMap.get(e.source_line_number)?.id||null;
      e.initial_state??=state(e);lineMap.set(e.line_index,e);
      const provenance=e.timing_status==='manual'?'manual':e.alignment_method==='external_srt_match'?'external_estimate':e.alignment_method==='user_timecode'?'mixed_user_estimate':'estimated';
      register(e.id,'lyric_line',`/lyric_timeline/entries/${i}`,range(e.start_sec,e.end_sec),provenance);
      if(!range(e.start_sec,e.end_sec))issue('invalid_time',e.id,'Lyric timing falls outside the source.','Correct the start and end times.');
      if(e.classification?.status==='candidate'&&e.classification.candidates?.length)issue('vocal_classification',e.id,'Text-only vocal classification has unconfirmed candidates.','Listen to the vocal and confirm the type in the editor.');
      if(e.timing_status==='estimated'||e.timing_status==='user_start_estimated_end')issue('estimated_lyric_time',e.id,'At least one boundary is heuristically estimated.','Listen and correct the boundaries; this is not forced alignment.');
    });
    const matches=data.lyric_asr_alignment?.matches||[],matchedLines=new Set();
    matches.forEach(m=>{
      const e=lineMap.get(m.line_index);if(!e)return;
      m.lyric_id=e.id;m.srt_ids=(m.srt_cue_indices||[]).map(i=>cueMap.get(i)).filter(Boolean);matchedLines.add(e.id);
      if(m.confidence==='low')issue('low_srt_match',e.id,'Canonical lyric / SRT similarity is low.','Compare the canonical text, ASR text and audio.');
    });
    for(const e of entries)if(cues.length&&!matchedLines.has(e.id))issue('unmatched_lyric',e.id,'No SRT cue matched this vocal line.','Check omitted or misrecognized ASR words and timing.');
    for(const c of data.lyric_asr_alignment?.unmatched_vocal_events||[]){
      c.srt_id=cueMap.get(c.cue_index)||null;
      if(c.srt_id)issue('unmatched_srt',c.srt_id,'SRT cue is not matched to canonical lyrics.','Listen for ad-lib, scat, ASR errors or missing canonical lyrics.');
    }
    const sectionMembers=new Map();
    for(const e of entries)if(e.section_ref){const group=sectionMembers.get(e.section_ref)||[];group.push(e);sectionMembers.set(e.section_ref,group);}
    data.unified_timeline??={};
    const sections=rows.filter(r=>r.kind==='SECTION').map(r=>{
      const members=sectionMembers.get(r.id)||[],times=members.filter(e=>range(e.start_sec,e.end_sec));
      const timing=times.length?range(Math.min(...times.map(e=>e.start_sec)),Math.max(...times.map(e=>e.end_sec))):null;
      if(timing){Object.assign(refs[r.id],timing,{provenance:'estimated'});timeIds.push(r.id);}
      return {section_id:r.id,legacy_section_id:r.section_id,member_lyric_ids:members.map(e=>e.id),
        start_sec:timing?.start_sec??null,end_sec:timing?.end_sec??null,provenance:'estimated',method:'envelope_of_member_lyric_times',limitations:'Includes any estimated lyric boundaries; not an acoustic section detection.'};
    });
    if(rebuildAudio||!data.audio_events){
      const events=[],seen=new Set();
      function event(type,role,timing,sourceRefs,method,provenance='estimated',numbers={},confidence=null,scope='local_detector_event'){
        if(!timing||!roles[role])return;
        const id=stableId('audio',{source:roles[role].id,config,type,method,...timing});if(seen.has(id))return;seen.add(id);
        events.push({id,type,source:role,source_id:roles[role].id,...timing,scope,provenance,method,confidence,numbers,source_refs:sourceRefs});
      }
      const rhythm=data.rhythm||{},onset=data.onset||{};
      for(const [values,type,pointer,method,confidence] of [
        [rhythm.beat_times_sec,'detected_beat','/rhythm/beat_times_sec',rhythm.selected_engine,rhythm.confidence],
        [onset.onset_times_sec,'onset','/onset/onset_times_sec',onset.selected_method,null],
        [onset.low_band_onset_times_sec,'low_band_onset','/onset/low_band_onset_times_sec','existing_band_detector',null],
        [onset.high_band_onset_times_sec,'high_band_onset','/onset/high_band_onset_times_sec','existing_band_detector',null]
      ])(values||[]).forEach((t,i)=>event(type,'Master',range(t),[`${pointer}/${i}`],method||'unspecified_detector','estimated',{},confidence??null));
      (data.section_change_candidates?.candidates||[]).forEach((s,i)=>event('structural_change','Master',range(s.time_sec),[`/section_change_candidates/candidates/${i}`],data.section_change_candidates.method,'estimated',{score:s.score},null));
      for(const [role,s] of Object.entries(data.stems?.analysis||{})){
        (s.event_candidates||[]).forEach((e,i)=>event(e.type,role[0].toUpperCase()+role.slice(1),range(e.time_sec),[`/stems/analysis/${role}/event_candidates/${i}`],'existing_stem_onset','estimated',{local_loudness_db:e.local_loudness_db},e.confidence??null));
      }
      // Reuse actual RMS frames near existing motion-window centers: observations, not accents.
      const curves=data.dynamics_and_bands?.curves||[];
      for(const w of windows){
        const mid=(w.start_sec+w.end_sec)/2;
        let lo=0,hi=curves.length-1;
        while(lo<hi){const m=(lo+hi)>>1;if(curves[m].t<mid)lo=m+1;else hi=m;}
        const frame=lo>0&&Math.abs(curves[lo-1].t-mid)<Math.abs((curves[lo]?.t??Infinity)-mid)?lo-1:lo;
        const c=curves[frame];if(!c||!Number.isFinite(c.loudness_db))continue;
        event('energy_sample','Master',range(c.t),[`/dynamics_and_bands/curves/${frame}`],'existing_rms_frame','observed',
          {loudness_db:c.loudness_db,low_ratio:c.low_ratio,mid_ratio:c.mid_ratio,high_ratio:c.high_ratio},null,'sampled_measurement');
      }
      events.sort((a,b)=>a.start_sec-b.start_sec||a.id.localeCompare(b.id));
      data.audio_events={version:'0.7.0',events,availability:{
        sources:Object.keys(roles),mid_band_onsets:'not_computed',bar_grid:'not_computed',
        beat_grid:rhythm.beat_times_sec?.length?'detector_output':'not_detected',
        energy_observations:curves.length?'existing_rms_frames':'not_available'
      },note:'Detector timestamps are estimates. RMS samples are observations of decoded audio, not calibrated loudness. Motion windows remain separate.'};
    }
    const confidenceGroups=new Map();
    data.audio_events.events.forEach((e,i)=>{
      register(e.id,'audio_event',`/audio_events/events/${i}`,range(e.start_sec,e.end_sec),e.provenance);
      if(!e.source_refs.length||(e.confidence===null||e.confidence==='candidate')&&e.type!=='energy_sample'){
        const key=`${e.source}/${e.method}`,group=confidenceGroups.get(key)||[];group.push(e.id);confidenceGroups.set(key,group);
      }
    });
    for(const ids of confidenceGroups.values()){
      ids.sort();issue('unquantified_event_confidence',ids[0],'Detector confidence is not available for these events.','Check the referenced detector output and listen before using these events as precise cut points.');
      const item=issues[issues.length-1];item.related_ids=ids;
      item.start_sec=Math.min(...ids.map(id=>refs[id].start_sec));item.end_sec=Math.max(...ids.map(id=>refs[id].end_sec));
    }
    if(!(data.rhythm?.beat_times_sec||[]).length)for(const w of windows)issue('no_detected_beats',w.id,'This window uses BPM-derived or fallback duration, not detected beats or bars.','Check actual beats in audio; do not treat window edges as beat detections.');
    if(!data.stems?.analysis?.vocals&&entries.some(e=>e.timing_status==='estimated'))issue('missing_vocal_source',data.source.id,'Vocal Stem is absent; fallback lyric placement is not measured vocal timing.','Supply aligned Vocals/SRT or manually check the lyric times.');
    data.reference_schema=SCHEMA;
    data.reference_identity={algorithm:'fnv1a32x4-utf16-canonical-json-v1',scope:'source content SHA-256 when available, otherwise metadata; detector versions, semantic type and original coordinates',
      source_fingerprint:data.source.content_sha256?'sha256':'metadata_fallback',limitations:'IDs are reproducible for identical inputs and conditions. Audio differences below metadata visibility are not distinguished in fallback mode. Text IDs include physical source line. Identical duplicate SRT cues use an occurrence suffix. Not a cryptographic identity guarantee.'};
    data.unified_timeline={...data.unified_timeline,version:'0.7.0',lyric_entry_count:entries.length,motion_window_count:windows.length,
      time_unit:'seconds',time_origin:'Master audio start',relation_policy:'Temporal overlap is not semantic agreement or causation.',references:refs,
      time_index:timeIds.sort((a,b)=>refs[a].start_sec-refs[b].start_sec||a.localeCompare(b)),sections};
    data.review_items=issues;
    return data;
  }
  root.MVReferences={SCHEMA,stableId,state,recordEdit,enrich};
  if(typeof module!=='undefined')module.exports=root.MVReferences;
})(globalThis);

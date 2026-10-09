import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {z} from 'zod/v4';

export const LIMITS = Object.freeze({fileBytes:32*1024*1024, outputBytes:16*1024*1024, timeoutMs:30000});
const cli = fileURLToPath(new URL('../cli/mv-analyzer.cjs', import.meta.url));
const file = z.string().min(1).max(4096);
const definitions = [
 ['mv_validate','validate',['analysis','storyboard']],
 ['mv_compare','compare',['baseline','analysis','storyboard']],
 ['mv_impact_review','impact-review',['baseline','analysis','storyboard']],
 ['mv_revision_handoff','revision-handoff',['review','storyboard']],
 ['mv_proposal_create','proposal-create',['handoff','storyboard']],
 ['mv_proposal_edit','proposal-edit',['proposal','storyboard','edits']],
 ['mv_preflight','preflight',['proposal','storyboard'],'analysis']
];
export const TOOLS = definitions.map(([name,command,required,optional])=>({name,command,
 schema:z.strictObject(Object.fromEntries([...required.map(k=>[k,file]),...(optional?[[optional,file.optional()]]:[])])),
 description:`Run the existing ${command} CLI. Inputs are workspace-relative JSON paths. No files are written; no baseline persistence or formal application. ` + (name==='mv_preflight'?'Technical inspection only: eligible_count does not prove human approval or authorize application.':'No automatic author approval.')
}));
export async function workspace(value) {
 if (!value || !path.isAbsolute(value)) throw Error('MV_ANALYZER_WORKSPACE must name an absolute existing directory.');
 const root=await fs.realpath(value);
 if (!(await fs.stat(root)).isDirectory()) throw Error('Workspace is not a directory.');
 return root;
}
function contained(root, target) {const rel=path.relative(root,target);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);}
export async function inputPath(root, value, limits=LIMITS) {
 // Reject absolute paths on either platform, ADS, UNC/device paths and traversal.
 if (path.isAbsolute(value)||path.win32.isAbsolute(value)||value.includes(':')||value.includes('\0')||value.split(/[\\/]/).includes('..')||path.extname(value).toLowerCase()!=='.json') throw Error('Only workspace-relative .json paths without traversal are allowed.');
 const resolved=await fs.realpath(path.resolve(root,value));
 if (!contained(root,resolved)) throw Error('Input resolves outside the workspace.');
 if (path.extname(resolved).toLowerCase()!=='.json') throw Error('Resolved input must be a .json file.');
 const handle=await fs.open(resolved,'r');
 try {
  const stat=await handle.stat();
  if (!stat.isFile()) throw Error('Input must be a regular JSON file.');
  if (stat.size>limits.fileBytes) throw Error('Input file size limit exceeded.');
  const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
  if (bytesRead>stat.size) throw Error('Input changed during validation.');
  JSON.parse(bytes.subarray(0,bytesRead).toString('utf8'));
 } finally {await handle.close();}
 return resolved;
}
export function runCli(command, inputs, limits=LIMITS) {
 if (!TOOLS.some(t=>t.command===command)) throw Error('Unsupported command.');
 return new Promise((resolve,reject)=>{
  const env=Object.fromEntries(['SystemRoot','WINDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawn(process.execPath,[cli,command,...Object.entries(inputs).flatMap(([k,v])=>['--'+k,v]),'--compact'],{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let size=0,failure=null;const stdout=[],stderr=[];
  const stop=message=>{if(!failure){failure=Error(message);child.kill();}};
  const timer=setTimeout(()=>stop('CLI execution time limit exceeded.'),limits.timeoutMs);
  for(const [stream,chunks] of [[child.stdout,stdout],[child.stderr,stderr]])stream.on('data',chunk=>{size+=chunk.length;if(size>limits.outputBytes)stop('CLI output size limit exceeded; result not returned.');else chunks.push(chunk);});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(failure)return reject(failure);if(code!==0){let detail;try{detail=JSON.parse(Buffer.concat(stderr).toString('utf8'));}catch{detail={error:'CLI execution failed.'};}const error=Error(detail.error||'CLI execution failed.');error.cli=detail;return reject(error);}try{const text=Buffer.concat(stdout).toString('utf8');resolve(JSON.parse(text));}catch{reject(Error('CLI returned invalid JSON.'));}});
 });
}
export function executor(root) {
 let active=false;
 return async (name,args)=>{
  if(active)throw Error('Server busy; retry after the active tool completes.');
  active=true;
  try {
   const tool=TOOLS.find(t=>t.name===name);if(!tool)throw Error('Unknown tool.');
   const parsed=tool.schema.parse(args),inputs={};
   for(const [key,value] of Object.entries(parsed))if(value!==undefined)inputs[key]=await inputPath(root,value);
   return await runCli(tool.command,inputs);
  }finally{active=false;}
 };
}

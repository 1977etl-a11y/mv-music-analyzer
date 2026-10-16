import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio, StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {workspace, executor, TOOLS} from './runner.mjs';
try {
 const root=await workspace(process.env.MV_ANALYZER_WORKSPACE),execute=executor(root);
 serveStdio(()=>{
  const server=new McpServer({name:'mv-analyzer',version:'0.1.0'});
  for(const tool of TOOLS)server.registerTool(tool.name,{
   description:tool.description,inputSchema:tool.schema,
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  },async args=>{
   try {const result=await execute(tool.name,args);return {content:[{type:'text',text:JSON.stringify(result)}]};}
   catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({schema:'mv_analyzer_mcp.error.v1',error:error.message,...(error.cli?{cli:error.cli}:{})})}]};}
  });
  return server;
 },{transport:new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:64*1024}),onerror:error=>process.stderr.write(error.message+'\n')});
} catch(error) {
 process.stderr.write(JSON.stringify({schema:'mv_analyzer_mcp.error.v1',error:error.message})+'\n');
 process.exitCode=1;
}

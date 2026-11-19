const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const url='http://127.0.0.1:5173/';
async function ready(){try{const response=await fetch(url,{signal:AbortSignal.timeout(1200)});return response.ok&&(await response.text()).includes('VOYAGER STAGE');}catch{return false;}}
async function main(){
 const vite=path.join(__dirname,'node_modules/vite/bin/vite.js');
 if(!fs.existsSync(vite))throw Error('Dependencies are missing. Run pnpm install in this folder first.');
 if(!await ready()){
  if(process.argv.includes('--check'))throw Error('The local preview server is not running.');
  const log=fs.openSync(path.join(__dirname,'server.log'),'a');
  const server=spawn(process.execPath,[vite,'--host','127.0.0.1','--port','5173','--strictPort'],{cwd:__dirname,detached:true,windowsHide:true,stdio:['ignore',log,log]});
  server.unref();fs.closeSync(log);
  let running=false;for(let i=0;i<25;i++){await new Promise(resolve=>setTimeout(resolve,300));if(await ready()){running=true;break;}}
  if(!running)throw Error('The server could not start. Check server.log; port 5173 may be in use.');
 }
 if(process.argv.includes('--check')){console.log('VOYAGER STAGE is ready.');return;}
 const browser=process.platform==='win32'?spawn('cmd.exe',['/c','start','',url],{windowsHide:true,detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
 browser.unref();
 console.log('VOYAGER STAGE: '+url);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

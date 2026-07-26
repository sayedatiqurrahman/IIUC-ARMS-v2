require('dotenv/config');
const crypto = require('crypto');
const https = require('https');
const APP_ID = process.env.GITHUB_ID;
let KEY = (process.env.GITHUB_PRIVATE_KEY||'').replace(/\\n/g,'\n').replace(/^"/,'').replace(/"$/,'');
function jwt(){const n=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({iat:n-60,exp:n+600,iss:APP_ID})).toString('base64url');return h+'.'+p+'.'+crypto.createSign('RSA-SHA256').update(h+'.'+p).sign(KEY,'base64url');}
function api(m,path,body,tok){return new Promise((res,rej)=>{const bs=body?JSON.stringify(body):null;const o={hostname:'api.github.com',path,method:m,headers:{'Authorization':'Bearer '+tok,'User-Agent':'Q','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};if(bs){o.headers['Content-Type']='application/json';o.headers['Content-Length']=Buffer.byteLength(bs);}const r=https.request(o,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res({s:r.statusCode,d:JSON.parse(d||'{}')})}catch{res({s:r.statusCode,d})}});});r.on('error',rej);if(bs)r.write(bs);r.end();});}
(async()=>{
const j=jwt();const i=(await api('GET','/repos/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/installation',null,j)).d;
const tok=(await api('POST','/app/installations/'+i.id+'/access_tokens',null,j)).d.token;
const ref=(await api('GET','/repos/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/git/refs/heads/main',null,tok)).d;
const sha=ref.object.sha;
const tree=(await api('GET','/repos/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/git/trees/'+sha+'?recursive=1',null,tok)).d;
const base='upload_academic_files/qsis';
const SEMS=['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const qsis=tree.tree.filter(f=>f.path.startsWith(base+'/')&&f.type==='blob');
const bySem={};
qsis.forEach(f=>{const r=f.path.substring(base.length+1);const sem=r.split('/')[0];if(!bySem[sem])bySem[sem]=0;bySem[sem]++;});
console.log('QSIS folder contents:');
SEMS.forEach(sem=>console.log('  '+sem+':',bySem[sem]||0,'files'));
console.log('related-kitabs etc:',Object.keys(bySem).filter(s=>!SEMS.includes(s)).map(s=>s+':'+bySem[s]).join(', ')||'none');
console.log('Total files under qsis/:',qsis.length);
})();

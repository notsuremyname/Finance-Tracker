const fs = require('fs');
const path = require('path');

function rmrf(dir){ if(!fs.existsSync(dir)) return; fs.readdirSync(dir).forEach(f=>{ const p=path.join(dir,f); if(fs.lstatSync(p).isDirectory()) rmrf(p); else fs.unlinkSync(p); }); fs.rmdirSync(dir); }

function copyRecursive(src, dest){ if(!fs.existsSync(src)) return; if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive:true}); fs.readdirSync(src).forEach(item=>{ const s = path.join(src,item); const d = path.join(dest,item); if(fs.lstatSync(s).isDirectory()) copyRecursive(s,d); else fs.copyFileSync(s,d); }); }

const root = process.cwd();
const dist = path.join(root,'dist');
rmrf(dist);
fs.mkdirSync(dist);

// copy index and assets
const filesToCopy = ['index.html'];
filesToCopy.forEach(f=>{ const s = path.join(root,f); if(fs.existsSync(s)) fs.copyFileSync(s, path.join(dist,f)); });
const assetsSrc = path.join(root,'assets');
const assetsDest = path.join(dist,'assets');
copyRecursive(assetsSrc, assetsDest);

console.log('Build completed. dist/ created.');

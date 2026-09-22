(function(global){
  'use strict';

  const utf8 = new TextDecoder('utf-8');

  function u16(view, off){ return view.getUint16(off, true); }
  function u32(view, off){ return view.getUint32(off, true); }
  function normalizeZipPath(path){
    const out=[];
    String(path||'').replace(/^\/+/, '').split('/').forEach(part=>{
      if(!part || part==='.') return;
      if(part==='..') out.pop(); else out.push(part);
    });
    return out.join('/');
  }
  function xmlUnescape(s){
    return String(s??'')
      .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
      .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(parseInt(d,10)))
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  }
  function attr(attrs,name){
    const m=String(attrs||'').match(new RegExp('(?:^|\\s)'+name.replace(':','\\:')+'="([^"]*)"'));
    return m?xmlUnescape(m[1]):'';
  }
  function canonicalHeader(v){ return String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function columnLetters(ref){ const m=String(ref||'').match(/^([A-Z]+)\d+$/i); return m?m[1].toUpperCase():''; }

  function parseCentralDirectory(arrayBuffer){
    const bytes=new Uint8Array(arrayBuffer), view=new DataView(arrayBuffer);
    let eocd=-1;
    const min=Math.max(0,bytes.length-65557);
    for(let i=bytes.length-22;i>=min;i--){ if(u32(view,i)===0x06054b50){ eocd=i; break; } }
    if(eocd<0) throw new Error('Struktur ZIP/XLSX tidak dikenali.');
    const total=u16(view,eocd+10), cdOffset=u32(view,eocd+16);
    let p=cdOffset; const entries=new Map();
    for(let i=0;i<total;i++){
      if(u32(view,p)!==0x02014b50) throw new Error('Central directory XLSX rusak.');
      const method=u16(view,p+10), compSize=u32(view,p+20), uncompSize=u32(view,p+24);
      const nameLen=u16(view,p+28), extraLen=u16(view,p+30), commentLen=u16(view,p+32), localOffset=u32(view,p+42);
      const name=utf8.decode(bytes.subarray(p+46,p+46+nameLen));
      entries.set(normalizeZipPath(name),{name:normalizeZipPath(name),method,compSize,uncompSize,localOffset});
      p+=46+nameLen+extraLen+commentLen;
    }
    return {bytes,view,entries};
  }

  async function entryBytes(zip, name){
    const entry=zip.entries.get(normalizeZipPath(name));
    if(!entry) return null;
    const {view,bytes}=zip, p=entry.localOffset;
    if(u32(view,p)!==0x04034b50) throw new Error('Local header XLSX rusak.');
    const nameLen=u16(view,p+26), extraLen=u16(view,p+28), start=p+30+nameLen+extraLen;
    const raw=bytes.slice(start,start+entry.compSize);
    if(entry.method===0) return raw;
    if(entry.method!==8) throw new Error('Metode kompresi XLSX tidak didukung: '+entry.method);
    if(typeof DecompressionStream!=='function') throw new Error('Browser tidak mendukung dekompresi XLSX. Gunakan Chrome/Edge terbaru.');
    const ds=new DecompressionStream('deflate-raw');
    const out=await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }
  async function entryText(zip,name){ const b=await entryBytes(zip,name); return b?utf8.decode(b):''; }

  function parseSharedStrings(xml){
    if(!xml) return [];
    const out=[]; const siRe=/<si\b[^>]*>([\s\S]*?)<\/si>/gi; let m;
    while((m=siRe.exec(xml))){
      let text=''; const tRe=/<t\b[^>]*>([\s\S]*?)<\/t>/gi; let t;
      while((t=tRe.exec(m[1]))) text+=xmlUnescape(t[1]);
      out.push(text);
    }
    return out;
  }

  function cellValue(attrs,inner,shared){
    const type=attr(attrs,'t');
    if(type==='inlineStr'){
      let text=''; const re=/<t\b[^>]*>([\s\S]*?)<\/t>/gi; let m;
      while((m=re.exec(inner||''))) text+=xmlUnescape(m[1]);
      return text;
    }
    const vm=String(inner||'').match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
    const raw=vm?xmlUnescape(vm[1]):'';
    if(type==='s') return shared[Number(raw)]??'';
    if(type==='b') return raw==='1'?'TRUE':raw==='0'?'FALSE':raw;
    return raw;
  }

  function parseCells(rowXml,shared,callback){
    const re=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi; let m;
    while((m=re.exec(rowXml||''))){
      const attrs=m[1]??'', inner=m[2]??''; const ref=attr(attrs,'r');
      callback(columnLetters(ref),cellValue(attrs,inner,shared),ref);
    }
  }

  function buildAliasLookup(wanted){
    const lookup=new Map();
    Object.entries(wanted||{}).forEach(([key,aliases])=>{
      (Array.isArray(aliases)?aliases:[aliases]).forEach(a=>lookup.set(canonicalHeader(a),key));
    });
    return lookup;
  }

  function parseSheet(xml,shared,wanted){
    const aliasLookup=buildAliasLookup(wanted);
    const rowRe=/<row\b[^>]*>([\s\S]*?)<\/row>/gi; let m; let headerFound=false;
    const colToKey=new Map(), matchedHeaders={}, headers=[]; const rows=[];
    while((m=rowRe.exec(xml))){
      const rowXml=m[1];
      if(!headerFound){
        const temp=[];
        parseCells(rowXml,shared,(col,value)=>{ if(col && String(value).trim()!=='') temp.push([col,String(value).trim()]); });
        if(!temp.length) continue;
        temp.forEach(([col,value])=>{
          headers.push(value);
          const target=aliasLookup.get(canonicalHeader(value));
          if(target && !Object.values(matchedHeaders).includes(value)){
            colToKey.set(col,target); matchedHeaders[target]=value;
          }
        });
        headerFound=true;
        continue;
      }
      if(!colToKey.size) continue;
      const row={};
      parseCells(rowXml,shared,(col,value)=>{ const k=colToKey.get(col); if(k) row[k]=String(value??'').trim(); });
      if(Object.values(row).some(v=>String(v).trim()!=='')) rows.push(row);
    }
    return {headers,matchedHeaders,rows};
  }

  async function readFirstSheet(input, options={}){
    const arrayBuffer = input instanceof ArrayBuffer ? input : (ArrayBuffer.isView(input) ? input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength) : await input.arrayBuffer());
    const zip=parseCentralDirectory(arrayBuffer);
    const workbook=await entryText(zip,'xl/workbook.xml');
    const rels=await entryText(zip,'xl/_rels/workbook.xml.rels');
    if(!workbook) throw new Error('workbook.xml tidak ditemukan. Pastikan file benar-benar .xlsx.');
    const sheetTag=(workbook.match(/<sheet\b[^>]*\/>/i)||workbook.match(/<sheet\b[^>]*>/i)||[])[0]||'';
    const sheetName=attr(sheetTag.replace(/^<sheet\b|\/?\>$/gi,''),'name')||'Sheet1';
    const relId=attr(sheetTag.replace(/^<sheet\b|\/?\>$/gi,''),'r:id');
    let target='';
    if(relId && rels){
      const relRe=/<Relationship\b([^>]*)\/?\>/gi; let rm;
      while((rm=relRe.exec(rels))){ if(attr(rm[1],'Id')===relId){ target=attr(rm[1],'Target'); break; } }
    }
    let sheetPath=target ? normalizeZipPath(target.startsWith('/')?target.slice(1):(target.startsWith('xl/')?target:'xl/'+target)) : 'xl/worksheets/sheet1.xml';
    if(!zip.entries.has(sheetPath) && zip.entries.has('xl/worksheets/sheet1.xml')) sheetPath='xl/worksheets/sheet1.xml';
    const [sheetXml,sharedXml]=await Promise.all([entryText(zip,sheetPath),entryText(zip,'xl/sharedStrings.xml')]);
    if(!sheetXml) throw new Error('Worksheet pertama tidak ditemukan di file Excel.');
    const shared=parseSharedStrings(sharedXml);
    const parsed=parseSheet(sheetXml,shared,options.wantedHeaders||{});
    return {sheetName,sheetPath,...parsed};
  }

  global.MiniXLSX={readFirstSheet,canonicalHeader};
})(typeof window!=='undefined'?window:globalThis);

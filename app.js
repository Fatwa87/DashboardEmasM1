const ADMIN_ONLY_PAGES = new Set(['archive','settings']);
let currentUser = null;
let authToken = ''; // kompatibilitas UI; sesi utama dikelola Supabase Auth
let supabaseClient = null;
const SUPABASE_LOGIN_EMAILS = { area:'area@closingemas.app', outlet:'outlet@closingemas.app' };

const productColors = ['#13a875','#0f8bc1','#ef6c00','#7c4df2','#f0aa00','#e91e50','#00796b','#56718f'];
const defaultTarget = 8000000000;

const sampleRecords = [
  {id:'s1',date:'2026-09-03',branch:'CP Medan Utama',outlet:'Outlet Medan Kota',customer:'Andi Pratama',contract:'AKD-EM-260903-001',product:'Gadai Emas',tenor:4,amount:625000000},
  {id:'s2',date:'2026-09-05',branch:'CP Kabanjahe',outlet:'Outlet Kabanjahe',customer:'Siti Rahma',contract:'AKD-EM-260905-014',product:'KCA Emas',tenor:6,amount:760000000},
  {id:'s3',date:'2026-09-07',branch:'CP Medan Petisah',outlet:'Outlet Petisah',customer:'Rudi Hartono',contract:'AKD-EM-260907-022',product:'Arrum Emas',tenor:12,amount:890000000},
  {id:'s4',date:'2026-09-10',branch:'CP Labuhan Deli',outlet:'Outlet Marelan',customer:'Nadia Putri',contract:'AKD-EM-260910-031',product:'Gadai Emas',tenor:4,amount:455000000},
  {id:'s5',date:'2026-09-12',branch:'CP Medan Sunggal',outlet:'Outlet Sunggal',customer:'Dedi Saputra',contract:'AKD-EM-260912-045',product:'Emas Angsuran',tenor:24,amount:1250000000},
  {id:'s6',date:'2026-09-14',branch:'CP Pulo Brayan',outlet:'Outlet Brayan',customer:'Maya Sari',contract:'AKD-EM-260914-052',product:'Mulia',tenor:12,amount:980000000},
  {id:'s7',date:'2026-09-17',branch:'CP Medan Utama',outlet:'Outlet Medan Kota',customer:'Hendra Wijaya',contract:'AKD-EM-260917-061',product:'KCA Emas',tenor:6,amount:1400000000},
  {id:'s8',date:'2026-09-19',branch:'CP Gaharu',outlet:'Outlet Gaharu',customer:'Lina Marlina',contract:'AKD-EM-260919-076',product:'Gadai Emas',tenor:4,amount:1678900000}
];

const defaultProducts = ['KCA Emas','Gadai Emas','Arrum Emas','Emas Angsuran','Mulia','Produk Emas Lainnya'];
const defaultLocations = [
  {branch:'CP Medan Utama',outlet:'Outlet Medan Kota'},
  {branch:'CP Kabanjahe',outlet:'Outlet Kabanjahe'},
  {branch:'CP Medan Petisah',outlet:'Outlet Petisah'},
  {branch:'CP Labuhan Deli',outlet:'Outlet Marelan'},
  {branch:'CP Medan Sunggal',outlet:'Outlet Sunggal'},
  {branch:'CP Pulo Brayan',outlet:'Outlet Brayan'},
  {branch:'CP Gaharu',outlet:'Outlet Gaharu'},
  {branch:'CP Pancur Batu',outlet:'Outlet Pancur Batu'},
  {branch:'CP KP Lalang',outlet:'Outlet Kampung Lalang'}
];

const $ = id => document.getElementById(id);
let currentPeriod = 'month';
let currentPage = 'dashboard';
let records = [];
let products = [];
let locations = [];
let monthlyTarget = defaultTarget;
let muliaRecords = [];
let muliaLastImport = '';
let riskData = {kol1:[],lar:[],npl:[]};
let riskMeta = {fileName:'',lastImport:'',sheetName:'',sourceRows:0};

function supabaseConfigured(){
  const cfg=window.CLOSING_EMAS_SUPABASE||{};
  return !!(cfg.url && cfg.key && !String(cfg.url).includes('PASTE_') && !String(cfg.key).includes('PASTE_'));
}
function ensureSupabase(){
  if(supabaseClient) return supabaseClient;
  if(!supabaseConfigured()){
    const err=new Error('Supabase belum dikonfigurasi. Isi supabase-config.js dengan Project URL dan Publishable/anon key.');
    err.status=0; err.code='SUPABASE_NOT_CONFIGURED'; throw err;
  }
  if(!window.supabase?.createClient){
    const err=new Error('Library Supabase tidak dapat dimuat. Pastikan perangkat terhubung ke internet.');
    err.status=0; err.code='SUPABASE_LIBRARY_MISSING'; throw err;
  }
  const cfg=window.CLOSING_EMAS_SUPABASE;
  supabaseClient=window.supabase.createClient(cfg.url,cfg.key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  return supabaseClient;
}
function appError(message,status=500,code='SUPABASE_ERROR'){
  const err=new Error(message||'Operasi database gagal.'); err.status=status; err.code=code; return err;
}
function bodyJson(options={}){
  if(!options.body) return {};
  if(typeof options.body==='object') return options.body;
  try{return JSON.parse(options.body);}catch(e){return {};}
}
function mapSupabaseError(error,fallback='Operasi database gagal.'){
  if(!error) return appError(fallback);
  const msg=error.message||fallback;
  const code=error.code||'SUPABASE_ERROR';
  let status=500;
  if(code==='23505') status=409;
  if(code==='42501' || /row-level security|permission denied|forbidden/i.test(msg)) status=403;
  if(/invalid login credentials/i.test(msg)) status=401;
  return appError(msg,status,code);
}
function chunkArray(items,size=200){
  const out=[];
  for(let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size));
  return out;
}
function friendlyUploadError(err,context='Upload'){
  const msg=String(err?.message||'').trim();
  const code=String(err?.code||'').trim();
  if(err?.status===401 || /jwt|session|not authenticated/i.test(msg)) return 'Sesi login berakhir. Silakan logout lalu login kembali sebagai Area.';
  if(err?.status===403 || /row-level security|permission denied|forbidden|42501/i.test(msg+' '+code)) return 'Akses database ditolak. Pastikan login menggunakan akun Area (Admin) dan policy Supabase sudah terpasang.';
  if(/failed to fetch|network|load failed|networkerror/i.test(msg)) return 'Koneksi ke Supabase terputus. Periksa internet lalu coba upload kembali.';
  if(/statement timeout|timeout|57014/i.test(msg+' '+code)) return 'Proses database terlalu besar dalam satu transaksi. Versi ini sudah menggunakan upload bertahap; silakan coba kembali.';
  return msg ? `${context}: ${msg}${code?` [${code}]`:''}` : `${context} gagal. Periksa koneksi dan struktur database Supabase.`;
}
async function replaceRiskSnapshotChunked(next,meta,onProgress){
  const sb=ensureSupabase();
  await currentAuthSession();
  if(currentUser?.role!=='Admin') throw appError('Upload monitoring hanya dapat dilakukan oleh Admin.',403,'FORBIDDEN');

  // Simpan data baru terlebih dahulu. Data lama baru dihapus setelah semua batch berhasil.
  const {data:lastRows,error:lastErr}=await sb.from('risk_records').select('id').order('id',{ascending:false}).limit(1);
  if(lastErr) throw mapSupabaseError(lastErr,'Gagal membaca snapshot monitoring lama.');
  const oldMaxId=Number(lastRows?.[0]?.id||0);
  const rows=[];
  ['kol1','lar','npl'].forEach(type=>(Array.isArray(next?.[type])?next[type]:[]).forEach(data=>rows.push({risk_type:type,data})));
  const batches=chunkArray(rows,200);
  let inserted=0;
  let snapshotSwapped=false;
  try{
    for(let i=0;i<batches.length;i++){
      const batch=batches[i];
      const {error}=await sb.from('risk_records').insert(batch);
      if(error) throw mapSupabaseError(error,`Gagal menyimpan batch ${i+1} dari ${batches.length}.`);
      inserted+=batch.length;
      if(onProgress) onProgress({stage:'upload',done:inserted,total:rows.length,batch:i+1,batches:batches.length});
    }

    // Setelah data baru lengkap, hapus snapshot lama saja.
    if(oldMaxId>0){
      const {error:delErr}=await sb.from('risk_records').delete().lte('id',oldMaxId);
      if(delErr) throw mapSupabaseError(delErr,'Data baru sudah masuk, tetapi snapshot lama gagal dibersihkan.');
    }
    snapshotSwapped=true;

    const metaRow={
      id:1,
      file_name:normalize(meta?.fileName),
      last_import:normalize(meta?.lastImport),
      sheet_name:normalize(meta?.sheetName),
      source_rows:Number(meta?.sourceRows||0),
      updated_at:new Date().toISOString()
    };
    const {error:metaErr}=await sb.from('risk_meta').upsert(metaRow,{onConflict:'id'});
    if(metaErr) throw mapSupabaseError(metaErr,'Data monitoring tersimpan, tetapi metadata upload gagal diperbarui.');
    if(onProgress) onProgress({stage:'done',done:rows.length,total:rows.length,batch:batches.length,batches:batches.length});
    return {counts:{kol1:(next.kol1||[]).length,lar:(next.lar||[]).length,npl:(next.npl||[]).length}};
  }catch(err){
    // Rollback best-effort hanya jika snapshot lama belum diganti.
    if(!snapshotSwapped){
      try{ await sb.from('risk_records').delete().gt('id',oldMaxId); }catch(_e){}
    }
    throw err;
  }
}
async function bulkInsertMuliaChunked(records,lastImport,onProgress){
  const sb=ensureSupabase();
  await currentAuthSession();
  if(currentUser?.role!=='Admin') throw appError('Upload Mulia Lunas hanya dapat dilakukan oleh Admin.',403,'FORBIDDEN');
  const batches=chunkArray(Array.isArray(records)?records:[],250);
  let added=0, skipped=0, done=0;
  for(let i=0;i<batches.length;i++){
    const {data:result,error}=await sb.rpc('bulk_insert_mulia',{
      p_records:batches[i],
      p_last_import:i===batches.length-1?normalize(lastImport):''
    });
    if(error) throw mapSupabaseError(error,`Import Mulia Lunas gagal pada batch ${i+1} dari ${batches.length}.`);
    added+=Number(result?.added||0); skipped+=Number(result?.skipped||0); done+=batches[i].length;
    if(onProgress) onProgress({done,total:records.length,batch:i+1,batches:batches.length});
  }
  return {added,skipped};
}
async function currentAuthSession(){
  const sb=ensureSupabase();
  const {data,error}=await sb.auth.getSession();
  if(error) throw mapSupabaseError(error,'Sesi login tidak dapat dibaca.');
  if(!data?.session) throw appError('Sesi login berakhir. Silakan masuk kembali.',401,'NO_SESSION');
  return data.session;
}
async function loadProfile(userId){
  const sb=ensureSupabase();
  const {data,error}=await sb.from('profiles').select('username,role').eq('user_id',userId).maybeSingle();
  if(error) throw mapSupabaseError(error,'Profil pengguna tidak dapat dibaca.');
  if(!data || !['Admin','Umum'].includes(data.role)) throw appError('Akun belum memiliki akses aplikasi.',403,'ACCOUNT_DISABLED');
  return {username:data.username,role:data.role};
}
async function fetchAllRows(table,columns='*',orders=[]){
  const sb=ensureSupabase(); const out=[]; const pageSize=1000;
  for(let from=0;;from+=pageSize){
    let q=sb.from(table).select(columns).range(from,from+pageSize-1);
    orders.forEach(o=>{q=q.order(o.column,{ascending:o.ascending!==false});});
    const {data,error}=await q;
    if(error) throw mapSupabaseError(error,`Gagal membaca ${table}.`);
    const rows=data||[]; out.push(...rows);
    if(rows.length<pageSize) break;
  }
  return out;
}
async function loadSupabaseState(){
  const sb=ensureSupabase();
  const [productRows,locationRows,recordRows,muliaRows,riskRows,settingsRows]=await Promise.all([
    fetchAllRows('products','name',[{column:'name'}]),
    fetchAllRows('locations','branch,outlet',[{column:'branch'},{column:'outlet'}]),
    fetchAllRows('realizations','id,date,branch,outlet,customer,contract,product,tenor,amount',[{column:'date'},{column:'id'}]),
    fetchAllRows('mulia_records','id,data',[{column:'created_at'},{column:'id'}]),
    fetchAllRows('risk_records','id,risk_type,data',[{column:'id'}]),
    fetchAllRows('settings','key,value',[{column:'key'}])
  ]);
  const {data:meta,error:metaError}=await sb.from('risk_meta').select('file_name,last_import,sheet_name,source_rows').eq('id',1).maybeSingle();
  if(metaError) throw mapSupabaseError(metaError,'Metadata monitoring tidak dapat dibaca.');
  const settings=Object.fromEntries(settingsRows.map(r=>[r.key,r.value]));
  const risk={kol1:[],lar:[],npl:[]};
  riskRows.forEach(r=>{if(risk[r.risk_type]) risk[r.risk_type].push(r.data||{});});
  return {
    records:recordRows,
    products:productRows.map(r=>r.name),
    locations:locationRows,
    monthlyTarget:Number(settings.monthly_target)||defaultTarget,
    muliaRecords:muliaRows.map(r=>({id:r.id,data:r.data||{}})),
    muliaLastImport:settings.mulia_last_import||'',
    riskData:risk,
    riskMeta:{fileName:meta?.file_name||'',lastImport:meta?.last_import||'',sheetName:meta?.sheet_name||'',sourceRows:Number(meta?.source_rows||0)}
  };
}
async function apiFetch(path,options={}){
  const sb=ensureSupabase();
  const method=String(options.method||'GET').toUpperCase();
  const data=bodyJson(options);
  try{
    if(method==='POST' && path==='/api/login'){
      const username=normalize(data.username); const email=SUPABASE_LOGIN_EMAILS[key(username)];
      if(!email) throw appError('Username atau password tidak sesuai.',401,'BAD_CREDENTIALS');
      const result=await sb.auth.signInWithPassword({email,password:String(data.password||'')});
      if(result.error) throw appError('Username atau password tidak sesuai.',401,'BAD_CREDENTIALS');
      const user=result.data?.user; const session=result.data?.session;
      if(!user||!session) throw appError('Login tidak berhasil.',401,'BAD_CREDENTIALS');
      let profile;
      try{ profile=await loadProfile(user.id); }
      catch(err){ await sb.auth.signOut(); throw err; }
      currentUser=profile; authToken=session.access_token||'';
      return {ok:true,token:authToken,user:profile,expiresAt:session.expires_at||null};
    }
    if(method==='POST' && path==='/api/logout'){
      await sb.auth.signOut(); currentUser=null; authToken=''; return {ok:true};
    }
    const session=await currentAuthSession();
    if(!currentUser) currentUser=await loadProfile(session.user.id);

    if(method==='GET' && path==='/api/state') return {ok:true,user:currentUser,state:await loadSupabaseState()};

    if(method==='POST' && path==='/api/realizations'){
      const row={id:normalize(data.id),date:data.date,branch:normalize(data.branch),outlet:normalize(data.outlet),customer:normalize(data.customer),contract:normalize(data.contract),product:normalize(data.product),tenor:Number(data.tenor),amount:Number(data.amount)};
      const {error}=await sb.from('realizations').insert(row);
      if(error){ if(error.code==='23505') throw appError('No. kredit / akad sudah ada.',409,'DUPLICATE_CONTRACT'); throw mapSupabaseError(error,'Data realisasi tidak dapat disimpan.'); }
      return {ok:true,record:row};
    }
    if(method==='POST' && path==='/api/products'){
      const name=normalize(data.name); const {error}=await sb.from('products').insert({name});
      if(error){if(error.code==='23505') throw appError('Produk sudah ada.',409,'DUPLICATE'); throw mapSupabaseError(error);}
      return {ok:true,name};
    }
    if(method==='POST' && path==='/api/products/bulk'){
      const {data:result,error}=await sb.rpc('bulk_insert_products',{p_names:Array.isArray(data.names)?data.names:[]});
      if(error) throw mapSupabaseError(error,'Import produk gagal.'); return {ok:true,...(result||{})};
    }
    if(method==='POST' && path==='/api/locations'){
      const branch=normalize(data.branch),outlet=normalize(data.outlet); const {error}=await sb.from('locations').insert({branch,outlet});
      if(error){if(error.code==='23505') throw appError('Pasangan cabang / outlet sudah ada.',409,'DUPLICATE'); throw mapSupabaseError(error);}
      return {ok:true,branch,outlet};
    }
    if(method==='POST' && path==='/api/locations/bulk'){
      const {data:result,error}=await sb.rpc('bulk_insert_locations',{p_locations:Array.isArray(data.locations)?data.locations:[]});
      if(error) throw mapSupabaseError(error,'Import cabang / outlet gagal.'); return {ok:true,...(result||{})};
    }
    if(method==='POST' && path==='/api/mulia/bulk'){
      const result=await bulkInsertMuliaChunked(Array.isArray(data.records)?data.records:[],normalize(data.lastImport));
      return {ok:true,...result};
    }
    if(method==='POST' && path==='/api/risk'){
      const result=await replaceRiskSnapshotChunked(data.riskData||{},data.riskMeta||{});
      return {ok:true,...result};
    }
    if(method==='PUT' && path==='/api/settings/target'){
      const value=Number(data.value); if(!value||value<=0) throw appError('Target harus lebih dari Rp 0.',400);
      const {error}=await sb.from('settings').upsert({key:'monthly_target',value:String(Math.round(value))},{onConflict:'key'});
      if(error) throw mapSupabaseError(error,'Target gagal disimpan.'); return {ok:true,value};
    }
    if(method==='DELETE' && path==='/api/realizations'){
      const {error,count}=await sb.from('realizations').delete({count:'exact'}).not('id','is',null);
      if(error) throw mapSupabaseError(error,'Report realisasi gagal dihapus.'); return {ok:true,deleted:count||0};
    }
    if(method==='DELETE' && path.startsWith('/api/realizations/')){
      const id=decodeURIComponent(path.slice('/api/realizations/'.length)); const {error}=await sb.from('realizations').delete().eq('id',id);
      if(error) throw mapSupabaseError(error,'Data realisasi gagal dihapus.'); return {ok:true};
    }
    if(method==='DELETE' && path==='/api/products'){
      const {error,count}=await sb.from('products').delete({count:'exact'}).eq('name',normalize(data.name));
      if(error) throw mapSupabaseError(error); return {ok:true,deleted:count||0};
    }
    if(method==='DELETE' && path==='/api/locations'){
      const {error,count}=await sb.from('locations').delete({count:'exact'}).eq('branch',normalize(data.branch)).eq('outlet',normalize(data.outlet));
      if(error) throw mapSupabaseError(error); return {ok:true,deleted:count||0};
    }
    if(method==='DELETE' && path==='/api/mulia'){
      const {data:result,error}=await sb.rpc('delete_all_mulia'); if(error) throw mapSupabaseError(error,'Data Mulia Lunas gagal dihapus.'); return {ok:true,...(result||{})};
    }
    if(method==='DELETE' && path.startsWith('/api/mulia/')){
      const id=decodeURIComponent(path.slice('/api/mulia/'.length)); const {error}=await sb.from('mulia_records').delete().eq('id',id);
      if(error) throw mapSupabaseError(error,'Data Mulia Lunas gagal dihapus.'); return {ok:true};
    }
    if(method==='DELETE' && path==='/api/risk'){
      const {data:result,error}=await sb.rpc('clear_risk_snapshot'); if(error) throw mapSupabaseError(error,'Data monitoring gagal dihapus.'); return {ok:true,...(result||{})};
    }
    throw appError('Endpoint aplikasi tidak dikenali.',404,'NOT_FOUND');
  }catch(err){
    if(err?.status===401 && path!=='/api/login'){
      currentUser=null; authToken=''; showLoginScreen();
    }
    if(err instanceof Error) throw err;
    throw appError(String(err||'Operasi database gagal.'));
  }
}
function applyServerState(state={}){
  records=Array.isArray(state.records)?state.records:[];
  products=Array.isArray(state.products)?state.products:[];
  locations=Array.isArray(state.locations)?state.locations:[];
  monthlyTarget=Number(state.monthlyTarget)||defaultTarget;
  muliaRecords=Array.isArray(state.muliaRecords)?state.muliaRecords:[];
  muliaLastImport=state.muliaLastImport||'';
  riskData=state.riskData&&typeof state.riskData==='object'?state.riskData:{kol1:[],lar:[],npl:[]};
  riskMeta=state.riskMeta&&typeof state.riskMeta==='object'?state.riskMeta:{fileName:'',lastImport:'',sheetName:'',sourceRows:0};
  if($('targetValue')) $('targetValue').value=monthlyTarget;
  if($('targetDisplay')) $('targetDisplay').value=monthlyTarget.toLocaleString('id-ID');
}
async function refreshState(){
  const payload=await apiFetch('/api/state');
  if(payload.user) currentUser=payload.user;
  applyServerState(payload.state||{});
  renderAll();
  applyRoleAccess();
}
function idr(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0); }
function shortIdr(n){
  if(n >= 1e9) return 'Rp ' + (n/1e9).toLocaleString('id-ID',{maximumFractionDigits:2}) + ' M';
  if(n >= 1e6) return 'Rp ' + (n/1e6).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' Jt';
  return idr(n);
}
function safe(text){ return String(text ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
function normalize(v){ return String(v || '').trim().replace(/\s+/g,' '); }
function key(v){ return normalize(v).toLocaleLowerCase('id-ID'); }
function dateID(v){ return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T12:00:00')); }
function todayLocal(){
  const d = new Date(); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function getReferenceDate(){
  const now = new Date();
  const newest = records.reduce((max,r)=> r.date>max?r.date:max, '');
  if(newest && newest > todayLocal()) return new Date(newest+'T12:00:00');
  return now;
}
function getPeriodRange(period){
  const ref = getReferenceDate(); const end = new Date(ref); end.setHours(23,59,59,999);
  let start = new Date(ref); start.setHours(0,0,0,0);
  if(period==='7d') start.setDate(start.getDate()-6);
  if(period==='month') start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  if(period==='year') start = new Date(ref.getFullYear(),0,1);
  if(period==='all') return null;
  return [start,end];
}
function filteredRecords(){
  const customStart=$('dashboardStartDate')?.value||'';
  const customEnd=$('dashboardEndDate')?.value||'';
  if(customStart || customEnd){
    return records.filter(r=>(!customStart || r.date>=customStart) && (!customEnd || r.date<=customEnd));
  }
  const range = getPeriodRange(currentPeriod); if(!range) return records;
  return records.filter(r=>{ const d=new Date(r.date+'T12:00:00'); return d>=range[0] && d<=range[1]; });
}
function periodName(){
  const customStart=$('dashboardStartDate')?.value||'';
  const customEnd=$('dashboardEndDate')?.value||'';
  if(customStart && customEnd) return `${dateID(customStart)} – ${dateID(customEnd)}`;
  if(customStart) return `Mulai ${dateID(customStart)}`;
  if(customEnd) return `Sampai ${dateID(customEnd)}`;
  if(currentPeriod==='today') return dateID(todayLocal());
  if(currentPeriod==='7d') return '7 Hari Terakhir';
  if(currentPeriod==='year') return new Intl.DateTimeFormat('id-ID',{year:'numeric'}).format(getReferenceDate());
  if(currentPeriod==='all') return 'Semua Periode';
  return new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(getReferenceDate());
}
function updateCountdown(){
  const ref = getReferenceDate(); const last = new Date(ref.getFullYear(),ref.getMonth()+1,0);
  const ms = new Date(last.getFullYear(),last.getMonth(),last.getDate()) - new Date(ref.getFullYear(),ref.getMonth(),ref.getDate());
  $('daysLeft').textContent = Math.max(0,Math.ceil(ms/86400000));
  $('monthEndLabel').textContent = new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long'}).format(last);
  $('periodLabel').textContent = periodName();
}
function toast(title,msg){
  $('toastTitle').textContent=title; $('toastMessage').textContent=msg; $('toast').classList.remove('hidden');
  clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),2600);
}

function renderDashboard(){
  const data=filteredRecords(); const total=data.reduce((s,r)=>s+Number(r.amount||0),0);
  const customers=new Set(data.map(r=>key(r.customer))).size; const pct=monthlyTarget?Math.round((total/monthlyTarget)*1000)/10:0;
  $('heroRealization').textContent=idr(total); $('heroTarget').textContent=idr(monthlyTarget); $('heroCount').textContent=`${data.length} akad terealisasi`;
  $('achievementPct').textContent=`${pct.toLocaleString('id-ID')}%`; $('achievementBar').style.width=Math.min(100,pct)+'%';
  $('targetStatus').textContent=pct>=100?'🎉 Target tercapai':'✦ '+Math.max(0,100-pct).toLocaleString('id-ID')+'% menuju target';
  $('totalCustomers').textContent=customers.toLocaleString('id-ID'); $('totalUp').textContent=idr(total); $('averageUp').textContent=idr(customers?Math.round(total/customers):0); $('totalContracts').textContent=data.length.toLocaleString('id-ID'); $('donutTotal').textContent=shortIdr(total);
  updateCountdown(); renderProducts(data,total); renderBranches(data); renderOutletStatus(data);
}
function renderProducts(data,total){
  const grouped={}; data.forEach(r=>grouped[r.product]=(grouped[r.product]||0)+Number(r.amount||0));
  const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]); $('productCountBadge').textContent=`${entries.length} Produk`;
  let acc=0, segments=[]; entries.forEach(([name,val],i)=>{ const start=total?acc/total*100:0; acc+=val; const end=total?acc/total*100:0; segments.push(`${productColors[i%productColors.length]} ${start}% ${end}%`); });
  $('productDonut').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'conic-gradient(#e8eef1 0 100%)';
  $('productLegend').innerHTML=entries.length?entries.map(([name,val],i)=>`<div class="legend-item"><span class="legend-dot" style="background:${productColors[i%productColors.length]}"></span><div class="legend-copy"><b>${safe(name)}</b><span>${shortIdr(val)} • ${total?Math.round(val/total*100):0}%</span></div></div>`).join(''):'<span style="font-size:9px;color:#95a2b3">Belum ada data produk.</span>';
}
function renderBranches(data){
  const grouped={}; data.forEach(r=>grouped[r.branch]=(grouped[r.branch]||0)+Number(r.amount||0));
  const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,5); const max=entries[0]?.[1]||1;
  $('branchBars').innerHTML=entries.length?entries.map(([name,val],idx)=>`<div class="branch-row"><div class="branch-name"><b>${idx+1}. ${safe(name)}</b><span>Kontribusi ${shortIdr(val)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(val/max)*100}%"></div></div><div class="branch-value">${shortIdr(val)}</div></div>`).join(''):'<div class="empty-state"><p>Belum ada data cabang.</p></div>';
}
function renderOutletStatus(data){
  const master=[];
  const seen=new Set();
  locations.forEach(x=>{
    const branch=normalize(x.branch), outlet=normalize(x.outlet);
    const id=`${key(branch)}|${key(outlet)}`;
    if(branch && outlet && !seen.has(id)){ seen.add(id); master.push({branch,outlet,id}); }
  });
  master.sort((a,b)=>a.branch.localeCompare(b.branch,'id')||a.outlet.localeCompare(b.outlet,'id'));
  const submitted=new Set(data.map(r=>`${key(r.branch)}|${key(r.outlet)}`));
  const filled=master.filter(x=>submitted.has(x.id));
  const pending=master.filter(x=>!submitted.has(x.id));
  $('filledOutletCount').textContent=filled.length.toLocaleString('id-ID');
  $('pendingOutletCount').textContent=pending.length.toLocaleString('id-ID');
  $('outletStatusBadge').textContent=`${filled.length} / ${master.length} Outlet`;
  const rows=list=>list.length?list.map(x=>`<div class="outlet-item"><b>${safe(x.outlet)}</b><span>${safe(x.branch)}</span></div>`).join(''):'<div class="outlet-empty">Tidak ada outlet pada status ini.</div>';
  $('filledOutletList').innerHTML=rows(filled);
  $('pendingOutletList').innerHTML=rows(pending);
}
function getArchiveRecords(){
  const q=$('searchInput').value.trim().toLowerCase();
  const start=$('archiveStartDate').value;
  const end=$('archiveEndDate').value;
  return [...records]
    .filter(r=>!q || [r.customer,r.contract,r.branch,r.outlet,r.product].join(' ').toLowerCase().includes(q))
    .filter(r=>!start || r.date>=start)
    .filter(r=>!end || r.date<=end)
    .sort((a,b)=>b.date.localeCompare(a.date));
}
function renderTable(){
  const shown=getArchiveRecords();
  $('recordsBody').innerHTML=shown.map(r=>`<tr><td>${dateID(r.date)}</td><td class="branch-cell"><b>${safe(r.branch)}</b><span>${safe(r.outlet)}</span></td><td class="customer-cell"><b>${safe(r.customer)}</b><span>Nasabah</span></td><td>${safe(r.contract)}</td><td><span class="product-tag">${safe(r.product)}</span></td><td>${safe(r.tenor)} bulan</td><td class="amount-cell">${idr(r.amount)}</td><td><button class="delete-btn" data-delete-record="${safe(r.id)}">Hapus</button></td></tr>`).join('');
  $('emptyState').classList.toggle('hidden',shown.length!==0);
}
function archiveRangeLabel(){
  const start=$('archiveStartDate').value;
  const end=$('archiveEndDate').value;
  if(start && end) return `${dateID(start)} s.d. ${dateID(end)}`;
  if(start) return `Mulai ${dateID(start)}`;
  if(end) return `Sampai ${dateID(end)}`;
  return 'Semua tanggal';
}
function printArchivePdf(){
  const shown=getArchiveRecords();
  if(!shown.length){ toast('Tidak ada data','Tidak ada realisasi pada filter yang dipilih untuk dicetak.'); return; }
  const total=shown.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const rows=shown.map((r,i)=>`<tr><td>${i+1}</td><td>${safe(dateID(r.date))}</td><td><b>${safe(r.branch)}</b><br><span>${safe(r.outlet)}</span></td><td>${safe(r.customer)}</td><td>${safe(r.contract)}</td><td>${safe(r.product)}</td><td>${safe(r.tenor)} bln</td><td class="money">${safe(idr(r.amount))}</td></tr>`).join('');
  const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Report Realisasi Closing Emas</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#152333;margin:0;font-size:10px}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #087a55;padding-bottom:10px;margin-bottom:14px}.brand{font-size:18px;font-weight:800;color:#075d42}.sub{color:#6e7f91;margin-top:4px}.meta{text-align:right;line-height:1.6}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 14px}.card{border:1px solid #dce7e3;border-radius:8px;padding:8px 10px}.card span{display:block;color:#748598;font-size:8px;text-transform:uppercase}.card b{display:block;font-size:13px;margin-top:3px;color:#075d42}table{width:100%;border-collapse:collapse}th{background:#eaf7f2;color:#075d42;text-align:left;padding:7px 6px;border:1px solid #cfe2da;font-size:8px}td{padding:7px 6px;border:1px solid #dde6e9;vertical-align:top}td span{color:#8393a3;font-size:8px}.money{text-align:right;font-weight:700;white-space:nowrap}.foot{margin-top:10px;color:#8393a3;font-size:8px;text-align:right} 
  </style></head><body><div class="head"><div><div class="brand">Dashboard Closing Emas</div><div class="sub">Report Realisasi • Area Medan 1</div></div><div class="meta"><b>Periode:</b> ${safe(archiveRangeLabel())}<br><b>Dicetak:</b> ${safe(new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeStyle:'short'}).format(new Date()))}</div></div><div class="cards"><div class="card"><span>Total Data</span><b>${shown.length} akad</b></div><div class="card"><span>Total UP</span><b>${safe(idr(total))}</b></div><div class="card"><span>Filter</span><b>${safe(archiveRangeLabel())}</b></div></div><table><thead><tr><th>No</th><th>Tanggal</th><th>Cabang / Outlet</th><th>Nasabah</th><th>No. Kredit</th><th>Produk</th><th>Tenor</th><th style="text-align:right">UP</th></tr></thead><tbody>${rows}</tbody></table><div class="foot">Gunakan opsi “Save as PDF / Simpan sebagai PDF” pada dialog cetak.</div></body></html>`;
  const frame=document.createElement('iframe');
  frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0'; frame.style.width='0'; frame.style.height='0'; frame.style.border='0';
  document.body.appendChild(frame);
  const doc=frame.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(()=>{ frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(()=>frame.remove(),1200); },250);
}
function uniqueBranches(){ return [...new Map(locations.map(x=>[key(x.branch),normalize(x.branch)])).values()].sort((a,b)=>a.localeCompare(b,'id')); }
function uniqueOutlets(){ return [...new Set(locations.map(x=>key(x.outlet)))].length; }
function renderInputOptions(selectedBranch=''){
  const branchSelect=$('branchSelect'), outletSelect=$('outletSelect'), productSelect=$('productSelect');
  const priorBranch=selectedBranch || branchSelect.value; const priorOutlet=outletSelect.value; const priorProduct=productSelect.value;
  branchSelect.innerHTML='<option value="">Pilih cabang</option>'+uniqueBranches().map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
  if(priorBranch && uniqueBranches().some(v=>key(v)===key(priorBranch))) branchSelect.value=uniqueBranches().find(v=>key(v)===key(priorBranch));
  const branch=branchSelect.value; const outlets=locations.filter(x=>!branch || key(x.branch)===key(branch)).map(x=>normalize(x.outlet)).filter((v,i,a)=>a.findIndex(x=>key(x)===key(v))===i).sort((a,b)=>a.localeCompare(b,'id'));
  outletSelect.innerHTML='<option value="">Pilih outlet</option>'+outlets.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
  if(priorOutlet && outlets.some(v=>key(v)===key(priorOutlet))) outletSelect.value=outlets.find(v=>key(v)===key(priorOutlet));
  productSelect.innerHTML='<option value="">Pilih produk</option>'+products.slice().sort((a,b)=>a.localeCompare(b,'id')).map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
  if(priorProduct && products.some(v=>key(v)===key(priorProduct))) productSelect.value=products.find(v=>key(v)===key(priorProduct));
}
function renderMasterData(){
  products = products.map(normalize).filter(Boolean).filter((v,i,a)=>a.findIndex(x=>key(x)===key(v))===i);
  locations = locations.map(x=>({branch:normalize(x.branch),outlet:normalize(x.outlet)})).filter(x=>x.branch&&x.outlet).filter((x,i,a)=>a.findIndex(y=>key(y.branch)===key(x.branch)&&key(y.outlet)===key(x.outlet))===i);
  $('masterProductCount').textContent=`${products.length} item`; $('masterLocationCount').textContent=`${locations.length} item`;
  $('productMasterList').innerHTML=products.length?products.slice().sort((a,b)=>a.localeCompare(b,'id')).map(v=>`<div class="master-item"><div class="master-item-name"><span class="master-dot"></span><span>${safe(v)}</span></div><button class="master-delete" data-delete-product="${safe(v)}">Hapus</button></div>`).join(''):'<div class="empty-state"><p>Belum ada master produk.</p></div>';
  $('locationMasterList').innerHTML=locations.length?locations.slice().sort((a,b)=>a.branch.localeCompare(b.branch,'id')||a.outlet.localeCompare(b.outlet,'id')).map((x,i)=>`<div class="location-row"><div><b>${safe(x.branch)}</b><span>Cabang</span></div><div><b>${safe(x.outlet)}</b><span>Outlet</span></div><button class="master-delete" data-delete-location="${i}" data-branch="${safe(x.branch)}" data-outlet="${safe(x.outlet)}">Hapus</button></div>`).join(''):'<div class="empty-state"><p>Belum ada master cabang/outlet.</p></div>';
  renderInputOptions();
}

function renderAll(){ renderDashboard(); renderMasterData(); renderTable(); renderMulia(); renderRiskAll(); }


function canAccessPage(page){ return !!currentUser && (currentUser.role==='Admin' || !ADMIN_ONLY_PAGES.has(page)); }
function applyRoleAccess(){
  const isAdmin=currentUser?.role==='Admin';
  document.querySelectorAll('[data-admin-only="true"]').forEach(el=>el.classList.toggle('role-hidden',!isAdmin));
  const targetBtn=$('editTargetBtn'); if(targetBtn) targetBtn.classList.toggle('role-hidden',!isAdmin);
  if($('accountName')) $('accountName').textContent=currentUser?.username||'-';
  if($('accountRole')) $('accountRole').textContent=currentUser?`Role • ${currentUser.role}`:'-';
  if($('accountAvatar')) $('accountAvatar').textContent=(currentUser?.username||'U').slice(0,1).toUpperCase();
}
async function openAuthenticatedApp(sessionInfo=null){
  if(sessionInfo?.token) authToken=sessionInfo.token;
  if(sessionInfo?.user) currentUser=sessionInfo.user;
  $('loginScreen').classList.add('hidden');
  $('appLayout').classList.remove('auth-locked');
  applyRoleAccess();
  try{
    await refreshState();
    showPage('dashboard');
    setTimeout(()=>{ if($('loginPassword')) $('loginPassword').value=''; },0);
  }catch(err){
    console.error(err);
    authToken=''; currentUser=null;
    showLoginScreen();
    if(err.status!==401) toast('Database tidak terhubung',err.message||'Periksa koneksi internet dan konfigurasi Supabase.');
  }
}
function showLoginScreen(){
  currentUser=null; authToken='';
  $('appLayout').classList.add('auth-locked');
  $('loginScreen').classList.remove('hidden');
  if($('loginError')) $('loginError').classList.add('hidden');
  if($('loginForm')) $('loginForm').reset();
  setTimeout(()=>$('loginUsername')?.focus(),50);
}
async function logout(){
  try{ await apiFetch('/api/logout',{method:'POST',body:'{}'}); }catch(e){}
  closeSidebar();
  showLoginScreen();
}
async function handleLogin(event){
  event.preventDefault();
  const username=$('loginUsername').value.trim();
  const password=$('loginPassword').value;
  const submit=$('loginForm').querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
    const payload=await apiFetch('/api/login',{method:'POST',body:JSON.stringify({username,password})});
    $('loginError').classList.add('hidden');
    await openAuthenticatedApp({token:payload.token,user:payload.user});
  }catch(err){
    $('loginError').textContent=err.status===0?(err.message||'Supabase belum dikonfigurasi.'):(err.message||'Username atau password tidak sesuai.');
    $('loginError').classList.remove('hidden');
    $('loginPassword').value='';
    $('loginPassword').focus();
  }finally{ submit.disabled=false; }
}

const pageMeta={
  dashboard:['DASHBOARD','Dashboard Realisasi','Monitoring pencapaian closing emas Area Medan 1'],
  input:['INPUT REALISASI','Input Realisasi','Tambah data closing emas dengan master data yang terstandar'],
  mulia:['MULIA LUNAS','Daftar Nasabah Mulia Lunas','Lihat dan kelola database nasabah Mulia yang sudah lunas'],
  kol1:['KOL 1 EMAS','KOL 1 Emas','Daftar kolektibilitas 1 dengan tunggakan 1 sampai 10 hari'],
  lar:['LAR EMAS','LAR Emas','Daftar kolektibilitas 2 dengan tunggakan 11 sampai 30 hari'],
  npl:['NPL EMAS','NPL Emas','Daftar kolektibilitas 3 sampai 5'],
  archive:['REPORT REALISASI','Report Realisasi','Filter, ekspor, cetak PDF, dan kelola seluruh data realisasi'],
  settings:['PENGATURAN','Pengaturan','Kelola target, master data, upload Mulia Lunas, dan Excel monitoring emas']
};
function showPage(page){
  if(!pageMeta[page]) page='dashboard';
  if(!canAccessPage(page)){
    if(currentUser && ADMIN_ONLY_PAGES.has(page)) toast('Akses terbatas','Menu ini hanya tersedia untuk role Admin.');
    page='dashboard';
  }
  currentPage=page;
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('pageCrumb').textContent=pageMeta[page][0]; $('pageTitle').textContent=pageMeta[page][1]; $('pageSubtitle').textContent=pageMeta[page][2];
  $('dashboardFilters').classList.toggle('hidden',page!=='dashboard');
  if(page==='dashboard') renderDashboard();
  if(page==='archive') renderTable();
  if(page==='mulia') renderMulia();
  if(['kol1','lar','npl'].includes(page)) renderRiskPage(page);
  if(page==='input' && !$('dateInput').value) $('dateInput').value=todayLocal();
  closeSidebar(); window.scrollTo({top:0,behavior:'smooth'});
}
function openSidebar(){ $('sidebar').classList.add('open'); $('sidebarOverlay').classList.remove('hidden'); }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.add('hidden'); }
function formatNumericInput(input,hidden){ input.addEventListener('input',()=>{ const digits=input.value.replace(/\D/g,''); hidden.value=digits; input.value=digits?Number(digits).toLocaleString('id-ID'):''; }); }
function resetRealizationForm(){ $('realizationForm').reset(); $('dateInput').value=todayLocal(); $('amountValue').value=''; renderInputOptions(); }

function parseCSV(text){
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"' && quoted && n==='"'){ cell+='"'; i++; continue; }
    if(c==='"'){ quoted=!quoted; continue; }
    if(c===',' && !quoted){ row.push(cell); cell=''; continue; }
    if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&n==='\n') i++; row.push(cell); cell=''; if(row.some(v=>v.trim()!=='')) rows.push(row); row=[]; continue; }
    cell+=c;
  }
  if(cell.length||row.length){ row.push(cell); if(row.some(v=>v.trim()!=='')) rows.push(row); }
  return rows;
}
function headerIndex(headers, candidates){ return headers.findIndex(h=>candidates.includes(key(h).replace(/[^a-z0-9_]/g,'_'))); }
async function importProductCsv(file){
  const input=$('productCsvInput');
  try{
    const text=(await file.text()).replace(/^\uFEFF/,'');
    const rows=parseCSV(text);
    if(rows.length<2){ toast('CSV produk kosong','File harus memiliki header “Nama Produk” dan minimal satu baris data.'); return; }
    const headers=rows[0].map(v=>normalize(v));
    const pIdx=headerIndex(headers,['nama_produk']);
    if(pIdx<0){ toast('Format CSV produk tidak sesuai','Gunakan satu kolom dengan header: Nama Produk'); return; }
    const names=rows.slice(1).map(row=>normalize(row[pIdx])).filter(Boolean);
    const result=await apiFetch('/api/products/bulk',{method:'POST',body:JSON.stringify({names})});
    await refreshState();
    toast('Import produk selesai',`${result.added} produk ditambahkan${result.skipped?` • ${result.skipped} duplikat diabaikan`:''}.`);
  }catch(err){ toast('Import produk gagal',err.message||'Data tidak dapat disimpan ke database.'); }
  finally { input.value=''; }
}
async function importLocationCsv(file){
  const input=$('locationCsvInput');
  try{
    const text=(await file.text()).replace(/^\uFEFF/,'');
    const rows=parseCSV(text);
    if(rows.length<2){ toast('CSV cabang/outlet kosong','File harus memiliki header “Nama Cabang, Nama Outlet” dan minimal satu baris data.'); return; }
    const headers=rows[0].map(v=>normalize(v));
    const bIdx=headerIndex(headers,['nama_cabang']);
    const oIdx=headerIndex(headers,['nama_outlet']);
    if(bIdx<0 || oIdx<0){ toast('Format CSV cabang/outlet tidak sesuai','Gunakan dua kolom dengan header: Nama Cabang, Nama Outlet'); return; }
    const incoming=rows.slice(1).map(row=>({branch:normalize(row[bIdx]),outlet:normalize(row[oIdx])})).filter(x=>x.branch&&x.outlet);
    const result=await apiFetch('/api/locations/bulk',{method:'POST',body:JSON.stringify({locations:incoming})});
    await refreshState();
    toast('Import cabang & outlet selesai',`${result.added} pasangan ditambahkan${result.skipped?` • ${result.skipped} duplikat diabaikan`:''}.`);
  }catch(err){ toast('Import cabang & outlet gagal',err.message||'Data tidak dapat disimpan ke database.'); }
  finally { input.value=''; }
}
function downloadCsv(filename, rows){
  const lines=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','));
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),250);
}

// daftar nasabah Mulia lunas
const MULIA_TEMPLATE_HEADERS = ['Nama Nasabah','No Kredit (Akad)','Nama Cabang','Nama Outlet','Tanggal Lunas'];
function muliaHeaders(){
  const headers=[];
  muliaRecords.forEach(record=>Object.keys(record.data||{}).forEach(h=>{ if(!headers.includes(h)) headers.push(h); }));
  return headers.length?headers:MULIA_TEMPLATE_HEADERS;
}
function muliaSignature(data){
  return Object.keys(data).sort().map(h=>`${key(h)}=${key(data[h])}`).join('\u001f');
}
function headerToken(v){ return key(v).replace(/[^a-z0-9]/g,''); }
function findMuliaColumn(headers,candidates){
  const wanted=new Set(candidates.map(headerToken));
  return headers.find(h=>wanted.has(headerToken(h)))||'';
}
function muliaFilterColumns(){
  const headers=muliaHeaders();
  return {
    branch:findMuliaColumn(headers,['Nama Cabang','Cabang']),
    unit:findMuliaColumn(headers,['Nama Outlet','Outlet','Nama Unit','Unit','Unit Kerja'])
  };
}
function fillFilterSelect(id,values,placeholder){
  const el=$(id); if(!el) return;
  const prior=el.value;
  const clean=values.map(normalize).filter(Boolean).filter((v,i,a)=>a.findIndex(x=>key(x)===key(v))===i).sort((a,b)=>a.localeCompare(b,'id'));
  el.innerHTML=`<option value="">${safe(placeholder)}</option>`+clean.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
  const matched=clean.find(v=>key(v)===key(prior));
  el.value=matched||'';
}
function populateMuliaFilters(){
  const cols=muliaFilterColumns();
  const branchSelect=$('muliaBranchFilter'), unitSelect=$('muliaUnitFilter');
  if(!branchSelect||!unitSelect) return;
  const branches=cols.branch?muliaRecords.map(r=>r.data?.[cols.branch]??''):[];
  fillFilterSelect('muliaBranchFilter',branches,'Semua Cabang');
  const branch=branchSelect.value;
  const unitRows=branch&&cols.branch?muliaRecords.filter(r=>key(r.data?.[cols.branch])===key(branch)):muliaRecords;
  const units=cols.unit?unitRows.map(r=>r.data?.[cols.unit]??''):[];
  fillFilterSelect('muliaUnitFilter',units,'Semua Unit / Outlet');
  branchSelect.disabled=!cols.branch;
  unitSelect.disabled=!cols.unit;
}
function filteredMuliaRecords(){
  const q=$('muliaSearchInput')?.value.trim().toLocaleLowerCase('id-ID')||'';
  const branch=$('muliaBranchFilter')?.value||'';
  const unit=$('muliaUnitFilter')?.value||'';
  const cols=muliaFilterColumns();
  return muliaRecords.filter(r=>{
    const data=r.data||{};
    if(branch && cols.branch && key(data[cols.branch])!==key(branch)) return false;
    if(unit && cols.unit && key(data[cols.unit])!==key(unit)) return false;
    if(q && !Object.values(data).some(v=>String(v??'').toLocaleLowerCase('id-ID').includes(q))) return false;
    return true;
  });
}
function renderMulia(){
  if(!$('muliaBody')) return;
  const headers=muliaHeaders();
  populateMuliaFilters();
  const shown=filteredMuliaRecords();
  $('muliaTotalRows').textContent=muliaRecords.length.toLocaleString('id-ID');
  $('muliaTotalColumns').textContent=(muliaRecords.length?headers.length:0).toLocaleString('id-ID');
  $('muliaLastImport').textContent=muliaLastImport||'-';
  $('muliaHead').innerHTML='<tr>'+headers.map(h=>`<th>${safe(h)}</th>`).join('')+'<th>Aksi</th></tr>';
  $('muliaBody').innerHTML=shown.map(record=>'<tr>'+headers.map(h=>`<td>${safe(record.data?.[h]??'')}</td>`).join('')+`<td><button class="delete-btn" data-delete-mulia="${safe(record.id)}">Hapus</button></td></tr>`).join('');
  $('muliaEmptyState').classList.toggle('hidden',shown.length!==0);
  const minWidth=Math.max(760, headers.length*165+100);
  document.querySelector('.mulia-table').style.minWidth=minWidth+'px';
}
async function importMuliaCsv(file){
  const input=$('muliaCsvInput');
  try{
    const text=(await file.text()).replace(/^\uFEFF/,'');
    const rows=parseCSV(text);
    if(rows.length<2){ toast('CSV Mulia Lunas kosong','File harus memiliki header dan minimal satu baris data.'); return; }
    let headers=rows[0].map((v,i)=>normalize(v)||`Kolom ${i+1}`);
    const used={};
    headers=headers.map(h=>{ const base=h; const k=key(base); used[k]=(used[k]||0)+1; return used[k]===1?base:`${base} (${used[k]})`; });
    const incoming=[];
    rows.slice(1).forEach((row,i)=>{
      if(!row.some(v=>normalize(v))) return;
      const data={}; headers.forEach((h,j)=>data[h]=normalize(row[j]??''));
      incoming.push({id:'m'+Date.now().toString(36)+i.toString(36)+Math.random().toString(36).slice(2,7),data});
    });
    const lastImport=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
    const result=await bulkInsertMuliaChunked(incoming,lastImport,({done,total})=>{
      const pct=total?Math.round(done/total*100):100;
      const st=$('muliaUploadStatus'); if(st){ st.textContent=`Mengunggah ${pct}% (${done.toLocaleString('id-ID')}/${total.toLocaleString('id-ID')})`; st.className='upload-status loading'; }
    });
    await refreshState();
    const st=$('muliaUploadStatus'); if(st){ st.textContent='Upload selesai'; st.className='upload-status success'; }
    toast('Import Mulia Lunas selesai',`${result.added} baris ditambahkan${result.skipped?` • ${result.skipped} duplikat diabaikan`:''}.`);
  }catch(err){
    const st=$('muliaUploadStatus'); if(st){ st.textContent='Import gagal'; st.className='upload-status error'; }
    toast('Import Mulia Lunas gagal',friendlyUploadError(err,'Import Mulia Lunas'));
  }
  finally { input.value=''; }
}
function exportMuliaCsv(){
  const shown=filteredMuliaRecords();
  if(!shown.length){ toast('Tidak ada data','Belum ada data Mulia Lunas untuk diekspor.'); return; }
  const headers=muliaHeaders();
  downloadCsv('daftar-nasabah-mulia-lunas.csv',[headers,...shown.map(r=>headers.map(h=>r.data?.[h]??''))]);
}


// monitoring portofolio emas dari Excel (.xlsx)
const RISK_COLUMNS = ['CIF','NO_KONTRAK','CUSTOMER_NM','SUB PRODUK_','TGL_KREDIT','TENOR','TGL_JATUH_TEMPO','KOLEKTIBILITAS_OSL_','OUTLET','OUTLET_CHANNELING','CABANG'];
const RISK_WANTED_HEADERS = {
  CIF:['CIF'],
  NO_KONTRAK:['NO_KONTRAK','NO KONTRAK'],
  CUSTOMER_NM:['CUSTOMER_NM','CUSTOMER NM'],
  SUB_PRODUK:['SUB PRODUK','SUB_PRODUK','SUB PRODUK_','SUB_PRODUK_'],
  TGL_KREDIT:['TGL_KREDIT','TGL KREDIT'],
  TENOR:['TENOR'],
  TGL_JATUH_TEMPO:['TGL_JATUH_TEMPO','TGL JATUH TEMPO'],
  KOLEKTIBILITAS:['KOLEKTIBILITAS','KOLEKTIBILITAS_OSL_','KOLEKTIBILITAS OSL'],
  HARI_TUNGGAKAN:['HARI_TUNGGAKAN','HARI TUNGGAKAN'],
  OUTLET:['OUTLET'],
  OUTLET_CHANNELING:['OUTLET_CHANNELING','OUTLET CHANNELING'],
  CABANG:['CABANG']
};
const RISK_CONFIG = {
  kol1:{total:'kol1Total',outlets:'kol1Outlets',branches:'kol1Branches',imported:'kol1Imported',search:'kol1Search',branchFilter:'kol1BranchFilter',unitFilter:'kol1UnitFilter',head:'kol1Head',body:'kol1Body',empty:'kol1Empty',export:'kol1Export',pdf:'kol1Pdf',filename:'kol-1-emas.csv',title:'KOL 1 Emas',subtitle:'Kolektibilitas 1 • tunggakan 1–10 hari'},
  lar:{total:'larTotal',outlets:'larOutlets',branches:'larBranches',imported:'larImported',search:'larSearch',branchFilter:'larBranchFilter',unitFilter:'larUnitFilter',head:'larHead',body:'larBody',empty:'larEmpty',export:'larExport',pdf:'larPdf',filename:'lar-emas.csv',title:'LAR Emas',subtitle:'Kolektibilitas 2 • tunggakan 11–30 hari'},
  npl:{total:'nplTotal',outlets:'nplOutlets',branches:'nplBranches',imported:'nplImported',search:'nplSearch',branchFilter:'nplBranchFilter',unitFilter:'nplUnitFilter',head:'nplHead',body:'nplBody',empty:'nplEmpty',export:'nplExport',pdf:'nplPdf',filename:'npl-emas.csv',title:'NPL Emas',subtitle:'Kolektibilitas 3–5'}
};
function excelSerialDate(value){
  const s=String(value??'').trim();
  if(!s) return '';
  if(/^\d+(?:\.\d+)?$/.test(s)){
    const n=Number(s);
    if(n>20000 && n<80000){
      const d=new Date(Date.UTC(1899,11,30)+Math.round(n*86400000));
      if(!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(d);
    }
  }
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}
function riskVisibleRecord(raw){
  return {
    'CIF':String(raw.CIF??''),
    'NO_KONTRAK':String(raw.NO_KONTRAK??''),
    'CUSTOMER_NM':String(raw.CUSTOMER_NM??''),
    'SUB PRODUK_':String(raw.SUB_PRODUK??''),
    'TGL_KREDIT':excelSerialDate(raw.TGL_KREDIT),
    'TENOR':String(raw.TENOR??''),
    'TGL_JATUH_TEMPO':excelSerialDate(raw.TGL_JATUH_TEMPO),
    'KOLEKTIBILITAS_OSL_':String(raw.KOLEKTIBILITAS??''),
    'OUTLET':String(raw.OUTLET??''),
    'OUTLET_CHANNELING':String(raw.OUTLET_CHANNELING??''),
    'CABANG':String(raw.CABANG??'')
  };
}
function populateRiskFilters(type){
  const cfg=RISK_CONFIG[type]; if(!cfg) return;
  const rows=Array.isArray(riskData[type])?riskData[type]:[];
  const branchEl=$(cfg.branchFilter), unitEl=$(cfg.unitFilter);
  if(!branchEl||!unitEl) return;
  fillFilterSelect(cfg.branchFilter,rows.map(r=>r.CABANG),'Semua Cabang');
  const branch=branchEl.value;
  const unitRows=branch?rows.filter(r=>key(r.CABANG)===key(branch)):rows;
  fillFilterSelect(cfg.unitFilter,unitRows.map(r=>r.OUTLET),'Semua Unit / Outlet');
}
function riskFiltered(type){
  const cfg=RISK_CONFIG[type];
  const q=$(cfg.search)?.value.trim().toLocaleLowerCase('id-ID')||'';
  const branch=$(cfg.branchFilter)?.value||'';
  const unit=$(cfg.unitFilter)?.value||'';
  const rows=Array.isArray(riskData[type])?riskData[type]:[];
  return rows.filter(r=>{
    if(branch && key(r.CABANG)!==key(branch)) return false;
    if(unit && key(r.OUTLET)!==key(unit)) return false;
    if(q && !RISK_COLUMNS.some(h=>String(r[h]??'').toLocaleLowerCase('id-ID').includes(q))) return false;
    return true;
  });
}
function renderRiskPage(type){
  const cfg=RISK_CONFIG[type]; if(!cfg) return;
  populateRiskFilters(type);
  const shown=riskFiltered(type);
  $(cfg.total).textContent=shown.length.toLocaleString('id-ID');
  $(cfg.outlets).textContent=new Set(shown.map(r=>key(r.OUTLET)).filter(Boolean)).size.toLocaleString('id-ID');
  $(cfg.branches).textContent=new Set(shown.map(r=>key(r.CABANG)).filter(Boolean)).size.toLocaleString('id-ID');
  $(cfg.imported).textContent=riskMeta.lastImport||'-';
  $(cfg.head).innerHTML='<tr>'+RISK_COLUMNS.map(h=>`<th>${safe(h)}</th>`).join('')+'</tr>';
  $(cfg.body).innerHTML=shown.map(r=>'<tr>'+RISK_COLUMNS.map(h=>`<td title="${safe(r[h]??'')}">${safe(r[h]??'')}</td>`).join('')+'</tr>').join('');
  $(cfg.empty).classList.toggle('hidden',shown.length!==0);
}
function renderRiskNavAndSettings(){
  const counts={kol1:(riskData.kol1||[]).length,lar:(riskData.lar||[]).length,npl:(riskData.npl||[]).length};
  $('navKol1Count').textContent=counts.kol1.toLocaleString('id-ID');
  $('navLarCount').textContent=counts.lar.toLocaleString('id-ID');
  $('navNplCount').textContent=counts.npl.toLocaleString('id-ID');
  $('settingsKol1Count').textContent=counts.kol1.toLocaleString('id-ID');
  $('settingsLarCount').textContent=counts.lar.toLocaleString('id-ID');
  $('settingsNplCount').textContent=counts.npl.toLocaleString('id-ID');
  $('settingsPortfolioImport').textContent=riskMeta.lastImport||'-';
  const status=$('portfolioUploadStatus');
  if(riskMeta.fileName){ status.textContent=riskMeta.fileName; status.className='upload-status success'; }
  else { status.textContent='Belum ada file'; status.className='upload-status'; }
}
function renderRiskAll(){ renderRiskNavAndSettings(); ['kol1','lar','npl'].forEach(renderRiskPage); }
function exportRiskCsv(type){
  const cfg=RISK_CONFIG[type], shown=riskFiltered(type);
  if(!shown.length){ toast('Tidak ada data','Tidak ada data pada tampilan ini untuk diekspor.'); return; }
  downloadCsv(cfg.filename,[RISK_COLUMNS,...shown.map(r=>RISK_COLUMNS.map(h=>r[h]??''))]);
}
function printFilterText(branchId,unitId,searchId){
  const parts=[];
  const branch=$(branchId)?.value||''; const unit=$(unitId)?.value||''; const q=$(searchId)?.value.trim()||'';
  if(branch) parts.push(`Cabang: ${branch}`);
  if(unit) parts.push(`Unit: ${unit}`);
  if(q) parts.push(`Pencarian: ${q}`);
  return parts.length?parts.join(' • '):'Semua data';
}
function printHtmlDocument(title,subtitle,filterText,headers,rows){
  const headCells=headers.map(h=>`<th>${safe(h)}</th>`).join('');
  const bodyRows=rows.map((row,i)=>`<tr><td class="no">${i+1}</td>${headers.map(h=>`<td>${safe(row[h]??'')}</td>`).join('')}</tr>`).join('');
  const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${safe(title)}</title><style>
    @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172637;margin:0;font-size:7px}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #087a55;padding-bottom:8px;margin-bottom:9px}.brand{font-size:16px;font-weight:800;color:#075d42}.sub{color:#6e7f91;margin-top:3px;font-size:8px}.meta{text-align:right;line-height:1.5;max-width:48%;font-size:7px}.summary{display:flex;gap:8px;margin:8px 0}.chip{border:1px solid #d7e5df;border-radius:6px;padding:5px 7px;background:#f8fcfa}.chip b{color:#075d42}table{width:100%;border-collapse:collapse;table-layout:auto}th{background:#eaf7f2;color:#075d42;text-align:left;padding:4px 3px;border:1px solid #cfe2da;font-size:6.5px;white-space:normal;word-break:break-word}td{padding:4px 3px;border:1px solid #dde6e9;vertical-align:top;font-size:6.4px;white-space:normal;word-break:break-word}.no{width:22px;text-align:center;color:#718196}.foot{margin-top:7px;color:#8393a3;font-size:6.5px;text-align:right}
  </style></head><body><div class="head"><div><div class="brand">${safe(title)}</div><div class="sub">${safe(subtitle)} • Area Medan 1</div></div><div class="meta"><b>Filter:</b> ${safe(filterText)}<br><b>Dicetak:</b> ${safe(new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeStyle:'short'}).format(new Date()))}</div></div><div class="summary"><div class="chip"><b>${rows.length.toLocaleString('id-ID')}</b> data ditampilkan</div></div><table><thead><tr><th class="no">No</th>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table><div class="foot">Gunakan opsi “Save as PDF / Simpan sebagai PDF” pada dialog cetak.</div></body></html>`;
  const frame=document.createElement('iframe');
  frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0'; frame.style.width='0'; frame.style.height='0'; frame.style.border='0';
  document.body.appendChild(frame);
  const doc=frame.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(()=>{ frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(()=>frame.remove(),1200); },250);
}
function printMuliaPdf(){
  const shown=filteredMuliaRecords();
  if(!shown.length){ toast('Tidak ada data','Tidak ada data Mulia Lunas pada filter yang dipilih untuk dicetak.'); return; }
  const headers=muliaHeaders();
  const rows=shown.map(r=>Object.fromEntries(headers.map(h=>[h,r.data?.[h]??''])));
  printHtmlDocument('Daftar Nasabah Mulia Lunas','Database nasabah Mulia lunas',printFilterText('muliaBranchFilter','muliaUnitFilter','muliaSearchInput'),headers,rows);
}
function printRiskPdf(type){
  const cfg=RISK_CONFIG[type], shown=riskFiltered(type);
  if(!shown.length){ toast('Tidak ada data','Tidak ada data pada filter yang dipilih untuk dicetak.'); return; }
  printHtmlDocument(cfg.title,cfg.subtitle,printFilterText(cfg.branchFilter,cfg.unitFilter,cfg.search),RISK_COLUMNS,shown);
}
async function importPortfolioExcel(file){
  const input=$('portfolioExcelInput'), status=$('portfolioUploadStatus');
  if(!/\.xlsx$/i.test(file.name||'')){ toast('Format Excel tidak sesuai','Gunakan file Excel format .xlsx. Jika file masih .xls, simpan ulang sebagai .xlsx.'); input.value=''; return; }
  status.textContent='Membaca Excel...'; status.className='upload-status loading';
  $('portfolioFileHint').textContent='Memproses worksheet pertama. Mohon tunggu...';
  await new Promise(r=>setTimeout(r,30));
  try{
    if(!window.MiniXLSX?.readFirstSheet) throw new Error('Modul pembaca Excel tidak tersedia.');
    const parsed=await window.MiniXLSX.readFirstSheet(file,{wantedHeaders:RISK_WANTED_HEADERS});
    const missing=Object.keys(RISK_WANTED_HEADERS).filter(k=>!parsed.matchedHeaders[k]);
    if(missing.length) throw new Error('Kolom wajib tidak ditemukan: '+missing.join(', '));
    const next={kol1:[],lar:[],npl:[]};
    for(const raw of parsed.rows){
      const kol=Number(String(raw.KOLEKTIBILITAS??'').replace(',','.'));
      const hari=Number(String(raw.HARI_TUNGGAKAN??'').replace(',','.'));
      if(kol===1 && Number.isFinite(hari) && hari>=1 && hari<=10) next.kol1.push(riskVisibleRecord(raw));
      if(kol===2 && Number.isFinite(hari) && hari>=11 && hari<=30) next.lar.push(riskVisibleRecord(raw));
      if(kol>=3 && kol<=5) next.npl.push(riskVisibleRecord(raw));
    }
    const meta={
      fileName:file.name||'Data Excel',
      lastImport:new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date()),
      sheetName:parsed.sheetName||'Sheet1',
      sourceRows:parsed.rows.length
    };
    const totalFiltered=next.kol1.length+next.lar.length+next.npl.length;
    $('portfolioFileHint').textContent=`Excel terbaca: ${parsed.rows.length.toLocaleString('id-ID')} baris • ${totalFiltered.toLocaleString('id-ID')} data akan disimpan bertahap...`;
    await replaceRiskSnapshotChunked(next,meta,({stage,done,total})=>{
      if(stage==='upload'){
        const pct=total?Math.round(done/total*100):100;
        status.textContent=`Mengunggah ${pct}%`;
        $('portfolioFileHint').textContent=`Menyimpan ke Supabase: ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} data`;
      }
    });
    await refreshState();
    status.textContent=file.name; status.className='upload-status success';
    $('portfolioFileHint').textContent=`${parsed.rows.length.toLocaleString('id-ID')} baris sumber • Sheet: ${parsed.sheetName||'Sheet1'} • tersimpan bertahap ke Supabase`;
    toast('Import Excel selesai',`KOL 1: ${next.kol1.length} • LAR: ${next.lar.length} • NPL: ${next.npl.length}`);
  }catch(err){
    console.error(err);
    status.textContent='Import gagal'; status.className='upload-status error';
    $('portfolioFileHint').textContent=friendlyUploadError(err,'Upload DATA MULIA');
    toast('Import Excel gagal',friendlyUploadError(err,'Upload DATA MULIA'));
  }finally{ input.value=''; }
}
async function clearPortfolioData(){
  const total=(riskData.kol1||[]).length+(riskData.lar||[]).length+(riskData.npl||[]).length;
  if(!total && !riskMeta.fileName){ toast('Data kosong','Belum ada data monitoring emas yang tersimpan.'); return; }
  if(!confirm('Hapus seluruh data KOL 1, LAR, dan NPL hasil upload Excel?')) return;
  try{
    await apiFetch('/api/risk',{method:'DELETE',body:'{}'});
    await refreshState();
    $('portfolioFileHint').textContent='Contoh struktur: DATA MULIA.xlsx • data tersimpan online di Supabase';
    toast('Data monitoring dihapus','KOL 1, LAR, dan NPL sudah dikosongkan dari database.');
  }catch(err){ toast('Gagal menghapus',err.message||'Database tidak dapat diakses.'); }
}

// navigation
$('loginForm').addEventListener('submit',handleLogin);
$('logoutBtn').addEventListener('click',logout);
$('togglePasswordBtn').addEventListener('click',()=>{
  const input=$('loginPassword');
  const showing=input.type==='text';
  input.type=showing?'password':'text';
  $('togglePasswordBtn').textContent=showing?'👁':'🙈';
  $('togglePasswordBtn').setAttribute('aria-label',showing?'Tampilkan password':'Sembunyikan password');
});
$('loginUsername').addEventListener('input',()=>$('loginError').classList.add('hidden'));
$('loginPassword').addEventListener('input',()=>$('loginError').classList.add('hidden'));

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.nav)));
$('mobileMenuBtn').addEventListener('click',openSidebar); $('sidebarOverlay').addEventListener('click',closeSidebar);

// filters
$('periodFilter').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-period]'); if(!btn)return;
  currentPeriod=btn.dataset.period;
  $('dashboardStartDate').value=''; $('dashboardEndDate').value='';
  document.querySelectorAll('#periodFilter button').forEach(b=>b.classList.toggle('active',b===btn));
  renderDashboard();
});
$('dashboardStartDate').addEventListener('change',()=>{
  if($('dashboardEndDate').value && $('dashboardStartDate').value>$('dashboardEndDate').value) $('dashboardEndDate').value=$('dashboardStartDate').value;
  document.querySelectorAll('#periodFilter button').forEach(b=>b.classList.remove('active'));
  renderDashboard();
});
$('dashboardEndDate').addEventListener('change',()=>{
  if($('dashboardStartDate').value && $('dashboardEndDate').value<$('dashboardStartDate').value) $('dashboardStartDate').value=$('dashboardEndDate').value;
  document.querySelectorAll('#periodFilter button').forEach(b=>b.classList.remove('active'));
  renderDashboard();
});
$('clearDashboardRangeBtn').addEventListener('click',()=>{
  $('dashboardStartDate').value=''; $('dashboardEndDate').value=''; currentPeriod='month';
  document.querySelectorAll('#periodFilter button').forEach(b=>b.classList.toggle('active',b.dataset.period==='month'));
  renderDashboard();
});
$('editTargetBtn').addEventListener('click',()=>{ showPage('settings'); setTimeout(()=>$('targetSettingsCard').scrollIntoView({behavior:'smooth',block:'center'}),100); });

// target
$('targetValue').value=monthlyTarget; $('targetDisplay').value=monthlyTarget.toLocaleString('id-ID'); formatNumericInput($('targetDisplay'),$('targetValue'));
$('targetForm').addEventListener('submit',async e=>{
  e.preventDefault(); const val=Number($('targetValue').value);
  if(!val||val<=0){toast('Target belum valid','Masukkan target lebih dari Rp 0.');return;}
  try{
    await apiFetch('/api/settings/target',{method:'PUT',body:JSON.stringify({value:val})});
    monthlyTarget=val; renderDashboard(); toast('Target diperbarui',idr(val));
  }catch(err){ toast('Gagal menyimpan target',err.message||'Database tidak dapat diakses.'); }
});

// realization form
formatNumericInput($('amountDisplay'),$('amountValue')); $('dateInput').value=todayLocal();
$('branchSelect').addEventListener('change',()=>renderInputOptions($('branchSelect').value));
$('resetFormBtn').addEventListener('click',resetRealizationForm);
$('realizationForm').addEventListener('submit',async e=>{
  e.preventDefault(); const fd=new FormData(e.currentTarget); const amount=Number($('amountValue').value);
  if(!amount||amount<=0){toast('Nominal belum valid','Masukkan UP lebih dari Rp 0.');return;}
  const contract=normalize(fd.get('contract'));
  if(records.some(r=>key(r.contract)===key(contract))){toast('Akad sudah ada','No. kredit / akad harus unik.');return;}
  const record={id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),date:fd.get('date'),branch:normalize(fd.get('branch')),outlet:normalize(fd.get('outlet')),customer:normalize(fd.get('customer')),contract,product:normalize(fd.get('product')),tenor:Number(fd.get('tenor')),amount};
  try{
    await apiFetch('/api/realizations',{method:'POST',body:JSON.stringify(record)});
    records.push(record); currentPeriod='month'; $('dashboardStartDate').value=''; $('dashboardEndDate').value=''; document.querySelectorAll('#periodFilter button').forEach(b=>b.classList.toggle('active',b.dataset.period==='month')); renderDashboard(); renderTable(); resetRealizationForm(); toast('Realisasi tersimpan ke database',`${record.customer} • ${idr(record.amount)}`);
  }catch(err){ toast('Realisasi gagal disimpan',err.message||'Database tidak dapat diakses.'); }
});

// master products
$('addProductForm').addEventListener('submit',async e=>{
  e.preventDefault(); const value=normalize($('newProductInput').value); if(!value)return;
  try{
    await apiFetch('/api/products',{method:'POST',body:JSON.stringify({name:value})});
    $('newProductInput').value=''; await refreshState(); toast('Produk ditambahkan',value);
  }catch(err){ toast('Produk tidak ditambahkan',err.message||'Database tidak dapat diakses.'); }
});
$('productMasterList').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-delete-product]'); if(!btn)return; const value=btn.dataset.deleteProduct;
  if(!confirm(`Hapus master produk “${value}”? Data realisasi lama tidak akan berubah.`)) return;
  try{ await apiFetch('/api/products',{method:'DELETE',body:JSON.stringify({name:value})}); await refreshState(); toast('Produk dihapus',value); }
  catch(err){ toast('Gagal menghapus produk',err.message||'Database tidak dapat diakses.'); }
});

// master location
$('addLocationForm').addEventListener('submit',async e=>{
  e.preventDefault(); const branch=normalize($('newBranchInput').value),outlet=normalize($('newOutletInput').value); if(!branch||!outlet)return;
  try{
    await apiFetch('/api/locations',{method:'POST',body:JSON.stringify({branch,outlet})});
    $('newBranchInput').value=''; $('newOutletInput').value=''; await refreshState(); toast('Cabang / outlet ditambahkan',`${branch} • ${outlet}`);
  }catch(err){ toast('Data tidak ditambahkan',err.message||'Database tidak dapat diakses.'); }
});
$('locationMasterList').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-delete-location]'); if(!btn)return; const branch=btn.dataset.branch,outlet=btn.dataset.outlet;
  if(!confirm(`Hapus pasangan “${branch} / ${outlet}”? Data realisasi lama tidak akan berubah.`)) return;
  try{ await apiFetch('/api/locations',{method:'DELETE',body:JSON.stringify({branch,outlet})}); await refreshState(); toast('Cabang / outlet dihapus',`${branch} • ${outlet}`); }
  catch(err){ toast('Gagal menghapus cabang / outlet',err.message||'Database tidak dapat diakses.'); }
});

// CSV master data terpisah
$('productCsvInput').addEventListener('change',e=>{ const file=e.target.files?.[0]; if(file) importProductCsv(file); });
$('locationCsvInput').addEventListener('change',e=>{ const file=e.target.files?.[0]; if(file) importLocationCsv(file); });
$('downloadProductTemplateBtn').addEventListener('click',()=>downloadCsv('template-master-produk.csv',[
  ['Nama Produk'],
  ['KCA Emas'],
  ['Gadai Emas']
]));
$('downloadLocationTemplateBtn').addEventListener('click',()=>downloadCsv('template-master-cabang-outlet-area-medan-1.csv',[
  ['Nama Cabang','Nama Outlet'],
  ['10001:CP MEDAN UTAMA','10001:CP MEDAN UTAMA'],
  ['10001:CP MEDAN UTAMA','10002:UPC TITI KUNING'],
  ['10001:CP MEDAN UTAMA','10003:UPC KATAMSO'],
  ['10001:CP MEDAN UTAMA','10004:UPC MEDAN PLASA'],
  ['10001:CP MEDAN UTAMA','10005:UPC PUSAT PASAR'],
  ['10001:CP MEDAN UTAMA','10006:UPC GAJAHMADA'],
  ['10001:CP MEDAN UTAMA','10007:UPC SIMPANG UISU'],
  ['10001:CP MEDAN UTAMA','10008:UPC MULTATULI'],
  ['10001:CP MEDAN UTAMA','10200:UPC MEDAN THAMRIN'],
  ['10009:CP LABUHAN DELI','10009:CP LABUHAN DELI'],
  ['10009:CP LABUHAN DELI','10010:UPC MARELAN'],
  ['10009:CP LABUHAN DELI','10011:UPC BELAWAN'],
  ['10009:CP LABUHAN DELI','10012:UPC HAMPARAN PERAK'],
  ['10009:CP LABUHAN DELI','10013:UPC MARTUBUNG'],
  ['10009:CP LABUHAN DELI','10014:UPC MARELAN 2'],
  ['10016:CP PANCUR BATU','10016:CP PANCUR BATU'],
  ['10016:CP PANCUR BATU','10017:UPC TANJUNG ANOM'],
  ['10016:CP PANCUR BATU','10018:UPC SELAYANG'],
  ['10016:CP PANCUR BATU','10019:UPC KARYA KASIH'],
  ['10025:CP TANJUNG PURA','10025:CP TANJUNG PURA'],
  ['10025:CP TANJUNG PURA','10026:UPC STABAT'],
  ['10025:CP TANJUNG PURA','10027:UPC KUALA BEGUMIT'],
  ['10025:CP TANJUNG PURA','10028:UPC PERDAMAIAN STABAT'],
  ['10025:CP TANJUNG PURA','17001:UPC BRI UNIT BATANG SERANGAN'],
  ['10029:CP PKL BRANDAN','10029:CP PKL BRANDAN'],
  ['10029:CP PKL BRANDAN','10030:UPC PANGKALAN SUSU'],
  ['10029:CP PKL BRANDAN','10031:UPC PELAWI'],
  ['10029:CP PKL BRANDAN','10032:UPC SEI LAPAN'],
  ['10029:CP PKL BRANDAN','10033:UPC BESITANG'],
  ['10034:CP BINJAI','10034:CP BINJAI'],
  ['10034:CP BINJAI','10035:UPC BINJAI UTARA'],
  ['10034:CP BINJAI','10036:UPC PASAR TAVIP'],
  ['10034:CP BINJAI','10037:UPC MERDEKA'],
  ['10034:CP BINJAI','10038:UPC SOEKARNO HATTA'],
  ['10034:CP BINJAI','10039:UPC BANGKATAN'],
  ['10034:CP BINJAI','14375:UPC KUALA'],
  ['10034:CP BINJAI','14428:UPC TANAH SERIBU'],
  ['10124:CP MEDAN SUNGGAL','10124:CP MEDAN SUNGGAL'],
  ['10124:CP MEDAN SUNGGAL','10125:UPC PASAR SUNGGAL'],
  ['10124:CP MEDAN SUNGGAL','10126:UPC CINTA DAMAI'],
  ['10124:CP MEDAN SUNGGAL','10127:UPC AMAL'],
  ['10124:CP MEDAN SUNGGAL','10128:UPC ASOKA'],
  ['10124:CP MEDAN SUNGGAL','10129:UPC BATANG HARI'],
  ['10130:CP KRAKATAU','10130:CP KRAKATAU'],
  ['10130:CP KRAKATAU','10131:UPC PERJUANGAN'],
  ['10130:CP KRAKATAU','10132:UPC PANCING'],
  ['10130:CP KRAKATAU','10133:UPC SIDORUKUN'],
  ['10130:CP KRAKATAU','10134:UPC MAHAMERU'],
  ['10130:CP KRAKATAU','10135:UPC BAYANGKARA'],
  ['10130:CP KRAKATAU','14393:UPC LODENDANG'],
  ['10136:CP KABANJAHE','10136:CP KABANJAHE'],
  ['10136:CP KABANJAHE','10137:UPC BRASTAGI'],
  ['10136:CP KABANJAHE','10138:UPC TIGA PANAH'],
  ['10136:CP KABANJAHE','14373:UPC TIGA BINANGA'],
  ['10136:CP KABANJAHE','14427:UPC LAU CIMBA'],
  ['10136:CP KABANJAHE','17004:UPC BRI UNIT SARIBU DOLOK'],
  ['10136:CP KABANJAHE','17104:UPC BRI UNIT TIGANDERKET'],
  ['10136:CP KABANJAHE','17105:UPC BRI UNIT LAUBALENG'],
  ['10139:CP MEDAN KARYA','10139:CP MEDAN KARYA'],
  ['10139:CP MEDAN KARYA','10141:UPC PASAR IV'],
  ['10139:CP MEDAN KARYA','10142:UPC ADAM MALIK'],
  ['10154:CP SIDIKALANG','10154:CP SIDIKALANG'],
  ['10154:CP SIDIKALANG','10155:UPC SUMBUL'],
  ['10154:CP SIDIKALANG','14372:UPC TIGA LINGGA'],
  ['10154:CP SIDIKALANG','17041:UPC BRI UNIT SALAK SIDIKALANG'],
  ['10154:CP SIDIKALANG','17230:UPC BRI UNIT PARONGIL'],
  ['10165:CP GAHARU','10165:CP GAHARU'],
  ['10165:CP GAHARU','10166:UPC SERDANG'],
  ['10165:CP GAHARU','10167:UPC KAMPUNG DURIAN'],
  ['10165:CP GAHARU','10168:UPC PRINTIS'],
  ['10165:CP GAHARU','10169:UPC GLUGUR'],
  ['10176:CP KP LALANG','10176:CP KP LALANG'],
  ['10176:CP KP LALANG','10177:UPC DISKI'],
  ['10176:CP KP LALANG','10178:UPC PONDOK KELAPA'],
  ['10176:CP KP LALANG','10179:UPC KLAMBIR LIMA'],
  ['10176:CP KP LALANG','10180:UPC RING ROAD'],
  ['10176:CP KP LALANG','10181:UPC SEMAYANG'],
  ['10176:CP KP LALANG','10182:UPC MEDAN KRIYO'],
  ['10176:CP KP LALANG','10183:UPC KLUMPANG'],
  ['10176:CP KP LALANG','17032:UPC BRI UNIT KLUMPANG'],
  ['10185:CP PULO BRAYAN','10185:CP PULO BRAYAN'],
  ['10185:CP PULO BRAYAN','10186:UPC TITI PAPAN'],
  ['10185:CP PULO BRAYAN','10187:UPC VETERAN'],
  ['10185:CP PULO BRAYAN','10188:UPC MABAR'],
  ['10189:CP HELVETIA','10189:CP HELVETIA'],
  ['10189:CP HELVETIA','10190:UPC PASAR HELVETIA'],
  ['10189:CP HELVETIA','10191:UPC SEI SIKAMBING'],
  ['10189:CP HELVETIA','10192:UPC PLASA MILENIUM'],
  ['10204:CP MEDAN PETISAH','10204:CP MEDAN PETISAH'],
  ['10204:CP MEDAN PETISAH','10205:UPC GATOT SUBROTO'],
  ['10204:CP MEDAN PETISAH','10207:UPC SEKIP'],
  ['10204:CP MEDAN PETISAH','10208:UPC MEDAN FAIR'],
  ['60075:CPS AR.HAKIM','60075:CPS AR.HAKIM'],
  ['60075:CPS AR.HAKIM','60078:UPS AHMAD YANI SIANTAR'],
  ['60075:CPS AR.HAKIM','60079:UPS WAHIDIN SIANTAR'],
  ['60075:CPS AR.HAKIM','60919:UPS AYAHANDA']
]));

// Mulia lunas CSV
$('muliaCsvInput').addEventListener('change',e=>{ const file=e.target.files?.[0]; if(file) importMuliaCsv(file); });
$('downloadMuliaTemplateBtn').addEventListener('click',()=>downloadCsv('template-nasabah-mulia-lunas.csv',[
  MULIA_TEMPLATE_HEADERS,
  ['BUDI SANTOSO','AKD-MULIA-001','10001:CP MEDAN UTAMA','10002:UPC TITI KUNING','2026-09-01']
]));
$('muliaSearchInput').addEventListener('input',renderMulia);
$('muliaBranchFilter').addEventListener('change',renderMulia);
$('muliaUnitFilter').addEventListener('change',renderMulia);
$('muliaExportBtn').addEventListener('click',exportMuliaCsv);
$('muliaPdfBtn').addEventListener('click',printMuliaPdf);
$('muliaBody').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-delete-mulia]'); if(!btn)return;
  if(!confirm('Hapus data nasabah Mulia Lunas ini?')) return;
  try{ await apiFetch('/api/mulia/'+encodeURIComponent(btn.dataset.deleteMulia),{method:'DELETE'}); await refreshState(); toast('Data dihapus','Data Mulia Lunas berhasil dihapus dari database.'); }
  catch(err){ toast('Gagal menghapus data',err.message||'Database tidak dapat diakses.'); }
});
$('muliaDeleteAllBtn').addEventListener('click',async ()=>{
  if(!muliaRecords.length){ toast('Daftar kosong','Belum ada data Mulia Lunas yang perlu dihapus.'); return; }
  if(!confirm(`Hapus SEMUA ${muliaRecords.length} data nasabah Mulia Lunas? Tindakan ini tidak dapat dibatalkan.`)) return;
  try{ await apiFetch('/api/mulia',{method:'DELETE'}); await refreshState(); toast('Semua data dihapus','Daftar nasabah Mulia Lunas sudah dikosongkan dari database.'); }
  catch(err){ toast('Gagal menghapus semua data',err.message||'Database tidak dapat diakses.'); }
});

// portfolio Excel monitoring emas
$('portfolioExcelInput').addEventListener('change',e=>{ const file=e.target.files?.[0]; if(file) importPortfolioExcel(file); });
$('clearPortfolioBtn').addEventListener('click',clearPortfolioData);
['kol1','lar','npl'].forEach(type=>{
  const cfg=RISK_CONFIG[type];
  $(cfg.search).addEventListener('input',()=>renderRiskPage(type));
  $(cfg.branchFilter).addEventListener('change',()=>renderRiskPage(type));
  $(cfg.unitFilter).addEventListener('change',()=>renderRiskPage(type));
  $(cfg.export).addEventListener('click',()=>exportRiskCsv(type));
  $(cfg.pdf).addEventListener('click',()=>printRiskPdf(type));
});

// records
$('searchInput').addEventListener('input',renderTable);
$('archiveStartDate').addEventListener('change',()=>{
  if($('archiveEndDate').value && $('archiveStartDate').value>$('archiveEndDate').value) $('archiveEndDate').value=$('archiveStartDate').value;
  renderTable();
});
$('archiveEndDate').addEventListener('change',()=>{
  if($('archiveStartDate').value && $('archiveEndDate').value<$('archiveStartDate').value) $('archiveStartDate').value=$('archiveEndDate').value;
  renderTable();
});
$('clearArchiveRangeBtn').addEventListener('click',()=>{ $('archiveStartDate').value=''; $('archiveEndDate').value=''; renderTable(); });
$('recordsBody').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-delete-record]'); if(!btn)return; const id=btn.dataset.deleteRecord;
  if(!confirm('Hapus data realisasi ini?')) return;
  try{ await apiFetch('/api/realizations/'+encodeURIComponent(id),{method:'DELETE'}); records=records.filter(r=>r.id!==id); renderDashboard(); renderTable(); toast('Data dihapus','Realisasi berhasil dihapus dari database.'); }
  catch(err){ toast('Gagal menghapus realisasi',err.message||'Database tidak dapat diakses.'); }
});
$('deleteAllBtn').addEventListener('click',async ()=>{
  if(!records.length){ toast('Report kosong','Tidak ada data realisasi yang perlu dihapus.'); return; }
  if(!confirm(`Hapus SEMUA ${records.length} data realisasi? Tindakan ini tidak dapat dibatalkan.`)) return;
  try{ await apiFetch('/api/realizations',{method:'DELETE'}); records=[]; renderDashboard(); renderTable(); toast('Semua data dihapus','Report realisasi sudah dikosongkan dari database.'); }
  catch(err){ toast('Gagal menghapus report',err.message||'Database tidak dapat diakses.'); }
});
$('exportBtn').addEventListener('click',()=>{
  const shown=getArchiveRecords();
  if(!shown.length){ toast('Tidak ada data','Tidak ada realisasi pada filter yang dipilih untuk diekspor.'); return; }
  const headers=['Tanggal Pencairan','Nama Cabang','Nama Outlet','Nama Nasabah','No Kredit (Akad)','Jenis Produk','Tenor (Bulan)','UP'];
  downloadCsv('report-realisasi-closing-emas.csv',[headers,...shown.map(r=>[r.date,r.branch,r.outlet,r.customer,r.contract,r.product,r.tenor,r.amount])]);
});
$('printPdfBtn').addEventListener('click',printArchivePdf);

document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSidebar(); });
async function initializeApp(){
  const foot=document.querySelector('.login-foot');
  try{
    const sb=ensureSupabase();
    const {data,error}=await sb.auth.getSession();
    if(error) throw mapSupabaseError(error,'Sesi Supabase tidak dapat dibaca.');
    if(data?.session?.user){
      const profile=await loadProfile(data.session.user.id);
      await openAuthenticatedApp({token:data.session.access_token||'',user:profile});
    }else{
      showLoginScreen();
    }
    if(foot) foot.innerHTML='<span class="online-dot"></span> Database online • Supabase terhubung';
  }catch(err){
    console.error(err);
    showLoginScreen();
    if(foot) foot.innerHTML='<span class="online-dot"></span> '+safe(err.message||'Supabase belum terhubung');
  }
}
let __lastFocusSync=0;
window.addEventListener('focus',()=>{
  if(!currentUser) return;
  const now=Date.now(); if(now-__lastFocusSync<15000) return; __lastFocusSync=now;
  refreshState().catch(err=>console.warn('Sinkronisasi Supabase gagal:',err));
});
initializeApp();

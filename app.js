/* Penghubung ke Google Sheets (pengganti Apps Script) */
const SC='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';
const NAMA={in:'Pemasukan',out:'Pengeluaran'};
const ALIAS={date:['tanggal','tgl','date','waktu'],cat:['kategori','sumber','metode','jenis','category'],amount:['jumlah','nominal','amount','total','nilai'],note:['keterangan','catatan','note','deskripsi','ket'],by:['dicatat oleh','oleh','pencatat'],wallet:['dompet','metode bayar','pembayaran','metode pembayaran']};
const DEF={date:0,cat:1,amount:2,note:3,by:-1,wallet:-1};
let TOKEN='',EXP=0,USER='',tc=null,META=null;
const enc=encodeURIComponent,ra=(t,a)=>"'"+t.title+"'!"+a,rg=(t,a)=>enc(ra(t,a));
const colL=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
const clean=s=>{s=String(s||'');return /^[=+\-@]/.test(s)?"'"+s:s};
const gsi=()=>new Promise(r=>{const f=()=>window.google&&google.accounts&&google.accounts.oauth2?r():setTimeout(f,100);f()});

function tok(){return gsi().then(()=>new Promise((res,rej)=>{
  if(!tc)tc=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SC,callback:()=>{}});
  tc.callback=async r=>{if(r.error)return rej(new Error(r.error));TOKEN=r.access_token;EXP=Date.now()+(r.expires_in-60)*1000;
    try{const u=await(await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+TOKEN}})).json();USER=String(u.email||'').split('@')[0]}catch(e){}
    res(TOKEN)};
  tc.error_callback=e=>rej(new Error(e.type||'popup'));
  tc.requestAccessToken({prompt:''})}))}
async function auth(){if(TOKEN&&Date.now()<EXP)return TOKEN;if(LS.g('li')!='1')throw new Error('Belum masuk');
  try{return await tok()}catch(e){throw new Error('Sesi habis. Muat ulang aplikasi lalu masuk lagi.')}}
function loginUI(){loading=false;document.querySelector('.fab').style.display='none';
  $('#v').innerHTML=`<div class="card" style="text-align:center;margin-top:12vh"><div style="font-size:54px">💰</div><h1>Catatan Keuangan</h1><p style="color:var(--mute);margin:6px 0 18px">Masuk dengan akun Google yang punya akses ke spreadsheet-mu.</p><button class="btn" onclick="signIn()">Masuk dengan Google</button></div>`}
function signIn(){tok().then(()=>{LS.s('li','1');boot()}).catch(e=>toast('Gagal masuk: '+e.message,'bad'))}
async function boot(){try{await auth()}catch(e){return loginUI()}document.querySelector('.fab').style.display='';loading=!D.length;load()}

async function api(p,o={}){const t=await auth();
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+p,{...o,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}});
  const j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||r.status);return j}
async function meta(){if(!META){const j=await api('?fields=sheets.properties(sheetId,title)'),s=j.sheets.map(x=>x.properties);
  META={sheets:s,find:k=>{const w=NAMA[k].toLowerCase(),x=s.find(y=>y.title.trim().toLowerCase()==w);
    if(!x)throw new Error('Tab "'+NAMA[k]+'" tidak ditemukan. Tab yang ada: '+s.map(y=>'"'+y.title+'"').join(', '));return{title:x.title,id:x.sheetId}}}}return META}
function map_(h){h=h.map(x=>String(x).trim().toLowerCase());const m={};for(const k in ALIAS){const i=h.findIndex(x=>ALIAS[k].includes(x));m[k]=i>-1?i:DEF[k]}return m}
const num_=v=>typeof v=='number'?v:Number(String(v).replace(/,\d{1,2}$/,'').replace(/[^\d-]/g,''))||0;
function date_(v){if(typeof v=='number')return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
  const s=String(v).trim();let a=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(a)return a[3]+'-'+a[2].padStart(2,'0')+'-'+a[1].padStart(2,'0');a=s.match(/^\d{4}-\d{2}-\d{2}/);return a?a[0]:''}
async function hdr(t){const j=await api('/values/'+rg(t,'1:1'));return map_((j.values||[[]])[0])}

async function getCfg(){try{const j=await api('/values/'+enc('_Pengaturan!A1'));return JSON.parse(j.values[0][0])}catch(e){return{budget:{},goal:null}}}
async function setCfg(c){const M=await meta();
  if(!M.sheets.find(s=>s.title=='_Pengaturan')){await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:'_Pengaturan'}}}]})});META=null}
  await api('/values/'+enc('_Pengaturan!A1')+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[[JSON.stringify(c)]]})});return true}

async function getData(){const M=await meta(),ty=['in','out'],ts=ty.map(k=>M.find(k));
  const j=await api('/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&'+ts.map(t=>'ranges='+rg(t,'A:Z')).join('&'));
  const tx=[];j.valueRanges.forEach((vr,n)=>{const v=vr.values||[];if(v.length<2)return;const m=map_(v[0]);
    for(let i=1;i<v.length;i++){const r=v[i],d=date_(r[m.date]??''),a=num_(r[m.amount]??'');if(!d&&!a)continue;
      tx.push({type:ty[n],row:i+1,date:d,cat:String(r[m.cat]??'').trim(),amount:a,note:String(r[m.note]??''),by:m.by>-1?String(r[m.by]??''):'',wallet:m.wallet>-1?String(r[m.wallet]??'').trim():''})}});
  return{tx,cfg:await getCfg(),me:USER}}
async function put(t,m,type,row,o,isNew){
  const d=[[m.date,o.date],[m.cat,clean(o.cat)],[m.amount,Number(o.amount)],[m.note,clean(o.note)]];
  if(m.by>-1&&isNew)d.push([m.by,USER]);if(m.wallet>-1&&type=='out')d.push([m.wallet,o.wallet||'']);
  await api('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'USER_ENTERED',data:d.map(([c,v])=>({range:ra(t,colL(c)+row),values:[[v]]}))})})}
async function same(t,m,o){if(!o.row||o.row<2)throw new Error('Baris tidak valid');
  const j=await api('/values/'+rg(t,o.row+':'+o.row)+'?valueRenderOption=UNFORMATTED_VALUE'),r=(j.values||[[]])[0];
  if(num_(r[m.amount]??'')!==+o.orig.amount||String(r[m.cat]??'').trim()!==o.orig.cat)throw new Error('Data di sheet sudah berubah. Muat ulang dulu.')}
async function addTx(o){if(!(+o.amount>0))throw new Error('Nominal harus lebih dari 0');
  const t=(await meta()).find(o.type),m=await hdr(t),j=await api('/values/'+rg(t,colL(m.date)+':'+colL(m.date)));
  await put(t,m,o.type,Math.max(2,(j.values||[]).length+1),o,true);return true}
async function updateTx(o){if(!(+o.amount>0))throw new Error('Nominal harus lebih dari 0');
  const t=(await meta()).find(o.type),m=await hdr(t);await same(t,m,o);await put(t,m,o.type,o.row,o,false);return true}
async function deleteTx(o){const t=(await meta()).find(o.type),m=await hdr(t);await same(t,m,o);
  await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:t.id,dimension:'ROWS',startIndex:o.row-1,endIndex:o.row}}}]})});return true}
const makePdf=async h=>URL.createObjectURL(new Blob(['<!doctype html><meta charset="utf-8"><title>Laporan Keuangan</title>'+h+'<script>onload=()=>print()<\/script>'],{type:'text/html'}));

/* Pengganti google.script.run (agar kode tampilan tidak perlu diubah) */
const FN={getData,addTx,updateTx,deleteTx,setCfg,makePdf};
const RUN=new Proxy({},{get:(_,k)=>{let ok=()=>{},bad=()=>{};
  const o=new Proxy({},{get:(_,n)=>n=='withSuccessHandler'?f=>(ok=f,o):n=='withFailureHandler'?f=>(bad=f,o):(...a)=>{FN[n](...a).then(ok,bad)}});
  return o[k]}});

import {customer,purchase,invoice,text,number} from './billing-core';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const enc=new TextEncoder();
async function sign(value:string,secret:string){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function authorized(req:Request,env:any){if(env.APP_MODE!=='external')return true;const cookie=req.headers.get('cookie')?.match(/(?:^|; )cts_session=([^;]+)/)?.[1]||'';const [ts,mac]=cookie.split('.');return !!(env.ADMIN_PASSWORD?.length>=12&&Number(ts)>Date.now()&&mac===await sign(ts,env.ADMIN_PASSWORD));}
export async function api(req:Request,env:any):Promise<Response>{
 try{
 const url=new URL(req.url),path=url.pathname.replace(/^\/api\/billing\/?/,'').split('/').filter(Boolean),method=req.method;
 if(!['GET','HEAD'].includes(method)&&req.headers.get('origin')!==url.origin)return json({error:'Request origin not allowed.'},403);
 if(path[0]==='session'){
   if(method==='DELETE')return new Response('{}',{headers:{'Set-Cookie':'cts_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0','Content-Type':'application/json'}});
   if(method==='POST'&&env.APP_MODE==='external'){
    if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return json({error:'Set ADMIN_PASSWORD to at least 12 characters in Worker secrets.'},503);
    const b:any=await req.json(); const a=await sign(String(b.password||''),env.ADMIN_PASSWORD),z=await sign(env.ADMIN_PASSWORD,env.ADMIN_PASSWORD);
    if(a!==z)return json({error:'Incorrect password.'},401);
    const ts=String(Date.now()+12*3600000);return new Response('{}',{headers:{'Set-Cookie':`cts_session=${ts}.${await sign(ts,env.ADMIN_PASSWORD)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,'Content-Type':'application/json'}});
   }
   return json({authenticated:await authorized(req,env),external:env.APP_MODE==='external'});
 }
 if(!await authorized(req,env))return json({error:'Sign in to access your invoices.'},401);
 const db=env.DB,bucket=env.BUCKET;if(!db||!bucket)return json({error:'Database or receipt storage is not configured.'},503);
 async function rows(table:string){const r=await db.prepare(`SELECT * FROM ${table} ORDER BY updated DESC`).all();return r.results.map((x:any)=>({...JSON.parse(x.data),id:x.id,updated:x.updated}));}
 async function get(table:string,id:string|number){const r=await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();if(!r)throw new Error('Record not found.');return {...JSON.parse(r.data),id:r.id,updated:r.updated};}
 if(path[0]==='data'&&method==='GET'){const [customers,purchases,invoices]=await Promise.all(['customers','purchases','invoices'].map(rows));return json({customers,purchases,invoices});}
 if(path[0]==='customers'&&method==='POST'){
  const v:any=await req.json(),id=v.id?text(v.id,80,true):crypto.randomUUID(),d=customer(v);
  await db.prepare('INSERT INTO customers(id,data,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(id,JSON.stringify(d),Date.now()).run();return json({id});
 }
 if(path[0]==='purchases'&&method==='POST'){
  const v:any=await req.json(),id=v.id?text(v.id,80,true):crypto.randomUUID(),d=purchase(v);
  if(!d.customerId)throw new Error('Select the customer this product was purchased for.');
  await get('customers',d.customerId);
  const linked=(await rows('invoices')).filter((i:any)=>i.status!=='void'&&i.lines.some((l:any)=>l.purchaseId===id));
  if(linked.some((i:any)=>i.customerId!==d.customerId))throw new Error('This purchase is linked to an invoice for another customer. Remove the draft link or void the invoice before reassigning it.');
  if(d.receiptId&&!await db.prepare('SELECT id FROM receipts WHERE id=?').bind(d.receiptId).first())throw new Error('Receipt not found. Upload it again.');
  await db.prepare('INSERT INTO purchases(id,data,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(id,JSON.stringify(d),Date.now()).run();return json({id});
 }
 if(path[0]==='invoices'&&method==='POST'){
  const v:any=await req.json(),d=invoice(v),c=await get('customers',d.customerId),updated=Date.now();
  const previous=v.id?await get('invoices',v.id):null;if(previous&&previous.status!=='draft')throw new Error('Only draft invoices can be edited.');
  for(const l of d.lines){
   if(l.purchaseId){const p=await get('purchases',l.purchaseId);if(l.kind!=='product'||p.customerId!==d.customerId)throw new Error('Linked products must belong to this invoice customer.');l.unitCost=p.unitCost;}
   else delete l.unitCost;
  }
  const data={...d,customer:c,status:'draft',paidAt:null};
  if(previous){const r=await db.prepare("UPDATE invoices SET data=?,updated=? WHERE id=? AND updated=?").bind(JSON.stringify(data),updated,v.id,v.updated).run();if(!r.meta.changes) return json({error:'This invoice changed in another window. Reload before editing.'},409);return json({id:v.id});}
  const r=await db.prepare('INSERT INTO invoices(data,updated) VALUES(?,?)').bind(JSON.stringify(data),updated).run();return json({id:r.meta.last_row_id});
 }
 if(path[0]==='invoices'&&path[1]&&method==='PATCH'){
  const v:any=await req.json(),old=await get('invoices',path[1]);
  const transitions:any={draft:['issued','void'],issued:['paid','void'],paid:[],void:[]};if(!transitions[old.status]?.includes(v.status))throw new Error('This status change is not allowed.');
  if(v.status==='issued'){for(const l of old.lines){if(l.purchaseId){const p=await get('purchases',l.purchaseId);if(l.kind!=='product'||p.customerId!==old.customerId)throw new Error('A linked product belongs to another customer. Edit this draft before finalizing.');if(l.unitCost===undefined)l.unitCost=p.unitCost;}}}
  const {id,updated,...data}=old;data.status=v.status;if(v.status==='paid')data.paidAt=new Date().toISOString();
  const r=await db.prepare('UPDATE invoices SET data=?,updated=? WHERE id=? AND updated=?').bind(JSON.stringify(data),Date.now(),id,updated).run();if(!r.meta.changes)return json({error:'Invoice changed. Refresh and try again.'},409);return json({id});
 }
 if(path[0]==='receipts'&&method==='POST'){
  const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>5*1024*1024)throw new Error('Choose an image or PDF under 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()); let type='';
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)type='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
  else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')type='image/webp';
  else if(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-')type='application/pdf';
  if(!type)throw new Error('Supported receipts: PNG, JPEG, WebP or PDF.');
  const id=crypto.randomUUID();await bucket.put('receipts/'+id,bytes,{httpMetadata:{contentType:type}});
  try{await db.prepare('INSERT INTO receipts(id,name,type,size) VALUES(?,?,?,?)').bind(id,file.name.slice(0,200),type,file.size).run();}catch(e){await bucket.delete('receipts/'+id);throw e;}
  return json({id,name:file.name});
 }
 if(path[0]==='receipts'&&path[1]&&method==='GET'){
  const r=await db.prepare('SELECT * FROM receipts WHERE id=?').bind(path[1]).first();if(!r)return json({error:'Receipt not found'},404);const obj=await bucket.get('receipts/'+r.id);if(!obj)return json({error:'Receipt file is missing'},404);
  return new Response(obj.body,{headers:{'Content-Type':r.type,'Content-Disposition':`inline; filename="receipt.${r.type==='application/pdf'?'pdf':r.type.split('/')[1]}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox"}});
 }
 if(path[0]==='backup'&&method==='GET'){
  const [customers,purchases,invoices]=await Promise.all(['customers','purchases','invoices'].map(rows));const rr=(await db.prepare('SELECT * FROM receipts').all()).results;
  // Stream base64 receipts one at a time so the export does not buffer the archive.
  const stream=new ReadableStream({async start(controller){try{controller.enqueue(enc.encode(JSON.stringify({format:'cts-billing',version:1,created:new Date().toISOString(),customers,purchases,invoices}).slice(0,-1)+',"receipts":['));
   for(let i=0;i<rr.length;i++){const r=rr[i],obj=await bucket.get('receipts/'+r.id);if(!obj)throw new Error('Missing receipt '+r.id);const b=new Uint8Array(await obj.arrayBuffer());let s='';for(let j=0;j<b.length;j+=32768)s+=String.fromCharCode(...b.slice(j,j+32768));controller.enqueue(enc.encode((i?',':'')+JSON.stringify({...r,base64:btoa(s)})));}
   controller.enqueue(enc.encode(']}'));controller.close();}catch(e){controller.error(e);}}});
  return new Response(stream,{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="cts-backup-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'no-store'}});
 }
 if(path[0]==='restore'&&method==='POST'){
  if(Number(req.headers.get('content-length')||0)>25*1024*1024)throw new Error('Browser restore supports backups up to 25 MB. Use the documented migration method for larger backups.');
  const raw=await req.text();if(raw.length>25*1024*1024)throw new Error('Backup exceeds the 25 MB restore limit.');const b=JSON.parse(raw);
  if(b.format!=='cts-billing'||b.version!==1||!['customers','purchases','invoices','receipts'].every(k=>Array.isArray(b[k])))throw new Error('Choose a valid CTS backup.');
  if(b.customers.length+b.purchases.length+b.invoices.length+b.receipts.length>1000)throw new Error('Browser restore supports up to 1,000 records.');
  const count=await db.prepare('SELECT (SELECT COUNT(*) FROM customers)+(SELECT COUNT(*) FROM invoices)+(SELECT COUNT(*) FROM purchases)+(SELECT COUNT(*) FROM receipts) AS n').first();if(count.n)throw new Error('Restore requires an empty database so existing work cannot be overwritten.');
  const ids=new Set<string>(),cids=new Set<string>();const commands:any[]=[]; const uploaded:string[]=[];
  const validId=(x:any)=>{if(typeof x!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(x))throw new Error('Invalid record identifier.');return x;};
  for(const c of b.customers){const id=validId(c.id);if(cids.has(id))throw new Error('Duplicate customer.');cids.add(id);commands.push(db.prepare('INSERT INTO customers(id,data,updated) VALUES(?,?,?)').bind(id,JSON.stringify(customer(c)),Date.now()));}
  for(const r of b.receipts){validId(r.id);if(ids.has(r.id)||!['image/png','image/jpeg','image/webp','application/pdf'].includes(r.type)||typeof r.base64!=='string')throw new Error('Invalid receipt.');const bytes=Uint8Array.from(atob(r.base64),x=>x.charCodeAt(0));if(bytes.length!==r.size||bytes.length>5*1024*1024)throw new Error('Invalid receipt size.');ids.add(r.id);commands.push(db.prepare('INSERT INTO receipts(id,name,type,size) VALUES(?,?,?,?)').bind(r.id,text(r.name,200),r.type,r.size));}
  for(const p of b.purchases){const d=purchase(p);if(d.customerId&&!cids.has(d.customerId)||d.receiptId&&!ids.has(d.receiptId))throw new Error('Purchase references missing data.');commands.push(db.prepare('INSERT INTO purchases(id,data,updated) VALUES(?,?,?)').bind(validId(p.id),JSON.stringify(d),Date.now()));}
  for(const i of b.invoices){const d=invoice(i);if(!Number.isSafeInteger(i.id)||i.id<1||!cids.has(d.customerId)||!['draft','issued','paid','void'].includes(i.status))throw new Error('Invalid invoice.');commands.push(db.prepare('INSERT INTO invoices(id,data,updated) VALUES(?,?,?)').bind(i.id,JSON.stringify({...d,customer:customer(i.customer),status:i.status,paidAt:i.paidAt?text(i.paidAt,40):null}),Date.now()));}
  if(!commands.length)return json({ok:true});
  try{for(const r of b.receipts){const key='receipts/'+r.id;await bucket.put(key,Uint8Array.from(atob(r.base64),x=>x.charCodeAt(0)),{httpMetadata:{contentType:r.type}});uploaded.push(key);}await db.batch(commands);}catch(e){for(const k of uploaded)await bucket.delete(k);throw e;}
  return json({ok:true});
 }
 return json({error:'Not found.'},404);
 }catch(e:any){console.error('Billing request failed:',e.message);return json({error:e.message?.includes('D1_')||e.message?.includes('SQLITE')?'Database request failed. Please retry.':e.message||'Request failed.'},400);}
}

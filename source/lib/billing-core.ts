export function text(v:unknown, max=200, required=false):string {
  const s=typeof v==='string'?v.trim():'';
  if(s.length>max || (required&&!s)) throw new Error(`Enter ${required?'a value of ':''}${max} characters or fewer.`);
  return s;
}
export function money(v:unknown):number {const n=Number(v); if(!Number.isSafeInteger(n)||n<0||n>100000000)throw new Error('Enter a valid amount between $0 and $1,000,000.');return n;}
export function qty(v:unknown):number {const n=Number(v);if(!Number.isFinite(n)||n<=0||n>100000||Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error('Quantity must be greater than zero with at most two decimal places.');return n;}
export function day(v:unknown):string {const s=text(v,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Enter a valid date.');return s;}
export function customer(v:any) {return {name:text(v.name,150,true),contact:text(v.contact,150),email:text(v.email,200),phone:text(v.phone,60),address:text(v.address,1000),mailDifferent:!!v.mailDifferent,mailing:text(v.mailing,1000),regular:money(v.regular),helpdesk:money(v.helpdesk),afterhours:money(v.afterhours),notes:text(v.notes,4000)};}
export function purchase(v:any){return {name:text(v.name,200,true),vendor:text(v.vendor,150),date:day(v.date),quantity:qty(v.quantity),unitCost:money(v.unitCost),unitPrice:money(v.unitPrice),customerId:text(v.customerId,80),receiptId:text(v.receiptId,80),notes:text(v.notes,4000)};}
export function invoice(v:any){
 const customerId=text(v.customerId,80,true),issued=day(v.date),due=day(v.due);
 if(due<issued)throw new Error('Due date cannot be before the invoice date.');
 if(!Array.isArray(v.lines)||!v.lines.length||v.lines.length>500)throw new Error('Add between 1 and 500 invoice lines.');
 const lines=v.lines.map((x:any)=>{if(!['regular','helpdesk','afterhours','product','other'].includes(x.kind))throw new Error('Unknown line type.'); const quantity=qty(x.quantity),unitPrice=money(x.unitPrice);return {kind:x.kind,description:text(x.description,500,true),quantity,unitPrice,purchaseId:text(x.purchaseId,80),timeEntryId:text(x.timeEntryId,80),timeUpdated:x.timeUpdated===undefined?undefined:Number(x.timeUpdated),...(x.unitCost!==undefined?{unitCost:money(x.unitCost)}:{}),amount:Math.round(Math.round(quantity*100)*unitPrice/100)};});
 const subtotal=lines.reduce((s:number,x:any)=>s+x.amount,0),taxRate=Number(v.taxRate||0);
 if(!Number.isFinite(taxRate)||taxRate<0||taxRate>30||Math.abs(taxRate*100-Math.round(taxRate*100))>.00001)throw new Error('Tax must be between 0 and 30 percent with at most two decimals.');
 const tax=Math.round(subtotal*Math.round(taxRate*100)/10000),total=subtotal+tax;if(!Number.isSafeInteger(total)||total>10000000000)throw new Error('Invoice total is too large.');
 return {customerId,date:issued,due,lines,notes:text(v.notes,4000),taxRate,subtotal,tax,total};
}
export function number(id:number){return `CTS-${String(id).padStart(6,'0')}`;}

// Sales are derived from linked invoice lines, never a manually maintained second price.
export function purchaseSales(p:any,invoices:any[]){
 const entries=invoices.filter(i=>i.status!=='void').flatMap(i=>i.lines.filter((l:any)=>l.purchaseId===p.id).map((l:any)=>({invoiceId:i.id,status:i.status,quantity:l.quantity,unitPrice:l.unitPrice,amount:l.amount,cost:Math.round(Math.round(l.quantity*100)*(l.unitCost??p.unitCost)/100)})));
 const sold=entries.filter(e=>e.status==='issued'||e.status==='paid');
 const revenue=sold.reduce((s,e)=>s+e.amount,0),cost=sold.reduce((s,e)=>s+e.cost,0),quantity=sold.reduce((s,e)=>s+Math.round(e.quantity*100),0)/100;
 return {entries,revenue,cost,quantity,profit:revenue-cost,markup:cost>0?(revenue-cost)/cost*100:null,hasSales:sold.length>0};
}

export function timeDuration(start:string,end:string,nextDay=false){
 const minute=(s:string)=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw new Error('Enter valid start and end times.');const [h,m]=s.split(':').map(Number);return h*60+m;};
 const durationMinutes=minute(end)-minute(start)+(nextDay?1440:0);
 if(durationMinutes<=0||durationMinutes>1440)throw new Error('End time must follow start time, within 24 hours. Use Next day for overnight work.');
 return {durationMinutes,hours:Math.ceil(durationMinutes/15)/4};
}
export function timeEntry(v:any){
 if(!['regular','helpdesk','afterhours'].includes(v.kind))throw new Error('Select a time category.');
 const timed=!!(v.startTime||v.endTime);
 const timing=timed?{startTime:text(v.startTime,5,true),endTime:text(v.endTime,5,true),nextDay:!!v.nextDay,...timeDuration(v.startTime,v.endTime,!!v.nextDay)}:{};
 const hours=timed?(timing as any).hours:qty(v.hours);if(hours>24)throw new Error('A time entry cannot exceed 24 hours.');
 return {customerId:text(v.customerId,80,true),date:day(v.date),description:text(v.description,450,true),kind:v.kind,hours,unitPrice:money(v.unitPrice),...timing};
}
// Rolling periods use the recorded start time in the viewer's local timezone.
// Legacy entries have only a work date, so include dates intersecting the period.
export function inTimePeriod(t:any,period:string,from:string,to:string,now=new Date()){
 if(period==='custom')return !!from&&!!to&&from<=to&&t.date>=from&&t.date<=to;
 const span=period==='48'?48:period==='7'?168:720,cutoff=now.getTime()-span*3600000;
 const start=new Date(t.date+'T'+(t.startTime||'00:00')+':00').getTime();
 const end=t.startTime?start:new Date(t.date+'T23:59:59.999').getTime();
 return start<=now.getTime()&&end>=cutoff;
}
export function timeLine(t:any){return {kind:t.kind,description:t.date+' · '+t.description,quantity:t.hours,unitPrice:t.unitPrice,purchaseId:'',timeEntryId:t.id,timeUpdated:t.updated};}

export const expenseCategories=['Software & subscriptions','Office supplies','Equipment','Internet & phone','Travel','Meals','Vehicle & transportation','Insurance','Professional services','Advertising & marketing','Rent & utilities','Training & education','Fees & licenses','Other'];
export function expense(v:any){
 const category=text(v.category,80,true);if(!expenseCategories.includes(category))throw new Error('Choose an expense category.');
 const amount=money(v.amount);if(amount<=0)throw new Error('Expense amount must be greater than zero.');
 return {date:day(v.date),vendor:text(v.vendor,150,true),description:text(v.description,500,true),category,amount,customerId:text(v.customerId,80),receiptId:text(v.receiptId,80),notes:text(v.notes,4000),archived:!!v.archived};
}

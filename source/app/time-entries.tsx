'use client';
import React,{useState,useEffect} from 'react';
import {timeLine} from '../lib/billing-core';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const labels:any={regular:'Regular hours',helpdesk:'Helpdesk',afterhours:'After hours'};
const amount=(t:any)=>Math.round(Math.round(t.hours*100)*t.unitPrice/100);
const hours=(items:any[])=>items.reduce((s:number,t:any)=>s+Math.round(t.hours*100),0)/100;
function toggle(set:any,id:string){set((ids:string[])=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
export function TimeEntries({data,open,run,api,reload,showInvoice,busy,emptyInvoice}:any){
 const [customer,setCustomer]=useState(''),[status,setStatus]=useState('unbilled'),[selected,setSelected]=useState<string[]>([]);
 const state=(t:any)=>!t.invoiceId?'unbilled':data.invoices.find((i:any)=>i.id===t.invoiceId)?.status==='draft'?'draft':'billed';
 const visible=data.timeEntries.filter((t:any)=>(!customer||t.customerId===customer)&&(status==='all'||state(t)===status)).sort((a:any,b:any)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const available=visible.filter((t:any)=>!t.invoiceId);
 const chosen=available.filter((t:any)=>selected.includes(t.id));
 return <section className="panel time-panel">
  <div className="time-filters"><label className="field"><span>Customer</span><select value={customer} onChange={e=>{setCustomer(e.target.value);setSelected([])}}><option value="">All customers</option>{data.customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Status</span><select value={status} onChange={e=>{setStatus(e.target.value);setSelected([])}}><option value="unbilled">Unbilled</option><option value="draft">In draft</option><option value="billed">Billed / closed</option><option value="all">All entries</option></select></label></div>
  <div className="time-summary"><div><strong>{chosen.length} selected · {hours(chosen)} hours · {money(chosen.reduce((s:number,t:any)=>s+amount(t),0))}</strong><p>{hours(available)} unbilled hours available across all dates. Finalizing the invoice automatically closes its time entries.</p></div><button className="primary" disabled={!customer||!chosen.length||busy} onClick={()=>{open('invoices',{...emptyInvoice(),customerId:customer,lines:chosen.map(timeLine)});setSelected([])}}>Invoice selected entries</button></div>
  {!customer&&<p className="quiet">Select a customer, then check the time entries you want to invoice.</p>}
  {visible.length?<div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all unbilled entries" disabled={!customer||!available.length} checked={available.length>0&&chosen.length===available.length} onChange={e=>setSelected(e.target.checked?available.map((t:any)=>t.id):[])}/></th><th>Date / customer</th><th>Work performed</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Status / invoice</th><th>Actions</th></tr></thead><tbody>{visible.map((t:any)=><tr key={t.id} className={chosen.some((x:any)=>x.id===t.id)?'time-selected':''}><td>{!t.invoiceId&&<input type="checkbox" aria-label={`Select ${t.date}: ${t.description}`} disabled={!customer} checked={selected.includes(t.id)} onChange={()=>toggle(setSelected,t.id)}/>}</td><td>{t.date}{t.startTime&&<small className="block">{t.startTime}–{t.endTime}{t.nextDay?' (+1 day)':''}</small>}<small className="block">{data.customers.find((c:any)=>c.id===t.customerId)?.name}</small></td><td className="time-description">{t.description}<small className="block">{labels[t.kind]}</small></td><td>{t.hours}</td><td>{money(t.unitPrice)}</td><td>{money(amount(t))}</td><td><span className={'badge '+(state(t)==='billed'?'paid':state(t)==='draft'?'draft':'issued')}>{state(t)==='billed'?'Billed / closed':state(t)==='draft'?'In draft':'Unbilled'}</span>{t.invoiceId&&<button className="text-button block" onClick={()=>showInvoice(data.invoices.find((i:any)=>i.id===t.invoiceId))}>CTS-{String(t.invoiceId).padStart(6,'0')}</button>}</td><td>{!t.invoiceId&&<div className="button-row"><button className="text-button" disabled={busy} onClick={()=>open('time',t)}>Edit</button><button className="text-button" disabled={busy} onClick={()=>{if(confirm('Delete this unbilled time entry?'))run(async()=>{await api('time/'+t.id,{method:'DELETE',body:JSON.stringify({updated:t.updated})});await reload()},'Time entry deleted.')}}>Delete</button></div>}</td></tr>)}</tbody></table></div>:<div className="empty"><h3>No time entries for these filters</h3><p>Add time as you work, then select the entries when you’re ready to invoice.</p><button className="primary" onClick={()=>open('time')}>Add time entry</button></div>}
 </section>
}
export function TimePicker({data,value,onChange}:any){
 const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>setSelected([]),[value.customerId]);
 const available=data.timeEntries.filter((t:any)=>t.customerId===value.customerId&&(!t.invoiceId||t.invoiceId===value.id)&&!value.lines.some((l:any)=>l.timeEntryId===t.id)).sort((a:any,b:any)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const chosen=available.filter((t:any)=>selected.includes(t.id));
 return <section className="time-picker"><h3>Add unbilled time</h3><p className="quiet">Select entries from any date. They close automatically when you finalize the invoice. Time reserved by another draft is excluded.</p>
  {!value.customerId?<p>Select a customer above to see their unbilled entries.</p>:!available.length?<p>No additional unbilled entries for this customer.</p>:<>
   <label className="checkbox"><input type="checkbox" checked={chosen.length===available.length} onChange={e=>setSelected(e.target.checked?available.map((t:any)=>t.id):[])}/>Select all {available.length} unbilled entries</label>
   <div className="time-choice-list">{available.map((t:any)=><label key={t.id} className={'time-choice '+(selected.includes(t.id)?'time-selected':'')}><input type="checkbox" checked={selected.includes(t.id)} onChange={()=>toggle(setSelected,t.id)} aria-label={`Add ${t.date}: ${t.description}`}/><span><strong>{t.date} · {labels[t.kind]}</strong><span className="time-choice-description">{t.description}</span></span><span className="time-choice-amount"><strong>{money(amount(t))}</strong><small>{t.hours} hr × {money(t.unitPrice)}</small></span></label>)}</div>
   <div className="time-summary"><strong>{chosen.length} selected · {hours(chosen)} hours · {money(chosen.reduce((s:number,t:any)=>s+amount(t),0))}</strong><button type="button" className="secondary" disabled={!chosen.length} onClick={()=>{onChange([...value.lines,...chosen.map(timeLine)]);setSelected([])}}>Add selected entries</button></div>
  </>}
 </section>
}

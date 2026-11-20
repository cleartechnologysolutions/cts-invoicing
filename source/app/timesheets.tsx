'use client';
import React,{useState,useEffect,useMemo} from 'react';
import {timeDuration,inTimePeriod} from '../lib/billing-core';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const labels:any={regular:'Regular hours',helpdesk:'Helpdesk',afterhours:'After hours'};
const today=()=>new Date().toLocaleDateString('en-CA');
const amount=(t:any)=>Math.round(Math.round(t.hours*100)*t.unitPrice/100);
const duration=(m:number)=>`${Math.floor(m/60)}h ${m%60}m`;
export function TimeEntryForm({data,value,onChange}:any){
 const customer=data.customers.find((c:any)=>c.id===value.customerId),rate=customer?.[value.kind]??0;
 let timing:any=null,error='';
 try{if(value.startTime||value.endTime)timing=timeDuration(value.startTime,value.endTime,value.nextDay)}catch(e:any){error=e.message}
 const legacy=!!value.id&&!value.startTime&&!value.endTime;
 const hours=timing?.hours??(legacy?value.hours:0);
 useEffect(()=>{if(value.unitPrice!==rate)onChange({...value,unitPrice:rate})},[rate,value.unitPrice]);
 const change=(patch:any)=>onChange({...value,...patch});
 return <><div className="form-grid">
 <label className="field wide"><span>Customer *</span><select autoFocus required value={value.customerId} onChange={e=>change({customerId:e.target.value})}><option value="">Select a customer</option>{data.customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="field"><span>Work date *</span><input type="date" required value={value.date} onChange={e=>change({date:e.target.value})}/></label>
 <label className="field"><span>Category *</span><select value={value.kind} onChange={e=>change({kind:e.target.value})}>{Object.entries(labels).map(([k,label]:any)=><option key={k} value={k}>{label}</option>)}</select></label>
 <label className="field"><span>Start time · internal</span><input type="time" step="60" required={!legacy} value={value.startTime||''} onChange={e=>change({startTime:e.target.value})}/></label>
 <label className="field"><span>End time · internal</span><input type="time" step="60" required={!legacy} value={value.endTime||''} onChange={e=>change({endTime:e.target.value})}/></label>
 <label className="checkbox wide"><input type="checkbox" checked={!!value.nextDay} onChange={e=>change({nextDay:e.target.checked})}/>End time is the next day</label>
 <label className="field"><span>Billable hours · rounded up</span><input readOnly value={hours.toFixed(2)} aria-label="Calculated billable hours"/></label>
 <label className="field"><span>Hourly rate · customer setting</span><input readOnly value={money(rate)} aria-label="Customer hourly rate"/></label>
 <label className="field wide"><span>Work performed *</span><textarea required maxLength={450} rows={4} value={value.description} onChange={e=>change({description:e.target.value})} placeholder="Description shown on the invoice"/></label>
 </div>{error&&<p className="error" role="alert">{error}</p>}
 {legacy&&<p className="quiet">Older entry: keeping its {value.hours} recorded hours. Add both times to recalculate.</p>}
 <div className="time-summary"><div><strong>{timing?duration(timing.durationMinutes)+' actual · ':''}{hours.toFixed(2)} billable hours</strong><p>Rounded up per entry to 15 minutes. Clock times stay internal. Rate is saved from the customer’s current settings.</p></div><strong>{money(Math.round(hours*rate))}</strong></div></>;
}
function csvCell(v:any){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function Timesheets({data}:any){
 const [period,setPeriod]=useState('7'),[from,setFrom]=useState(today),[to,setTo]=useState(today),[customer,setCustomer]=useState(''),[status,setStatus]=useState('all'),[asOf,setAsOf]=useState(()=>new Date());
 const state=(t:any)=>!t.invoiceId?'Unbilled':data.invoices.find((i:any)=>i.id===t.invoiceId)?.status==='draft'?'In draft':'Billed / closed';
 const rows=useMemo(()=>data.timeEntries.filter((t:any)=>(!customer||t.customerId===customer)&&(status==='all'||state(t)===status)&&inTimePeriod(t,period,from,to,asOf)).sort((a:any,b:any)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||'')||a.id.localeCompare(b.id)),[data,customer,status,period,from,to,asOf]);
 const actual=rows.filter((t:any)=>t.durationMinutes!==undefined),missing=rows.length-actual.length;
 const totalHours=rows.reduce((s:number,t:any)=>s+Math.round(t.hours*100),0)/100,totalAmount=rows.reduce((s:number,t:any)=>s+amount(t),0);
 const refreshPeriod=(v:string)=>{setPeriod(v);setAsOf(new Date())};
 const title=period==='custom'?`${from} through ${to}`:`Last ${period==='48'?'48 hours':period+' days'} · through ${asOf.toLocaleString()}`;
 const exportCSV=()=>{const records=[['Customer','Work date','Start time','End time','Ends next day','Actual minutes','Billable hours','Category','Hourly rate USD','Amount USD','Status','Invoice','Description'],...rows.map((t:any)=>[data.customers.find((c:any)=>c.id===t.customerId)?.name,t.date,t.startTime||'',t.endTime||'',t.nextDay?'Yes':'No',t.durationMinutes??'',t.hours,labels[t.kind],(t.unitPrice/100).toFixed(2),(amount(t)/100).toFixed(2),state(t),t.invoiceId?'CTS-'+String(t.invoiceId).padStart(6,'0'):'',t.description])];const url=URL.createObjectURL(new Blob(['\ufeff'+records.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='timesheet-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const print=()=>{document.body.classList.add('printing-timesheet');const cleanup=()=>document.body.classList.remove('printing-timesheet');window.addEventListener('afterprint',cleanup,{once:true});window.print();cleanup()};
 return <section className="panel time-panel timesheet-report"><div className="report-controls">
 <div className="time-filters"><label className="field"><span>Time period</span><select value={period} onChange={e=>refreshPeriod(e.target.value)}><option value="48">Last 48 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom dates</option></select></label>
 {period==='custom'&&<><label className="field"><span>From (inclusive)</span><input type="date" required value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>Through (inclusive)</span><input type="date" required value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></>}
 <label className="field"><span>Customer</span><select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">All customers</option>{data.customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="field"><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}>{['all','Unbilled','In draft','Billed / closed'].map(x=><option key={x} value={x}>{x==='all'?'All statuses':x}</option>)}</select></label></div>
 <div className="button-row"><button className="secondary" onClick={()=>setAsOf(new Date())}>Update period</button><button className="secondary" disabled={!rows.length} onClick={exportCSV}>Download CSV</button><button className="secondary" disabled={!rows.length} onClick={print}>Print / PDF</button></div></div>
 <header className="report-title"><h2>Clear Technology Solutions · Timesheet</h2><p>{title}</p><p>{customer?data.customers.find((c:any)=>c.id===customer)?.name:'All customers'} · {status==='all'?'All statuses':status} · Internal report</p></header>
 {period==='custom'&&(!from||!to||from>to)&&<p role="alert">Choose a valid start and end date.</p>}
 <div className="report-totals"><div><span>Entries</span><strong>{rows.length}</strong></div><div><span>Actual time recorded</span><strong>{duration(actual.reduce((s:number,t:any)=>s+t.durationMinutes,0))}</strong></div><div><span>Billable hours</span><strong>{totalHours.toFixed(2)}</strong></div><div><span>Billable amount</span><strong>{money(totalAmount)}</strong></div></div>
 <p className="quiet report-note">Periods use work start time in your browser’s local timezone. Overnight entries belong to their start date. {missing>0?`${missing} older entries have no clock times; they are included by work date and excluded from actual-time totals.`:''}</p>
 {rows.length?<div className="table-wrap"><table><thead><tr><th>Work date / customer</th><th>Internal times</th><th>Work performed</th><th>Actual</th><th>Billable hours</th><th>Rate</th><th>Amount</th><th>Status / invoice</th></tr></thead><tbody>{rows.map((t:any)=><tr key={t.id}><td>{t.date}<small className="block">{data.customers.find((c:any)=>c.id===t.customerId)?.name}</small></td><td>{t.startTime?`${t.startTime}–${t.endTime}${t.nextDay?' (+1 day)':''}`:'Not recorded'}</td><td className="time-description">{t.description}<small className="block">{labels[t.kind]}</small></td><td>{t.durationMinutes!==undefined?duration(t.durationMinutes):'—'}</td><td>{t.hours.toFixed(2)}</td><td>{money(t.unitPrice)}</td><td>{money(amount(t))}</td><td>{state(t)}{t.invoiceId&&<small className="block">CTS-{String(t.invoiceId).padStart(6,'0')}</small>}</td></tr>)}</tbody></table></div>:<div className="empty"><h3>No entries in this period</h3><p>Change the date range or filters to include more work.</p></div>}
 </section>;
}

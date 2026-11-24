import {useState} from 'react';
import {Sparkles,X} from 'lucide-react';
import {api} from '../services/api';
export default function ContextAI({mode='suggestions',label='AI suggestions',question='',title='AI engineering insight',compact=false}){
 const [open,setOpen]=useState(false),[result,setResult]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(){setOpen(true);setBusy(true);setError('');try{const r=await api.post('/ai/workbench',{mode,question,style:'brief'});if(!r.data?.success)throw Error(r.data?.message||'No AI result');setResult(r.data.answer||'No insights available.')}catch(e){setError(e.response?.data?.message||e.message||'AI request failed')}finally{setBusy(false)}}
 return <div className={`context-ai ${compact?'compact':''}`}><button className="context-ai-trigger" onClick={()=>open?setOpen(false):run()} disabled={busy}><Sparkles size={15}/>{busy?'Analyzing…':label}</button>{open&&<section className="context-ai-result" aria-live="polite"><div className="context-ai-head"><strong>{title}</strong><button onClick={()=>setOpen(false)} aria-label="Close AI insight"><X size={16}/></button></div>{error?<p role="alert" className="error-box">{error}</p>:busy?<p className="upgrade-muted">Analyzing available evidence…</p>:<div className="upgrade-result">{result}</div>}{!busy&&<button className="ghost" onClick={run}>Regenerate</button>}</section>}</div>
}

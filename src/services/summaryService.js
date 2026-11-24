import {askDeepSeek} from './aiService.js';
export const summarySections={notes:['executiveSummary','keyTakeaways','actionItems','openQuestions'],reports:['reportOverview','achievements','risksAndGaps','crossCheck','recommendedNextSteps']};
export function parseStructuredSummary(text,kind){
 const fields=summarySections[kind];let data;
 try{const raw=String(text).replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');data=JSON.parse(raw)}catch{const start=String(text).indexOf('{'),end=String(text).lastIndexOf('}');if(start>=0&&end>start)try{data=JSON.parse(String(text).slice(start,end+1))}catch{}}
 if(!data||typeof data!=='object'||Array.isArray(data))data={};
 const result={};for(const key of fields){const value=data[key];result[key]=key==='actionItems'?Array.isArray(value)?value.filter(x=>x&&typeof x.title==='string').slice(0,20).map(x=>({title:x.title.slice(0,240),description:String(x.description||'').slice(0,3000),priority:['low','medium','high','critical'].includes(x.priority)?x.priority:'medium'})):[]:Array.isArray(value)?value.map(x=>String(x).slice(0,1500)).slice(0,30):typeof value==='string'?value.slice(0,8000):''}
 if(!Object.values(result).some(v=>Array.isArray(v)?v.length:!!v))result[fields[0]]=String(text).slice(0,10000);
 return result;
}
export async function structuredSummary(kind,context,style='brief'){
 const keys=summarySections[kind];const guidance=kind==='notes'?'Capture decisions, actionable tasks and unresolved risks.':'Compare claims to actual tasks and repository evidence; mark unverified claims clearly.';
 const answer=await askDeepSeek({question:`Summarize the supplied ${kind} based ONLY on provided context. ${guidance} Respond with STRICT valid JSON without markdown. Properties: ${keys.join(', ')}. All properties are strings or arrays of strings except actionItems, an array of objects {"title":"...","description":"...","priority":"medium"}. Use ${style==='detailed'?'detailed':'brief'} style. Missing info must be explicitly labeled unknown.`,context});
 return {sections:parseStructuredSummary(answer,kind),raw:answer};
}

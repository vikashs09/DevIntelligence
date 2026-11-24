// Git tree contains blob sizes but NOT per-file test coverage, complexity or churn.
// Explicitly use unknown for unavailable signals rather than fabricate measurements.
const testPattern=/(^|\/)(test|tests|__tests__|spec|specs)(\/|$)|\.(test|spec)\.[^/]+$/i;
const docPattern=/(^|\/)(docs?|documentation)(\/|$)|\.(md|mdx|rst|adoc)$/i;
const extLanguage={js:'JavaScript',jsx:'JavaScript',ts:'TypeScript',tsx:'TypeScript',py:'Python',java:'Java',go:'Go',rs:'Rust',c:'C',cpp:'C++',cs:'C#',rb:'Ruby',php:'PHP',vue:'Vue',css:'CSS',scss:'SCSS',html:'HTML',json:'JSON',md:'Markdown'};
export function analyzeFileMetadata(file,{testPaths=[],docPaths=[]}={}){
 const path=String(file.path||'');const bytes=Number.isFinite(file.size)?file.size:Number.isFinite(file.bytes)?file.bytes:null;
 const isTest=testPattern.test(path);const isDocumentation=docPattern.test(path);
 const ext=path.split('.').pop()?.toLowerCase();const folder=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
 const stem=path.replace(/\.[^.]+$/,'').split('/').pop()?.toLowerCase();
 const testCovered=testPaths.some(t=>t.toLowerCase().includes(stem)&&stem?.length>2);
 const docCovered=docPaths.some(d=>d.toLowerCase().includes(stem)&&stem?.length>2);
 const flags=[];let score=100;
 if(bytes!=null&&bytes>150000){score-=35;flags.push('very-large-file')}else if(bytes!=null&&bytes>60000){score-=20;flags.push('large-file')}
 if(!isTest&&!isDocumentation&&bytes>30000&&!testCovered){score-=12;flags.push('test-link-not-found')}
 if(!isTest&&!isDocumentation&&bytes>60000&&!docCovered){score-=8;flags.push('doc-link-not-found')}
 const commitCount=Number.isFinite(file.commitCount90d)?file.commitCount90d:null;
 if(commitCount!=null&&commitCount>25){score-=15;flags.push('high-churn')}
 const lastCommitAt=file.lastCommitAt?new Date(file.lastCommitAt):null;
 if(lastCommitAt&&!Number.isNaN(lastCommitAt.getTime())&&Date.now()-lastCommitAt.getTime()>180*86400000){score-=12;flags.push('stale-module')}
 return {path,bytes,sha:file.sha||null,folder,language:extLanguage[ext]||ext||'Unknown',isTest,isDocumentation,
 lastCommitAt,commitCount90d:commitCount,healthScore:Math.max(0,score),flags,
 assessment:{size:bytes===null?'unknown':bytes,complexity:'unknown',testCoverage:'unknown',documentationCompleteness:'unknown',testFileMatch:testCovered,documentationFileMatch:docCovered,churn:commitCount===null?'unknown':commitCount}};
}
export function summarizeFileHealth(files){const scored=files.filter(f=>Number.isFinite(f.healthScore));return {totalFiles:files.length,averageScore:scored.length?Math.round(scored.reduce((a,f)=>a+f.healthScore,0)/scored.length):null,flaggedFiles:files.filter(f=>f.flags?.length).length,criticalFiles:files.filter(f=>f.healthScore<60).length,unknownSignals:['test coverage','code complexity','per-file churn without commit history','documentation completeness']};}

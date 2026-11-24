export function graphInsights({nodes=[],edges=[]}){
 const degree=new Map(nodes.map(n=>[n.id,0]));for(const e of edges){degree.set(e.source,(degree.get(e.source)||0)+1);degree.set(e.target,(degree.get(e.target)||0)+1)}
 return {orphanNotes:nodes.filter(n=>n.type==='note'&&!degree.get(n.id)).map(n=>({id:n.id,label:n.label})),hubs:nodes.filter(n=>(degree.get(n.id)||0)>=3).sort((a,b)=>degree.get(b.id)-degree.get(a.id)).slice(0,10).map(n=>({id:n.id,label:n.label,connections:degree.get(n.id)})),riskClusters:nodes.filter(n=>n.type==='risk').slice(0,30).map(n=>({id:n.id,label:n.label,related:edges.filter(e=>e.source===n.id||e.target===n.id).map(e=>e.source===n.id?e.target:e.source)})),totalNodes:nodes.length,totalEdges:edges.length};
}

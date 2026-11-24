import AuditLog from "../models/AuditLog.js";
import Project from "../models/Project.js";
export const AI_SCOPES=["ai:read_files","ai:read_reports","ai:read_github","ai:read_notes","ai:write_notes"];
const get=(map,key)=>map instanceof Map?map.get(key):map?.[key];
export async function checkScopes(req,scopes,projectId=null){
 const team=req.user.team;const project=projectId?await Project.findOne({_id:projectId,team:team?._id}).select("aiPermissions"):null;
 if(projectId&&!project)return {ok:false,message:"Project not found in workspace"};
 const denied=scopes.filter(s=>!AI_SCOPES.includes(s)||get(team?.settings?.aiPermissions,s)===false||get(req.user.preferences?.aiPermissions,s)===false||get(project?.aiPermissions,s)===false);
 const ok=!!team&&team.settings?.aiEnabled!==false&&!denied.length;
 await AuditLog.create({team:team?._id,actor:req.user._id,action:ok?"ai.access":"ai.blocked",resourceType:"ai",resourceId:String(projectId||""),summary:ok?`AI access: ${scopes.join(", ")}`:`AI denied: ${denied.join(", ")||"workspace disabled"}`,metadata:{scopes,denied},requestId:req.requestId});
 return {ok,message:denied.length?`AI permission denied: ${denied.join(", ")}`:"AI is disabled for this workspace"};
}
export const requireScopes=(...scopes)=>async(req,res,next)=>{try{const result=await checkScopes(req,scopes,req.body?.projectId||req.query?.projectId);if(!result.ok)return res.status(403).json({success:false,message:result.message});next()}catch(e){next(e)}};

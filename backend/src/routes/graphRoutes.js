import express from 'express';
import {auth} from '../middleware/auth.js';
import {requirePermission} from '../middleware/permissions.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Note from '../models/Note.js';
import Report from '../models/Report.js';
import Repository from '../models/Repository.js';
import FileMetric from '../models/FileMetric.js';
const router=express.Router();router.use(auth,requirePermission('analytics.view'));
router.get('/',async(req,res,next)=>{try{
 const team=req.user.team?._id;
 const [projects,tasks,notes,reports,repos,files,members]=await Promise.all([
 Project.find({team}).limit(100).lean(),Task.find({team}).limit(400).lean(),
 Note.find({team}).limit(400).lean(),Report.find({team}).limit(200).lean(),
 Repository.find({team}).limit(150).lean(),FileMetric.find({team}).sort({healthScore:1}).limit(700).lean(),
 User.find({team}).select('name role').limit(150).lean()]);
 const nodes=[],edges=[];
 const add=(type,obj,label,extra={})=>nodes.push({id:`${type}:${obj._id}`,type,label:String(label||'Untitled').slice(0,120),entityId:String(obj._id),projectId:String(obj.projectId||obj.project||''),...extra});
 const edge=(source,target,type)=>{if(source&&target)edges.push({id:`${source}->${target}:${type}`,source,target,type})};
 projects.forEach(x=>add('project',x,x.name,{status:x.status}));
 members.forEach(x=>add('member',x,x.name,{status:x.role}));
 tasks.forEach(x=>{add('task',x,x.title,{status:x.status,priority:x.priority});edge(x.project&&`project:${x.project}`,`task:${x._id}`,'contains');edge(x.assignee&&`member:${x.assignee}`,`task:${x._id}`,'tracks');(x.blockedBy||[]).forEach(t=>edge(`task:${t}`,`task:${x._id}`,'blocks'));
 if(['high','critical'].includes(x.priority)&&x.status!=='done'){
 const id=`risk:task-${x._id}`;nodes.push({id,type:'risk',label:`${x.priority} priority: ${x.title}`.slice(0,120),entityId:String(x._id),projectId:String(x.project||''),status:'open',severity:x.priority});edge(id,`task:${x._id}`,'risks')}
 });
 notes.forEach(x=>{add('note',x,x.title,{category:x.category,content:x.content?.slice(0,3000)});edge(x.projectId&&`project:${x.projectId}`,`note:${x._id}`,'documents');(x.linkedTaskIds||[]).forEach(t=>edge(`note:${x._id}`,`task:${t}`,'links_to'));(x.linkedNoteIds||[]).forEach(n=>edge(`note:${x._id}`,`note:${n}`,'links_to'));(x.linkedReportIds||[]).forEach(n=>edge(`note:${x._id}`,`report:${n}`,'summarizes'));
 (x.linkedFilePaths||[]).forEach(p=>files.filter(f=>f.path===p).forEach(f=>edge(`note:${x._id}`,`file:${f._id}`,'documents')));
 (x.linkedGithubRefs||[]).forEach(ref=>repos.filter(r=>r.fullName===ref||r.url===ref).forEach(r=>edge(`note:${x._id}`,`github:${r._id}`,'links_to')))
 });
 reports.forEach(x=>{add('report',x,x.title,{format:x.format});edge(x.projectId&&`project:${x.projectId}`,`report:${x._id}`,'documents')});
 repos.forEach(x=>{add('github',x,x.fullName,{status:x.lastSynced?'synced':'pending',url:x.url});edge(x.project&&`project:${x.project}`,`github:${x._id}`,'tracks')});
 files.forEach(x=>{add('file',x,x.path,{status:x.healthScore<60?'at-risk':x.healthScore<80?'attention':'healthy',healthScore:x.healthScore,flags:x.flags,path:x.path,repositoryId:String(x.repository)});edge(`github:${x.repository}`,`file:${x._id}`,'contains');if(x.project)edge(`project:${x.project}`,`file:${x._id}`,'tracks');if(x.healthScore<60){const id=`risk:file-${x._id}`;nodes.push({id,type:'risk',label:`File risk: ${x.path}`.slice(0,120),entityId:String(x._id),projectId:String(x.project||''),status:'open'});edge(id,`file:${x._id}`,'risks')}});
 const ids=new Set(nodes.map(n=>n.id));const validEdges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
 const projectId=String(req.query.projectId||'');const type=String(req.query.type||'');const search=String(req.query.search||'').toLowerCase().slice(0,120);
 const visible=nodes.filter(n=>(!projectId||n.projectId===projectId||n.type==='project'&&n.entityId===projectId)&&(!type||n.type===type)&&(!search||n.label.toLowerCase().includes(search)));
 const visibleIds=new Set(visible.map(n=>n.id));
 res.json({success:true,nodes:visible,edges:validEdges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target)),projects:projects.map(p=>({id:String(p._id),name:p.name}))});
}catch(e){next(e)}});
export default router;

import express from "express";
import { askDeepSeek } from "../services/aiService.js";
import { auth } from "../middleware/auth.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Repository from "../models/Repository.js";
import { requirePermission } from "../middleware/permissions.js";
import { checkScopes,requireScopes } from "../middleware/aiScopes.js";
import FileMetric from "../models/FileMetric.js";
import {structuredSummary} from "../services/summaryService.js";
import {summarizeFileHealth} from "../services/fileHealthService.js";
import {graphInsights} from "../services/graphInsightsService.js";
import {requirePermission as allow} from "../middleware/permissions.js";
import Note from "../models/Note.js";import Report from "../models/Report.js";import GitHubEvent from "../models/GitHubEvent.js";import mongoose from "mongoose";

const router = express.Router();
router.use(auth, requirePermission("ai.use"));

router.post("/chat", async (req, res) => {
  try {
    const question = typeof req.body.question === "string" ? req.body.question.trim().slice(0, 4000) : "";
    const conversation = Array.isArray(req.body.conversation) ? req.body.conversation.slice(-8) : [];
    if (!question) return res.status(400).json({ success: false, message: "Question is required." });
    const team = req.user.team?._id;
    if (!team) return res.status(403).json({ success: false, message: "Workspace membership required." });
    if (req.user.team.settings?.aiEnabled === false) return res.status(403).json({ success: false, message: "AI is disabled for this workspace." });

    // The browser-supplied context is intentionally not trusted. Build context from authorized workspace data.
    const githubAccess = await checkScopes(req,["ai:read_github"]);
    const [tasks, projects, repositoriesRaw] = await Promise.all([
      Task.find({ team }).sort({ updatedAt: -1 }).limit(100)
        .populate("assignee", "name").populate("project", "name").lean(),
      Project.find({ team }).sort({ updatedAt: -1 }).limit(30).lean(),
      githubAccess.ok ? Repository.find({ team }).sort({ lastSynced: -1 }).limit(30).lean() : Promise.resolve([])
    ]);

    const repositories = githubAccess.ok ? repositoriesRaw : [];
    const context = {
      workspace: { name: req.user.team.name, teamId: req.user.team.teamId },
      generatedAt: new Date().toISOString(),
      tasks: tasks.map((t) => ({
        id: String(t._id), key: t.taskKey, title: t.title, status: t.status, priority: t.priority,
        dueDate: t.dueDate, assignee: t.assignee?.name || null, project: t.project?.name || null,
        github: { repository: t.github?.repositoryFullName, branch: t.github?.branch,
          pullRequests: (t.github?.pullRequests || []).map((p) => ({ number: p.number, title: p.title, state: p.state, url: p.url })),
          checks: t.github?.checks || [] }
      })),
      projects: projects.map((p) => ({ id: String(p._id), name: p.name, status: p.status, description: p.description })),
      repositories: repositories.map((r) => ({ id: String(r._id), fullName: r.fullName, url: r.url,
        language: r.language, openIssues: r.openIssues, openPullRequests: r.openPullRequests,
        mergedPullRequests: r.mergedPullRequests, recentCommits30d: r.recentCommits30d, lastSynced: r.lastSynced }))
    };
    const sources = [
      ...tasks.slice(0, 40).map((t) => ({ type: "task", id: String(t._id), label: `${t.taskKey || "Task"} · ${t.title}`, url: `/tasks?task=${t._id}` })),
      ...repositories.map((r) => ({ type: "repository", id: String(r._id), label: r.fullName, url: r.url }))
    ];
    const answer = await askDeepSeek({ question, context, conversation });
    res.json({ success: true, answer, sources, generatedAt: context.generatedAt, contextScope: "current-workspace" });
  } catch (error) {
    console.error("AI Route Error:", error.message);
    if (error?.status === 402 || error?.message?.toLowerCase().includes("insufficient")) {
      return res.status(402).json({ success: false, code: "AI_INSUFFICIENT_BALANCE", message: "AI service balance is insufficient. Configure an available model or add credits." });
    }
    if (error?.status === 429) return res.status(429).json({ success: false, code: "AI_RATE_LIMIT", message: "AI rate limit reached. Please try again later." });
    if (error?.message?.toLowerCase().includes("openrouter_api_key")) return res.status(503).json({ success: false, code: "AI_API_KEY_MISSING", message: "Configure OPENROUTER_API_KEY in backend/.env." });
    res.status(500).json({ success: false, code: "AI_REQUEST_FAILED", message: "AI request failed." });
  }
});


const scopes={"file-health":["ai:read_files","ai:read_github"],"suggestions":[],"github-audit":["ai:read_github"],"report-audit":["ai:read_reports","ai:read_github"],"notes-summary":["ai:read_notes"],"report-summary":["ai:read_reports"],"graph-insights":[]};
router.post("/workbench",async(req,res)=>{try{
 const mode=String(req.body.mode||"");if(!Object.hasOwn(scopes,mode))return res.status(400).json({message:"Unknown AI mode"});
 const team=req.user.team?._id;const ids=Array.isArray(req.body.ids)?req.body.ids.filter(mongoose.isValidObjectId).slice(0,30):[];
 if(req.body.projectId&&!mongoose.isValidObjectId(req.body.projectId))return res.status(400).json({message:"Invalid project"});
 const required=[...scopes[mode]];if(mode==="graph-insights")required.push("ai:read_notes","ai:read_reports","ai:read_files","ai:read_github");
 const allowed=await checkScopes(req,required,req.body.projectId);if(!allowed.ok)return res.status(403).json({message:allowed.message});
 const [tasks,projects,notes,reports,repos,events]=await Promise.all([
 Task.find({team,...(req.body.projectId?{project:req.body.projectId}:{})}).select("title status priority blockedBy github createdAt updatedAt").limit(100).lean(),
 Project.find({team}).select("name status description").limit(40).lean(),
 required.includes("ai:read_notes")?Note.find({team,...(ids.length?{_id:{$in:ids}}:{})}).select("title content category tags linkedTaskIds linkedFilePaths").limit(40).lean():[],
 required.includes("ai:read_reports")?Report.find({team,...(ids.length?{_id:{$in:ids}}:{})}).select("title content format projectId").limit(15).lean():[],
 required.includes("ai:read_github")?Repository.find({team}).select("fullName recentCommits30d openIssues openPullRequests lastSynced").limit(50).lean():[],
 required.includes("ai:read_github")?GitHubEvent.find({team}).select("eventType action repositoryFullName receivedAt status").sort({receivedAt:-1}).limit(80).lean():[]
 ]);
 const fileRows=required.includes("ai:read_files")?await FileMetric.find({team,...(req.body.projectId?{project:req.body.projectId}:{})}).select("path bytes language healthScore flags assessment repository").sort({healthScore:1}).limit(150).lean():[];
 const context={fileHealth:summarizeFileHealth(fileRows),files:fileRows,graph:mode==='graph-insights'?graphInsights({nodes:[...notes.map(n=>({id:`note:${n._id}`,type:'note',label:n.title})),...fileRows.map(f=>({id:`file:${f._id}`,type:'file',label:f.path})),...tasks.map(t=>({id:`task:${t._id}`,type:'task',label:t.title}))],edges:[...notes.flatMap(n=>(n.linkedTaskIds||[]).map(id=>({source:`note:${n._id}`,target:`task:${id}`}))),...tasks.flatMap(t=>(t.blockedBy||[]).map(id=>({source:`task:${id}`,target:`task:${t._id}`})))]}):undefined,tasks,projects,notes:notes.map(n=>({...n,content:n.content?.slice(0,12000)})),reports:reports.map(r=>({...r,content:r.content?.slice(0,20000)})),repositories:repos,events};
 const instructions={"file-health":"Evaluate measured file sizes and heuristic health scores. Clearly mark churn, complexity and coverage unknown unless explicitly provided. Provide a file health breakdown and concrete prioritized refactoring plan.","suggestions":"Propose prioritized actionable engineering improvements tied to actual task and project evidence.","github-audit":"Audit actual repository and event activity. Identify bottlenecks and evidence-backed follow-ups.","report-audit":"Cross-check report claims against tasks and GitHub evidence. Explicitly label unverifiable claims.","notes-summary":"Return sections: Executive Summary / TL;DR; Key Takeaways & Decisions; Action Items; Open Questions / Risks.","report-summary":"Return sections: Report Overview; Key Achievements / Milestones; Identified Risks & Gaps; Cross-Check Against Repo/Tasks; Recommended Next Steps.","graph-insights":"Identify disconnected knowledge, high-dependency tasks and risk clusters from supplied data; distinguish missing graph edges from evidence of no relationship."};
 const answer=await askDeepSeek({question:`${instructions[mode]} Summary style: ${req.body.style==="detailed"?"detailed":"brief"}. Additional request: ${String(req.body.question||"").slice(0,1500)}`,context});
 res.json({success:true,mode,answer,generatedAt:new Date().toISOString()});
 }catch(e){console.error("Workbench:",e);res.status(500).json({success:false,message:e.message?.includes("OPENROUTER_API_KEY")?"Configure OPENROUTER_API_KEY in backend/.env":"AI request failed"})}});


router.post('/summarize',async(req,res,next)=>{try{
 const kind=req.body.kind==='notes'?'notes':req.body.kind==='reports'?'reports':null;
 if(!kind)return res.status(400).json({message:'kind must be notes or reports'});
 const ids=Array.isArray(req.body.ids)?[...new Set(req.body.ids.filter(mongoose.isValidObjectId))].slice(0,30):[];
 if(!ids.length)return res.status(400).json({message:'Select at least one note or report'});
 const projectId=req.body.projectId||null;
 if(projectId&&!mongoose.isValidObjectId(projectId))return res.status(400).json({message:'Invalid project'});
 const read=kind==='notes'?'ai:read_notes':'ai:read_reports';
 const scopes=kind==='reports'?['ai:read_reports','ai:read_github']:['ai:read_notes'];
 const access=await checkScopes(req,scopes,projectId);if(!access.ok)return res.status(403).json({message:access.message});
 const team=req.user.team?._id;
 const Model=kind==='notes'?Note:Report;
 const docs=await Model.find({team,_id:{$in:ids},...(projectId?{projectId}:{})}).select('title content category projectId createdAt').lean();
 if(docs.length!==ids.length)return res.status(404).json({message:'One or more documents were not found in this workspace/project'});
 const projectIds=[...new Set(docs.map(x=>String(x.projectId||'')).filter(Boolean))].filter(mongoose.isValidObjectId);
 const tasks=kind==='reports'?await Task.find({team,...(projectIds.length?{project:{$in:projectIds}}:{})}).select('title status priority project github updatedAt').limit(120).lean():[];
 const repositories=kind==='reports'?await Repository.find({team,...(projectIds.length?{project:{$in:projectIds}}:{})}).select('fullName openIssues openPullRequests mergedPullRequests recentCommits30d lastSynced').limit(30).lean():[];
 const data=await structuredSummary(kind,{documents:docs.map(d=>({...d,content:d.content.slice(0,25000)})),tasks,repositories},req.body.style);
 res.json({success:true,kind,style:req.body.style==='detailed'?'detailed':'brief',...data});
}catch(e){next(e)}});
router.post('/save-insight',allow('task.create'),async(req,res,next)=>{try{
 const title=String(req.body.title||'').trim().slice(0,240);
 const content=String(req.body.content||'').trim().slice(0,100000);
 if(!title||!content)return res.status(400).json({message:'Title and AI insight required'});
 const projectId=req.body.projectId||null;
 if(projectId&&(!mongoose.isValidObjectId(projectId)||!await Project.exists({_id:projectId,team:req.user.team?._id})))return res.status(400).json({message:'Invalid project'});
 const access=await checkScopes(req,['ai:write_notes'],projectId);if(!access.ok)return res.status(403).json({message:access.message});
 const note=await Note.create({team:req.user.team?._id,projectId:projectId||undefined,title,content,category:['architecture','meeting','bug','report-review','idea','general'].includes(req.body.category)?req.body.category:'idea',tags:['ai-insight'],createdBy:req.user._id,updatedBy:req.user._id});
 res.status(201).json({success:true,note});
}catch(e){next(e)}});
router.post('/action-task',allow('task.create'),async(req,res,next)=>{try{
 const title=String(req.body.title||'').trim();if(!title||title.length>240)return res.status(400).json({message:'Task title must be 1–240 characters'});
 const projectId=req.body.projectId||null;
 if(projectId&&(!mongoose.isValidObjectId(projectId)||!await Project.exists({_id:projectId,team:req.user.team?._id})))return res.status(400).json({message:'Invalid project'});
 let note=null;if(req.body.noteId){if(!mongoose.isValidObjectId(req.body.noteId))return res.status(400).json({message:'Invalid note'});note=await Note.findOne({_id:req.body.noteId,team:req.user.team?._id});if(!note)return res.status(404).json({message:'Note not found'});const access=await checkScopes(req,['ai:write_notes'],note.projectId);if(!access.ok)return res.status(403).json({message:access.message})}
 const task=await Task.create({team:req.user.team?._id,project:projectId||note?.projectId||undefined,title,description:String(req.body.description||'').slice(0,10000),priority:['low','medium','high','critical'].includes(req.body.priority)?req.body.priority:'medium',createdBy:req.user._id});
 if(note){note.linkedTaskIds.addToSet(task._id);note.updatedBy=req.user._id;await note.save()}
 res.status(201).json({success:true,task});
}catch(e){next(e)}});

export default router;

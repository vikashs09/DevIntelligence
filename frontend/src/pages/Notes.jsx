import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderPlus, Folder, FileText, Pin, Search, Plus, Trash2, Pencil, Sparkles, Save, ListFilter, ChevronRight, FolderOpen, X } from "lucide-react";
import { api } from "../services/api";
import StructuredSummary from "../components/StructuredSummary";

const categories = ["general", "architecture", "meeting", "bug", "report-review", "idea"];
const colors = ["blue", "violet", "teal", "rose", "slate"];
const blankNote = (folderId = "") => ({ _new: true, title: "", content: "", category: "general", tags: [], isPinned: false, projectId: "", folderId, linkedTaskIds: [], linkedNoteIds: [], linkedReportIds: [], linkedFilePaths: [], linkedGithubRefs: [] });
const id = (value) => String(value?._id || value || "");

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [folder, setFolder] = useState("all");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [style, setStyle] = useState("brief");
  const [folderModal, setFolderModal] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("blue");
  const [preview, setPreview] = useState(false);

  const refresh = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true);
      const [nr, fr, pr] = await Promise.all([api.get("/notes"), api.get("/notes/folders"), api.get("/projects")]);
      setNotes(nr.data.notes || []);
      setFolders(fr.data.folders || []);
      setProjects(pr.data.projects || pr.data.data || []);
      setError("");
    } catch (e) { setError(e.response?.data?.message || "Unable to load the notes workspace."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(true); }, [refresh]);

  const visible = useMemo(() => notes.filter(n => {
    const folderMatch = folder === "all" || (folder === "unfiled" ? !n.folderId : id(n.folderId) === folder);
    const categoryMatch = !category || n.category === category;
    const match = `${n.title} ${n.content} ${(n.tags || []).join(" ")}`.toLowerCase().includes(search.toLowerCase());
    return folderMatch && categoryMatch && match;
  }), [notes, folder, category, search]);
  const folderLabel = folder === "all" ? "All notes" : folder === "unfiled" ? "Unfiled" : folders.find(f => f._id === folder)?.name || "Folder";
  const startNote = () => { setSelected(blankNote(folder === "all" || folder === "unfiled" ? "" : folder)); setPreview(false); setSummary(null); };
  const openNote = (n) => { setSelected({ ...n, projectId: id(n.projectId), folderId: id(n.folderId) }); setSummary(null); setPreview(false); };

  async function save() {
    if (!selected?.title?.trim()) { setError("Give your note a title before saving."); return; }
    try {
      setBusy(true); setError("");
      const fields = ["title", "content", "category", "tags", "isPinned", "projectId", "folderId", "linkedTaskIds", "linkedNoteIds", "linkedReportIds", "linkedFilePaths", "linkedGithubRefs"];
      const data = Object.fromEntries(fields.map(k => [k, selected[k]]));
      if (!data.projectId) delete data.projectId;
      data.folderId = data.folderId || null;
      const r = selected._new ? await api.post("/notes", data) : await api.patch(`/notes/${selected._id}`, data);
      setSelected({ ...r.data.note, projectId: id(r.data.note.projectId), folderId: id(r.data.note.folderId) });
      await refresh();
    } catch (e) { setError(e.response?.data?.message || "Could not save the note."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!selected?._id || !window.confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    try { setBusy(true); await api.delete(`/notes/${selected._id}`); setSelected(null); setSummary(null); await refresh(); }
    catch (e) { setError(e.response?.data?.message || "Could not delete note."); }
    finally { setBusy(false); }
  }
  async function createTask() {
    if (!selected?._id) return;
    try { setBusy(true); const r = await api.post(`/notes/${selected._id}/task`, { title: selected.title }); setError(""); window.alert(`Task created: ${r.data.task.title}`); await refresh(); }
    catch (e) { setError(e.response?.data?.message || "Unable to create task."); }
    finally { setBusy(false); }
  }
  async function summarize(ids) {
    try { setBusy(true); setSummary(null); setError(""); const r = await api.post("/ai/summarize", { kind: "notes", ids, style }); setSummary(r.data.sections); }
    catch (e) { setError(e.response?.data?.message || "AI summarization failed."); }
    finally { setBusy(false); }
  }
  const openFolderForm = (f = null) => { setFolderModal(f || "new"); setFolderName(f?.name || ""); setFolderColor(f?.color || "blue"); };
  async function saveFolder(e) {
    e.preventDefault();
    if (!folderName.trim()) return;
    try { setBusy(true); setError(""); const payload = { name: folderName.trim(), color: folderColor };
      const r = folderModal === "new" ? await api.post("/notes/folders", payload) : await api.patch(`/notes/folders/${folderModal._id}`, payload);
      if (folderModal === "new") setFolder(r.data.folder._id);
      setFolderModal(null); await refresh();
    } catch (e) { setError(e.response?.data?.message || "Unable to save folder."); }
    finally { setBusy(false); }
  }
  async function removeFolder() {
    if (folderModal === "new" || !window.confirm(`Delete “${folderModal.name}”? Notes will be moved to Unfiled.`)) return;
    try { setBusy(true); await api.delete(`/notes/folders/${folderModal._id}`); if (folder === folderModal._id) setFolder("unfiled"); if (selected?.folderId === folderModal._id) setSelected(s => s && ({ ...s, folderId: "" })); setFolderModal(null); await refresh(); }
    catch (e) { setError(e.response?.data?.message || "Unable to delete folder."); }
    finally { setBusy(false); }
  }
  async function moveNote(note, folderId) {
    try { setError(""); const r = await api.patch(`/notes/${note._id}`, { folderId: folderId || null }); if (selected?._id === note._id) setSelected(s => ({ ...s, folderId: id(r.data.note.folderId) })); await refresh(); }
    catch (e) { setError(e.response?.data?.message || "Unable to move note."); }
  }
  const update = (key, value) => setSelected(s => ({ ...s, [key]: value }));
  const changeLinks = (key, value) => update(key, value.split(",").map(v => v.trim()).filter(Boolean));

  return <div className="page notes-page">
    <div className="page-title notes-page-title"><div><span className="eyebrow">YOUR ENGINEERING KNOWLEDGE</span><h1>Notes workspace</h1><p>Organize ideas in folders, capture decisions and turn notes into action.</p></div><div className="notes-title-actions"><button className="notes-quiet-btn" onClick={() => openFolderForm()}><FolderPlus size={17} /> New folder</button><button className="primary small" onClick={startNote}><Plus size={17} /> New note</button></div></div>
    {error && <div className="notes-alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}
    <div className="notes-shell">
      <aside className="notes-folders" aria-label="Note folders">
        <div className="notes-side-heading"><span>LIBRARY</span><button aria-label="Add folder" title="Create folder" onClick={() => openFolderForm()}><FolderPlus size={17}/></button></div>
        <button className={`notes-folder ${folder === "all" ? "active" : ""}`} onClick={() => setFolder("all")}><FileText size={17}/><span>All notes</span><small>{notes.length}</small></button>
        <button className={`notes-folder ${folder === "unfiled" ? "active" : ""}`} onClick={() => setFolder("unfiled")}><FolderOpen size={17}/><span>Unfiled</span><small>{notes.filter(n => !n.folderId).length}</small></button>
        <div className="notes-side-heading notes-folder-subhead"><span>FOLDERS</span><button aria-label="Add folder" title="Create folder" onClick={() => openFolderForm()}><Plus size={16}/></button></div>
        {folders.map(f => <div className={`notes-folder-row ${folder === f._id ? "active" : ""}`} key={f._id}><button className="notes-folder" onClick={() => setFolder(f._id)}><Folder size={17} className={`folder-${f.color}`}/><span title={f.name}>{f.name}</span><small>{f.noteCount}</small></button><button className="notes-folder-edit" title={`Edit ${f.name}`} aria-label={`Edit ${f.name}`} onClick={() => openFolderForm(f)}><Pencil size={13}/></button></div>)}
        {!folders.length && <p className="notes-side-tip">Create folders to keep projects, research and meeting notes separate.</p>}
      </aside>
      <section className="notes-browser" aria-label="Notes list">
        <div className="notes-browser-title"><div><h2>{folderLabel}</h2><span>{visible.length} note{visible.length === 1 ? "" : "s"}</span></div><button title="Create note" aria-label="Create note" onClick={startNote}><Plus size={19}/></button></div>
        <label className="notes-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes and tags" /></label>
        <div className="notes-filter"><ListFilter size={15}/><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="notes-items">{loading ? <div className="notes-empty">Loading your notes…</div> : visible.length ? visible.map(n => <div key={n._id} className={`notes-item ${selected?._id === n._id ? "active" : ""}`}><button className="notes-item-main" onClick={() => openNote(n)}><span className="notes-item-heading">{n.isPinned && <Pin size={13} fill="currentColor"/>}<strong>{n.title}</strong></span><span className="notes-item-excerpt">{n.content?.replace(/[#*_`\n]/g, " ").trim() || "Empty note"}</span><span className="notes-item-meta"><span>{n.category}</span><span>{new Date(n.updatedAt).toLocaleDateString()}</span></span></button><select className="notes-move-select" title="Move note to folder" aria-label={`Move ${n.title} to folder`} value={id(n.folderId)} onChange={e => moveNote(n, e.target.value)}><option value="">Unfiled</option>{folders.map(f => <option value={f._id} key={f._id}>{f.name}</option>)}</select></div>) : <div className="notes-empty"><FileText size={27}/><strong>No notes found</strong><p>Try another filter or add a note here.</p><button className="notes-quiet-btn" onClick={startNote}><Plus size={15}/> Create note</button></div>}</div>
        <div className="notes-browser-footer"><select aria-label="AI summary detail" value={style} onChange={e => setStyle(e.target.value)}><option value="brief">Brief summary</option><option value="detailed">Detailed summary</option></select><button disabled={busy || !visible.length} onClick={() => summarize(visible.map(n => n._id))}><Sparkles size={15}/> Summarize</button></div>
      </section>
      <section className="notes-editor" aria-label="Note editor">
        {selected ? <><div className="notes-editor-top"><div className="notes-breadcrumb"><span>{folders.find(f => f._id === selected.folderId)?.name || "Unfiled"}</span><ChevronRight size={14}/><span>{selected._new ? "New note" : "Edit note"}</span></div><div className="notes-editor-actions"><button className={preview ? "active" : ""} onClick={() => setPreview(p => !p)} title="Toggle reading view">{preview ? "Edit" : "Read"}</button><button disabled={busy || !selected.title?.trim()} className="primary small" onClick={save}><Save size={15}/> Save</button></div></div>
          {preview ? <div className="notes-preview"><h2>{selected.title || "Untitled"}</h2><pre>{selected.content || "No content yet."}</pre></div> : <div className="notes-edit-fields"><input className="notes-title-input" maxLength={240} placeholder="Untitled note" value={selected.title} onChange={e => update("title", e.target.value)}/><div className="notes-meta-fields"><select aria-label="Category" value={selected.category} onChange={e => update("category", e.target.value)}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select><select aria-label="Folder" value={selected.folderId || ""} onChange={e => update("folderId", e.target.value)}><option value="">Unfiled</option>{folders.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select><select aria-label="Project" value={selected.projectId || ""} onChange={e => update("projectId", e.target.value)}><option value="">No project</option>{projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select><label className="notes-pin"><input type="checkbox" checked={!!selected.isPinned} onChange={e => update("isPinned", e.target.checked)}/><Pin size={14}/> Pin</label></div><input className="notes-tags" placeholder="Add tags separated by commas" value={(selected.tags || []).join(", ")} onChange={e => changeLinks("tags", e.target.value)}/><textarea className="notes-content" placeholder="Start writing…\n\nCapture meeting notes, architecture decisions, code snippets or ideas." value={selected.content} onChange={e => update("content", e.target.value)}/><details className="notes-links"><summary>Advanced links to tasks, files, reports and GitHub</summary><div className="notes-links-grid">{[["linkedTaskIds", "Task IDs"], ["linkedNoteIds", "Note IDs"], ["linkedReportIds", "Report IDs"], ["linkedFilePaths", "File paths"], ["linkedGithubRefs", "GitHub refs"]].map(([key, label]) => <label key={key}>{label}<input value={(selected[key] || []).join(", ")} onChange={e => changeLinks(key, e.target.value)} placeholder="Comma-separated" /></label>)}</div></details></div>}
          <div className="notes-editor-footer">{!selected._new && <><button disabled={busy} onClick={() => summarize([selected._id])}><Sparkles size={15}/> AI summarize</button><button disabled={busy} onClick={createTask}>Create task</button><button disabled={busy} className="notes-delete" onClick={remove}><Trash2 size={15}/> Delete</button></>}<span>{selected.content?.length || 0} characters</span></div>
        </> : <div className="notes-editor-empty"><div className="notes-empty-art"><FileText size={32}/></div><h2>Your ideas, organized</h2><p>Select a note or create a new one. Keep work organized with folders and use AI to turn notes into next steps.</p><button className="primary small" onClick={startNote}><Plus size={16}/> Write a note</button></div>}
        {summary && <div className="notes-summary"><div className="notes-summary-head"><h3><Sparkles size={18}/> AI summary</h3><button onClick={() => setSummary(null)} aria-label="Close summary"><X size={17}/></button></div><StructuredSummary sections={summary} noteId={selected?._new ? "" : selected?._id} projectId={selected?.projectId || ""}/></div>}
      </section>
    </div>
    {folderModal && <div className="notes-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setFolderModal(null); }}><form className="notes-folder-dialog" onSubmit={saveFolder} role="dialog" aria-modal="true" aria-label={folderModal === "new" ? "New folder" : "Edit folder"}><div className="notes-modal-title"><h2>{folderModal === "new" ? "Create a folder" : "Edit folder"}</h2><button type="button" onClick={() => setFolderModal(null)} aria-label="Close"><X size={18}/></button></div><p>Group related notes so they're easier to find.</p><label>Folder name<input autoFocus maxLength={80} required value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="e.g. Architecture decisions"/></label><div className="notes-folder-colors" role="group" aria-label="Folder color">{colors.map(c => <button type="button" key={c} className={`notes-color folder-bg-${c} ${folderColor === c ? "chosen" : ""}`} aria-label={`${c} folder color`} aria-pressed={folderColor === c} onClick={() => setFolderColor(c)}/>)}</div><div className="notes-modal-actions">{folderModal !== "new" && <button type="button" className="notes-delete" disabled={busy} onClick={removeFolder}><Trash2 size={15}/> Delete folder</button>}<button type="button" onClick={() => setFolderModal(null)}>Cancel</button><button className="primary small" disabled={busy || !folderName.trim()} type="submit">{folderModal === "new" ? "Create folder" : "Save changes"}</button></div></form></div>}
  </div>;
}

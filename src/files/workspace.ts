// File workspace manager (Remix-style): multiple named workspaces, nested
// folders, a per-workspace file tree, recents, and localStorage persistence.
//
// Storage layout:
//   qcpbm.workspaces.v1  -> { activeId, list: WorkspaceMeta[] }   (index)
//   qcpbm.ws.<id>        -> { files: Record<path,string>, folders: string[], active }
//   qcpbm.recents.v1     -> { files: RecentFile[], workspaces: RecentWorkspace[] }
//
// File keys are normalized POSIX paths (e.g. "contracts/Token.sol"); folders are
// tracked explicitly so empty folders persist. The compiler consumes allSources().

import { STORAGE_SOL, EXAMPLE_TOKEN_SOL, EXAMPLE_DETAILED_SOL } from "../app/sample";

const LS_INDEX = "qcpbm.workspaces.v1";
const LS_RECENTS = "qcpbm.recents.v1";
const LS_WS_PREFIX = "qcpbm.ws.";
const RECENTS_CAP = 12;

export type WorkspaceListener = () => void;
export type WorkspaceTemplate = "blank" | "samples";

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
}

interface WorkspaceIndex {
  activeId: string;
  list: WorkspaceMeta[];
}

interface WorkspaceData {
  files: Record<string, string>;
  folders: string[];
  active: string;
}

export interface RecentFile {
  wsId: string;
  wsName: string;
  path: string;
  at: number;
}
export interface RecentWorkspace {
  id: string;
  name: string;
  at: number;
}
interface Recents {
  files: RecentFile[];
  workspaces: RecentWorkspace[];
}

export class Workspace {
  private index!: WorkspaceIndex;
  private data!: WorkspaceData; // active workspace's contents
  private recents: Recents = { files: [], workspaces: [] };
  private listeners = new Set<WorkspaceListener>();

  constructor() {
    this.loadRecents();
    this.loadIndex();
    this.data = this.readWorkspaceData(this.index.activeId) ?? this.seed("samples");
    this.ensureActiveValid();
    this.persistActive();
    this.recordRecentWorkspace(this.activeMeta());
  }

  // ---- Loading / persistence ----

  private loadIndex(): void {
    let idx: WorkspaceIndex | null = null;
    try {
      const raw = localStorage.getItem(LS_INDEX);
      if (raw) idx = JSON.parse(raw) as WorkspaceIndex;
    } catch {
      idx = null;
    }
    if (!idx || !Array.isArray(idx.list) || idx.list.length === 0) {
      const meta = this.newMeta("Default");
      this.index = { activeId: meta.id, list: [meta] };
      this.writeWorkspaceData(meta.id, this.seed("samples"));
      this.persistIndex();
      return;
    }
    this.index = idx;
    if (!idx.list.some((w) => w.id === idx!.activeId)) {
      this.index.activeId = idx.list[0]!.id;
    }
  }

  private loadRecents(): void {
    try {
      const raw = localStorage.getItem(LS_RECENTS);
      if (raw) {
        const r = JSON.parse(raw) as Partial<Recents>;
        this.recents = { files: r.files ?? [], workspaces: r.workspaces ?? [] };
      }
    } catch {
      this.recents = { files: [], workspaces: [] };
    }
  }

  private readWorkspaceData(id: string): WorkspaceData | null {
    try {
      const raw = localStorage.getItem(LS_WS_PREFIX + id);
      if (!raw) return null;
      const d = JSON.parse(raw) as Partial<WorkspaceData>;
      return { files: d.files ?? {}, folders: d.folders ?? [], active: d.active ?? "" };
    } catch {
      return null;
    }
  }

  private writeWorkspaceData(id: string, data: WorkspaceData): void {
    try {
      localStorage.setItem(LS_WS_PREFIX + id, JSON.stringify(data));
    } catch {
      /* ignore quota errors */
    }
  }

  private persistIndex(): void {
    try {
      localStorage.setItem(LS_INDEX, JSON.stringify(this.index));
    } catch {
      /* ignore */
    }
  }

  private persistActive(): void {
    this.writeWorkspaceData(this.index.activeId, this.data);
  }

  private persistRecents(): void {
    try {
      localStorage.setItem(LS_RECENTS, JSON.stringify(this.recents));
    } catch {
      /* ignore */
    }
  }

  private seed(template: WorkspaceTemplate): WorkspaceData {
    if (template === "samples") {
      return {
        files: {
          "Storage.sol": STORAGE_SOL,
          "ExampleToken.sol": EXAMPLE_TOKEN_SOL,
          "ExampleDetailed.sol": EXAMPLE_DETAILED_SOL,
        },
        folders: [],
        active: "Storage.sol",
      };
    }
    const name = "Untitled.sol";
    return { files: { [name]: skeleton(name) }, folders: [], active: name };
  }

  // ---- Events ----

  subscribe(l: WorkspaceListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit(): void {
    this.persistActive();
    for (const l of this.listeners) l();
  }

  // ---- File tree (active workspace) ----

  /** File paths in the active workspace, sorted folders-first then by name. */
  list(): string[] {
    return Object.keys(this.data.files).sort(pathCompare);
  }
  /** Explicit folder paths (including empty ones). */
  listFolders(): string[] {
    return [...this.data.folders].sort(pathCompare);
  }
  has(path: string): boolean {
    return path in this.data.files;
  }
  read(path: string): string {
    return this.data.files[path] ?? "";
  }
  getActive(): string {
    return this.data.active;
  }

  setActive(path: string): void {
    if (path in this.data.files && path !== this.data.active) {
      this.data.active = path;
      this.recordRecentFile(path);
      this.emit();
    }
  }

  write(path: string, content: string): void {
    if (!(path in this.data.files)) return; // never create via write
    this.data.files[path] = content;
    this.persistActive();
  }

  /** Create a new file (defaults to a `.sol` extension), returning its final path. */
  create(pathRaw: string): string {
    const base = normalizePath(pathRaw, true);
    let p = base;
    let n = 1;
    while (p in this.data.files) p = addSuffix(base, `-${n++}`);
    this.data.files[p] = skeleton(p);
    this.ensureParents(p);
    this.data.active = p;
    this.recordRecentFile(p);
    this.emit();
    return p;
  }

  /** Duplicate a file next to itself, returning the copy's path. */
  duplicate(path: string): string {
    if (!(path in this.data.files)) return path;
    let c = addSuffix(path, "-copy");
    let n = 1;
    while (c in this.data.files) c = addSuffix(path, `-copy-${n++}`);
    this.data.files[c] = this.data.files[path]!;
    this.data.active = c;
    this.recordRecentFile(c);
    this.emit();
    return c;
  }

  importFile(name: string, content: string): string {
    const path = normalizePath(name, false);
    this.data.files[path] = content;
    this.ensureParents(path);
    this.data.active = path;
    this.recordRecentFile(path);
    this.emit();
    return path;
  }

  rename(oldPath: string, newRaw: string): string {
    if (!(oldPath in this.data.files)) return oldPath;
    const newPath = normalizePath(newRaw, true);
    if (newPath === oldPath || newPath in this.data.files) return oldPath;
    this.data.files[newPath] = this.data.files[oldPath]!;
    delete this.data.files[oldPath];
    this.ensureParents(newPath);
    if (this.data.active === oldPath) this.data.active = newPath;
    this.emit();
    return newPath;
  }

  /** Move a file into `destFolder` (empty string = workspace root). */
  move(path: string, destFolderRaw: string): string {
    if (!(path in this.data.files)) return path;
    const dest = normalizeFolder(destFolderRaw);
    const target = dest ? `${dest}/${basename(path)}` : basename(path);
    return this.rename(path, target);
  }

  delete(path: string): void {
    if (!(path in this.data.files)) return;
    delete this.data.files[path];
    if (this.data.active === path) this.ensureActiveValid();
    this.emit();
  }

  // ---- Folders ----

  createFolder(rawPath: string): string {
    const base = normalizeFolder(rawPath);
    if (!base) return "";
    let f = base;
    let n = 1;
    while (this.data.folders.includes(f) || f in this.data.files) f = `${base}-${n++}`;
    this.addFolderWithParents(f);
    this.emit();
    return f;
  }

  renameFolder(oldRaw: string, newRaw: string): string {
    const oldF = normalizeFolder(oldRaw);
    const newF = normalizeFolder(newRaw);
    if (!newF || newF === oldF) return oldF;
    const op = `${oldF}/`;
    const np = `${newF}/`;
    for (const f of Object.keys(this.data.files)) {
      if (f.startsWith(op)) {
        const nf = np + f.slice(op.length);
        this.data.files[nf] = this.data.files[f]!;
        delete this.data.files[f];
        if (this.data.active === f) this.data.active = nf;
      }
    }
    this.data.folders = this.data.folders.map((d) =>
      d === oldF ? newF : d.startsWith(op) ? np + d.slice(op.length) : d,
    );
    this.addFolderWithParents(newF);
    this.emit();
    return newF;
  }

  deleteFolder(rawPath: string): void {
    const folder = normalizeFolder(rawPath);
    if (!folder) return;
    const prefix = `${folder}/`;
    for (const f of Object.keys(this.data.files)) {
      if (f === folder || f.startsWith(prefix)) delete this.data.files[f];
    }
    this.data.folders = this.data.folders.filter((d) => d !== folder && !d.startsWith(prefix));
    this.ensureActiveValid();
    this.emit();
  }

  // ---- Workspaces ----

  listWorkspaces(): WorkspaceMeta[] {
    return [...this.index.list];
  }
  activeWorkspaceId(): string {
    return this.index.activeId;
  }
  activeWorkspace(): WorkspaceMeta {
    return this.activeMeta();
  }

  createWorkspace(name: string, template: WorkspaceTemplate): WorkspaceMeta {
    const meta = this.newMeta(uniqueName(name || "workspace", this.index.list));
    this.index.list.push(meta);
    this.writeWorkspaceData(meta.id, this.seed(template));
    this.switchTo(meta.id);
    return meta;
  }

  openWorkspace(id: string): void {
    if (id === this.index.activeId) return;
    if (!this.index.list.some((w) => w.id === id)) return;
    this.switchTo(id);
  }

  cloneWorkspace(id: string, name: string): WorkspaceMeta | null {
    const src = this.readWorkspaceData(id);
    if (!src) return null;
    const meta = this.newMeta(uniqueName(name || "copy", this.index.list));
    this.index.list.push(meta);
    this.writeWorkspaceData(meta.id, {
      files: { ...src.files },
      folders: [...src.folders],
      active: src.active,
    });
    this.switchTo(meta.id);
    return meta;
  }

  renameWorkspace(id: string, name: string): void {
    const m = this.index.list.find((w) => w.id === id);
    if (!m || !name.trim()) return;
    m.name = name.trim();
    this.recents.workspaces = this.recents.workspaces.map((w) => (w.id === id ? { ...w, name: m.name } : w));
    this.recents.files = this.recents.files.map((f) => (f.wsId === id ? { ...f, wsName: m.name } : f));
    this.persistRecents();
    this.persistIndex();
    this.emit();
  }

  deleteWorkspace(id: string): void {
    const i = this.index.list.findIndex((w) => w.id === id);
    if (i < 0) return;
    this.index.list.splice(i, 1);
    try {
      localStorage.removeItem(LS_WS_PREFIX + id);
    } catch {
      /* ignore */
    }
    this.recents.workspaces = this.recents.workspaces.filter((w) => w.id !== id);
    this.recents.files = this.recents.files.filter((f) => f.wsId !== id);
    this.persistRecents();

    if (this.index.list.length === 0) {
      const meta = this.newMeta("Default");
      this.index.list.push(meta);
      this.writeWorkspaceData(meta.id, this.seed("samples"));
      this.index.activeId = meta.id;
    } else if (!this.index.list.some((w) => w.id === this.index.activeId)) {
      this.index.activeId = this.index.list[0]!.id;
    }
    this.data = this.readWorkspaceData(this.index.activeId) ?? this.seed("samples");
    this.ensureActiveValid();
    this.persistIndex();
    this.recordRecentWorkspace(this.activeMeta());
    this.emit();
  }

  private switchTo(id: string): void {
    const meta = this.index.list.find((w) => w.id === id);
    if (!meta) return;
    this.index.activeId = id;
    meta.lastOpenedAt = Date.now();
    this.data = this.readWorkspaceData(id) ?? this.seed("blank");
    this.ensureActiveValid();
    this.recordRecentWorkspace(meta);
    this.persistIndex();
    this.persistActive();
    this.emit();
  }

  // ---- Recents ----

  recentFiles(): RecentFile[] {
    return [...this.recents.files];
  }
  recentWorkspaces(): RecentWorkspace[] {
    return [...this.recents.workspaces];
  }

  private recordRecentFile(path: string): void {
    if (!path) return;
    const wsId = this.index.activeId;
    const wsName = this.activeMeta().name;
    this.recents.files = [
      { wsId, wsName, path, at: Date.now() },
      ...this.recents.files.filter((f) => !(f.wsId === wsId && f.path === path)),
    ].slice(0, RECENTS_CAP);
    this.persistRecents();
  }

  private recordRecentWorkspace(meta: WorkspaceMeta): void {
    this.recents.workspaces = [
      { id: meta.id, name: meta.name, at: Date.now() },
      ...this.recents.workspaces.filter((w) => w.id !== meta.id),
    ].slice(0, RECENTS_CAP);
    this.persistRecents();
  }

  // ---- Compilation ----

  /** All sources (for multi-file compilation with workspace-relative imports). */
  allSources(): Record<string, string> {
    return { ...this.data.files };
  }

  // ---- Internals ----

  private activeMeta(): WorkspaceMeta {
    return this.index.list.find((w) => w.id === this.index.activeId) ?? this.index.list[0]!;
  }

  private newMeta(name: string): WorkspaceMeta {
    const now = Date.now();
    const id = `ws_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    return { id, name, createdAt: now, lastOpenedAt: now };
  }

  private ensureActiveValid(): void {
    if (this.data.active && this.data.active in this.data.files) return;
    this.data.active = Object.keys(this.data.files).sort(pathCompare)[0] ?? "";
  }

  private ensureParents(path: string): void {
    const d = dirname(path);
    if (d) this.addFolderWithParents(d);
  }

  private addFolderWithParents(folder: string): void {
    const parts = folder.split("/");
    let acc = "";
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (acc && !this.data.folders.includes(acc)) this.data.folders.push(acc);
    }
  }
}

// ---- Path helpers ----

function normalizePath(raw: string, defaultSol: boolean): string {
  let p = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  if (!p) p = "Untitled";
  if (defaultSol && !/\.[A-Za-z0-9]+$/.test(basename(p))) p += ".sol";
  return p;
}

function normalizeFolder(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : "";
}

function skeleton(path: string): string {
  const c = basename(path).replace(/\.sol$/, "").replace(/[^A-Za-z0-9_]/g, "_") || "Contract";
  return `// SPDX-License-Identifier: MIT\npragma solidity 0.7.6;\n\ncontract ${c} {\n}\n`;
}

/** Insert `suffix` before the file extension (or at the end if none). */
function addSuffix(path: string, suffix: string): string {
  const b = basename(path);
  const d = dirname(path);
  const dot = b.lastIndexOf(".");
  const nb = dot > 0 ? b.slice(0, dot) + suffix + b.slice(dot) : b + suffix;
  return d ? `${d}/${nb}` : nb;
}

function uniqueName(name: string, list: WorkspaceMeta[]): string {
  const taken = new Set(list.map((w) => w.name));
  if (!taken.has(name)) return name;
  let n = 1;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** Sort so folders/paths group naturally: compare segment by segment. */
function pathCompare(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return pa[i]!.localeCompare(pb[i]!);
  }
  return pa.length - pb.length;
}

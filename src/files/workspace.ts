// File workspace (Mini §4.1): create/rename/delete .sol files, single workspace,
// localStorage persistence, import from file/zip is handled in main via File API.

import { STORAGE_SOL, EXAMPLE_TOKEN_SOL, EXAMPLE_DETAILED_SOL } from "../app/sample";

const LS_KEY = "qcpbm.workspace.v1";
const LS_ACTIVE = "qcpbm.workspace.active";

export type WorkspaceListener = () => void;

interface Persisted {
  files: Record<string, string>;
  active: string;
}

export class Workspace {
  private files: Record<string, string> = {};
  private active = "";
  private listeners = new Set<WorkspaceListener>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted | Record<string, string>;
        if (parsed && typeof parsed === "object" && "files" in parsed) {
          this.files = (parsed as Persisted).files ?? {};
          this.active = (parsed as Persisted).active ?? "";
        } else {
          this.files = parsed as Record<string, string>;
        }
      }
    } catch {
      this.files = {};
    }
    if (Object.keys(this.files).length === 0) {
      this.files = {
        "Storage.sol": STORAGE_SOL,
        "ExampleToken.sol": EXAMPLE_TOKEN_SOL,
        "ExampleDetailed.sol": EXAMPLE_DETAILED_SOL,
      };
    }
    if (!this.active || !(this.active in this.files)) {
      this.active = Object.keys(this.files)[0]!;
    }
    this.persist();
  }

  private persist(): void {
    try {
      const data: Persisted = { files: this.files, active: this.active };
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      localStorage.setItem(LS_ACTIVE, this.active);
    } catch {
      /* ignore quota errors in MVP */
    }
  }

  subscribe(l: WorkspaceListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit(): void {
    this.persist();
    for (const l of this.listeners) l();
  }

  list(): string[] {
    return Object.keys(this.files).sort();
  }
  has(path: string): boolean {
    return path in this.files;
  }
  read(path: string): string {
    return this.files[path] ?? "";
  }
  getActive(): string {
    return this.active;
  }

  setActive(path: string): void {
    if (path in this.files && path !== this.active) {
      this.active = path;
      this.emit();
    }
  }

  write(path: string, content: string): void {
    this.files[path] = content;
    this.persist(); // no re-render needed for content edits
  }

  create(path: string): string {
    let name = normalizeSolName(path);
    let n = 1;
    while (name in this.files) {
      name = name.replace(/\.sol$/, "") + `-${n++}.sol`;
    }
    this.files[name] = `// SPDX-License-Identifier: MIT\npragma solidity 0.7.6;\n\ncontract ${baseName(name)} {\n}\n`;
    this.active = name;
    this.emit();
    return name;
  }

  importFile(name: string, content: string): string {
    const safe = normalizeSolName(name);
    this.files[safe] = content;
    this.active = safe;
    this.emit();
    return safe;
  }

  rename(oldPath: string, newPathRaw: string): string {
    if (!(oldPath in this.files)) return oldPath;
    const newPath = normalizeSolName(newPathRaw);
    if (newPath === oldPath || newPath in this.files) return oldPath;
    this.files[newPath] = this.files[oldPath]!;
    delete this.files[oldPath];
    if (this.active === oldPath) this.active = newPath;
    this.emit();
    return newPath;
  }

  delete(path: string): void {
    if (!(path in this.files)) return;
    delete this.files[path];
    if (Object.keys(this.files).length === 0) {
      this.files = { "Storage.sol": STORAGE_SOL };
    }
    if (this.active === path) this.active = Object.keys(this.files)[0]!;
    this.emit();
  }

  /** All sources (for multi-file compilation with workspace-relative imports). */
  allSources(): Record<string, string> {
    return { ...this.files };
  }
}

function normalizeSolName(name: string): string {
  let n = name.trim().replace(/^\.?\//, "");
  if (!n) n = "Untitled.sol";
  if (!n.endsWith(".sol")) n += ".sol";
  return n;
}
function baseName(path: string): string {
  return path.replace(/\.sol$/, "").replace(/[^A-Za-z0-9_]/g, "_") || "Contract";
}

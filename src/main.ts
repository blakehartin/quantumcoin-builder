import "./styles/app.css";

import { QCEditor, type PragmaStatus } from "./editor/QCEditor";
import { CompilerClient } from "./compiler/compilerClient";
import { DEFAULT_SETTINGS, type EditorDiagnostic } from "./compiler/types";
import { SidePanel } from "./panels/sidePanel";
import { Terminal } from "./app/terminal";
import { MenuBar } from "./app/menu";
import { BootstrapOverlay } from "./app/bootstrap";
import { brandIcon } from "./app/brand";
import { Store } from "./app/state";
import { Workspace } from "./files/workspace";
import { Explorer } from "./files/explorer";
import { Tabs } from "./files/tabs";
import { initSdk } from "./abi/sdk";
import { readZip } from "./export/zip";
import { downloadProjectZip } from "./export/download";

const store = new Store();
const workspace = new Workspace();
const compiler = new CompilerClient();
const terminal = new Terminal();

let openFiles: string[] = [workspace.getActive()];
let explorerVisible = true;

let resolveShellReady!: () => void;
const shellReady = new Promise<void>((r) => {
  resolveShellReady = r;
});

// ---- Auto-compile (3s after the last edit) ----
const AUTO_COMPILE_DELAY = 3000;
let autoCompileTimer: number | null = null;
let autoCompileEnabled = false;

function scheduleAutoCompile(): void {
  if (!autoCompileEnabled) return;
  if (autoCompileTimer != null) clearTimeout(autoCompileTimer);
  autoCompileTimer = window.setTimeout(() => {
    autoCompileTimer = null;
    // Skip silently while the pragma is unsatisfied to avoid noisy errors mid-edit.
    if (!editor.getPragmaStatus().ok) return;
    void compileCurrent();
  }, AUTO_COMPILE_DELAY);
}

// ---- Editor ----
const editor = new QCEditor({
  onChange: (path, value) => {
    workspace.write(path, value);
    scheduleAutoCompile();
  },
  onPragmaChange: (status: PragmaStatus) => {
    store.set({ pragmaOk: status.ok });
    sidePanel.setPragmaOk(status.ok);
  },
});

// ---- Side panel ----
const sidePanel = new SidePanel({
  onCompile: () => compileCurrent(),
  log: (msg, kind) => terminal.log(msg, kind),
});

// ---- Tabs / explorer ----
const tabs = new Tabs({
  onSelect: (path) => openFile(path),
  onClose: (path) => closeFile(path),
});
const explorer = new Explorer(workspace, {
  onOpen: (path) => openFile(path),
  onNew: () => newFile(),
  onRename: (path) => renameFile(path),
  onDelete: (path) => deleteFile(path),
});

// ---- Shell DOM ----
function buildShell(): void {
  const app = document.getElementById("app") as HTMLDivElement;
  app.className = "app";

  // Title bar
  const titlebar = document.createElement("div");
  titlebar.className = "titlebar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.append(brandIcon("icon"), spanText("title", "QuantumCoin"), spanText("subtitle", "Platform Builder"));
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.title = "Settings";
  gear.innerHTML = "&#9881;";
  gear.addEventListener("click", () => handleAction("tools.compilerSettings"));
  titlebar.append(brand, spacer, gear);

  // Menu bar
  const menubar = new MenuBar(handleAction);

  // Body
  const body = document.createElement("div");
  body.className = "body";

  const center = document.createElement("div");
  center.style.display = "flex";
  center.style.flexDirection = "column";
  center.style.minWidth = "0";
  center.style.minHeight = "0";
  center.appendChild(tabs.el);
  editor.mount(center);

  body.append(explorer.el, center, sidePanel.el);

  app.append(titlebar, menubar.el, body, terminal.el);

  // Terminal diagnostic clicks -> jump editor
  terminal.setDiagnosticClickHandler((d) => focusDiagnostic(d));

  // Load the active document into the freshly mounted editor.
  const active = workspace.getActive();
  editor.setDocument(active, workspace.read(active));

  renderTabs();
  resolveShellReady();
}

function spanText(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

// ---- File operations ----
function renderTabs(): void {
  openFiles = openFiles.filter((p) => workspace.has(p));
  if (!openFiles.includes(workspace.getActive())) openFiles.push(workspace.getActive());
  tabs.render(openFiles, workspace.getActive());
}

function openFile(path: string): void {
  if (!workspace.has(path)) return;
  // Persist current editor buffer before switching.
  workspace.write(editor.getPath(), editor.getValue());
  workspace.setActive(path);
  if (!openFiles.includes(path)) openFiles.push(path);
  editor.setDocument(path, workspace.read(path));
  renderTabs();
  explorer.render();
  editor.focus();
}

function closeFile(path: string): void {
  openFiles = openFiles.filter((p) => p !== path);
  if (openFiles.length === 0) {
    const next = workspace.list()[0]!;
    openFiles = [next];
  }
  if (workspace.getActive() === path) openFile(openFiles[openFiles.length - 1]!);
  else renderTabs();
}

function newFile(): void {
  const name = window.prompt("New file name", "Untitled.sol");
  if (!name) return;
  const created = workspace.create(name);
  openFiles.push(created);
  editor.setDocument(created, workspace.read(created));
  renderTabs();
  terminal.log(`Created ${created}`);
}

function renameFile(path: string): void {
  const next = window.prompt("Rename file", path);
  if (!next) return;
  const renamed = workspace.rename(path, next);
  openFiles = openFiles.map((p) => (p === path ? renamed : p));
  if (editor.getPath() === path) editor.setDocument(renamed, workspace.read(renamed));
  renderTabs();
  terminal.log(`Renamed ${path} \u2192 ${renamed}`);
}

function deleteFile(path: string): void {
  if (!window.confirm(`Delete ${path}?`)) return;
  workspace.delete(path);
  openFiles = openFiles.filter((p) => p !== path);
  const active = workspace.getActive();
  if (!openFiles.includes(active)) openFiles.push(active);
  editor.setDocument(active, workspace.read(active));
  renderTabs();
  terminal.log(`Deleted ${path}`, "warning");
}

function importFromFile(): void {
  pickFile(".sol", async (file) => {
    const text = await file.text();
    const name = workspace.importFile(file.name, text);
    openFiles.push(name);
    editor.setDocument(name, text);
    renderTabs();
    terminal.log(`Imported ${name}`, "success");
  });
}

function importFromZip(): void {
  pickFile(".zip", async (file) => {
    try {
      const entries = await readZip(file);
      let last = "";
      for (const e of entries) {
        if (e.name.endsWith(".sol")) last = workspace.importFile(e.name, e.text);
      }
      if (last) {
        openFiles.push(last);
        editor.setDocument(last, workspace.read(last));
        renderTabs();
        terminal.log(`Imported ${entries.filter((e) => e.name.endsWith(".sol")).length} file(s) from ${file.name}`, "success");
      } else {
        terminal.log(`No .sol files found in ${file.name}`, "warning");
      }
    } catch (err) {
      terminal.log("Zip import failed: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  });
}

function downloadProject(): void {
  workspace.write(editor.getPath(), editor.getValue());
  const sources = workspace.allSources();
  const count = Object.keys(sources).length;
  const filename = downloadProjectZip(sources);
  terminal.log(`Downloaded ${count} file(s) as ${filename}`, "success");
}

function pickFile(accept: string, onPick: (f: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onPick(f);
  });
  input.click();
}

// ---- Compile ----
async function compileCurrent(): Promise<void> {
  workspace.write(editor.getPath(), editor.getValue());
  const pragma = editor.getPragmaStatus();
  if (!pragma.ok) {
    terminal.log(`Cannot compile: ${pragma.message}`, "error");
    return;
  }
  const active = workspace.getActive();
  const sources = workspace.allSources();
  terminal.log(`Compiling ${active} with Solidity 0.7.6 (soljson-v32b.8.12.js)\u2026`);
  try {
    const result = await compiler.compile(sources, DEFAULT_SETTINGS, (stage) =>
      terminal.log(`  ${stage}\u2026`),
    );
    editor.setDiagnostics(result.diagnostics);
    for (const d of result.diagnostics) terminal.logDiagnostic(d);
    store.set({ lastResult: result });
    sidePanel.setResult(result);

    if (result.errorCount > 0) {
      terminal.log(`Compilation failed \u2014 ${result.errorCount} error(s), ${result.warningCount} warning(s).`, "error");
    } else {
      const names = result.contracts.map((c) => c.contractName).join(", ") || "(no contracts)";
      terminal.log(`Compiled successfully: ${names}. ${result.warningCount} warning(s).`, "success");
    }
  } catch (err) {
    terminal.log("Compiler error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
}

function focusDiagnostic(d: EditorDiagnostic): void {
  if (d.file !== workspace.getActive() && workspace.has(d.file)) openFile(d.file);
  editor.gotoLine(d.line, true);
}

// ---- Menu actions ----
function handleAction(id: string): void {
  switch (id) {
    case "file.new": newFile(); break;
    case "file.open": importFromFile(); break;
    case "file.importZip": importFromZip(); break;
    case "file.download": downloadProject(); break;
    case "file.save":
      workspace.write(editor.getPath(), editor.getValue());
      terminal.log(`Saved ${editor.getPath()}`);
      break;
    case "file.rename": renameFile(workspace.getActive()); break;
    case "file.close": closeFile(workspace.getActive()); break;
    case "edit.undo": editor.undo(); break;
    case "edit.redo": editor.redo(); break;
    case "edit.find": editor.openFindReplace(false); break;
    case "edit.replace": editor.openFindReplace(true); break;
    case "edit.gotoLine": editor.openGoToLine(); break;
    case "view.explorer": toggleExplorer(); break;
    case "view.compiler": sidePanel.showTab("compiler"); break;
    case "view.abi": sidePanel.showTab("abi"); break;
    case "view.terminal": toggleTerminal(); break;
    case "build.compile":
    case "build.compileAll": compileCurrent(); break;
    case "tools.compilerSettings":
      terminal.log("Compiler settings: optimizer enabled (runs 200); Solidity 0.7.6 fixed. (UI in a later iteration.)");
      break;
    case "help.docs": window.open("https://quantumcoin.org", "_blank", "noopener"); break;
    case "help.shortcuts":
      terminal.log("Shortcuts: Ctrl+S Save, Ctrl+Shift+B Compile, Ctrl+F Find, Ctrl+H Replace, Ctrl+G Go to line");
      break;
    case "help.about":
      terminal.log("QuantumCoin Blockchain Platform Builder");
      break;
    default: break;
  }
}

function toggleExplorer(): void {
  explorerVisible = !explorerVisible;
  document.querySelector(".body")?.classList.toggle("no-explorer", !explorerVisible);
  explorer.el.style.display = explorerVisible ? "" : "none";
}

function toggleTerminal(): void {
  const root = document.querySelector(".app") as HTMLElement;
  const hidden = terminal.el.style.display === "none";
  terminal.el.style.display = hidden ? "" : "none";
  root.style.setProperty("--terminal-h", hidden ? "200px" : "0px");
}

// ---- Keyboard shortcuts (global) ----
function bindGlobalShortcuts(): void {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      compileCurrent();
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleAction("file.save");
    }
  });
}

// ---- Bootstrap ----
function startBootstrap(): void {
  const overlay = new BootstrapOverlay();
  const root = document.getElementById("bootstrap-root") as HTMLElement;

  overlay.addAsset("shell", "Application shell", async () => buildShell(), true);
  overlay.addAsset("editor", "Code editor (QCEditor)", async () => {
    // The editor mounts and loads the active document during shell build.
    await shellReady;
  }, true);
  overlay.addAsset("compiler", "Solidity compiler", async () => {
    overlay.setDetail("compiler", "loading soljson\u2026");
    await compiler.ping();
  }, false);
  overlay.addAsset("sdk", "QuantumCoin SDK (WASM)", async () => {
    await initSdk();
  }, false);
  overlay.addAsset("fonts", "Fonts", async () => {
    if (document.fonts?.ready) {
      await Promise.race([document.fonts.ready, delay(4000)]);
    }
  }, true);

  overlay.mount(root);
  void overlay.run(() => {
    const app = document.getElementById("app") as HTMLElement;
    app.hidden = false;
    bindGlobalShortcuts();
    autoCompileEnabled = true;
    editor.focus();
    terminal.log("Ready. Write Solidity 0.7.6 \u2014 it auto-compiles ~3s after you stop typing (or Ctrl+Shift+B).");
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

startBootstrap();

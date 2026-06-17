// Windows-style menu bar (Mini §4.2). Emits action ids; main wires behavior.

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separatorAfter?: boolean;
  disabled?: boolean;
}
export interface MenuDef {
  label: string;
  items: MenuItem[];
}

export const MENUS: MenuDef[] = [
  {
    label: "File",
    items: [
      { id: "file.new", label: "New File", shortcut: "Ctrl+N" },
      { id: "file.open", label: "Open File\u2026", shortcut: "Ctrl+O" },
      { id: "file.importZip", label: "Import from Zip\u2026", separatorAfter: true },
      { id: "file.save", label: "Save", shortcut: "Ctrl+S" },
      { id: "file.rename", label: "Rename\u2026" },
      { id: "file.close", label: "Close File", separatorAfter: true },
      { id: "file.exit", label: "Exit", disabled: true },
    ],
  },
  {
    label: "Edit",
    items: [
      { id: "edit.undo", label: "Undo", shortcut: "Ctrl+Z" },
      { id: "edit.redo", label: "Redo", shortcut: "Ctrl+Y", separatorAfter: true },
      { id: "edit.find", label: "Find\u2026", shortcut: "Ctrl+F" },
      { id: "edit.replace", label: "Replace\u2026", shortcut: "Ctrl+H" },
      { id: "edit.gotoLine", label: "Go to Line\u2026", shortcut: "Ctrl+G" },
    ],
  },
  {
    label: "View",
    items: [
      { id: "view.explorer", label: "File Explorer" },
      { id: "view.compiler", label: "Compiler Panel" },
      { id: "view.abi", label: "ABI Panel" },
      { id: "view.terminal", label: "Terminal" },
    ],
  },
  {
    label: "Build",
    items: [
      { id: "build.compile", label: "Compile Current File", shortcut: "Ctrl+Shift+B" },
      { id: "build.compileAll", label: "Compile All" },
    ],
  },
  {
    label: "Tools",
    items: [{ id: "tools.compilerSettings", label: "Compiler Settings\u2026" }],
  },
  {
    label: "Help",
    items: [
      { id: "help.docs", label: "Documentation" },
      { id: "help.shortcuts", label: "Keyboard Shortcuts" },
      { id: "help.about", label: "About Platform Builder" },
    ],
  },
];

export class MenuBar {
  readonly el: HTMLElement;
  private onAction: (id: string) => void;

  constructor(onAction: (id: string) => void) {
    this.onAction = onAction;
    this.el = document.createElement("div");
    this.el.className = "menubar";
    this.build();
    document.addEventListener("click", () => this.closeAll());
  }

  private build(): void {
    for (const menu of MENUS) {
      const wrap = document.createElement("div");
      wrap.className = "menu";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = menu.label;
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = wrap.classList.contains("open");
        this.closeAll();
        if (!open) wrap.classList.add("open");
      });
      const dropdown = document.createElement("div");
      dropdown.className = "dropdown";
      for (const item of menu.items) {
        const mi = document.createElement("div");
        mi.className = "mi" + (item.disabled ? " disabled" : "");
        const name = document.createElement("span");
        name.textContent = item.label;
        mi.appendChild(name);
        if (item.shortcut) {
          const sc = document.createElement("span");
          sc.className = "sc";
          sc.textContent = item.shortcut;
          mi.appendChild(sc);
        }
        if (!item.disabled) {
          mi.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeAll();
            this.onAction(item.id);
          });
        }
        dropdown.appendChild(mi);
        if (item.separatorAfter) {
          const sep = document.createElement("div");
          sep.className = "sep";
          dropdown.appendChild(sep);
        }
      }
      wrap.append(label, dropdown);
      this.el.appendChild(wrap);
    }
  }

  private closeAll(): void {
    this.el.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  }
}

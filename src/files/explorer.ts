import type { Workspace } from "./workspace";

export interface ExplorerHooks {
  onOpen: (path: string) => void;
  onNew: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

/** Collapsible left drawer file explorer (Mini §9.3). */
export class Explorer {
  readonly el: HTMLElement;
  private ws: Workspace;
  private hooks: ExplorerHooks;
  private tree!: HTMLDivElement;

  constructor(ws: Workspace, hooks: ExplorerHooks) {
    this.ws = ws;
    this.hooks = hooks;
    this.el = document.createElement("aside");
    this.el.className = "explorer";
    const head = document.createElement("div");
    head.className = "panel-head";
    const title = document.createElement("span");
    title.textContent = "Explorer";
    const add = document.createElement("button");
    add.className = "icon-btn";
    add.title = "New file";
    add.textContent = "+";
    add.addEventListener("click", () => this.hooks.onNew());
    head.append(title, add);
    this.tree = document.createElement("div");
    this.tree.className = "tree";
    this.el.append(head, this.tree);
    this.render();
    ws.subscribe(() => this.render());
  }

  render(): void {
    this.tree.innerHTML = "";
    const root = document.createElement("div");
    root.className = "row";
    root.innerHTML = `<span>\u25BE</span> workspace`;
    this.tree.appendChild(root);

    for (const path of this.ws.list()) {
      const row = document.createElement("div");
      row.className = "row file" + (path === this.ws.getActive() ? " active" : "");
      const name = document.createElement("span");
      name.textContent = "\uD83D\uDCC4 " + path;
      name.style.flex = "1";
      name.addEventListener("click", () => this.hooks.onOpen(path));
      const del = document.createElement("button");
      del.className = "icon-btn";
      del.title = "Delete";
      del.textContent = "\u00D7";
      del.style.width = "20px";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hooks.onDelete(path);
      });
      const ren = document.createElement("button");
      ren.className = "icon-btn";
      ren.title = "Rename";
      ren.textContent = "\u270E";
      ren.style.width = "20px";
      ren.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hooks.onRename(path);
      });
      row.append(name, ren, del);
      this.tree.appendChild(row);
    }
  }
}

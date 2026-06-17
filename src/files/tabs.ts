export interface TabsHooks {
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

/** File tabs above the editor (Mini §5.4). One editor instance; swap on change. */
export class Tabs {
  readonly el: HTMLDivElement;
  private hooks: TabsHooks;

  constructor(hooks: TabsHooks) {
    this.hooks = hooks;
    this.el = document.createElement("div");
    this.el.className = "tabs";
  }

  render(open: string[], active: string): void {
    this.el.innerHTML = "";
    for (const path of open) {
      const tab = document.createElement("div");
      tab.className = "tab" + (path === active ? " active" : "");
      const name = document.createElement("span");
      name.textContent = path;
      name.addEventListener("click", () => this.hooks.onSelect(path));
      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "\u00D7";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hooks.onClose(path);
      });
      tab.append(name, close);
      this.el.appendChild(tab);
    }
  }
}

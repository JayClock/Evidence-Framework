import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export class ToolLease {
  private readonly added = new Set<string>();

  constructor(private readonly pi: ExtensionAPI) {}

  activate(names: string[]): void {
    const active = this.pi.getActiveTools();
    for (const name of names) {
      if (!active.includes(name)) this.added.add(name);
    }
    this.pi.setActiveTools([...new Set([...active, ...names])]);
  }

  release(): void {
    if (this.added.size === 0) return;
    this.pi.setActiveTools(
      this.pi.getActiveTools().filter((name) => !this.added.has(name)),
    );
    this.added.clear();
  }
}

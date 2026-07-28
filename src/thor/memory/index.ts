export type MemoryWindowEntry = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export class ThorMemoryWindow {
  private readonly entries: MemoryWindowEntry[] = [];

  constructor(private readonly limit = 30) {}

  add(entry: MemoryWindowEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
  }

  list() {
    return [...this.entries];
  }

  clear() {
    this.entries.length = 0;
  }
}

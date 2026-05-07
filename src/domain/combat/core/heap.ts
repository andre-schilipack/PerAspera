/**
 * Minimal binary min-heap with a custom comparator.
 * Kept local to avoid adding deps during Slice 1.
 */
export class MinHeap<T> {
  private data: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.data.length;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  push(value: T): void {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (n > 1) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.data[i]!, this.data[parent]!) >= 0) return;
      [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.data.length;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.compare(this.data[left]!, this.data[smallest]!) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.data[right]!, this.data[smallest]!) < 0) {
        smallest = right;
      }
      if (smallest === i) return;
      [this.data[i], this.data[smallest]] = [this.data[smallest]!, this.data[i]!];
      i = smallest;
    }
  }
}


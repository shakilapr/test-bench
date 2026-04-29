// Lightweight event bus so backend modules can publish without circular imports.
// Topics are strings; payloads are typed via overloads when needed.

type Listener = (payload: unknown) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(topic: string, fn: Listener): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(topic: string, payload: unknown) {
    const set = this.listeners.get(topic);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] listener threw on ${topic}:`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

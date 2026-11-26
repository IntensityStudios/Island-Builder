// Snapshot-based undo/redo. Snapshots are small (≈25 KB), so we just copy state.
export class History {
  constructor(getSnapshot, applySnapshot, limit = 60) {
    this.get = getSnapshot;
    this.apply = applySnapshot;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = () => {};
  }
  /** Call BEFORE making a change. */
  record() {
    this.undoStack.push(this.get());
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange();
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.get());
    this.apply(this.undoStack.pop());
    this.onChange();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.get());
    this.apply(this.redoStack.pop());
    this.onChange();
    return true;
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.onChange(); }
}

import type { ReaderTextSelectionSnapshot } from "../model/types";
import {
  cloneReaderTextSelectionSnapshot,
  readerTextSelectionSnapshotsEqual
} from "./reader-selection";
import type { ReaderSelectionSessionState } from "./reader-session-state";

export class ReaderSelectionSession {
  constructor(private readonly state: ReaderSelectionSessionState) {}

  get textSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return cloneReaderTextSelectionSnapshot(this.state.textSelectionSnapshot);
  }

  get pinnedTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return cloneReaderTextSelectionSnapshot(
      this.state.pinnedTextSelectionSnapshot
    );
  }

  setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): {
    changed: boolean;
    selection: ReaderTextSelectionSnapshot | null;
  } {
    this.state.pinnedTextSelectionSnapshot =
      cloneReaderTextSelectionSnapshot(selection);
    return this.updateTextSelectionSnapshot(selection);
  }

  updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): {
    changed: boolean;
    selection: ReaderTextSelectionSnapshot | null;
  } {
    if (
      readerTextSelectionSnapshotsEqual(
        this.state.textSelectionSnapshot,
        selection
      )
    ) {
      return {
        changed: false,
        selection: cloneReaderTextSelectionSnapshot(
          this.state.textSelectionSnapshot
        )
      };
    }

    this.state.textSelectionSnapshot =
      cloneReaderTextSelectionSnapshot(selection);
    return {
      changed: true,
      selection: cloneReaderTextSelectionSnapshot(
        this.state.textSelectionSnapshot
      )
    };
  }

  reset(): void {
    this.state.textSelectionSnapshot = null;
    this.state.pinnedTextSelectionSnapshot = null;
  }
}

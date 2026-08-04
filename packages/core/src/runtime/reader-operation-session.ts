export class ReaderOperationCancelledError extends Error {
  constructor() {
    super("Reader operation was superseded by a newer publication")
    this.name = "ReaderOperationCancelledError"
  }
}

export class ReaderOperationSession {
  private publicationVersion = 0

  beginPublication(): number {
    this.publicationVersion += 1
    return this.publicationVersion
  }

  capturePublication(): number {
    return this.publicationVersion
  }

  invalidatePublication(): void {
    this.publicationVersion += 1
  }

  isCurrentPublication(version: number): boolean {
    return version === this.publicationVersion
  }

  assertCurrentPublication(version: number): void {
    if (!this.isCurrentPublication(version)) {
      throw new ReaderOperationCancelledError()
    }
  }
}

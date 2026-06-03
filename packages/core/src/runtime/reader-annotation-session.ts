import type { Annotation } from "../model/types";
import type { ReaderAnnotationSessionState } from "./reader-session-state";

export class ReaderAnnotationSession {
  constructor(private readonly state: ReaderAnnotationSessionState) {}

  get annotations(): Annotation[] {
    return this.state.annotations;
  }

  set annotations(value: Annotation[]) {
    this.state.annotations = value;
  }

  append(annotation: Annotation): void {
    this.state.annotations = [...this.state.annotations, annotation];
  }

  reset(): void {
    this.state.annotations = [];
  }
}

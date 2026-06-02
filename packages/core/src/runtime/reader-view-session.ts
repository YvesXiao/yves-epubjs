import type {
  PublisherColorOverride,
  PublisherStylesMode,
  ReaderPreferences,
  ReaderSettings,
  ReaderSpreadMode,
  Theme,
  TypographyOptions
} from "../model/types";
import type { ReaderViewSessionState } from "./reader-session-state";

export class ReaderViewSession {
  constructor(private readonly state: ReaderViewSessionState) {}

  get preferences(): ReaderPreferences {
    return this.state.preferences;
  }

  set preferences(value: ReaderPreferences) {
    this.state.preferences = value;
  }

  get mode(): "scroll" | "paginated" {
    return this.state.mode;
  }

  set mode(value: "scroll" | "paginated") {
    this.state.mode = value;
  }

  get publisherStyles(): PublisherStylesMode {
    return this.state.publisherStyles;
  }

  set publisherStyles(value: PublisherStylesMode) {
    this.state.publisherStyles = value;
  }

  get publisherColorOverride(): PublisherColorOverride {
    return this.state.publisherColorOverride;
  }

  set publisherColorOverride(value: PublisherColorOverride) {
    this.state.publisherColorOverride = value;
  }

  get experimentalRtl(): boolean {
    return this.state.experimentalRtl;
  }

  set experimentalRtl(value: boolean) {
    this.state.experimentalRtl = value;
  }

  get spreadMode(): ReaderSpreadMode {
    return this.state.spreadMode;
  }

  set spreadMode(value: ReaderSpreadMode) {
    this.state.spreadMode = value;
  }

  get debugMode(): boolean {
    return this.state.debugMode;
  }

  set debugMode(value: boolean) {
    this.state.debugMode = value;
  }

  get theme(): Theme {
    return this.state.theme;
  }

  set theme(value: Theme) {
    this.state.theme = value;
  }

  get typography(): TypographyOptions {
    return this.state.typography;
  }

  set typography(value: TypographyOptions) {
    this.state.typography = value;
  }

  applySettings(input: {
    preferences: ReaderPreferences;
    settings: ReaderSettings;
  }): void {
    this.state.preferences = input.preferences;
    this.state.mode = input.settings.mode;
    this.state.publisherStyles = input.settings.publisherStyles;
    this.state.publisherColorOverride = input.settings.publisherColorOverride;
    this.state.experimentalRtl = input.settings.experimentalRtl;
    this.state.spreadMode = input.settings.spreadMode;
    this.state.theme = { ...input.settings.theme };
    this.state.typography = { ...input.settings.typography };
  }

  snapshotSettings(): ReaderSettings {
    return {
      mode: this.state.mode,
      publisherStyles: this.state.publisherStyles,
      publisherColorOverride: this.state.publisherColorOverride,
      experimentalRtl: this.state.experimentalRtl,
      spreadMode: this.state.spreadMode,
      theme: { ...this.state.theme },
      typography: { ...this.state.typography }
    };
  }
}

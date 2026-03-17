export class MusicSorterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MusicSorterError';
  }
}

export class OverlayError extends MusicSorterError {
  constructor(message: string) {
    super(message, 'OVERLAY_ERROR');
    this.name = 'OverlayError';
  }
}

export class PlanError extends MusicSorterError {
  constructor(message: string) {
    super(message, 'PLAN_ERROR');
    this.name = 'PlanError';
  }
}

export class AudioAnalysisError extends MusicSorterError {
  constructor(message: string) {
    super(message, 'AUDIO_ANALYSIS_ERROR');
    this.name = 'AudioAnalysisError';
  }
}

export class TagError extends MusicSorterError {
  constructor(message: string) {
    super(message, 'TAG_ERROR');
    this.name = 'TagError';
  }
}

export class DatabaseError extends MusicSorterError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

export class FfmpegNotFoundError extends AudioAnalysisError {
  constructor() {
    super(
      'ffmpeg not found. Install ffmpeg to enable BPM analysis and audio decoding.\n' +
        '  macOS: brew install ffmpeg\n' +
        '  Linux: sudo apt install ffmpeg',
    );
    this.name = 'FfmpegNotFoundError';
  }
}

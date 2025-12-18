
export interface Slide {
  id: string;
  pageIndex: number; // 0-based index
  imageBlob: Blob;
  imageUrl: string;
  script: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number; // in seconds
  isProcessing: boolean;
  status: 'pending' | 'ready' | 'error';
}

export interface VideoMetadata {
  title: string;
  description: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING_PDF = 'PROCESSING_PDF',
  GENERATING_SCRIPTS = 'GENERATING_SCRIPTS',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  GENERATING_VIDEO = 'GENERATING_VIDEO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface GenerationProgress {
  current: number;
  total: number;
  message: string;
}

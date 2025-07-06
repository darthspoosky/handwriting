export interface OCRResult {
  text: string;
  confidence: number;
  provider: string;
  metadata: {
    processingTime: number;
    detectedLanguage?: string;
    wordCount: number;
    boundingBoxes?: Array<{
      text: string;
      confidence: number;
      box: { x: number; y: number; width: number; height: number };
    }>;
  };
}

export interface OCRProvider {
  name: string;
  processImage(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult>;
  getSupportedLanguages(): string[];
  getMaxFileSize(): number;
}

export interface OCROptions {
  language?: string;
  detectOrientation?: boolean;
  enhanceText?: boolean;
}

export class OCRError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string
  ) {
    super(message);
    this.name = 'OCRError';
  }
}

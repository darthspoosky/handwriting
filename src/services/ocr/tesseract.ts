import Tesseract from 'tesseract.js';
import { OCRProvider, OCRResult, OCROptions, OCRError } from './base';

export class TesseractOCR implements OCRProvider {
  name = 'tesseract';

  async processImage(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      const result = await Tesseract.recognize(
        imageBuffer,
        options?.language || 'eng+hin',
        {
          logger: () => {}, // Disable logging
        }
      );

      return {
        text: result.data.text,
        confidence: result.data.confidence / 100, // Convert to 0-1 scale
        provider: this.name,
        metadata: {
          processingTime: Date.now() - startTime,
          wordCount: result.data.text.split(/\s+/).length,
          boundingBoxes: result.data.words?.map(word => ({
            text: word.text,
            confidence: word.confidence / 100,
            box: {
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
              height: word.bbox.y1 - word.bbox.y0,
            },
          })),
        },
      };
    } catch (error) {
      throw new OCRError(
        `Tesseract OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'TESSERACT_ERROR'
      );
    }
  }

  getSupportedLanguages(): string[] {
    return ['eng', 'hin', 'tam', 'tel', 'kan', 'mal', 'guj', 'ben', 'pan', 'ori', 'asm', 'mar'];
  }

  getMaxFileSize(): number {
    return 10 * 1024 * 1024; // 10MB
  }
}

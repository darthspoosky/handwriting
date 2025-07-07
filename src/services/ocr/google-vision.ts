import { ImageAnnotatorClient } from '@google-cloud/vision';
import { OCRProvider, OCRResult, OCROptions, OCRError } from './base';
import { config } from '@/lib/config';

export class GoogleVisionOCR implements OCRProvider {
  name = 'google-vision';
  private client: ImageAnnotatorClient;

  constructor() {
    this.client = new ImageAnnotatorClient({
      projectId: config.ocr.google.projectId,
      keyFilename: config.ocr.google.keyFilename,
    });
  }

  async processImage(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      const [result] = await this.client.documentTextDetection({
        image: { content: imageBuffer },
        imageContext: {
          languageHints: options?.language ? [options.language] : ['en', 'hi'],
        },
      });

      const annotations = result.textAnnotations || [];
      const fullText = annotations[0]?.description || '';

      // Calculate average confidence
      const avgConfidence = annotations.length > 1
        ? annotations.slice(1).reduce((sum, ann) => sum + (ann.confidence || 0), 0) / (annotations.length - 1)
        : 0;

      // Extract word-level bounding boxes
      const boundingBoxes = annotations.slice(1).map(ann => ({
        text: ann.description || '',
        confidence: ann.confidence || 0,
        box: {
          x: ann.boundingPoly?.vertices?.[0]?.x || 0,
          y: ann.boundingPoly?.vertices?.[0]?.y || 0,
          width: (ann.boundingPoly?.vertices?.[2]?.x || 0) - (ann.boundingPoly?.vertices?.[0]?.x || 0),
          height: (ann.boundingPoly?.vertices?.[2]?.y || 0) - (ann.boundingPoly?.vertices?.[0]?.y || 0),
        },
      }));

      return {
        text: fullText,
        confidence: avgConfidence,
        provider: this.name,
        metadata: {
          processingTime: Date.now() - startTime,
          detectedLanguage: result.textAnnotations?.[0]?.locale,
          wordCount: fullText.split(/\s+/).length,
          boundingBoxes,
        },
      };
    } catch (error) {
      throw new OCRError(
        `Google Vision OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'GOOGLE_VISION_ERROR'
      );
    }
  }

  getSupportedLanguages(): string[] {
    return ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'gu', 'bn', 'pa', 'or', 'as', 'mr'];
  }

  getMaxFileSize(): number {
    return 20 * 1024 * 1024; // 20MB
  }
}

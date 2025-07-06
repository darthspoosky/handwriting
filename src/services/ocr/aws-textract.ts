import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { OCRProvider, OCRResult, OCROptions, OCRError } from './base';
import { config } from '@/lib/config';

export class AWSTextractOCR implements OCRProvider {
  name = 'aws-textract';
  private client: TextractClient;

  constructor() {
    this.client = new TextractClient({
      region: config.ocr.aws.region,
      credentials: {
        accessKeyId: config.ocr.aws.accessKeyId,
        secretAccessKey: config.ocr.aws.secretAccessKey,
      },
    });
  }

  async processImage(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: imageBuffer,
        },
        FeatureTypes: ['TABLES', 'FORMS'],
      });

      const response = await this.client.send(command);
      const blocks = response.Blocks || [];

      // Extract text from LINE blocks
      const textLines = blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text || '')
        .join('\n');

      // Calculate average confidence
      const avgConfidence = blocks
        .filter(block => block.Confidence !== undefined)
        .reduce((sum, block) => sum + (block.Confidence || 0), 0) / blocks.length || 0;

      return {
        text: textLines,
        confidence: avgConfidence / 100, // Convert to 0-1 scale
        provider: this.name,
        metadata: {
          processingTime: Date.now() - startTime,
          wordCount: textLines.split(/\s+/).length,
        },
      };
    } catch (error) {
      throw new OCRError(
        `AWS Textract OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'AWS_TEXTRACT_ERROR'
      );
    }
  }

  getSupportedLanguages(): string[] {
    return ['en']; // Textract primarily supports English
  }

  getMaxFileSize(): number {
    return 10 * 1024 * 1024; // 10MB
  }
}

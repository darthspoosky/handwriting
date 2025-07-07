import { ComputerVisionClient } from '@azure/cognitiveservices-computervision';
import { ApiKeyCredentials } from '@azure/ms-rest-js';
import { OCRProvider, OCRResult, OCROptions, OCRError } from './base';
import { config } from '@/lib/config';

export class AzureOCR implements OCRProvider {
  name = 'azure-ocr';
  private client: ComputerVisionClient;

  constructor() {
    const credentials = new ApiKeyCredentials({
      inHeader: { 'Ocp-Apim-Subscription-Key': config.ocr.azure.subscriptionKey }
    });
    this.client = new ComputerVisionClient(credentials, config.ocr.azure.endpoint);
  }

  async processImage(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      const result = await this.client.readInStream(imageBuffer);
      const operationId = result.operationLocation?.split('/').pop();

      if (!operationId) {
        throw new Error('Failed to get operation ID from Azure OCR');
      }

      // Poll for results
      let readResult;
      do {
        await new Promise(resolve => setTimeout(resolve, 1000));
        readResult = await this.client.getReadResult(operationId!);
      } while (readResult.status === 'running');

      if (readResult.status !== 'succeeded') {
        throw new Error(`Azure OCR failed with status: ${readResult.status}`);
      }

      // Extract text from results
      const pages = readResult.analyzeResult?.readResults || [];
      const allText = pages
        .flatMap(page => page.lines || [])
        .map(line => line.text)
        .join('\n');

      // Calculate average confidence
      const allWords = pages.flatMap(page =>
        page.lines?.flatMap(line => line.words || []) || []
      );
      const avgConfidence = allWords.length > 0
        ? allWords.reduce((sum, word) => sum + (word.confidence || 0), 0) / allWords.length
        : 0;

      return {
        text: allText,
        confidence: avgConfidence,
        provider: this.name,
        metadata: {
          processingTime: Date.now() - startTime,
          wordCount: allText.split(/\s+/).length,
        },
      };
    } catch (error) {
      throw new OCRError(
        `Azure OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'AZURE_OCR_ERROR'
      );
    }
  }

  getSupportedLanguages(): string[] {
    return ['en', 'hi', 'ar', 'zh-Hans', 'zh-Hant', 'cs', 'da', 'nl', 'fi', 'fr', 'de'];
  }

  getMaxFileSize(): number {
    return 50 * 1024 * 1024; // 50MB
  }
}

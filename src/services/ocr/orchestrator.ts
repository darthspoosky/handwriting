import { OCRProvider, OCRResult, OCROptions, OCRError } from './base';
import { GoogleVisionOCR } from './google-vision';
import { AWSTextractOCR } from './aws-textract';
import { AzureOCR } from './azure-ocr';
import { TesseractOCR } from './tesseract';

export interface OCROrchestatorConfig {
  providers: OCRProvider[];
  fallbackStrategy: 'confidence' | 'speed' | 'cost';
  minimumConfidence: number;
  timeout: number;
}

export class OCROrchestrator {
  private providers: Map<string, OCRProvider> = new Map();
  private config: OCROrchestatorConfig;

  constructor(config?: Partial<OCROrchestatorConfig>) {
    this.config = {
      providers: [],
      fallbackStrategy: 'confidence',
      minimumConfidence: 0.7,
      timeout: 30000,
      ...config,
    };

    // Initialize providers
    this.providers.set('google-vision', new GoogleVisionOCR());
    this.providers.set('aws-textract', new AWSTextractOCR());
    this.providers.set('azure-ocr', new AzureOCR());
    this.providers.set('tesseract', new TesseractOCR());
  }

  async processImage(
    imageBuffer: Buffer,
    options?: OCROptions & { preferredProvider?: string }
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const providers = this.getProviderOrder(options?.preferredProvider);
    const results: OCRResult[] = [];
    const errors: OCRError[] = [];

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        console.log(`Attempting OCR with ${providerName}...`);

        const result = await Promise.race([
          provider.processImage(imageBuffer, options),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.timeout)
          ),
        ]);

        results.push(result);

        // If confidence is above threshold, return immediately
        if (result.confidence >= this.config.minimumConfidence) {
          console.log(`OCR successful with ${providerName} (confidence: ${result.confidence})`);
          return result;
        }

        console.log(`OCR completed with ${providerName} but low confidence: ${result.confidence}`);
      } catch (error) {
        const ocrError = error instanceof OCRError
          ? error
          : new OCRError(
              `${providerName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              providerName
            );
        errors.push(ocrError);
        console.warn(`OCR failed with ${providerName}:`, ocrError.message);
      }
    }

    // If we have results but none meet confidence threshold, return the best one
    if (results.length > 0) {
      const bestResult = results.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      console.log(`Returning best result from ${bestResult.provider} with confidence: ${bestResult.confidence}`);
      return bestResult;
    }

    // If all providers failed, throw the first error
    throw new OCRError(
      `All OCR providers failed. Errors: ${errors.map(e => e.message).join(', ')}`,
      'orchestrator',
      'ALL_PROVIDERS_FAILED'
    );
  }

  private getProviderOrder(preferredProvider?: string): string[] {
    const allProviders = Array.from(this.providers.keys());

    if (preferredProvider && this.providers.has(preferredProvider)) {
      return [preferredProvider, ...allProviders.filter(p => p !== preferredProvider)];
    }

    // Default order based on accuracy and features
    return ['google-vision', 'azure-ocr', 'aws-textract', 'tesseract'];
  }

  async getBestProviderForLanguage(language: string): Promise<string> {
    const languageSupport: Record<string, string[]> = {
      'en': ['google-vision', 'azure-ocr', 'aws-textract', 'tesseract'],
      'hi': ['google-vision', 'azure-ocr', 'tesseract'],
      'ta': ['google-vision', 'tesseract'],
      'te': ['google-vision', 'tesseract'],
      'kn': ['google-vision', 'tesseract'],
      'ml': ['google-vision', 'tesseract'],
    };

    const supportedProviders = languageSupport[language] || languageSupport['en'];
    return supportedProviders[0];
  }

  getProviderStats(): Array<{ name: string; isAvailable: boolean; supportedLanguages: string[] }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      isAvailable: true, // Could add health checks here
      supportedLanguages: provider.getSupportedLanguages(),
    }));
  }
}

import { OCROrchestrator } from './ocr/orchestrator';
import { ImageProcessingService } from './image-processing';
import { ContentAnalyzer } from './ai/content-analyzer';
import { FeedbackGenerator } from './ai/feedback-generator';
import { PrismaClient } from '@prisma/client';
import { uploadToS3, deleteFromS3 } from './storage-service';

const prisma = new PrismaClient();

export interface EvaluationRequest {
  userId: string;
  questionId: string;
  imageBuffer: Buffer;
  fileName: string;
  options?: {
    preferredOCRProvider?: string;
    enhanceImage?: boolean;
    priority?: 'speed' | 'accuracy';
  };
}

export interface EvaluationProgress {
  stage: 'uploading' | 'processing_image' | 'ocr' | 'ai_analysis' | 'generating_feedback' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  estimatedTimeRemaining?: number; // seconds
}

export class EvaluationService {
  private ocrOrchestrator: OCROrchestrator;
  private imageProcessor: ImageProcessingService;
  private contentAnalyzer: ContentAnalyzer;
  private feedbackGenerator: FeedbackGenerator;

  constructor() {
    this.ocrOrchestrator = new OCROrchestrator();
    this.imageProcessor = new ImageProcessingService();
    this.contentAnalyzer = new ContentAnalyzer();
    this.feedbackGenerator = new FeedbackGenerator();
  }

  async startEvaluation(
    request: EvaluationRequest,
    progressCallback?: (progress: EvaluationProgress) => void
  ): Promise<string> {
    const startTime = Date.now();

    // Create evaluation record
    const evaluation = await prisma.evaluation.create({
      data: {
        userId: request.userId,
        questionId: request.questionId,
        originalImageUrl: '', // Will be updated after upload
        status: 'PROCESSING',
      },
    });

    // Start async processing
    this.processEvaluationAsync(evaluation.id, request, progressCallback)
      .catch((error) => {
        console.error(`Evaluation ${evaluation.id} failed:`, error);
        this.handleEvaluationError(evaluation.id, error);
      });

    return evaluation.id;
  }

  private async processEvaluationAsync(
    evaluationId: string,
    request: EvaluationRequest,
    progressCallback?: (progress: EvaluationProgress) => void
  ): Promise<void> {
    const updateProgress = (stage: EvaluationProgress['stage'], progress: number, message: string) => {
      progressCallback?.({ stage, progress, message });
    };

    const startTime = Date.now();

    try {
      // Stage 1: Upload and process image (0-20%)
      updateProgress('uploading', 5, 'Uploading image...');

      const originalImageUrl = await uploadToS3(
        request.imageBuffer,
        `evaluations/${evaluationId}/original-${request.fileName}`
      );

      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { originalImageUrl },
      });

      updateProgress('processing_image', 10, 'Analyzing image quality...');

      const imageQuality = await this.imageProcessor.assessImageQuality(request.imageBuffer);

      // Enhance image if needed or requested
      let processedImageBuffer = request.imageBuffer;
      if (request.options?.enhanceImage || imageQuality.qualityScore < 70) {
        updateProgress('processing_image', 15, 'Enhancing image...');
        processedImageBuffer = await this.imageProcessor.enhanceImage(request.imageBuffer, {
          enhanceContrast: true,
          removeNoise: true,
          sharpenText: true,
          cropWhitespace: true,
        });

        const processedImageUrl = await uploadToS3(
          processedImageBuffer,
          `evaluations/${evaluationId}/processed-${request.fileName}`
        );

        await prisma.evaluation.update({
          where: { id: evaluationId },
          data: {
            processedImageUrl,
            imageMetadata: imageQuality,
          },
        });
      }

      // Stage 2: OCR Processing (20-50%)
      updateProgress('ocr', 25, 'Extracting text from image...');

      const ocrResult = await this.ocrOrchestrator.processImage(
        processedImageBuffer,
        {
          preferredProvider: request.options?.preferredOCRProvider,
          language: 'en', // Could be detected automatically
        }
      );

      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          extractedText: ocrResult.text,
          ocrProvider: ocrResult.provider,
          ocrConfidence: ocrResult.confidence,
          ocrMetadata: ocrResult.metadata,
        },
      });

      updateProgress('ocr', 50, `Text extracted using ${ocrResult.provider} (${Math.round(ocrResult.confidence * 100)}% confidence)`);

      // Get question data
      const question = await prisma.question.findUnique({
        where: { id: request.questionId },
      });

      if (!question) {
        throw new Error('Question not found');
      }

      // Stage 3: AI Analysis (50-80%)
      updateProgress('ai_analysis', 55, 'Analyzing content quality...');

      const contentAnalysis = await this.contentAnalyzer.analyzeContent(ocrResult.text, {
        content: question.content,
        keywords: question.keywords,
        subject: question.subject,
        marks: question.marks || 15,
      });

      updateProgress('ai_analysis', 65, 'Analyzing answer structure...');

      const structureAnalysis = await this.contentAnalyzer.analyzeStructure(ocrResult.text);

      updateProgress('ai_analysis', 75, 'Analyzing handwriting quality...');

      const handwritingAnalysis = this.feedbackGenerator.analyzeHandwriting(
        ocrResult,
        imageQuality
      );

      // Stage 4: Generate Feedback (80-100%)
      updateProgress('generating_feedback', 85, 'Generating personalized feedback...');

      // Get user profile for personalization
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        include: {
          evaluations: {
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            take: 5,
          },
        },
      });

      const userProfile = user ? {
        name: user.name || undefined,
        previousScores: user.evaluations.map(e => e.overallScore).filter(Boolean) as number[],
        weakAreas: [], // Could be derived from previous evaluations
      } : undefined;

      const feedback = await this.feedbackGenerator.generateComprehensiveFeedback(
        contentAnalysis,
        structureAnalysis,
        handwritingAnalysis,
        {
          content: question.content,
          subject: question.subject,
          marks: question.marks || 15,
        },
        userProfile
      );

      updateProgress('generating_feedback', 95, 'Finalizing evaluation...');

      // Save final results
      const processingTime = Date.now() - startTime;

      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          contentScore: feedback.scoreBreakdown.content,
          structureScore: feedback.scoreBreakdown.structure,
          handwritingScore: feedback.scoreBreakdown.handwriting,
          overallScore: feedback.scoreBreakdown.overall,
          strengths: feedback.strengths,
          improvements: feedback.improvements,
          suggestions: feedback.suggestions,
          detailedFeedback: feedback.detailedFeedback,
          status: 'COMPLETED',
          processingTime,
          completedAt: new Date(),
        },
      });

      // Update usage stats
      await this.updateUsageStats(request.userId);

      // Clean up temporary files after 24 hours
      setTimeout(async () => {
        try {
          await deleteFromS3(originalImageUrl);
          if (evaluation.processedImageUrl) {
            await deleteFromS3(evaluation.processedImageUrl);
          }
        } catch (error) {
          console.warn('Failed to clean up files:', error);
        }
      }, 24 * 60 * 60 * 1000); // 24 hours

      updateProgress('completed', 100, 'Evaluation completed successfully!');

    } catch (error) {
      console.error('Evaluation processing failed:', error);
      throw error;
    }
  }

  private async handleEvaluationError(evaluationId: string, error: any): Promise<void> {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'FAILED',
        errorMessage: error.message || 'Unknown error occurred',
      },
    });
  }

  private async updateUsageStats(userId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.usageStats.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        evaluationsCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        date: today,
        evaluationsCount: 1,
      },
    });
  }

  async getEvaluationStatus(evaluationId: string): Promise<any> {
    return await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        question: true,
        user: {
          select: { name: true, email: true },
        },
      },
    });
  }

  async getUserEvaluations(userId: string, limit: number = 10): Promise<any[]> {
    return await prisma.evaluation.findMany({
      where: { userId },
      include: { question: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getEvaluationAnalytics(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const evaluations = await prisma.evaluation.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      totalEvaluations: evaluations.length,
      averageScore: evaluations.reduce((sum, e) => sum + (e.overallScore || 0), 0) / evaluations.length || 0,
      progressTrend: evaluations.map(e => ({
        date: e.createdAt,
        score: e.overallScore,
      })),
      strongestAreas: this.calculateStrongestAreas(evaluations),
      improvementAreas: this.calculateImprovementAreas(evaluations),
    };
  }

  private calculateStrongestAreas(evaluations: any[]): string[] {
    const avgScores = {
      content: evaluations.reduce((sum, e) => sum + (e.contentScore || 0), 0) / evaluations.length || 0,
      structure: evaluations.reduce((sum, e) => sum + (e.structureScore || 0), 0) / evaluations.length || 0,
      handwriting: evaluations.reduce((sum, e) => sum + (e.handwritingScore || 0), 0) / evaluations.length || 0,
    };

    return Object.entries(avgScores)
      .sort(([,a], [,b]) => b - a)
      .map(([area]) => area);
  }

  private calculateImprovementAreas(evaluations: any[]): string[] {
    const avgScores = {
      content: evaluations.reduce((sum, e) => sum + (e.contentScore || 0), 0) / evaluations.length || 0,
      structure: evaluations.reduce((sum, e) => sum + (e.structureScore || 0), 0) / evaluations.length || 0,
      handwriting: evaluations.reduce((sum, e) => sum + (e.handwritingScore || 0), 0) / evaluations.length || 0,
    };

    return Object.entries(avgScores)
      .sort(([,a], [,b]) => a - b)
      .slice(0, 2)
      .map(([area]) => area);
  }
}

import OpenAI from 'openai';
import { ContentAnalysisResult, StructureAnalysisResult } from './content-analyzer';
import { config } from '@/lib/config';

export interface GeneratedFeedback {
  overallScore: number; // 0-100
  grade: string; // A+, A, B+, B, C+, C, D

  strengths: string[];
  improvements: string[];
  suggestions: string[];

  detailedFeedback: string;
  personalizedMessage: string;

  scoreBreakdown: {
    content: number;
    structure: number;
    handwriting: number;
    overall: number;
  };

  nextSteps: string[];
  resourceRecommendations: string[];
}

export interface HandwritingAnalysis {
  legibilityScore: number; // 0-100
  consistencyScore: number; // 0-100
  neatnessScore: number; // 0-100
  speedEstimate: 'slow' | 'moderate' | 'fast';

  handwritingStrengths: string[];
  handwritingIssues: string[];
  improvementTips: string[];

  overallHandwritingScore: number; // 0-100
}

export class FeedbackGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.ai.openaiApiKey,
    });
  }

  async generateComprehensiveFeedback(
    contentAnalysis: ContentAnalysisResult,
    structureAnalysis: StructureAnalysisResult,
    handwritingAnalysis: HandwritingAnalysis,
    questionData: {
      content: string;
      subject: string;
      marks: number;
    },
    userProfile?: {
      name?: string;
      previousScores?: number[];
      weakAreas?: string[];
    }
  ): Promise<GeneratedFeedback> {
    const prompt = this.buildFeedbackPrompt(
      contentAnalysis,
      structureAnalysis,
      handwritingAnalysis,
      questionData,
      userProfile
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a senior UPSC examiner and mentor with 20+ years of experience. You provide constructive, encouraging, and actionable feedback that helps students improve. Your feedback is specific, balanced, and motivational.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as GeneratedFeedback;
    } catch (error) {
      console.error('Feedback generation failed:', error);
      return this.getDefaultFeedback(contentAnalysis, structureAnalysis, handwritingAnalysis);
    }
  }

  analyzeHandwriting(
    ocrResult: {
      confidence: number;
      metadata: {
        boundingBoxes?: Array<{
          text: string;
          confidence: number;
          box: { x: number; y: number; width: number; height: number };
        }>;
      };
    },
    imageQuality: {
      qualityScore: number;
      sharpness: number;
      contrast: number;
    }
  ): HandwritingAnalysis {
    const { confidence, metadata } = ocrResult;
    const { qualityScore, sharpness, contrast } = imageQuality;

    // Calculate legibility based on OCR confidence
    const legibilityScore = Math.round(confidence * 100);

    // Calculate consistency based on confidence variance
    let consistencyScore = 75; // Default
    if (metadata.boundingBoxes && metadata.boundingBoxes.length > 5) {
      const confidences = metadata.boundingBoxes.map(box => box.confidence);
      const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
      const stdDev = Math.sqrt(variance);
      consistencyScore = Math.max(0, Math.round((1 - stdDev) * 100));
    }

    // Calculate neatness based on image quality
    const neatnessScore = Math.round((qualityScore + sharpness + contrast) / 3);

    // Estimate writing speed based on character density
    let speedEstimate: 'slow' | 'moderate' | 'fast' = 'moderate';
    if (metadata.boundingBoxes && metadata.boundingBoxes.length > 0) {
      const totalArea = metadata.boundingBoxes.reduce((sum, box) =>
        sum + (box.box.width * box.box.height), 0);
      const averageCharSize = totalArea / metadata.boundingBoxes.length;

      if (averageCharSize > 1000) speedEstimate = 'slow';
      else if (averageCharSize < 300) speedEstimate = 'fast';
    }

    // Generate feedback
    const handwritingStrengths: string[] = [];
    const handwritingIssues: string[] = [];
    const improvementTips: string[] = [];

    if (legibilityScore >= 80) {
      handwritingStrengths.push('Excellent legibility - text is very clear to read');
    } else if (legibilityScore >= 60) {
      handwritingStrengths.push('Good legibility - most text is readable');
    } else {
      handwritingIssues.push('Legibility needs improvement - some text is difficult to read');
      improvementTips.push('Practice writing slowly and focus on letter formation');
    }

    if (consistencyScore >= 80) {
      handwritingStrengths.push('Consistent handwriting style throughout');
    } else if (consistencyScore < 60) {
      handwritingIssues.push('Handwriting consistency varies across the answer');
      improvementTips.push('Practice maintaining consistent letter size and spacing');
    }

    if (neatnessScore >= 75) {
      handwritingStrengths.push('Neat and well-organized presentation');
    } else if (neatnessScore < 50) {
      handwritingIssues.push('Presentation could be neater');
      improvementTips.push('Use proper margins and maintain line spacing');
    }

    if (speedEstimate === 'slow') {
      improvementTips.push('Practice writing faster while maintaining legibility');
    } else if (speedEstimate === 'fast') {
      improvementTips.push('Slow down slightly to improve clarity');
    }

    const overallHandwritingScore = Math.round(
      (legibilityScore * 0.5) + (consistencyScore * 0.3) + (neatnessScore * 0.2)
    );

    return {
      legibilityScore,
      consistencyScore,
      neatnessScore,
      speedEstimate,
      handwritingStrengths,
      handwritingIssues,
      improvementTips,
      overallHandwritingScore,
    };
  }

  private buildFeedbackPrompt(
    contentAnalysis: ContentAnalysisResult,
    structureAnalysis: StructureAnalysisResult,
    handwritingAnalysis: HandwritingAnalysis,
    questionData: {
      content: string;
      subject: string;
      marks: number;
    },
    userProfile?: {
      name?: string;
      previousScores?: number[];
      weakAreas?: string[];
    }
  ): string {
    const userName = userProfile?.name || 'Student';
    const improvementContext = userProfile?.weakAreas?.length
      ? `Previous weak areas: ${userProfile.weakAreas.join(', ')}`
      : '';

    return `
Generate comprehensive, encouraging feedback for this UPSC Mains answer evaluation.

**Question Details:**
- Question: ${questionData.content}
- Subject: ${questionData.subject}
- Marks: ${questionData.marks}

**Student Profile:**
- Name: ${userName}
${improvementContext}

**Analysis Results:**
- Content Score: ${contentAnalysis.overallContentScore}/100
- Structure Score: ${structureAnalysis.overallStructureScore}/100
- Handwriting Score: ${handwritingAnalysis.overallHandwritingScore}/100

**Detailed Metrics:**
Content: Relevance(${contentAnalysis.relevanceScore}), Depth(${contentAnalysis.depthScore}), Accuracy(${contentAnalysis.accuracyScore})
Structure: Intro(${structureAnalysis.introductionScore}), Body(${structureAnalysis.bodyScore}), Conclusion(${structureAnalysis.conclusionScore})
Handwriting: Legibility(${handwritingAnalysis.legibilityScore}), Consistency(${handwritingAnalysis.consistencyScore})

**Identified Strengths:** ${[...contentAnalysis.strengthsIdentified, ...structureAnalysis.structuralStrengths, ...handwritingAnalysis.handwritingStrengths].join(', ')}

**Areas for Improvement:** ${[...contentAnalysis.improvementAreas, ...structureAnalysis.structuralWeaknesses, ...handwritingAnalysis.handwritingIssues].join(', ')}

Provide response in this exact JSON format:
{
  "overallScore": number (0-100, weighted: content 50%, structure 30%, handwriting 20%),
  "grade": string ("A+", "A", "B+", "B", "C+", "C", "D"),

  "strengths": [3-5 specific strengths from the analysis],
  "improvements": [3-5 specific areas to improve],
  "suggestions": [3-5 actionable suggestions for improvement],

  "detailedFeedback": "2-3 paragraph comprehensive feedback that's encouraging yet constructive",
  "personalizedMessage": "1-2 sentences personalized to the student",

  "scoreBreakdown": {
    "content": ${contentAnalysis.overallContentScore},
    "structure": ${structureAnalysis.overallStructureScore},
    "handwriting": ${handwritingAnalysis.overallHandwritingScore},
    "overall": calculated_overall_score
  },

  "nextSteps": [3-4 immediate action items for improvement],
  "resourceRecommendations": [2-3 study resources or practice methods]
}

Make the feedback encouraging, specific, and actionable. Focus on growth mindset and concrete steps for improvement.
    `;
  }

  private getDefaultFeedback(
    contentAnalysis: ContentAnalysisResult,
    structureAnalysis: StructureAnalysisResult,
    handwritingAnalysis: HandwritingAnalysis
  ): GeneratedFeedback {
    const overallScore = Math.round(
      (contentAnalysis.overallContentScore * 0.5) +
      (structureAnalysis.overallStructureScore * 0.3) +
      (handwritingAnalysis.overallHandwritingScore * 0.2)
    );

    const grade = this.calculateGrade(overallScore);

    return {
      overallScore,
      grade,

      strengths: [
        'Shows understanding of the topic',
        'Attempts to address the question',
        'Organized presentation',
      ],

      improvements: [
        'Could provide more detailed analysis',
        'Add more relevant examples',
        'Improve conclusion strength',
      ],

      suggestions: [
        'Practice writing more comprehensive answers',
        'Include current examples and case studies',
        'Work on time management for detailed responses',
      ],

      detailedFeedback: `Your answer demonstrates a basic understanding of the topic and shows effort in addressing the question. While you've covered some key points, there's room for improvement in depth of analysis and use of relevant examples. Focus on developing your arguments more comprehensively and ensure your conclusion ties together your main points effectively.`,

      personalizedMessage: 'Keep practicing! Your consistent effort will lead to significant improvement.',

      scoreBreakdown: {
        content: contentAnalysis.overallContentScore,
        structure: structureAnalysis.overallStructureScore,
        handwriting: handwritingAnalysis.overallHandwritingScore,
        overall: overallScore,
      },

      nextSteps: [
        'Practice answer writing daily',
        'Read model answers for reference',
        'Focus on time-bound practice',
        'Improve handwriting consistency',
      ],

      resourceRecommendations: [
        'Study current affairs from reliable sources',
        'Practice previous year questions',
        'Join peer discussion groups',
      ],
    };
  }

  private calculateGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C+';
    if (score >= 40) return 'C';
    return 'D';
  }
}

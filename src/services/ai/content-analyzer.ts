import { encode } from 'gpt-3-encoder';
import OpenAI from 'openai';
import { config } from '@/lib/config';

export interface ContentAnalysisResult {
  relevanceScore: number; // 0-100
  depthScore: number; // 0-100
  accuracyScore: number; // 0-100
  keywordCoverage: number; // 0-100

  coveredKeywords: string[];
  missedKeywords: string[];
  additionalConcepts: string[];

  strengthsIdentified: string[];
  improvementAreas: string[];
  factualErrors: string[];

  overallContentScore: number; // 0-100
}

export interface StructureAnalysisResult {
  introductionScore: number; // 0-100
  bodyScore: number; // 0-100
  conclusionScore: number; // 0-100
  logicalFlowScore: number; // 0-100
  coherenceScore: number; // 0-100

  paragraphCount: number;
  averageParagraphLength: number;
  transitionQuality: number; // 0-100

  structuralStrengths: string[];
  structuralWeaknesses: string[];

  overallStructureScore: number; // 0-100
}

export class ContentAnalyzer {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.ai.openaiApiKey,
    });
  }

  async analyzeContent(
    extractedText: string,
    questionData: {
      content: string;
      keywords: string[];
      subject: string;
      marks: number;
    }
  ): Promise<ContentAnalysisResult> {
    const prompt = this.buildContentAnalysisPrompt(extractedText, questionData);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert UPSC examiner with 15+ years of experience evaluating Mains answers. Provide detailed, constructive analysis.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as ContentAnalysisResult;
    } catch (error) {
      console.error('Content analysis failed:', error);
      // Return default analysis
      return this.getDefaultContentAnalysis(extractedText, questionData.keywords);
    }
  }

  async analyzeStructure(extractedText: string): Promise<StructureAnalysisResult> {
    const prompt = this.buildStructureAnalysisPrompt(extractedText);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in academic writing structure and UPSC answer evaluation. Analyze the structural quality of the given answer.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as StructureAnalysisResult;
    } catch (error) {
      console.error('Structure analysis failed:', error);
      return this.getDefaultStructureAnalysis(extractedText);
    }
  }

  private buildContentAnalysisPrompt(
    text: string,
    questionData: {
      content: string;
      keywords: string[];
      subject: string;
      marks: number;
    }
  ): string {
    return `
Analyze this UPSC Mains answer and provide detailed evaluation in JSON format.

**Question:** ${questionData.content}
**Subject:** ${questionData.subject}
**Marks:** ${questionData.marks}
**Expected Keywords:** ${questionData.keywords.join(', ')}

**Student Answer:**
${text}

Provide analysis in this exact JSON format:
{
  "relevanceScore": number (0-100, how well answer addresses the question),
  "depthScore": number (0-100, depth of analysis and understanding),
  "accuracyScore": number (0-100, factual accuracy),
  "keywordCoverage": number (0-100, percentage of expected keywords covered),

  "coveredKeywords": ["keyword1", "keyword2"],
  "missedKeywords": ["keyword3", "keyword4"],
  "additionalConcepts": ["concept1", "concept2"],

  "strengthsIdentified": ["strength1", "strength2"],
  "improvementAreas": ["improvement1", "improvement2"],
  "factualErrors": ["error1", "error2"],

  "overallContentScore": number (0-100, weighted average of above scores)
}

Focus on UPSC-specific evaluation criteria: multi-dimensional analysis, use of examples, critical thinking, and balanced arguments.
    `;
  }

  private buildStructureAnalysisPrompt(text: string): string {
    return `
Analyze the structure and organization of this UPSC Mains answer. Provide detailed evaluation in JSON format.

**Answer Text:**
${text}

Evaluate based on UPSC standards and provide analysis in this exact JSON format:
{
  "introductionScore": number (0-100, hook, context, thesis clarity),
  "bodyScore": number (0-100, logical development, paragraph organization),
  "conclusionScore": number (0-100, synthesis, forward-looking statements),
  "logicalFlowScore": number (0-100, smooth transitions between ideas),
  "coherenceScore": number (0-100, overall coherence and unity),

  "paragraphCount": number,
  "averageParagraphLength": number (words per paragraph),
  "transitionQuality": number (0-100, quality of transitions between paragraphs),

  "structuralStrengths": ["strength1", "strength2"],
  "structuralWeaknesses": ["weakness1", "weakness2"],

  "overallStructureScore": number (0-100, weighted average considering UPSC expectations)
}

Consider UPSC-specific structural requirements: clear introduction with context, well-developed body with multiple dimensions, and conclusive ending with way forward.
    `;
  }

  private getDefaultContentAnalysis(
    text: string,
    keywords: string[]
  ): ContentAnalysisResult {
    // Basic keyword matching fallback
    const textLower = text.toLowerCase();
    const coveredKeywords = keywords.filter(keyword =>
      textLower.includes(keyword.toLowerCase())
    );
    const keywordCoverage = (coveredKeywords.length / keywords.length) * 100;

    return {
      relevanceScore: Math.min(80, Math.max(40, keywordCoverage)),
      depthScore: Math.min(70, text.length / 50), // Rough depth based on length
      accuracyScore: 75, // Default moderate score
      keywordCoverage,

      coveredKeywords,
      missedKeywords: keywords.filter(k => !coveredKeywords.includes(k)),
      additionalConcepts: [],

      strengthsIdentified: ['Attempts to address the question'],
      improvementAreas: ['Could provide more detailed analysis'],
      factualErrors: [],

      overallContentScore: Math.round((keywordCoverage + 75 + 70) / 3),
    };
  }

  private getDefaultStructureAnalysis(text: string): StructureAnalysisResult {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const wordCount = text.split(/\s+/).length;

    return {
      introductionScore: paragraphs.length > 0 ? 70 : 40,
      bodyScore: paragraphs.length > 2 ? 75 : 50,
      conclusionScore: paragraphs.length > 1 ? 70 : 40,
      logicalFlowScore: 65,
      coherenceScore: 70,

      paragraphCount: paragraphs.length,
      averageParagraphLength: Math.round(wordCount / Math.max(1, paragraphs.length)),
      transitionQuality: 60,

      structuralStrengths: ['Organized in paragraphs'],
      structuralWeaknesses: paragraphs.length < 3 ? ['Could benefit from better paragraph organization'] : [],

      overallStructureScore: 68,
    };
  }

  // Helper method to calculate token count for cost estimation
  getTokenCount(text: string): number {
    return encode(text).length;
  }
}

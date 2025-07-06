import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { EvaluationService } from '@/services/evaluation-service';
import { RateLimitService } from '@/services/rate-limit-service';

const evaluationService = new EvaluationService();
const rateLimitService = new RateLimitService();

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting check
    const isAllowed = await rateLimitService.checkLimit(
      session.user.id,
      'evaluation',
      { maxRequests: 20, windowMs: 3600000 } // 20 evaluations per hour
    );

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const questionId = formData.get('questionId') as string;
    const preferredProvider = formData.get('preferredProvider') as string | null;

    if (!imageFile || !questionId) {
      return NextResponse.json(
        { error: 'Missing required fields: image and questionId' },
        { status: 400 }
      );
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and PDF are supported.' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

    // Start evaluation
    const evaluationId = await evaluationService.startEvaluation({
      userId: session.user.id,
      questionId,
      imageBuffer,
      fileName: imageFile.name,
      options: {
        preferredOCRProvider: preferredProvider || undefined,
        enhanceImage: true,
        priority: 'accuracy',
      },
    });

    return NextResponse.json({ evaluationId });

  } catch (error) {
    console.error('Evaluation start error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

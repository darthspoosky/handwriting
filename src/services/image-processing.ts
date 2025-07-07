import sharp from 'sharp';

export interface ImageQualityMetrics {
  resolution: { width: number; height: number };
  fileSize: number;
  format: string;
  hasColor: boolean;
  brightness: number;
  contrast: number;
  sharpness: number;
  qualityScore: number; // 0-100
  recommendations: string[];
}

export interface ImageEnhancementOptions {
  enhanceContrast?: boolean;
  removeNoise?: boolean;
  sharpenText?: boolean;
  deskew?: boolean;
  cropWhitespace?: boolean;
}

export class ImageProcessingService {
  async assessImageQuality(imageBuffer: Buffer): Promise<ImageQualityMetrics> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const stats = await image.stats();

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const fileSize = imageBuffer.length;

    // Calculate quality metrics
    const resolution = width * height;
    const brightness = this.calculateBrightness(stats);
    const contrast = this.calculateContrast(stats);
    const sharpness = await this.calculateSharpness(image);

    // Generate quality score
    const qualityScore = this.calculateQualityScore({
      resolution,
      brightness,
      contrast,
      sharpness,
      fileSize,
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      width,
      height,
      brightness,
      contrast,
      sharpness,
      qualityScore,
    });

    return {
      resolution: { width, height },
      fileSize,
      format: metadata.format || 'unknown',
      hasColor: metadata.channels ? metadata.channels > 1 : false,
      brightness,
      contrast,
      sharpness,
      qualityScore,
      recommendations,
    };
  }

  async enhanceImage(
    imageBuffer: Buffer,
    options: ImageEnhancementOptions = {}
  ): Promise<Buffer> {
    let image = sharp(imageBuffer);

    // Convert to grayscale for better OCR performance
    image = image.grayscale();

    // Enhance contrast if requested
    if (options.enhanceContrast) {
      image = image.linear(1.2, -(128 * 1.2) + 128); // Increase contrast
    }

    // Remove noise if requested
    if (options.removeNoise) {
      image = image.blur(0.3); // Light blur to reduce noise
    }

    // Sharpen text if requested
    if (options.sharpenText) {
      image = image.sharpen({ sigma: 1, flat: 1, jagged: 2 });
    }

    // Crop whitespace if requested
    if (options.cropWhitespace) {
      image = image.trim({ threshold: 10 });
    }

    // Normalize the image
    image = image.normalize();

    return await image.jpeg({ quality: 95 }).toBuffer();
  }

  async compressImage(imageBuffer: Buffer, maxSizeKB: number = 1024): Promise<Buffer> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    let quality = 95;
    let width = metadata.width;
    let height = metadata.height;

    // Calculate compression needed
    const currentSizeKB = imageBuffer.length / 1024;

    if (currentSizeKB <= maxSizeKB) {
      return imageBuffer; // No compression needed
    }

    // Reduce dimensions if needed
    const compressionRatio = maxSizeKB / currentSizeKB;
    if (compressionRatio < 0.5) {
      const scaleFactor = Math.sqrt(compressionRatio);
      width = Math.floor(width * scaleFactor);
      height = Math.floor(height * scaleFactor);
    }

    // Adjust quality
    quality = Math.max(70, Math.floor(95 * compressionRatio));

    return await image
      .resize(width, height, { kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality })
      .toBuffer();
  }

  private calculateBrightness(stats: sharp.Stats): number {
    const avgBrightness = stats.channels.reduce((sum, channel) =>
      sum + channel.mean, 0) / stats.channels.length;
    return (avgBrightness / 255) * 100; // Convert to percentage
  }

  private calculateContrast(stats: sharp.Stats): number {
    const avgStdDev = stats.channels.reduce((sum, channel) =>
      sum + channel.stdev, 0) / stats.channels.length;
    return Math.min(100, (avgStdDev / 64) * 100); // Normalize to percentage
  }

  private async calculateSharpness(image: sharp.Sharp): Promise<number> {
    try {
      // Apply Laplacian filter to detect edges (sharpness indicator)
      const edgeBuffer = await image
        .clone()
        .grayscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        })
        .raw()
        .toBuffer();

      // Calculate variance of edge detection result
      const pixels = new Uint8Array(edgeBuffer);
      const mean = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
      const variance = pixels.reduce((sum, pixel) => sum + Math.pow(pixel - mean, 2), 0) / pixels.length;

      return Math.min(100, variance / 1000); // Normalize to percentage
    } catch (error) {
      console.warn('Sharpness calculation failed:', error);
      return 50; // Default moderate sharpness
    }
  }

  private calculateQualityScore(metrics: {
    resolution: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    fileSize: number;
  }): number {
    const { resolution, brightness, contrast, sharpness } = metrics;

    // Resolution score (prefer images > 1MP)
    const resolutionScore = Math.min(100, Math.sqrt(resolution / 1000000) * 100);

    // Brightness score (prefer 20-80% brightness)
    const brightnessScore = brightness >= 20 && brightness <= 80 ? 100 :
      Math.max(0, 100 - Math.abs(brightness - 50) * 2);

    // Contrast score (prefer higher contrast)
    const contrastScore = Math.min(100, contrast * 2);

    // Sharpness score
    const sharpnessScore = Math.min(100, sharpness * 2);

    // Weighted average
    return Math.round(
      resolutionScore * 0.3 +
      brightnessScore * 0.25 +
      contrastScore * 0.25 +
      sharpnessScore * 0.2
    );
  }

  private generateRecommendations(metrics: {
    width: number;
    height: number;
    brightness: number;
    contrast: number;
    sharpness: number;
    qualityScore: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.width < 1200 || metrics.height < 800) {
      recommendations.push('Capture image at higher resolution for better text recognition');
    }

    if (metrics.brightness < 20) {
      recommendations.push('Increase lighting - image appears too dark');
    } else if (metrics.brightness > 80) {
      recommendations.push('Reduce lighting or exposure - image appears overexposed');
    }

    if (metrics.contrast < 30) {
      recommendations.push('Improve contrast between text and background');
    }

    if (metrics.sharpness < 30) {
      recommendations.push('Ensure image is in focus and avoid camera shake');
    }

    if (metrics.qualityScore < 60) {
      recommendations.push('Consider retaking the photo with better lighting and focus');
    }

    return recommendations;
  }
}

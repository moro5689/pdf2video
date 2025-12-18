
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Handle ES module interoperability
const pdfjs: any = (pdfjsLib as any).default || pdfjsLib;

// Use local pdf.js worker bundle via Vite's ?url import (no CDN dependency)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

/**
 * Removes watermark from the canvas context based on requirements:
 * Bottom right, 15% width, 3% height.
 * Samples color from 5px to the left of the start x.
 */
const removeWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const regionWidth = width * 0.15;
  const regionHeight = height * 0.03;
  const startX = width * 0.85;
  const startY = height * 0.97;

  // Sampling point: 5px left of the region start, vertically centered in the region
  const sampleX = Math.max(0, startX - 5);
  const sampleY = Math.min(height - 1, startY + (regionHeight / 2));

  try {
    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
    // pixel is [r, g, b, a]
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    
    // Fill the region
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(startX, startY, regionWidth, regionHeight);
  } catch (e) {
    console.warn("Could not sample color, falling back to white", e);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(startX, startY, regionWidth, regionHeight);
  }
};

export const convertPdfToImages = async (file: File): Promise<Blob[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const blobs: Blob[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High quality for video

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not get canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    // Apply Watermark Removal Logic
    removeWatermark(context, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });

    if (blob) {
      blobs.push(blob);
    }
  }

  return blobs;
};

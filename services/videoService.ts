
import { Slide } from '../types.ts';

export const generateVideo = async (
  slides: Slide[],
  onProgress: (msg: string) => void
): Promise<Blob> => {

  const canvas = document.createElement('canvas');
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const FPS = 30;
  const BITRATE = 8_000_000; // 8 Mbps

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('No canvas context');

  // MIME type detection
  let mimeType = 'video/webm; codecs=vp9';
  const AnyMediaRecorder = (window as any).MediaRecorder;
  if (AnyMediaRecorder?.isTypeSupported?.('video/mp4')) {
    mimeType = 'video/mp4';
  } else if (AnyMediaRecorder?.isTypeSupported?.('video/webm; codecs=h264')) {
    mimeType = 'video/webm; codecs=h264';
  }

  // Audio Context
  const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const dest = audioCtx.createMediaStreamDestination();

  // Capture stream
  const canvasStream = (canvas as any).captureStream(FPS);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const recorder = new AnyMediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: BITRATE,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e: any) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  // Helpers
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const decodeAudio = async (blob: Blob): Promise<AudioBuffer> => {
    const arrayBuffer = await blob.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  };

  // Start recording
  recorder.start();

  // Draw black initial frame
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // We process slides sequentially in real-time
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    onProgress(`動画生成中... ${i + 1}/${slides.length}`);

    if (!slide.audioBlob) continue;

    const img = await loadImage(slide.imageUrl);
    const audioBuffer = await decodeAudio(slide.audioBlob);
    const duration = audioBuffer.duration;

    // Play audio
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);
    source.start(audioCtx.currentTime);

    // Draw Loop for the duration of the audio
    const startTime = audioCtx.currentTime;
    const endTime = startTime + duration;

    await new Promise<void>((resolve) => {
      const draw = () => {
        const now = audioCtx.currentTime;

        if (now >= endTime) {
          resolve();
          return;
        }

        // Draw background
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Calculate aspect ratio fit
        const scale = Math.min(WIDTH / img.width, HEIGHT / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (WIDTH - drawW) / 2;
        const y = (HEIGHT - drawH) / 2;

        ctx.drawImage(img, x, y, drawW, drawH);

        window.requestAnimationFrame(draw);
      };
      draw();
    });
  }

  // Small buffer at end
  await new Promise(r => setTimeout(r, 500));

  // Stop recording
  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      
      // Cleanup
      audioCtx.close();
      combinedStream.getTracks().forEach((t: any) => t.stop());
      canvasStream.getTracks().forEach((t: any) => t.stop());
      
      resolve(blob);
    };
    recorder.stop();
  });
};

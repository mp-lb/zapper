import { bayer8 } from "./bayer8";

type Options = {
  bias: number;
  colorLevels: number;
  intensity: number;
  pixelSize: number;
};

export const applyBayerDither = (
  source: ImageData,
  { bias, colorLevels, intensity, pixelSize }: Options,
) => {
  const output = new ImageData(source.width, source.height);
  const inputData = source.data;
  const outputData = output.data;
  const levels = Math.max(2, Math.round(colorLevels));
  const step = 255 / (levels - 1);
  const resolvedPixelSize = Math.max(1, Math.round(pixelSize));
  const mix = clampUnit(intensity);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width + x) * 4;
      const alpha = inputData[index + 3];

      if (alpha === 0) {
        continue;
      }

      const luminance =
        0.299 * inputData[index] +
        0.587 * inputData[index + 1] +
        0.114 * inputData[index + 2];

      const cellX = Math.floor(x / resolvedPixelSize) % 8;
      const cellY = Math.floor(y / resolvedPixelSize) % 8;
      const threshold = (bayer8[cellY * 8 + cellX] - bias) * step;
      const quantized = quantize(luminance + threshold, step);
      const value = Math.round(luminance + (quantized - luminance) * mix);

      outputData[index] = value;
      outputData[index + 1] = value;
      outputData[index + 2] = value;
      outputData[index + 3] = alpha;
    }
  }

  return output;
};

const quantize = (value: number, step: number) =>
  Math.round(clamp(value) / step) * step;

const clamp = (value: number) => Math.max(0, Math.min(255, value));

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

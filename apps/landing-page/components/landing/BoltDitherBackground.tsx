"use client";

import { useEffect, useRef, useState } from "react";

import { applyBayerDither } from "./dither/applyBayerDither";

type BoltDitherConfig = {
  bendInset: number;
  brightness: number;
  colorLevels: number;
  ditherBias: number;
  ditherIntensity: number;
  glow: number;
  lineWidth: number;
  lowerBand: number;
  scale: number;
  showDither: boolean;
  upperBand: number;
  pixelSize: number;
};

const defaultConfig: BoltDitherConfig = {
  bendInset: 0.28,
  brightness: 1,
  colorLevels: 2,
  ditherBias: 0.5,
  ditherIntensity: 1,
  glow: 0.16,
  lineWidth: 0.05,
  lowerBand: 0.7,
  pixelSize: 2,
  scale: 1,
  showDither: true,
  upperBand: 0.3,
};

export const BoltDitherBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState(defaultConfig);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState(false);
  const showInspector = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!showInspector) {
      return;
    }

    const media = window.matchMedia("(max-width: 639px)");
    const syncInspectorState = () => setIsInspectorMinimized(media.matches);

    syncInspectorState();
    media.addEventListener("change", syncInspectorState);

    return () => media.removeEventListener("change", syncInspectorState);
  }, [showInspector]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let frame = 0;

    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        renderCanvas(canvas, config);
      });
    };

    const observer = new ResizeObserver(draw);

    observer.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [config]);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <canvas className="block h-full w-full" ref={canvasRef} />
      </div>

      {showInspector ? (
        <DitherInspector
          config={config}
          isMinimized={isInspectorMinimized}
          setIsMinimized={setIsInspectorMinimized}
          updateConfig={(partial) =>
            setConfig((current) => ({ ...current, ...partial }))
          }
        />
      ) : null}
    </>
  );
};

type DitherInspectorProps = {
  config: BoltDitherConfig;
  isMinimized: boolean;
  setIsMinimized: (value: boolean) => void;
  updateConfig: (partial: Partial<BoltDitherConfig>) => void;
};

const DitherInspector = ({
  config,
  isMinimized,
  setIsMinimized,
  updateConfig,
}: DitherInspectorProps) => {
  if (isMinimized) {
    return (
      <button
        type="button"
        aria-label="Open bolt inspector"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-30 inline-flex h-9 items-center border border-white/80 bg-black px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72 transition-colors hover:text-white"
      >
        FX
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-30 w-[min(280px,calc(100vw-1rem))] max-h-[calc(100svh-1rem)] overflow-y-auto border border-white/80 bg-black/92 p-3 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/20 pb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/50">
            Local Inspector
          </p>
          <h2 className="mt-1 text-sm font-bold uppercase tracking-[0.16em]">
            Bolt + Dither
          </h2>
        </div>

        <button
          type="button"
          aria-label="Minimize bolt inspector"
          onClick={() => setIsMinimized(true)}
          className="inline-flex h-8 min-w-8 items-center justify-center border border-white/50 px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white/72 transition-colors hover:text-white"
        >
          Hide
        </button>
      </div>

      <div className="space-y-4">
        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/50">
            Bolt
          </div>

          <InspectorSlider
            label="Scale"
            max={1.6}
            min={0.7}
            step={0.01}
            value={config.scale}
            onChange={(value) => updateConfig({ scale: value })}
          />
          <InspectorSlider
            label="Width"
            max={0.11}
            min={0.015}
            step={0.001}
            value={config.lineWidth}
            onChange={(value) => updateConfig({ lineWidth: value })}
          />
          <InspectorSlider
            label="Glow"
            max={0.32}
            min={0.03}
            step={0.005}
            value={config.glow}
            onChange={(value) => updateConfig({ glow: value })}
          />
          <InspectorSlider
            label="Bright"
            max={1.6}
            min={0.2}
            step={0.01}
            value={config.brightness}
            onChange={(value) => updateConfig({ brightness: value })}
          />
          <InspectorSlider
            label="Upper Y"
            max={0.48}
            min={0.12}
            step={0.01}
            value={config.upperBand}
            onChange={(value) => updateConfig({ upperBand: value })}
          />
          <InspectorSlider
            label="Lower Y"
            max={0.88}
            min={0.52}
            step={0.01}
            value={config.lowerBand}
            onChange={(value) => updateConfig({ lowerBand: value })}
          />
          <InspectorSlider
            label="Bend"
            max={0.42}
            min={0.16}
            step={0.01}
            value={config.bendInset}
            onChange={(value) => updateConfig({ bendInset: value })}
          />
        </section>

        <section className="space-y-2 border-t border-white/20 pt-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/50">
            Dither
          </div>

          <InspectorToggle
            checked={config.showDither}
            label="Enabled"
            onChange={(checked) => updateConfig({ showDither: checked })}
          />
          <InspectorSlider
            label="Pixel"
            max={10}
            min={1}
            step={1}
            value={config.pixelSize}
            onChange={(value) => updateConfig({ pixelSize: value })}
          />
          <InspectorSlider
            label="Amount"
            max={1}
            min={0}
            step={0.01}
            value={config.ditherIntensity}
            onChange={(value) => updateConfig({ ditherIntensity: value })}
          />
          <InspectorSlider
            label="Bias"
            max={1}
            min={0}
            step={0.01}
            value={config.ditherBias}
            onChange={(value) => updateConfig({ ditherBias: value })}
          />
          <InspectorSlider
            label="Levels"
            max={5}
            min={2}
            step={1}
            value={config.colorLevels}
            onChange={(value) => updateConfig({ colorLevels: value })}
          />
        </section>
      </div>
    </aside>
  );
};

type InspectorSliderProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
};

const InspectorSlider = ({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: InspectorSliderProps) => (
  <label className="grid gap-1">
    <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/62">
      <span>{label}</span>
      <span className="text-white/82">{formatValue(value, step)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-4 w-full accent-white"
    />
  </label>
);

type InspectorToggleProps = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

const InspectorToggle = ({
  checked,
  label,
  onChange,
}: InspectorToggleProps) => (
  <label className="flex items-center justify-between gap-3 border border-white/20 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-white/62">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-3.5 w-3.5 accent-white"
    />
  </label>
);

const formatValue = (value: number, step: number) =>
  step >= 1 ? String(Math.round(value)) : value.toFixed(step < 0.01 ? 3 : 2);

const renderCanvas = (canvas: HTMLCanvasElement, config: BoltDitherConfig) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return;
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  drawBoltSource(context, width, height, config);

  if (!config.showDither) {
    return;
  }

  const source = context.getImageData(0, 0, width, height);
  const dithered = applyBayerDither(source, {
    bias: config.ditherBias,
    colorLevels: config.colorLevels,
    intensity: config.ditherIntensity,
    pixelSize: config.pixelSize * dpr,
  });

  context.putImageData(dithered, 0, 0);
};

const drawBoltSource = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: BoltDitherConfig,
) => {
  const unit = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const outerWidth = Math.max(1, config.lineWidth * unit);
  const glowSize = Math.max(1, config.glow * unit);
  const points = [
    [-0.08 * width, height * config.lowerBand],
    [width * config.bendInset, height * config.upperBand],
    [width * (1 - config.bendInset), height * config.lowerBand],
    [1.08 * width, height * config.upperBand],
  ].map(([x, y]) => [
    centerX + (x - centerX) * config.scale,
    centerY + (y - centerY) * config.scale,
  ]) as [number, number][];

  const outerGradient = createBoltGradient(context, width, height, 0.14);
  const middleGradient = createBoltGradient(context, width, height, 0.34);
  const innerGradient = createBoltGradient(context, width, height, 0.9);

  drawBoltStroke(context, points, {
    brightness: config.brightness * 0.22,
    shadowBlur: glowSize * 1.5,
    strokeStyle: outerGradient,
    width: outerWidth + glowSize * 1.25,
  });

  drawBoltStroke(context, points, {
    brightness: config.brightness * 0.42,
    shadowBlur: glowSize * 0.9,
    strokeStyle: middleGradient,
    width: outerWidth + glowSize * 0.45,
  });

  drawBoltStroke(context, points, {
    brightness: config.brightness * 0.9,
    shadowBlur: glowSize * 0.45,
    strokeStyle: innerGradient,
    width: outerWidth,
  });

  drawBoltStroke(context, points, {
    brightness: Math.min(1.2, config.brightness),
    shadowBlur: glowSize * 0.1,
    strokeStyle: "#ffffff",
    width: outerWidth * 0.36,
  });
};

const createBoltGradient = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
) => {
  const gradient = context.createLinearGradient(
    0,
    height * 0.68,
    width,
    height * 0.32,
  );

  gradient.addColorStop(0, `rgba(255,255,255,${alpha * 0.72})`);
  gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
  gradient.addColorStop(1, `rgba(255,255,255,${alpha * 0.72})`);

  return gradient;
};

type StrokeOptions = {
  brightness: number;
  shadowBlur: number;
  strokeStyle: CanvasGradient | string;
  width: number;
};

const drawBoltStroke = (
  context: CanvasRenderingContext2D,
  points: [number, number][],
  { brightness, shadowBlur, strokeStyle, width }: StrokeOptions,
) => {
  context.save();
  context.beginPath();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;
  context.shadowBlur = shadowBlur;
  context.shadowColor = `rgba(255,255,255,${Math.min(1, brightness)})`;
  context.globalAlpha = Math.min(1, brightness);
  context.strokeStyle = strokeStyle;

  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }

    context.lineTo(x, y);
  });

  context.stroke();
  context.restore();
};

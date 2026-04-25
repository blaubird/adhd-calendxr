'use client';
import React, { useState, useEffect } from 'react';
import { formatTime24 } from 'app/lib/datetime';

function splitHHmm(value: string | null): { hh: string; mm: string } {
  if (!value) return { hh: '', mm: '' };
  const [hh = '', mm = ''] = value.split(':');
  return { hh, mm };
}

function snapMinutes(value: number, step: number) {
  if (step <= 1) return value;
  const snapped = Math.round(value / step) * step;
  return Math.max(0, Math.min(59, snapped));
}

function normalizePartsToHHmm(hh: string, mm: string, stepMinutes: number): string | null {
  const trimmedH = hh.trim();
  const trimmedM = mm.trim();
  if (!trimmedH && !trimmedM) return null;

  const parsedH = Number.parseInt(trimmedH, 10);
  const parsedM = Number.parseInt(trimmedM || '0', 10);

  if (Number.isNaN(parsedH) || parsedH < 0 || parsedH > 23) return null;
  if (Number.isNaN(parsedM) || parsedM < 0 || parsedM > 59) return null;

  const finalM = snapMinutes(parsedM, stepMinutes);

  const hhStr = parsedH.toString().padStart(2, '0');
  const mmStr = finalM.toString().padStart(2, '0');

  return `${hhStr}:${mmStr}`;
}

function clampWithinRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function WheelNumberField({
  value,
  min,
  max,
  pad = 2,
  placeholder,
  ariaLabel,
  onChange,
  onStep,
}: {
  value: string;
  min: number;
  max: number;
  pad?: number;
  placeholder: string;
  ariaLabel: string;
  onChange: (next: string) => void;
  onStep: (next: string) => void;
}) {
  const formatValue = (raw: string) => raw.padStart(pad, '0').slice(-pad);

  const handleStep = (delta: number) => {
    const numeric = Number.parseInt(value || `${min}`, 10);
    const fallback = Number.isNaN(numeric) ? min : numeric;
    const next = clampWithinRange(fallback + delta, min, max);
    onStep(formatValue(next.toString()));
  };

  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      className="h-10 w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100 text-sm text-center focus:border-sky-500 focus:outline-none"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        const sanitized = e.target.value.replace(/\D/g, '').slice(0, pad);
        onChange(sanitized);
      }}
      onWheel={(e) => {
        e.preventDefault();
        handleStep(e.deltaY < 0 ? 1 : -1);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleStep(1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          handleStep(-1);
        }
      }}
    />
  );
}

export function TimeField({
  label,
  value,
  onChange,
  stepMinutes = 1,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  stepMinutes?: number;
}) {
  const normalized = formatTime24(value) || null;
  const { hh: initialH, mm: initialM } = splitHHmm(normalized);
  const [hh, setHh] = useState(initialH);
  const [mm, setMm] = useState(initialM);

  useEffect(() => {
    const { hh: nextH, mm: nextM } = splitHHmm(formatTime24(value) || null);
    setHh(nextH);
    setMm(nextM);
  }, [value]);

  const commit = (nextH: string, nextM: string) => {
    const normalizedValue = normalizePartsToHHmm(nextH, nextM, stepMinutes);
    onChange(normalizedValue);
    const { hh: syncedH, mm: syncedM } = splitHHmm(normalizedValue);
    setHh(syncedH);
    setMm(syncedM);
  };

  const handleBlur = () => commit(hh, mm);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <WheelNumberField
          value={hh}
          min={0}
          max={23}
          placeholder="HH"
          ariaLabel={`${label} hours`}
          onChange={(v) => setHh(v)}
          onStep={(v) => commit(v, mm || '00')}
        />
        <span className="text-slate-400 select-none">:</span>
        <WheelNumberField
          value={mm}
          min={0}
          max={59}
          placeholder="MM"
          ariaLabel={`${label} minutes`}
          onChange={(v) => setMm(v)}
          onStep={(v) => commit(hh || '00', v)}
        />
        <button
          type="button"
          className="h-10 px-3 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
          onClick={() => {
            setHh('');
            setMm('');
            onChange(null);
          }}
        >
          Clear
        </button>
      </div>
      <div className="text-[11px] text-slate-500">Scroll or use arrows to adjust time.</div>
    </label>
  );
}


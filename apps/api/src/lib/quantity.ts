const memoryUnits: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
  P: 1000 ** 5
};

export function parseCpu(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  if (value.endsWith("m")) {
    return Number(value.slice(0, -1)) / 1000;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMemory(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^([0-9.]+)([A-Za-z]+)?$/);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  if (!unit) {
    return amount;
  }

  const multiplier = memoryUnits[unit];
  return multiplier ? amount * multiplier : undefined;
}

export function formatCpu(value?: number): string {
  if (value === undefined) {
    return "n/a";
  }

  if (value < 1) {
    return `${Math.round(value * 1000)}m`;
  }

  return `${value.toFixed(2)} cores`;
}

export function formatMemory(value?: number): string {
  if (value === undefined) {
    return "n/a";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let current = value;
  let index = 0;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[index]}`;
}

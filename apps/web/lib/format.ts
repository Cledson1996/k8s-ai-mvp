export function formatCpu(value?: number) {
  if (value === undefined) {
    return "--";
  }

  return `${value.toFixed(2)} cores`;
}

export function formatMemory(value?: number) {
  if (value === undefined) {
    return "--";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatRelativeTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatKindLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatPercent(value?: number) {
  if (value === undefined) {
    return "--";
  }

  return `${value.toFixed(0)}%`;
}

export function formatCpuCompact(value?: number) {
  if (value === undefined) {
    return "--";
  }

  if (value < 1) {
    return `${(value * 1000).toFixed(0)}m`;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} cores`;
}

export function formatMemoryCompact(value?: number) {
  return formatMemory(value);
}

export function formatMetricTimestamp(value: string, window: "1h" | "6h" | "24h" | "7d") {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: window === "7d" ? "2-digit" : undefined,
    month: window === "7d" ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

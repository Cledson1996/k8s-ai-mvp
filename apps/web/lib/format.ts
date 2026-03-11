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

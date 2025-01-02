export function getSizeBytes(size: string): number | null {
  const labelSizeMap = {
    s: 1,
    b: 1,
    w: 2,
    l: 4,
  };
  return labelSizeMap[size as keyof typeof labelSizeMap] ?? null;
}

export function getSizeLabel(size: number): string | null {
  const sizeLabelMap = {
    1: "b",
    2: "w",
    4: "l",
  };
  return sizeLabelMap[size as keyof typeof sizeLabelMap] ?? null;
}

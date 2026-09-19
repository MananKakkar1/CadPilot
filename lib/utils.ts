type ClassValue = string | false | null | undefined | Record<string, boolean | null | undefined> | ClassValue[];

export function cn(...values: ClassValue[]) {
  return values.flatMap((value): string[] => {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((nested) => cn(nested));
    return Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name);
  }).join(' ');
}

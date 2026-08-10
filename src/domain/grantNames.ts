const REFRESH_GRANT_NAME = /^Refresh grant ([1-9]\d*)$/;

export function nextRefreshGrantName(names: readonly string[]): string {
  const occupied = new Set(names.flatMap((name) => {
    const match = REFRESH_GRANT_NAME.exec(name);
    return match ? [Number(match[1])] : [];
  }));
  let number = 1;
  while (occupied.has(number)) number += 1;
  return `Refresh grant ${number}`;
}

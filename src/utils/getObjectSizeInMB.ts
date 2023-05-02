export function getObjectSizeInMB(obj: object): number {
  const bytes = JSON.stringify(obj).length;
  const kilobytes = bytes / 1024;
  return kilobytes / 1024;
}

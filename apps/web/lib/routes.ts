export function buildResourceHref(
  kind: string,
  namespace: string,
  name: string
) {
  return `/explorer/${encodeURIComponent(namespace)}/${encodeURIComponent(kind)}/${encodeURIComponent(name)}`;
}

export function buildNamespaceHref(namespace: string) {
  return `/explorer/${encodeURIComponent(namespace)}`;
}

export function buildSnapshotDiffHref(snapshotId: string, previousId: string) {
  return `/history/${encodeURIComponent(snapshotId)}/compare/${encodeURIComponent(previousId)}`;
}

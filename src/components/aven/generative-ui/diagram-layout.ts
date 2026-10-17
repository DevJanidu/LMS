/**
 * Layered layout for small diagrams (≤24 nodes): each node sits one layer below the
 * deepest node pointing at it, so flows read top to bottom. Cycles are tolerated: nodes
 * caught in one are placed after their already-placed predecessors instead of looping.
 * Input order is kept within a layer, so the model's ordering stays meaningful.
 */
export function diagramLayers(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
): string[][] {
  const ids = nodes.map((node) => node.id),
    known = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]])),
    incoming = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges)
    if (known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to) {
      outgoing.get(edge.from)!.push(edge.to);
      incoming.set(edge.to, incoming.get(edge.to)! + 1);
    }
  const layer = new Map(ids.map((id) => [id, 0])),
    placed = new Set<string>();
  const queue = ids.filter((id) => incoming.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    placed.add(id);
    for (const next of outgoing.get(id)!) {
      layer.set(next, Math.max(layer.get(next)!, layer.get(id)! + 1));
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  // Nodes in cycles: one layer below their deepest placed predecessor, in input order.
  for (const id of ids)
    if (!placed.has(id)) {
      const depth = edges
        .filter((edge) => edge.to === id && placed.has(edge.from))
        .reduce((max, edge) => Math.max(max, layer.get(edge.from)! + 1), layer.get(id)!);
      layer.set(id, depth);
      placed.add(id);
    }
  const rows: string[][] = [];
  for (const id of ids) (rows[layer.get(id)!] ??= []).push(id);
  return rows.filter(Boolean);
}

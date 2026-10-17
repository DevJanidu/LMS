"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DiagramData } from "@/lib/aven/ui-blocks";
import ActionCard from "../cards/ActionCard";
import { diagramLayers } from "./diagram-layout";
interface Line {
  key: string;
  d: string;
  label: string | null;
  x: number;
  y: number;
  active: boolean;
}
/**
 * A structured diagram: nodes are real buttons laid out in layers, connectors are drawn
 * from measured positions, and every label is plain text. Nothing from the model is
 * executed or parsed as markup. A text list of the connections serves screen readers.
 */
export default function DiagramBlock({ id, data }: { id: string; data: DiagramData }) {
  const t = useTranslations("aven.blocks");
  const stage = useRef<HTMLDivElement>(null),
    [lines, setLines] = useState<Line[]>([]),
    [size, setSize] = useState({ width: 0, height: 0 }),
    [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => diagramLayers(data.nodes, data.edges), [data]);
  const byId = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const groups = useMemo(
    () => [...new Set(data.nodes.map((node) => node.group).filter((group): group is string => Boolean(group)))],
    [data],
  );
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const position = (nodeId: string) =>
        root.querySelector<HTMLElement>(`[data-node="${CSS.escape(nodeId)}"]`)?.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
      setLines(
        data.edges.flatMap((edge, index) => {
          const from = position(edge.from),
            to = position(edge.to);
          if (!from || !to) return [];
          const down = to.top >= from.bottom - 1;
          const x1 = from.left + from.width / 2 - box.left,
            y1 = (down ? from.bottom : from.top) - box.top,
            x2 = to.left + to.width / 2 - box.left,
            y2 = (down ? to.top : to.bottom) - box.top;
          const bend = Math.max(24, Math.abs(y2 - y1) / 2);
          // Edges pointing back up (loops) bow out to the side instead of crossing the flow.
          const side = Math.max(from.width, to.width) / 2 + 28;
          const d = down
            ? `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
            : `M ${x1 + from.width / 2} ${y1 + from.height / 2} C ${x1 + side} ${y1}, ${x2 + side} ${y2}, ${x2 + to.width / 2} ${y2 - to.height / 2}`;
          return [
            {
              key: `${edge.from}-${edge.to}-${index}`,
              d,
              label: edge.label,
              x: down ? (x1 + x2) / 2 : Math.max(x1, x2) + side * 0.8,
              y: (y1 + y2) / 2,
              active: selected === edge.from || selected === edge.to,
            },
          ];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [data, selected]);
  const detail = selected ? byId.get(selected) : null;
  return (
    <ActionCard eyebrow={t(`diagramKinds.${data.kind}`)} title={data.title}>
      <div ref={stage} className="aven-diagram" role="group" aria-label={data.title}>
        <svg className="aven-diagram-lines" width={size.width} height={size.height} aria-hidden="true">
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="aven-diagram-arrow" />
            </marker>
          </defs>
          {lines.map((line) => (
            <g key={line.key} data-active={line.active || undefined}>
              <path d={line.d} className="aven-diagram-edge" markerEnd={`url(#${id}-arrow)`} />
              {line.label && (
                <text x={line.x} y={line.y} className="aven-diagram-edge-label" textAnchor="middle" dominantBaseline="middle">
                  {line.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        {rows.map((row, index) => (
          <div key={index} className="aven-diagram-row">
            {row.map((nodeId) => {
              const node = byId.get(nodeId)!;
              return (
                <button
                  key={nodeId}
                  type="button"
                  data-node={nodeId}
                  data-group={node.group ? groups.indexOf(node.group) % 5 : undefined}
                  className="aven-diagram-node"
                  aria-pressed={selected === nodeId}
                  aria-describedby={selected === nodeId && node.detail ? `${id}-detail` : undefined}
                  onClick={() => setSelected((current) => (current === nodeId ? null : nodeId))}
                >
                  {node.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {detail && (
        <div id={`${id}-detail`} className="aven-diagram-detail" role="status">
          <strong>{detail.label}</strong>
          <p>{detail.detail ?? t("noNodeDetail")}</p>
        </div>
      )}
      {!detail && data.nodes.some((node) => node.detail) && <p className="aven-card-note">{t("diagramHint")}</p>}
      {data.edges.length > 0 && (
        <details className="aven-diagram-connections">
          <summary>{t("connections", { count: data.edges.length })}</summary>
          <ul>
            {data.edges.map((edge, index) => (
              <li key={index}>
                {t(edge.label ? "connectionLabelled" : "connection", {
                  from: byId.get(edge.from)!.label,
                  to: byId.get(edge.to)!.label,
                  label: edge.label ?? "",
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </ActionCard>
  );
}

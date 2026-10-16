"use client";
import { useEffect, useState, type ReactNode } from "react";

export interface SettingsNavGroup { label: string; items: { id: string; label: string; icon: ReactNode }[] }
interface Props { label: string; groups: SettingsNavGroup[] }

/**
 * In-page section navigation. The item for the section nearest the top of the
 * viewport is marked current; below 900px it becomes a horizontal chip bar.
 */
export default function SettingsNav({ label, groups }: Props) {
  const ids = groups.flatMap(group => group.items.map(item => item.id));
  const key = ids.join(",");
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const sections = key.split(",").map(id => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      }
      const next = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (next) setActive(next);
    }, { rootMargin: "-96px 0px -55% 0px", threshold: [0, 1] });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [key]);
  return (
    <nav className="sf-set-nav" aria-label={label}>
      {groups.map(group => (
        <div key={group.label} className="sf-set-nav-group">
          <p className="sf-set-nav-label">{group.label}</p>
          <ul>
            {group.items.map(item => (
              <li key={item.id}>
                <a href={`#${item.id}`} aria-current={active === item.id ? "true" : undefined} onClick={() => setActive(item.id)}>
                  <span className="sf-set-nav-icon" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

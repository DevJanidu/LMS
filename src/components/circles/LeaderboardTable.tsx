"use client";
import { useTranslations } from "next-intl";
import { compactDuration } from "@/lib/time";
import { FlameIcon, TrophyIcon } from "@/icons";
import PersonAvatar from "./PersonAvatar";

export interface LeaderboardRow { userId: string; name: string; image: string | null; seconds: number; rank: number; behindNextSeconds: number | null; me: boolean; streak: number | null; role?: string }
interface Props { rows: LeaderboardRow[]; caption: string; showRoles?: boolean; finalized?: boolean }

/** Ranked verified time. Shared ranks are shown as such; the current user is highlighted. */
export default function LeaderboardTable({ rows, caption, showRoles = false, finalized = false }: Props) {
  const t = useTranslations("circles");
  const leader = rows[0]?.seconds ?? 0;
  return (
    <div className="sc-table-wrap">
      <table className="sc-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sc-col-rank">{t("table.rank")}</th>
            <th scope="col">{t("table.student")}</th>
            <th scope="col" className="sc-col-num">{t("table.verified")}</th>
            <th scope="col" className="sc-col-num sc-hide-sm">{t("table.gap")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const tied = rows.filter(other => other.rank === row.rank).length > 1;
            return (
              <tr key={row.userId} data-me={row.me || undefined} data-winner={(finalized && row.rank === 1 && row.seconds > 0) || undefined}>
                <td className="sc-col-rank">
                  <span className="sc-rank" data-top={row.rank <= 3 && row.seconds > 0 ? row.rank : undefined}>
                    {finalized && row.rank === 1 && row.seconds > 0 ? <TrophyIcon aria-label={t("table.winner")} /> : row.rank}
                  </span>
                  {tied && <span className="sr-only">{t("table.tied")}</span>}
                </td>
                <td>
                  <span className="sc-person">
                    <PersonAvatar name={row.name} image={row.image} size="sm" />
                    <span className="min-w-0">
                      <span className="sc-person-name">{row.me ? t("you", { name: row.name }) : row.name}</span>
                      <span className="sc-person-meta">
                        {showRoles && row.role && row.role !== "member" && <span className="sc-chip">{t(`roles.${row.role}`)}</span>}
                        {tied && <span className="sc-chip">{t("table.tiedShort")}</span>}
                        {row.streak !== null && row.streak > 0 && <span className="sc-streak"><FlameIcon aria-hidden="true" />{t("streakDays", { count: row.streak })}</span>}
                      </span>
                    </span>
                  </span>
                  <span className="sc-bar" aria-hidden="true"><span style={{ inlineSize: `${leader ? Math.round((row.seconds / leader) * 100) : 0}%` }} /></span>
                </td>
                <td className="sc-col-num tabular-nums">{compactDuration(row.seconds)}</td>
                <td className="sc-col-num sc-hide-sm tabular-nums sc-muted">{row.behindNextSeconds === null ? "—" : t("table.behind", { time: compactDuration(row.behindNextSeconds) })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

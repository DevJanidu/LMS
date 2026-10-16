"use client";
import { useTranslations } from "next-intl";
import { compactDuration } from "@/lib/time";
import { FlameIcon, GroupIcon, TimeIcon, TrophyIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import KpiCard from "@/components/analytics/KpiCard";
import LeaderboardTable from "./LeaderboardTable";
import ActivityFeed from "./ActivityFeed";
import { useCircles } from "./useCircles";
import { useNow } from "@/lib/workspace/store";
import { PanelError, PanelSkeleton } from "./PanelState";
import type { Overview } from "./types";

interface Props { onOpen: (tab: "friends" | "groups" | "leaderboard") => void }

export default function OverviewPanel({ onOpen }: Props) {
  const t = useTranslations("circles");
  const { data, error, loading, reload } = useCircles<Overview>({ view: "overview" }, 60);
  const now = useNow(60000);
  if (loading && !data) return <PanelSkeleton />;
  if (error || !data) return <PanelError code={error} onRetry={reload} />;
  const me = data.me;
  const alone = data.participants <= 1;
  return (
    <div className="sc-stack">
      {(data.incomingRequests > 0 || data.groupInvitations > 0) && (
        <div className="sc-notice" role="status">
          <span>{t("overview.pending", { requests: data.incomingRequests, invitations: data.groupInvitations })}</span>
          <button type="button" className="sf-set-button" data-variant="secondary" onClick={() => onOpen(data.incomingRequests ? "friends" : "groups")}>{t("overview.review")}</button>
        </div>
      )}
      <section className="an-kpis sc-kpis" aria-label={t("overview.summary")}>
        <KpiCard icon={<TimeIcon />} label={t("overview.verifiedWeek")} value={compactDuration(me.seconds)} hint={t("overview.verifiedHint")} />
        <KpiCard icon={<TrophyIcon />} tone="warm" label={t("overview.friendsRank")} value={alone ? "—" : t("overview.rankOf", { rank: me.rank, total: data.participants })} hint={me.behindNextSeconds !== null ? t("overview.behind", { time: compactDuration(me.behindNextSeconds) }) : alone ? t("overview.addFriendsHint") : t("overview.leading")} />
        <KpiCard icon={<FlameIcon />} tone="warm" label={t("overview.streak")} value={t("streakDays", { count: me.streak ?? 0 })} hint={t("overview.streakHint")} />
        <KpiCard icon={<GroupIcon />} tone="success" label={t("overview.groups")} value={String(data.groups)} hint={t("overview.wins", { count: data.record.groupWins })} />
      </section>
      <div className="sc-grid">
        <AnalyticsCard id="circles-top" className="sc-span-7" title={t("overview.leaderboardTitle")} description={t("overview.leaderboardDescription")}
          action={<button type="button" className="sc-link" onClick={() => onOpen("leaderboard")}>{t("overview.seeAll")}</button>}>
          {alone ? (
            <div className="sc-empty-state">
              <GroupIcon aria-hidden="true" />
              <p className="sc-empty-title">{t("overview.aloneTitle")}</p>
              <p className="sc-empty">{t("overview.aloneBody")}</p>
              <button type="button" className="sf-set-button" data-variant="primary" onClick={() => onOpen("friends")}>{t("friends.add")}</button>
            </div>
          ) : <LeaderboardTable rows={data.top} caption={t("overview.leaderboardTitle")} />}
        </AnalyticsCard>
        <AnalyticsCard id="circles-feed" className="sc-span-5" title={t("feed.title")} description={t("feed.description")}>
          {now > 0 && <ActivityFeed items={data.feed} now={now} />}
        </AnalyticsCard>
      </div>
      {data.record.achievements.length > 0 && (
        <AnalyticsCard id="circles-achievements" title={t("achievements.title")} description={t("achievements.description")}>
          <ul className="sc-badges">
            {data.record.achievements.map(item => <li key={item.key} className="sc-badge"><TrophyIcon aria-hidden="true" /><span>{t(`achievements.${item.key}`)}</span></li>)}
          </ul>
        </AnalyticsCard>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import LeaderboardTable, { type LeaderboardRow } from "./LeaderboardTable";
import WeekPicker from "./WeekPicker";
import ScoringRules from "./ScoringRules";
import { useCircles } from "./useCircles";
import { PanelError, PanelSkeleton } from "./PanelState";

/** Friends leaderboard for any week; refreshes every minute while visible. */
export default function LeaderboardPanel({ currentWeek }: { currentWeek: string }) {
  const t = useTranslations("circles");
  const [week, setWeek] = useState(currentWeek);
  const board = useCircles<{ week: string; rows: LeaderboardRow[] }>({ view: "leaderboard", week }, week === currentWeek ? 60 : undefined);
  return (
    <div className="sc-stack">
      <AnalyticsCard id="circles-leaderboard" title={t("leaderboard.title")} description={t("leaderboard.description")} action={<WeekPicker week={week} current={currentWeek} onChange={setWeek} />}>
        {board.loading && !board.data ? <PanelSkeleton rows={5} />
          : board.error ? <PanelError code={board.error} onRetry={board.reload} />
          : board.data && board.data.rows.length > 1 ? <LeaderboardTable rows={board.data.rows} caption={t("leaderboard.title")} finalized={week < currentWeek} />
          : (
            <>
              {board.data && <LeaderboardTable rows={board.data.rows} caption={t("leaderboard.title")} />}
              <p className="sc-empty">{t("leaderboard.alone")}</p>
            </>
          )}
      </AnalyticsCard>
      <ScoringRules />
    </div>
  );
}

"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import OverviewPanel from "./OverviewPanel";
import FriendsPanel from "./FriendsPanel";
import GroupsPanel from "./GroupsPanel";
import LeaderboardPanel from "./LeaderboardPanel";
import HistoryPanel from "./HistoryPanel";
import PrivacyPanel from "./PrivacyPanel";
import { CIRCLE_TABS, type CircleTab } from "./tabs";

interface Props { initialTab: CircleTab; currentWeek: string }

/** Study Circles: one page, tabbed; the URL keeps the open tab so it can be shared or reloaded. */
export default function StudyCircles({ initialTab, currentWeek }: Props) {
  const t = useTranslations("circles");
  const [tab, setTab] = useState<CircleTab>(initialTab);
  const open = (next: CircleTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="sc-page">
      <header className="an-header">
        <h1 className="an-title">{t("title")}</h1>
        <p className="an-subtitle">{t("tagline")}</p>
      </header>
      <nav className="sc-tabs" aria-label={t("tabsLabel")}>
        {CIRCLE_TABS.map(key => (
          <button key={key} type="button" className="sc-tab" aria-current={tab === key ? "page" : undefined} onClick={() => open(key)}>{t(`tabs.${key}`)}</button>
        ))}
      </nav>
      <div key={tab}>
        {tab === "overview" && <OverviewPanel onOpen={open} />}
        {tab === "friends" && <FriendsPanel />}
        {tab === "groups" && <GroupsPanel />}
        {tab === "leaderboard" && <LeaderboardPanel currentWeek={currentWeek} />}
        {tab === "history" && <HistoryPanel currentWeek={currentWeek} />}
        {tab === "privacy" && <PrivacyPanel />}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { compactDuration } from "@/lib/time";
import { ArrowRightIcon, GroupIcon, PlusIcon, TrophyIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import KpiCard from "@/components/analytics/KpiCard";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/Checkbox";
import LeaderboardTable from "./LeaderboardTable";
import WeekPicker from "./WeekPicker";
import GroupForm from "./GroupForm";
import ScoringRules from "./ScoringRules";
import PersonAvatar from "./PersonAvatar";
import { circlesAction, useCircles } from "./useCircles";
import { PanelError, PanelSkeleton, useErrorText } from "./PanelState";
import type { GroupBoard, GroupWeek } from "./types";

type Confirm = { kind: "leave" | "delete" } | { kind: "remove" | "transfer"; userId: string; name: string } | null;

export default function GroupDetail({ groupId, currentWeek }: { groupId: string; currentWeek: string }) {
  const t = useTranslations("circles.group");
  const format = useFormatter();
  const router = useRouter();
  const errorText = useErrorText();
  const [week, setWeek] = useState(currentWeek);
  const board = useCircles<GroupBoard>({ view: "group", id: groupId, week }, week === currentWeek ? 60 : undefined);
  const history = useCircles<{ history: GroupWeek[] }>({ view: "groupHistory", id: groupId });
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (board.loading && !board.data) return <PanelSkeleton rows={6} />;
  if (board.error || !board.data) return <PanelError code={board.error} onRetry={board.reload} />;
  const data = board.data;
  const manager = data.group.myRole !== "member";
  const act = async (body: Record<string, unknown>, done?: string) => {
    setStatus(null);
    try { await circlesAction(body); await board.reload(); if (done) setStatus({ tone: "success", text: done }); return true; }
    catch (cause) { setStatus({ tone: "error", text: errorText(cause) }); return false; }
  };
  return (
    <div className="sc-page">
      <nav aria-label={t("breadcrumb")}>
        <ol className="an-breadcrumb">
          <li><Link href="/circles?tab=groups">{t("back")}</Link></li>
          <li aria-hidden="true"><ArrowRightIcon className="rtl:rotate-180" /></li>
          <li aria-current="page">{data.group.name}</li>
        </ol>
      </nav>
      <header className="sc-group-header">
        <span className="sc-group-tile" data-color={data.group.color} data-size="lg" aria-hidden="true"><GroupIcon /></span>
        <div className="min-w-0 flex-1">
          <h1 className="an-title">{data.group.name}</h1>
          <p className="an-subtitle">{data.group.description || t("noDescription")}</p>
        </div>
        <div className="sf-set-actions">
          {manager && <button type="button" className="sf-set-button" data-variant="primary" onClick={() => setInviting(true)}><PlusIcon aria-hidden="true" />{t("invite")}</button>}
          {manager && <button type="button" className="sf-set-button" data-variant="secondary" onClick={() => setEditing(true)}>{t("edit")}</button>}
          {data.group.myRole === "owner"
            ? <button type="button" className="sf-set-button" data-variant="danger" onClick={() => setConfirm({ kind: "delete" })}>{t("delete")}</button>
            : <button type="button" className="sf-set-button" data-variant="ghost" onClick={() => setConfirm({ kind: "leave" })}>{t("leave")}</button>}
        </div>
      </header>
      {status && <p role={status.tone === "error" ? "alert" : "status"} className={status.tone === "error" ? "sf-set-inline-error" : "sf-set-inline-success"}>{status.text}</p>}
      <section className="an-kpis sc-kpis" aria-label={t("summary")}>
        <KpiCard icon={<GroupIcon />} label={t("members")} value={String(data.rows.length)} />
        <KpiCard icon={<TrophyIcon />} tone="warm" label={t("lastWinner")} value={data.previousWinners.length ? data.previousWinners.map(winner => winner.name).join(" & ") : "—"} hint={data.previousWinners[0] ? compactDuration(data.previousWinners[0].seconds) : t("noWinnerYet")} />
        <KpiCard icon={<TrophyIcon />} tone="success" label={t(week === currentWeek ? "groupTotal" : "groupTotalWeek")} value={compactDuration(data.totalSeconds)} />
      </section>
      <div className="sc-grid">
        <AnalyticsCard id="circles-group-board" className="sc-span-7" title={t(data.finalized ? "finalStandings" : "standings")} description={t(data.finalized ? "finalDescription" : "liveDescription")} action={<WeekPicker week={week} current={currentWeek} onChange={setWeek} />}>
          {data.rows.length ? <LeaderboardTable rows={data.rows} caption={data.group.name} showRoles finalized={data.finalized} /> : <p className="sc-empty">{t("noResults")}</p>}
          {manager && week === currentWeek && (
            <details className="sc-manage">
              <summary>{t("manage")}</summary>
              <ul className="sc-list">
                {data.rows.filter(row => !row.me && row.role !== "owner").map(row => (
                  <li key={row.userId} className="sc-row">
                    <PersonAvatar name={row.name} image={row.image} size="sm" />
                    <span className="sc-row-main"><span className="sc-person-name">{row.name}</span><span className="sc-muted">{t(`roles.${row.role}`)}</span></span>
                    <span className="sc-row-actions">
                      {data.group.myRole === "owner" && <button type="button" className="sf-set-text-button" onClick={() => void act({ kind: "manageMember", id: groupId, memberId: row.userId, action: row.role === "admin" ? "makeMember" : "makeAdmin" })}>{t(row.role === "admin" ? "makeMember" : "makeAdmin")}</button>}
                      {data.group.myRole === "owner" && <button type="button" className="sf-set-text-button" onClick={() => setConfirm({ kind: "transfer", userId: row.userId, name: row.name })}>{t("transfer")}</button>}
                      {(data.group.myRole === "owner" || row.role === "member") && <button type="button" className="sf-set-text-button" onClick={() => setConfirm({ kind: "remove", userId: row.userId, name: row.name })}>{t("remove")}</button>}
                    </span>
                  </li>
                ))}
              </ul>
              {data.invitations.length > 0 && <p className="sc-muted">{t("pendingInvites", { names: data.invitations.map(item => item.name).join(", ") })}</p>}
            </details>
          )}
        </AnalyticsCard>
        <AnalyticsCard id="circles-group-history" className="sc-span-5" title={t("history")} description={t("historyDescription")}>
          {history.loading && !history.data ? <PanelSkeleton rows={3} />
            : history.error || !history.data ? <PanelError code={history.error} onRetry={history.reload} />
            : !history.data.history.length ? <p className="sc-empty">{t("noHistory")}</p>
            : (
              <ol className="sc-list">
                {history.data.history.map(row => (
                  <li key={row.week} className="sc-row">
                    <span className="sc-rank" data-top={row.winners.length ? 1 : undefined}><TrophyIcon aria-hidden="true" /></span>
                    <span className="sc-row-main">
                      <span className="sc-person-name">{row.winners.length ? row.winners.map(winner => winner.name).join(" & ") : t("noWinner")}</span>
                      <span className="sc-muted">{t("weekOf", { date: format.dateTime(new Date(`${row.week}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" }) })} · {compactDuration(row.totalSeconds)}{row.myRank ? ` · ${t("yourRank", { rank: row.myRank })}` : ""}{row.corrected ? ` · ${t("corrected")}` : ""}</span>
                    </span>
                    <button type="button" className="sf-set-text-button" onClick={() => setWeek(row.week)}>{t("view")}</button>
                  </li>
                ))}
              </ol>
            )}
        </AnalyticsCard>
      </div>
      <ScoringRules />
      <GroupForm open={editing} title={t("edit")} submitLabel={t("save")} initial={{ name: data.group.name, description: data.group.description, color: data.group.color as "brand" }}
        onClose={() => setEditing(false)} onSubmit={async value => { await circlesAction({ kind: "updateGroup", id: groupId, value }); await board.reload(); }} />
      {inviting && <InviteDialog groupId={groupId} onClose={() => setInviting(false)} onInvited={count => { setInviting(false); void board.reload(); setStatus({ tone: "success", text: t("invited", { count }) }); }} />}
      <ConfirmDialog background={false} isOpen={confirm !== null} onClose={() => setConfirm(null)}
        title={confirm ? t(`confirm.${confirm.kind}Title`, { name: "name" in confirm ? confirm.name : data.group.name }) : ""}
        description={confirm ? t(`confirm.${confirm.kind}Body`) : ""}
        onConfirm={async () => {
          if (!confirm) return false;
          if (confirm.kind === "leave" || confirm.kind === "delete") {
            try { await circlesAction({ kind: confirm.kind === "leave" ? "leaveGroup" : "deleteGroup", id: groupId }); router.replace("/circles?tab=groups"); return true; }
            catch (cause) { setStatus({ tone: "error", text: errorText(cause) }); return false; }
          }
          if (!("userId" in confirm)) return false;
          return act({ kind: "manageMember", id: groupId, memberId: confirm.userId, action: confirm.kind === "remove" ? "remove" : "transferOwnership" });
        }} />
    </div>
  );
}

function InviteDialog({ groupId, onClose, onInvited }: { groupId: string; onClose: () => void; onInvited: (count: number) => void }) {
  const t = useTranslations("circles.group");
  const errorText = useErrorText();
  const friends = useCircles<{ friends: { id: string; name: string; image: string | null }[] }>({ view: "invitable", id: groupId });
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal isOpen onClose={pending ? () => {} : onClose} title={t("invite")}>
      <div className="grid gap-4">
        <p className="text-body text-secondary dark:text-secondary">{t("inviteHelp")}</p>
        {friends.loading && !friends.data ? <PanelSkeleton rows={3} />
          : !friends.data?.friends.length ? <p className="sc-empty">{t("noInvitable")}</p>
          : (
            <ul className="sc-list sc-invite-list">
              {friends.data.friends.map(friend => (
                <li key={friend.id}>
                  <label className="sc-row sc-invite-row">
                    <Checkbox checked={chosen.includes(friend.id)} onCheckedChange={checked => setChosen(current => checked === true ? [...current, friend.id] : current.filter(id => id !== friend.id))} />
                    <PersonAvatar name={friend.name} image={friend.image} size="sm" />
                    <span className="sc-person-name">{friend.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        {error && <p role="alert" className="sf-set-inline-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="sf-set-button" data-variant="ghost" onClick={onClose} disabled={pending}>{t("cancel")}</button>
          <button type="button" className="sf-set-button" data-variant="primary" disabled={!chosen.length || pending} aria-busy={pending || undefined}
            onClick={async () => {
              setPending(true); setError("");
              try { const result = await circlesAction<{ invited: number }>({ kind: "inviteToGroup", id: groupId, userIds: chosen }); onInvited(result.invited); }
              catch (cause) { setError(errorText(cause)); }
              finally { setPending(false); }
            }}>{pending ? t("sending") : t("sendInvites", { count: chosen.length })}</button>
        </div>
      </div>
    </Modal>
  );
}

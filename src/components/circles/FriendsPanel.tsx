"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { compactDuration } from "@/lib/time";
import { FlameIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import PersonAvatar from "./PersonAvatar";
import { circlesAction, useCircles } from "./useCircles";
import { PanelError, PanelSkeleton, useErrorText } from "./PanelState";
import type { Friend, Requests } from "./types";

type Pending = { kind: "remove" | "block"; friend: Friend } | null;

export default function FriendsPanel() {
  const t = useTranslations("circles");
  const format = useFormatter();
  const errorText = useErrorText();
  const friends = useCircles<{ friends: Friend[] }>({ view: "friends" });
  const requests = useCircles<Requests>({ view: "requests" });
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true); setStatus(null);
    try {
      await circlesAction({ kind: "sendRequest", email });
      // The same message whatever happened, so nobody learns whether an address has an account.
      setStatus({ tone: "success", text: t("friends.sentGeneric") });
      setEmail("");
      await requests.reload();
    } catch (cause) { setStatus({ tone: "error", text: errorText(cause) }); }
    finally { setSending(false); }
  };
  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setStatus(null);
    try { await circlesAction(body); await Promise.all([friends.reload(), requests.reload()]); return true; }
    catch (cause) { setStatus({ tone: "error", text: errorText(cause) }); return false; }
    finally { setBusy(null); }
  };

  return (
    <div className="sc-stack">
      <AnalyticsCard id="circles-add" title={t("friends.addTitle")} description={t("friends.addDescription")}>
        <form className="sc-add" onSubmit={send}>
          <label htmlFor="circles-email" className="sr-only">{t("friends.email")}</label>
          <input id="circles-email" type="email" required maxLength={254} autoComplete="off" placeholder={t("friends.emailPlaceholder")} value={email} onChange={event => setEmail(event.target.value)} disabled={sending} />
          <button type="submit" className="sf-set-button" data-variant="primary" disabled={sending || !email} aria-busy={sending || undefined}>{sending ? t("friends.sending") : t("friends.send")}</button>
        </form>
        {status && <p role={status.tone === "error" ? "alert" : "status"} className={status.tone === "error" ? "sf-set-inline-error" : "sf-set-inline-success"}>{status.text}</p>}
      </AnalyticsCard>

      {requests.data && (requests.data.incoming.length > 0 || requests.data.outgoing.length > 0) && (
        <div className="sc-grid">
          <AnalyticsCard id="circles-incoming" className="sc-span-6" title={t("friends.incoming")} description={t("friends.incomingDescription")}>
            {requests.data.incoming.length ? (
              <ul className="sc-list">
                {requests.data.incoming.map(item => (
                  <li key={item.id} className="sc-row">
                    <PersonAvatar name={item.name} image={item.image} />
                    <span className="sc-row-main"><span className="sc-person-name">{item.name}</span><span className="sc-muted">{format.relativeTime(new Date(item.createdAt), new Date())}</span></span>
                    <span className="sc-row-actions">
                      <button type="button" className="sf-set-button" data-variant="primary" disabled={busy !== null} onClick={() => void act(item.id, { kind: "respondRequest", id: item.id, action: "accept" })}>{t("friends.accept")}</button>
                      <button type="button" className="sf-set-button" data-variant="ghost" disabled={busy !== null} onClick={() => void act(item.id, { kind: "respondRequest", id: item.id, action: "decline" })}>{t("friends.decline")}</button>
                      <button type="button" className="sf-set-text-button" disabled={busy !== null} onClick={() => void act(item.id, { kind: "respondRequest", id: item.id, action: "block" })}>{t("friends.block")}</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="sc-empty">{t("friends.noIncoming")}</p>}
          </AnalyticsCard>
          <AnalyticsCard id="circles-outgoing" className="sc-span-6" title={t("friends.outgoing")} description={t("friends.outgoingDescription")}>
            {requests.data.outgoing.length ? (
              <ul className="sc-list">
                {requests.data.outgoing.map(item => (
                  <li key={item.id} className="sc-row">
                    <span className="sc-row-main"><span className="sc-person-name">{item.maskedEmail}</span><span className="sc-muted">{t("friends.sentOn", { date: new Date(item.createdAt) })}</span></span>
                    <button type="button" className="sf-set-text-button" disabled={busy !== null} onClick={() => void act(item.id, { kind: "cancelInvitation", id: item.id })}>{t("friends.withdraw")}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="sc-empty">{t("friends.noOutgoing")}</p>}
          </AnalyticsCard>
        </div>
      )}

      <AnalyticsCard id="circles-friends" title={t("friends.title")} description={t("friends.description")}>
        {friends.loading && !friends.data ? <PanelSkeleton rows={3} />
          : friends.error ? <PanelError code={friends.error} onRetry={friends.reload} />
          : !friends.data?.friends.length ? <p className="sc-empty">{t("friends.none")}</p>
          : (
            <ul className="sc-cards">
              {friends.data.friends.map(friend => (
                <li key={friend.id} className="sc-friend">
                  <div className="sc-friend-head">
                    <PersonAvatar name={friend.name} image={friend.image} size="lg" />
                    <div className="min-w-0">
                      <p className="sc-person-name">{friend.name}</p>
                      <p className="sc-muted">{friend.lastActivityAt ? t("friends.lastActive", { when: format.relativeTime(new Date(friend.lastActivityAt), new Date()) }) : t("friends.activityHidden")}</p>
                    </div>
                  </div>
                  <dl className="sc-friend-stats">
                    <div><dt>{t("friends.thisWeek")}</dt><dd className="tabular-nums">{friend.weekSeconds === null ? t("friends.hidden") : compactDuration(friend.weekSeconds)}</dd></div>
                    <div><dt>{t("friends.rank")}</dt><dd className="tabular-nums">{friend.rank ? `#${friend.rank}` : "—"}</dd></div>
                    <div><dt>{t("friends.streak")}</dt><dd className="tabular-nums">{friend.streak === null ? t("friends.hidden") : <><FlameIcon aria-hidden="true" />{friend.streak}</>}</dd></div>
                  </dl>
                  <div className="sc-friend-actions">
                    <Link href={`/circles/friends/${friend.id}`} className="sf-set-button" data-variant="secondary">{t("friends.viewActivity")}</Link>
                    <button type="button" className="sf-set-text-button" onClick={() => setConfirm({ kind: "remove", friend })}>{t("friends.remove")}</button>
                    <button type="button" className="sf-set-text-button" onClick={() => setConfirm({ kind: "block", friend })}>{t("friends.block")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </AnalyticsCard>

      <ConfirmDialog background={false} isOpen={confirm !== null} onClose={() => setConfirm(null)}
        title={confirm ? t(confirm.kind === "remove" ? "friends.removeTitle" : "friends.blockTitle", { name: confirm.friend.name }) : ""}
        description={confirm ? t(confirm.kind === "remove" ? "friends.removeBody" : "friends.blockBody") : ""}
        onConfirm={() => confirm ? act(confirm.friend.id, { kind: confirm.kind === "remove" ? "removeFriend" : "block", id: confirm.friend.id }) : false} />
    </div>
  );
}

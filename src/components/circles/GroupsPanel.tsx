"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { GroupIcon, PlusIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import GroupForm from "./GroupForm";
import { circlesAction, useCircles } from "./useCircles";
import { PanelError, PanelSkeleton, useErrorText } from "./PanelState";
import type { GroupSummary, Requests } from "./types";

export default function GroupsPanel() {
  const t = useTranslations("circles.groups");
  const router = useRouter();
  const errorText = useErrorText();
  const groups = useCircles<{ groups: GroupSummary[] }>({ view: "groups" });
  const requests = useCircles<Requests>({ view: "requests" });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const respond = async (id: string, action: "accept" | "decline") => {
    setBusy(id); setError("");
    try {
      const result = await circlesAction<{ groupId?: string }>({ kind: "respondGroupInvitation", id, action });
      await Promise.all([groups.reload(), requests.reload()]);
      if (result.groupId) router.push(`/circles/groups/${result.groupId}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(null); }
  };
  const invitations = requests.data?.groupInvitations ?? [];
  return (
    <div className="sc-stack">
      {invitations.length > 0 && (
        <AnalyticsCard id="circles-group-invites" title={t("invitations")} description={t("invitationsDescription")}>
          <ul className="sc-list">
            {invitations.map(item => (
              <li key={item.id} className="sc-row">
                <span className="sc-group-tile" data-color="brand" aria-hidden="true"><GroupIcon /></span>
                <span className="sc-row-main"><span className="sc-person-name">{item.groupName}</span><span className="sc-muted">{t("invitedBy", { name: item.inviterName })}</span></span>
                <span className="sc-row-actions">
                  <button type="button" className="sf-set-button" data-variant="primary" disabled={busy !== null} onClick={() => void respond(item.id, "accept")}>{t("join")}</button>
                  <button type="button" className="sf-set-button" data-variant="ghost" disabled={busy !== null} onClick={() => void respond(item.id, "decline")}>{t("decline")}</button>
                </span>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="sf-set-inline-error">{error}</p>}
        </AnalyticsCard>
      )}
      <AnalyticsCard id="circles-groups" title={t("title")} description={t("description")}
        action={<button type="button" className="sf-set-button" data-variant="primary" onClick={() => setCreating(true)}><PlusIcon aria-hidden="true" />{t("create")}</button>}>
        {groups.loading && !groups.data ? <PanelSkeleton rows={3} />
          : groups.error ? <PanelError code={groups.error} onRetry={groups.reload} />
          : !groups.data?.groups.length ? (
            <div className="sc-empty-state">
              <GroupIcon aria-hidden="true" />
              <p className="sc-empty-title">{t("emptyTitle")}</p>
              <p className="sc-empty">{t("emptyBody")}</p>
            </div>
          ) : (
            <ul className="sc-cards">
              {groups.data.groups.map(group => (
                <li key={group.id}>
                  <Link href={`/circles/groups/${group.id}`} className="sc-group-card">
                    <span className="sc-group-tile" data-color={group.color} aria-hidden="true"><GroupIcon /></span>
                    <span className="min-w-0">
                      <span className="sc-person-name">{group.name}</span>
                      <span className="sc-muted">{t("memberCount", { count: group.members })}{group.role !== "member" ? ` · ${t(`role.${group.role}`)}` : ""}</span>
                      {group.description && <span className="sc-group-description">{group.description}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </AnalyticsCard>
      <GroupForm open={creating} title={t("create")} submitLabel={t("createSubmit")} onClose={() => setCreating(false)}
        onSubmit={async value => {
          const result = await circlesAction<{ group: { id: string } }>({ kind: "createGroup", value });
          router.push(`/circles/groups/${result.group.id}`);
        }} />
    </div>
  );
}

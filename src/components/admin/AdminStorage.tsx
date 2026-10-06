"use client";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/lib/mock/store";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import EmptyState from "@/components/studyflow/EmptyState";
import ProgressBar from "@/components/studyflow/ProgressBar";
import ComponentCard from "@/components/common/ComponentCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
interface Props {
  initial: Workspace;
}
/** Storage usage displays sizes and owners without exposing file contents. */
export default function AdminStorage({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const usage = data.users
    .map((user) => ({
      user,
      bytes: data.resources
        .filter((resource) => resource.userId === user.id)
        .reduce((sum, resource) => sum + (resource.sizeBytes ?? 0), 0),
    }))
    .sort((a, b) => b.bytes - a.bytes);
  const cell = "px-4 py-4 text-start text-sm";
  return (
    <>
      <PageHeader title={t("storage")} description={t("storageDescription")} />
      <div className="mb-6 max-w-sm">
        <StatTile
          label={t("totalStorage")}
          value={`${(usage.reduce((sum, entry) => sum + entry.bytes, 0) / 1024 / 1024).toFixed(1)} MB`}
          detail={t("metadataOnly")}
        />
      </div>
      <ComponentCard title={t("largestUsers")}>
        {!usage.length && <EmptyState title={t("noUsers")} />}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {["name", "storageUsed", "allowance"].map((key) => (
                  <TableCell key={key} isHeader className={cell}>
                    {t(key)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map(({ user, bytes }) => (
                <TableRow
                  key={user.id}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <TableCell className={cell}>{user.name}</TableCell>
                  <TableCell className={cell}>
                    {(bytes / 1024 / 1024).toFixed(1)} MB
                  </TableCell>
                  <TableCell className={cell}>
                    <span>{data.settings.storagePerUserMB} MB</span>
                    <div className="mt-2 min-w-24">
                      <ProgressBar
                        value={Math.round(
                          (bytes /
                            (data.settings.storagePerUserMB * 1024 * 1024)) *
                            100,
                        )}
                        label={user.name}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ComponentCard>
    </>
  );
}

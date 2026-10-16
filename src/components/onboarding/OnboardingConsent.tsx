"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePickerField } from "@/components/form/DatePickerField";

interface Props {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  /** Shown only while the workspace enforces a minimum registration age. */
  askDateOfBirth: boolean;
  dateOfBirth: string;
  onDateOfBirthChange: (value: string) => void;
}

export default function OnboardingConsent({ accepted, onAcceptedChange, askDateOfBirth, dateOfBirth, onDateOfBirthChange }: Props) {
  const t = useTranslations("studyflow");
  return (
    <div className="space-y-4">
      {askDateOfBirth && (
        <DatePickerField label={t("dateOfBirth")} name="dob" value={dateOfBirth} onChange={event => onDateOfBirthChange(event.target.value)} compact required max={new Date().toISOString().slice(0, 10)} />
      )}
      <label className="flex items-start gap-3 text-body">
        <Checkbox name="terms" checked={accepted} onCheckedChange={checked => onAcceptedChange(checked === true)} required className="mt-1" />
        <span>
          {t("acceptTerms")}{" "}
          <Link href="/terms" className="text-brand-600 underline dark:text-brand-300">{t("terms")}</Link>{" "}
          {t("and")}{" "}
          <Link href="/privacy" className="text-brand-600 underline dark:text-brand-300">{t("privacy")}</Link>
        </span>
      </label>
      <p className="text-small text-muted dark:text-secondary">{t("adminDisclosure")}</p>
    </div>
  );
}

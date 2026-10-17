"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronDownIcon, SparklesIcon } from "@/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import Switch from "@/components/ui/switch/Switch";
import {
  DETAIL_LEVELS,
  REASONING_MODES,
  type ModelOption,
  type ModelSettings,
} from "@/lib/aven/model-options";
interface Props {
  options: ModelOption[];
  settings: ModelSettings;
  onChange: (change: Partial<ModelSettings>) => void;
  /** Learning-resource access is a privacy setting managed in Aven settings. */
  resourceAccess: boolean;
  onOpenSettings: () => void;
  saveFailed: boolean;
}
/**
 * Model, reasoning and response-detail controls in one menu. Every choice is a native radio
 * input (arrow keys move between options, Escape closes), unavailable models and modes are
 * disabled with the reason shown, and only controls with a real effect are offered.
 */
export default function AvenModelMenu({ options, settings, onChange, resourceAccess, onOpenSettings, saveFailed }: Props) {
  const t = useTranslations("aven.models"),
    id = useId(),
    [open, setOpen] = useState(false);
  const current = options.find((option) => option.key === settings.model) ?? options[0];
  if (!current) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="aven-model-trigger"
          aria-label={t("triggerLabel", { model: current.label, reasoning: t(`modes.${settings.reasoning}.label`) })}
        >
          <SparklesIcon className="size-4" aria-hidden="true" />
          <span className="aven-model-trigger-name">{current.label}</span>
          {settings.reasoning !== "auto" && (
            <span className="aven-model-trigger-mode">{t(`modes.${settings.reasoning}.label`)}</span>
          )}
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="aven-model-menu" aria-label={t("menuLabel")}>
        <fieldset className="aven-model-section">
          <legend className="aven-model-legend">{t("model")}</legend>
          {options.map((option) => (
            <label
              key={option.key}
              className="aven-model-option"
              data-selected={option.key === settings.model || undefined}
              data-disabled={!option.available || undefined}
            >
              <input
                type="radio"
                name={`${id}-model`}
                value={option.key}
                className="sr-only"
                checked={option.key === settings.model}
                disabled={!option.available}
                onChange={() => onChange({ model: option.key })}
              />
              <span className="aven-model-option-text">
                <span className="aven-model-option-title">
                  {option.label}
                  {option.recommended && <span className="aven-model-badge">{t("recommended")}</span>}
                </span>
                <span className="aven-model-option-description">{option.description}</span>
                {!option.available && option.unavailableReason && (
                  <span className="aven-model-option-note">{t(`unavailable.${option.unavailableReason}`)}</span>
                )}
              </span>
              <CheckIcon className="aven-model-check size-4" aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <fieldset className="aven-model-section">
          <legend className="aven-model-legend">{t("reasoning")}</legend>
          {REASONING_MODES.map((mode) => {
            const supported = current.modes.includes(mode);
            return (
              <label
                key={mode}
                className="aven-model-option"
                data-compact
                data-selected={mode === settings.reasoning || undefined}
                data-disabled={!supported || undefined}
              >
                <input
                  type="radio"
                  name={`${id}-reasoning`}
                  value={mode}
                  className="sr-only"
                  checked={mode === settings.reasoning}
                  disabled={!supported}
                  onChange={() => onChange({ reasoning: mode })}
                />
                <span className="aven-model-option-text">
                  <span className="aven-model-option-title">{t(`modes.${mode}.label`)}</span>
                  <span className="aven-model-option-description">
                    {supported ? t(`modes.${mode}.description`) : t("notSupported", { model: current.label })}
                  </span>
                </span>
                <CheckIcon className="aven-model-check size-4" aria-hidden="true" />
              </label>
            );
          })}
        </fieldset>
        <fieldset className="aven-model-section">
          <legend className="aven-model-legend">{t("detail")}</legend>
          <div className="aven-model-segments">
            {DETAIL_LEVELS.map((level) => (
              <label key={level} className="aven-model-segment" data-selected={level === settings.detail || undefined}>
                <input
                  type="radio"
                  name={`${id}-detail`}
                  value={level}
                  className="sr-only"
                  checked={level === settings.detail}
                  onChange={() => onChange({ detail: level })}
                />
                {t(`details.${level}`)}
              </label>
            ))}
          </div>
          <p className="aven-model-hint">{t(`detailHints.${settings.detail}`)}</p>
        </fieldset>
        <section className="aven-model-section" aria-labelledby={`${id}-capabilities`}>
          <h3 id={`${id}-capabilities`} className="aven-model-legend">
            {t("capabilities")}
          </h3>
          <div className="aven-model-capability">
            <span>
              <span className="aven-model-option-title">{t("workspace")}</span>
              <span className="aven-model-option-description">{t("workspaceHelp")}</span>
            </span>
            <span className="aven-model-status">{t("alwaysOn")}</span>
          </div>
          <div className="aven-model-capability">
            <span>
              <span className="aven-model-option-title">{t("resources")}</span>
              <span className="aven-model-option-description">{t(resourceAccess ? "resourcesOn" : "resourcesOff")}</span>
            </span>
            <button
              type="button"
              className="aven-text-button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              {t("change")}
            </button>
          </div>
          <div className="aven-model-capability">
            <span>
              <label htmlFor={`${id}-interactive`} className="aven-model-option-title">
                {t("interactive")}
              </label>
              <span className="aven-model-option-description">{t("interactiveHelp")}</span>
            </span>
            <Switch
              id={`${id}-interactive`}
              checked={settings.interactive}
              onCheckedChange={(interactive) => onChange({ interactive })}
            />
          </div>
        </section>
        <p className="aven-model-footnote">
          {saveFailed ? t("saveFailed") : t("footnote", { model: current.apiModel })}
        </p>
      </PopoverContent>
    </Popover>
  );
}

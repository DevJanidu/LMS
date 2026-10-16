"use client";
import dynamic from "next/dynamic";
import { memo } from "react";
import { useTranslations } from "next-intl";
import type { ApexOptions } from "apexcharts";
import { useTheme } from "@/context/ThemeContext";
import LoadingSkeleton from "@/components/studyflow/LoadingSkeleton";
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <LoadingSkeleton />,
});
interface Props {
  labels: string[];
  values: number[];
  label: string;
  type?: "bar" | "line";
  /** Bars run left to right with labels on the y axis (e.g. one bar per subject). */
  horizontal?: boolean;
  height?: number;
  /** Values are minutes; tooltips and the data table show "1h 25m". */
  minutes?: boolean;
}
const asDuration = (value: number) => {
  const minutes = Math.round(value);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};
/** Lazy chart with an equivalent accessible data table. */
function StudyChart({
  labels,
  values,
  label,
  type = "bar",
  horizontal = false,
  height = 260,
  minutes = false,
}: Props) {
  const { theme } = useTheme();
  const t = useTranslations("studyflow");
  const dark = theme === "dark";
  // Chart option colors mirror the @theme palette: brand-500 / dark primary, gray-500 / gray-400.
  const muted = dark ? "#98a2b3" : "#667085";
  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      fontFamily: "inherit",
      background: "transparent",
      animations: { enabled: false },
    },
    colors: [dark ? "#9aa6fa" : "#5265d6"],
    theme: { mode: theme },
    grid: { strokeDashArray: 4, borderColor: dark ? "#2a3345" : "#e4e7ec", xaxis: { lines: { show: horizontal } }, yaxis: { lines: { show: !horizontal } } },
    xaxis: { categories: labels, labels: { style: { colors: muted } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, labels: { style: { colors: muted }, maxWidth: horizontal ? 140 : 160 } },
    dataLabels: { enabled: false },
    stroke: { width: type === "line" ? 3 : 0, curve: "smooth" },
    plotOptions: { bar: { borderRadius: horizontal ? 5 : 4, borderRadiusApplication: "end", horizontal, columnWidth: "36%", barHeight: "56%" } },
    tooltip: { theme, y: minutes ? { formatter: asDuration } : undefined },
    states: { hover: { filter: { type: "darken" } } },
  };
  return (
    <div className="sf-chart">
      <ReactApexChart
        options={options}
        series={[{ name: label, data: values }]}
        type={type}
        height={height}
      />
      <details className="mt-2 text-caption text-muted dark:text-secondary">
        <summary className="cursor-pointer">{t("viewChartData")}</summary>
        <table className="mt-3 w-full">
          <caption className="sr-only">{label}</caption>
          <tbody>
            {labels.map((text, index) => (
              <tr key={`${text}-${index}`}>
                <th scope="row" className="py-1 text-start text-caption">
                  {text}
                </th>
                <td className="text-end tabular-nums">{minutes ? asDuration(values[index]) : values[index]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
export default memo(StudyChart, (before, after) => before.label === after.label && before.type === after.type
  && before.horizontal === after.horizontal && before.height === after.height && before.minutes === after.minutes
  && before.labels.length === after.labels.length && before.values.length === after.values.length
  && before.labels.every((label, index) => label === after.labels[index])
  && before.values.every((value, index) => value === after.values[index]));

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
}
/** Lazy chart with an equivalent accessible data table. */
function StudyChart({
  labels,
  values,
  label,
  type = "bar",
}: Props) {
  const { theme } = useTheme();
  const t = useTranslations("studyflow");
  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      fontFamily: "inherit",
      background: "transparent",
      animations: { enabled: false },
    },
    colors: ["#5265d6"],
    theme: { mode: theme },
    grid: { strokeDashArray: 4, borderColor: theme === "dark" ? "#1d2939" : "#e4e7ec" },
    xaxis: { categories: labels },
    dataLabels: { enabled: false },
    stroke: { width: type === "line" ? 3 : 0, curve: "smooth" },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "32%" } },
    yaxis: { min: 0 },
    tooltip: { theme },
  };
  return (
    <div className="sf-chart">
      <ReactApexChart
        options={options}
        series={[{ name: label, data: values }]}
        type={type}
        height={260}
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
                <td className="text-end">{values[index]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
export default memo(StudyChart, (before, after) => before.label === after.label && before.type === after.type
  && before.labels.length === after.labels.length && before.values.length === after.values.length
  && before.labels.every((label, index) => label === after.labels[index])
  && before.values.every((value, index) => value === after.values[index]));

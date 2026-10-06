"use client";
import dynamic from "next/dynamic";
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
export default function StudyChart({
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
    <div>
      <ReactApexChart
        options={options}
        series={[{ name: label, data: values }]}
        type={type}
        height={260}
      />
      <details className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer">{t("viewChartData")}</summary>
        <table className="mt-3 w-full">
          <caption className="sr-only">{label}</caption>
          <tbody>
            {labels.map((text, index) => (
              <tr key={`${text}-${index}`}>
                <th scope="row" className="py-1 text-start font-normal">
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

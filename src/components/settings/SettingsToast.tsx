"use client";
import { useEffect } from "react";
import { CheckIcon } from "@/icons";

interface Props { message: string; onDone: () => void }

/** Short confirmation that slides up and leaves after a few seconds. */
export default function SettingsToast({ message, onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div className="sf-set-toast" role="status">
      <span className="sf-set-toast-check" aria-hidden="true"><CheckIcon /></span>
      {message}
    </div>
  );
}

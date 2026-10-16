"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** On/off control rendered as a real `role="switch"` button. */
export default function Switch({ id, checked, onCheckedChange, disabled, ...aria }: SwitchProps) {
  return (
    <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="sf-switch" {...aria}>
      <SwitchPrimitive.Thumb className="sf-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

"use client";

import * as Primitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverAnchor = Primitive.Anchor;

export function PopoverContent({ className = "", sideOffset = 6, collisionPadding = 12, container, ...props }: ComponentProps<typeof Primitive.Content> & { container?: HTMLElement | null }) {
  return (
    <Primitive.Portal container={container}>
      <Primitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={`z-999999 rounded-xl border border-gray-200 bg-white text-primary shadow-theme-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:border-gray-700 dark:bg-gray-dark dark:text-primary ${className}`}
        {...props}
      />
    </Primitive.Portal>
  );
}

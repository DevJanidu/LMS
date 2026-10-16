interface Props { name: string; image?: string | null; size?: "sm" | "md" | "lg" }

/** Profile photo, or initials when there is none. */
export default function PersonAvatar({ name, image, size = "md" }: Props) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
  return (
    <span className="sc-avatar" data-size={size} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- small remote avatars need no optimizer round trip */}
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

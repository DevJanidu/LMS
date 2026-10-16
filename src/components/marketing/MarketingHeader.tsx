"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BrandLogo from "@/components/studyflow/BrandLogo";
import ThemeToggle from "@/components/studyflow/ThemeToggle";
import { ArrowRightIcon } from "@/icons";
import { marketingNavigation } from "./navigation";

/** Sticky, translucent marketing header with an accessible mobile menu. */
export default function MarketingHeader() {
  const t = useTranslations("marketing.nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    const close = () => window.innerWidth >= 960 && setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="mk-header" data-scrolled={scrolled} data-open={open}>
        <div className="mk-container mk-header-inner">
          <Link href="/" className="mk-logo" aria-label={t("home")}>
            <BrandLogo />
          </Link>
          <nav className="mk-nav" aria-label={t("label")}>
            {marketingNavigation.map((item) => (
              <Link key={item.key} href={item.href}>
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="mk-header-actions">
            <ThemeToggle label={t("theme")} className="mk-icon-btn" />
            <Link
              href="/login"
              className="mk-btn mk-btn-ghost mk-btn-sm mk-desktop-only"
            >
              {t("login")}
            </Link>
            <Link
              href="/login"
              className="mk-btn mk-btn-primary mk-btn-sm mk-desktop-only"
            >
              {t("getStarted")}
            </Link>
            <button
              type="button"
              className="mk-icon-btn mk-mobile-only"
              aria-expanded={open}
              aria-controls="mk-mobile-menu"
              aria-label={open ? t("closeMenu") : t("openMenu")}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="mk-menu-icon" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div id="mk-mobile-menu" className="mk-mobile-panel mk-mobile-only">
          <nav aria-label={t("label")}>
            {marketingNavigation.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {t(item.key)}
                <ArrowRightIcon className="mk-muted size-4" />
              </Link>
            ))}
          </nav>
          <div className="mt-6 grid gap-3">
            <Link href="/login" className="mk-btn mk-btn-primary mk-btn-lg">
              {t("getStarted")}
            </Link>
            <Link href="/login" className="mk-btn mk-btn-secondary mk-btn-lg">
              {t("login")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconProgress, IconToday, IconWords } from "./icons";

const tabs = [
  { href: "/", label: "Днес", Icon: IconToday },
  { href: "/words", label: "Речник", Icon: IconWords },
  { href: "/progress", label: "Напредък", Icon: IconProgress },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Основна навигация"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-3" style={{ height: "var(--tabbar-h)" }}>
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-ink" : "text-ink-3"
                }`}
              >
                <Icon width={22} height={22} />
                <span className="relative">
                  {label}
                  {/* активният раздел е подчертан, както всичко останало в приложението */}
                  <span
                    className="wave-line wave-progress absolute inset-x-0 -bottom-[5px]"
                    style={{ height: 4, clipPath: active ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

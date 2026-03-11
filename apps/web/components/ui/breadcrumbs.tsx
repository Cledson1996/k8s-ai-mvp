import Link from "next/link";

export function Breadcrumbs({
  items
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.href ? (
            <Link href={item.href} className="text-slate-500 transition hover:text-tide">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-ink">{item.label}</span>
          )}
          {index < items.length - 1 ? <span className="text-slate-300">/</span> : null}
        </span>
      ))}
    </nav>
  );
}

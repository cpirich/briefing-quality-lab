import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

type BadgeTone = "amber" | "blue" | "green" | "red" | "slate";

const toneClasses: Record<BadgeTone, string> = {
	amber:
		"border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
	blue: "border-[var(--badge-blue-border)] bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
	green:
		"border-[var(--badge-green-border)] bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]",
	red: "border-[var(--badge-red-border)] bg-[var(--badge-red-bg)] text-[var(--badge-red-fg)]",
	slate:
		"border-[var(--badge-slate-border)] bg-[var(--badge-slate-bg)] text-[var(--badge-slate-fg)]",
};

export function Badge({
	className,
	tone = "slate",
	wrap = false,
	...props
}: ComponentProps<"span"> & { tone?: BadgeTone; wrap?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border px-2 py-0.5 font-medium text-xs",
				wrap ? "whitespace-normal break-words" : "whitespace-nowrap",
				toneClasses[tone],
				className,
			)}
			{...props}
		/>
	);
}

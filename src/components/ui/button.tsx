import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

type ButtonTone = "accent" | "ghost" | "secondary";

const toneClasses: Record<ButtonTone, string> = {
	accent:
		"border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)]",
	ghost:
		"border-transparent bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
	secondary:
		"border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm hover:bg-[var(--muted)]",
};

export function Button({
	className,
	tone = "secondary",
	...props
}: ComponentProps<"button"> & { tone?: ButtonTone }) {
	return (
		<button
			className={cn(
				"inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 font-medium text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
				toneClasses[tone],
				className,
			)}
			{...props}
		/>
	);
}

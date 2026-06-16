import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

type NativeSelectProps = ComponentProps<"select"> & {
	wrapperClassName?: string;
};

export function NativeSelect({
	className,
	wrapperClassName,
	...props
}: NativeSelectProps) {
	return (
		<div className={cn("relative", wrapperClassName)}>
			<select
				className={cn(
					"h-9 w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] px-3 pr-10 text-[var(--foreground)] text-sm",
					className,
				)}
				{...props}
			/>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-[var(--foreground)]"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				viewBox="0 0 24 24"
			>
				<path d="m6 9 6 6 6-6" />
			</svg>
		</div>
	);
}

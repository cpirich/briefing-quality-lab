import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
	return (
		<section
			className={cn(
				"min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("border-[var(--border)] border-b px-4 py-3", className)}
			{...props}
		/>
	);
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("p-4", className)} {...props} />;
}

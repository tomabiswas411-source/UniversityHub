import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
 return (
 <div
 data-slot="skeleton"
 /* bg-muted — quiet warm-grey shimmer in both themes. bg-accent was
    bright Cavendish Yellow, which made every loading state glare. */
 className={cn("bg-muted animate-pulse rounded-md", className)}
 {...props}
 />
 )
}

export { Skeleton }

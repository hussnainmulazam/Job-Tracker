import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/92 shadow-xs active:translate-y-[0.5px]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs active:translate-y-[0.5px]",
        outline:
          "border border-border/80 bg-background/90 text-foreground hover:bg-muted/60 hover:text-foreground hover:border-border shadow-xs active:translate-y-[0.5px]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/40 active:translate-y-[0.5px]",
        ghost: "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-1.5",
        xs: "h-7 px-2.5 text-[11px] rounded",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-10 px-5 text-sm rounded-md",
        icon: "h-8 w-8 rounded-md p-0",
        "icon-sm": "h-7 w-7 rounded p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };


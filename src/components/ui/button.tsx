import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft rounded-full",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full",
        outline: "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground rounded-full",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full",
        ghost: "hover:bg-primary/10 hover:text-primary rounded-full",
        link: "text-primary underline-offset-4 hover:underline",
        // ThePsy specific variants
        pill: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft rounded-full",
        "pill-outline": "border-2 border-primary bg-transparent text-primary hover:bg-primary/10 rounded-full",
        coral: "bg-coral text-accent-foreground hover:bg-coral/90 shadow-soft rounded-full",
        teal: "bg-teal text-primary-foreground hover:bg-teal-dark shadow-soft rounded-full",
        "teal-light": "bg-teal-light text-teal-dark hover:bg-teal-light/80 rounded-full",
        hero: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-elevated hover:-translate-y-0.5 rounded-full",
        "yes-no": "border border-border bg-card text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-full",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        xl: "h-14 px-10 text-base",
        icon: "h-10 w-10",
        // Pill sizes
        pill: "h-12 px-8 py-3",
        "pill-sm": "h-10 px-6 py-2",
        "pill-lg": "h-14 px-10 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

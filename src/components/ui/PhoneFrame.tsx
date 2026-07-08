import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

export const PhoneFrame = ({ children, className }: PhoneFrameProps) => {
  return (
    <div className={cn(
      "min-h-screen w-full max-w-md mx-auto bg-background relative overflow-hidden",
      className
    )}>
      {children}
    </div>
  );
};

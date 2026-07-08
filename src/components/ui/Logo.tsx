import { cn } from "@/lib/utils";
import logoPng from "../../assets/images/logo.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export const Logo = ({ className, size = "md", showText = true }: LogoProps) => {
  const sizes = {
    sm: { height: 42 },
    md: { height: 58 },
    lg: { height: 74 },
  };

  return (
    <div className={cn("flex items-center", className)}>
      <img 
        src={logoPng} 
        alt="ThePsy Logo" 
        style={{ height: `${sizes[size].height}px`, width: 'auto' }}
        className="object-contain"
      />
      {showText && (
        <span className={cn("font-serif text-primary ml-2", size === "sm" ? "text-lg" : size === "md" ? "text-xl" : "text-2xl")}>
          ThePsy
        </span>
      )}
    </div>
  );
};

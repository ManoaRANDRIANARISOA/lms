import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
  checked?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, checked, onChange, ...props }, ref) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (onCheckedChange) {
            onCheckedChange(e.target.checked);
        }
        if (onChange) {
            onChange(e);
        }
    }

    return (
      <div className="relative inline-flex items-center">
        <input
            type="checkbox"
            className="peer h-4 w-4 shrink-0 opacity-0 absolute inset-0 cursor-pointer z-10"
            ref={ref}
            checked={checked}
            onChange={handleChange}
            {...props}
        />
        <div className={cn(
            "h-4 w-4 shrink-0 rounded-sm border border-gray-300 bg-white ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer-checked:bg-black peer-checked:text-white flex items-center justify-center",
            className
        )}>
            {checked && <Check className="h-3 w-3" />}
        </div>
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

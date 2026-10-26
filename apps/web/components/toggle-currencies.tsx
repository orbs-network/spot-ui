import { useActionHandlers } from '@/lib/hooks/use-action-handlers';
import { ArrowDown } from 'lucide-react';
import React from 'react'


export function ToggleCurrencies() {
    const { handleToggleCurrencies } = useActionHandlers();
  return (
    <div className="flex justify-center h-[4px] relative top-[-16px] z-1">
       <button type="button" aria-label="Switch tokens" onClick={handleToggleCurrencies} className="cursor-pointer bg-card w-[40px] h-[40px] rounded-[12px] border-4 border-background flex items-center justify-center hover:bg-accent">
        <ArrowDown className="size-5" />
       </button>
    </div>
  )
}

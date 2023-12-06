import Jdenticon from '@/components/jdenticon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const DidIcon = ({
  did,
  origin,
  size = '100%',
  className,
  onClicked,
}: {
  did: string;
  origin?: string
  size?: string;
  className?: string;
  onClicked?: (did: string) => void;
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className={className} asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClicked?.(did);
            }}
            className={'transition hover:-translate-y-0.5 hover:scale-110'}
          >
            <Jdenticon className="bg-white" value={did} size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent className={'DidTooltipContent mt-4'}>
          <p className={'max-h-[60px] max-w-[230px] text-xs break-all overflow-y-scroll scrollbar-w-[5px] scrollbar scrollbar-thumb-primary/80 scrollbar-track-accent/50 scrollbar-thumb-rounded-full'}>
            {origin ? (new URL(origin).hostname) : did}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

import Jdenticon from '@/components/jdenticon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const DidIcon = ({
  did,
  size = '100%',
  className,
  onClicked,
}: {
  did: string;
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
        <TooltipContent className={'DidTooltipContent'}>
          <p className={'max-h-[80px] max-w-[230px] text-xs break-all'}>
            {did}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

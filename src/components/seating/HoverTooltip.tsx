import { HoverTooltip as HoverTooltipData } from './FloorPlanEditor';

export const HoverTooltip = ({ tooltip }: { tooltip: HoverTooltipData }) => (
  <div
    className="fixed z-50 pointer-events-none bg-[#4A3F35] text-[#FAF6F0] p-3 rounded-2xl shadow-2xl border-2 border-[#CBAE94] text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3 min-w-[220px] max-w-xs animate-fadeIn"
    style={{ left: tooltip.x, top: tooltip.y - 12 }}
  >
    <div className="font-bold text-sm text-amber-200">
      {tooltip.title}
    </div>
    {tooltip.subtitle && (
      <div className="text-[10px] font-mono text-[#CBAE94] font-bold uppercase tracking-wider">
        {tooltip.subtitle}
      </div>
    )}
    <div className="pt-1.5 border-t border-[#CBAE94]/30 space-y-1">
      {tooltip.details.map((d, i) => (
        <p key={i} className="text-[11px] leading-relaxed text-[#F8F5F0]">
          {d}
        </p>
      ))}
    </div>
  </div>
);
